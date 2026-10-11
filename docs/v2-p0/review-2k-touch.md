# P0 corrective review: 2K arena and touch

The original arena filled the 2560×1440 viewport: 2560×1259 px with a 38 px cookie. Its projectile crossed toward a cookie at the top in about 563 ms. The same fixed cookie looked small in that space. This was a rendering and interaction scale problem; no SP, HP, wave, wallet or upgrade rule changed.

The arena now caps at 960×720 on desktop. Cookie radius follows arena width, clamped to 19–26 px; sprite diameter, collision radius, spawn clearance, cannon, projectile radius and obstacle width use that scale. The SVG art is inset by roughly 8–13% inside its texture, leaving a small touch tolerance. The width cap prevents a 2K display from increasing firing distance and lateral aiming range without limit. A subtle outline marks the actual field. Bullet speed derives from a configurable 420 ms full-height travel target. This changes apparent response through a measured flight time, not an arbitrary display-scale multiplier. Sizes are experimental for the next human playtest.

| Viewport | Old arena | New arena | Old/new cookie model diameter | Old/new vertical top intercept* |
|---|---:|---:|---:|---:|
| 390×844 | 390×664 | 390×664 | 38/38 px | 540/385 ms |
| 1280×720 | 1280×539 | 960×539 | 38/52 px | 528/362 ms |
| 2560×1440 | 2560×1259 | 960×720 | 38/52 px | 563/376 ms |

*Theoretical unobstructed time from muzzle to the upper edge of a cookie at the top spawn line, using each version's geometry and projectile speed. Real interceptions vary with angle, movement, obstacles and reaction time. At 2K the new speed is 1714 px/s versus 2140 px/s before, yet the shorter bounded path reduces flight time. The five supported viewport measurements are 320×320: 283 ms, 360×640: 370 ms, 390×844: 385 ms, 568×320: 307 ms, 1280×720: 362 ms.

## Browser evidence

Chrome CDP ran against Vite with real `Input.dispatchTouchEvent` and `Input.dispatchMouseEvent`, not direct simulation calls. All five supported viewports plus 2560×1440 showed a first cookie inside the arena, no off-screen canvas, and no console exceptions. Touch Direct and Offset each fired 3 shots during a held drag and stopped after release. A mouse drag with Chrome mobile emulation fired 2 shots; desktop mouse drag also fired. Live resize from 1280×720 to 390×844 updated the canvas and collision radius. An unattended 320×320 wave reached **DEFEAT**; touch input produced no shots then. **Retry stage** returned to PREP, **Start wave 1** returned to RUNNING, and touch drag fired 2 shots. The original report's screenshot was taken in DEFEAT, which explains that particular non-response. Actual phone hardware remains untested.

- [Old 2K](review-screenshots/baseline-2560x1440.png) / [new 2K](review-screenshots/running-2560x1440.png)
- [Old desktop](review-screenshots/baseline-1280x720.png) / [new desktop](review-screenshots/running-1280x720.png)
- [Old mobile](review-screenshots/baseline-390x844.png) / [new mobile](review-screenshots/running-390x844.png)
- [Touch Direct start](review-screenshots/touch-direct-start.png) / [after drag](review-screenshots/touch-direct-drag.png)
- [Touch Offset start](review-screenshots/touch-offset-start.png) / [after drag](review-screenshots/touch-offset-drag.png)
- [Device Toolbar mouse drag](review-screenshots/device-toolbar-mouse-drag-390x844.png) / [touch after Retry](review-screenshots/retry-touch-drag-320x320.png)
- [Live resize](review-screenshots/live-resize-desktop-to-mobile.png)

To repeat the automated browser check, start Vite on port 5187 and Chrome with `--remote-debugging-port=9225`, then run `node scripts/p0-browser-review.mjs`. The script saves fresh screenshots in `review-screenshots/`. The check uses headless Chrome; it does not replace a human playtest on a physical phone or a high-DPI monitor.

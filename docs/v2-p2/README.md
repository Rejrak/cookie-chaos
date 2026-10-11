# Cookie Chaos V2 — P2 boss playtest

P2 runs at `/v2.html`; `/p0.html` and `/` remain available. The four boss gates at stages 3, 6, 9 and 12 are now playable. P2 is technically verified, with human balance and enjoyment still to be judged. No P3 or P4 mechanics are included.

## Play

```bash
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173/v2.html`, or the same address with your computer's LAN IP on a phone. Play the three ordinary waves of a boss stage, including up to two recovery waves if SP are short. The final ordinary threat must resolve before **Start boss battle** appears. The Shop is available in that preparation pause and unavailable during combat. Hold mouse or touch to fire; drag to aim. Shoot the boss for HP or protection damage, and shoot falling threats to protect the base. Boss threats give pending Cookies within a fixed encounter budget, never SP. After boss HP reaches zero, the timer and new attacks stop; surviving threats still have to be intercepted or endured. Victory then pays the boss bonus once, restores up to 2 HP, and unlocks the next stage. Defeat discards pending Cookies and returns Retry to wave one.

Stage 12 victory displays **KINGDOM I COMPLETED**. Kingdom II and Endless remain unavailable.

## Isolated boss previews

In development only, open `/v2.html?diagnostic=1`. In the menu choose stage 3, 6, 9 or 12, optionally set Damage level (0–4), Fire Rate level (0–3) and base HP (1–5), then choose **Preview selected boss**. This launches directly into the boss preparation state with seed 1207. Diagnostic progress uses no storage, grants no official currency or unlocks, and is intended to compare controls and loadouts. Start the encounter with **Start boss battle**. The **Metrics / JSON** dialog exports local measurements. For an official campaign run, use `/v2.html` without the query string.

## Experimental configurations

| Boss | HP + guard | Timer | Attack interval | Threat reward cap | Win bonus |
|---|---:|---:|---:|---:|---:|
| Barbarian | 16 + 0 | 48 s | 5.0 s | 30 | 35 |
| Knight | 20 + 8 | 58 s | 4.8 s | 45 | 55 |
| Berserker | 26 + 0 | 62 s | 4.5 s; faster in Rage | 55 | 75 |
| Cookieng | 32 + 10 | 78 s | 4.8 s; faster in Golden Form | 75 | 120 |

The first warning starts after 2.5 s. Barbarian alternates a resistant signal cookie and a Normal burst; intercepting the signal opens a counter window. Knight's shield absorbs direct hits until removed; intercepting its signal temporarily opens the body even while protection remains. Berserker switches at half HP to three-cookie Rage volleys and shorter intervals. Cookieng begins behind a crown and switches to Golden Form with combined resistant and Normal volleys. Rage and Golden transitions bring the next telegraph forward to prevent the phase from existing only as a color change. Telegraphs are visible in the HUD and around the boss. The target moves smoothly, with no random teleport. These numbers are playtest baselines, not approved final balance.

Boss hits use the cannon's current Damage level. Protection absorbs a complete hit before the body; excess damage never crosses in the same projectile. A projectile is consumed on one target. Boss threat rewards are pending and capped; the victory bonus is paid only after successful cleanup. If the timer reaches zero on the same fixed step as a potential hit, timeout wins. Boss timer and threats pause with the browser, loss of focus, or an open metrics dialog. The Shop is not available during combat.

## P1 tuning measurement

Campaign-only fall-time inputs changed from P0's Normal 4.5 s, Hard 5.2 s and Golden 3.3 s to **4.18 / 4.8 / 2.8 s**. P0 values remain unchanged. Deterministic measured time to ground (seed 1207, free arena, one cookie, 60 FPS render input) is:

| Arena | Normal old → new | Hard old → new | Golden old → new |
|---|---:|---:|---:|
| 320×175 | 2608 → 2533 ms (−2.9%) | 2792 → 2675 ms (−4.2%) | 3183 → 2700 ms (−15.2%) |
| 390×720 | 4475 → 4158 ms (−7.1%) | 5167 → 4775 ms (−7.6%) | 3283 → 2783 ms (−15.2%) |
| 960×614 | 4467 → 4150 ms (−7.1%) | 5158 → 4767 ms (−7.6%) | 3275 → 2783 ms (−15.0%) |

The compact arena's anti-stuck fallback already accelerates slow early falls, reducing the incremental effect for Normal and Hard. This is documented rather than changing the approved P0 physics. Golden remains reachable with a consistent, predictable trajectory and its existing zero ground damage.

The P1 near-horizontal firing lane was preserved. A deterministic three-wave Stage 3 comparison (390×720, seed 1207, 100 HP solely to prevent early simulation termination) yielded:

| Loadout | Shots | Hits | Hard destroyed / escaped | HP lost | SP |
|---|---:|---:|---:|---:|---:|
| No upgrades | 131 | 45 | 6 / 3 | 3 | 47 |
| Fire Rate Lv3 | 249 | 48 | 9 / 0 | 0 | 56 |
| Damage Lv2 | 127 | 30 | 9 / 0 | 0 | 56 |

This is a narrow synthetic lane, not evidence that a person can clear the campaign by holding one aim. It shows both upgrades offer different benefits and the lane was not removed. Normal stage SP/timers, upgrade prices and obstacle placements were not changed.

## Verification and saves

`npm run typecheck`, `npm run test`, and `npm run build` validate the code. `node scripts/v2-p2-browser-review.mjs` uses a local Vite server on port 5187 and Chrome CDP on 9225 to check the six supported viewports, genuine touch/mouse drag firing, boss telegraphs and threats, Knight shield hits, Berserker Rage, Cookieng Golden Form, a real touch victory, a threat-caused defeat and Retry, and loading of P0 and the old clicker. Its 30 real Phaser screenshots are in [`screenshots/`](screenshots/). The automated campaign test reaches 1→12 through ordinary wave and projectile transitions; it injects deterministic projectile hits to speed validation, so it is not a human difficulty test. P0's existing tests remain active.

The P1 storage key remains `cookie-chaos-v2-campaign-v1`. P1 schema v1 saves migrate in memory to schema v2 on load, preserving stage, HP, upgrade levels, retry reference, transaction IDs and exact bigint wallet. The next authorized save writes v2; interrupted boss states and pending rewards are never stored. Kingdom completion is a v2 field, persisted once. The legacy clicker storage is not read or written.

## Human playtest focus

Play stages 1–12 on PC and a phone; repeat each boss with and without purchased Damage and Fire Rate. Report encounter duration, hit accuracy, threat escapes, HP lost, retries, whether warnings and special phases were readable, and whether any threat felt unavoidable. Headless Chrome and deterministic projectile injection cannot establish enjoyment or realistic difficulty.

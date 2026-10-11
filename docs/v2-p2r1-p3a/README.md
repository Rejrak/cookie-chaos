# Cookie Chaos V2 — P2-R1 + P3-A playtest build

Run `npm run dev -- --host 0.0.0.0`, then open `/v2.html`. `/p0.html` and `/` remain available. This branch is technically testable; the new balance is experimental and needs a human playtest.

## Economy and boss changes

| Purchase | P2 prices | New prices |
|---|---|---|
| Damage Lv1–4 | 20 / 35 / 55 / 80 | 30 / 80 / 180 / 360 |
| Fire Rate Lv1–3 | 20 / 40 / 65 | 30 / 100 / 250 |
| Full offense | 315 | 1,030 |

Stage 1 has a 63-Cookie perfect-collection ceiling, so the first upgrade remains affordable. Ordinary-wave reward potential was 1,199 Cookies across Kingdom I before P3-A and is 1,419 with the new types. These are ceilings, not predicted human earnings; missed cookies, failures and purchases reduce actual purchasing power. Boss victory rewards and bounded hostile rewards are unchanged. P2 saves retain levels and balances without retroactive charges or schema migration. Max Health and Repair prices are unchanged.

A deterministic projectile bot with predictive aim, 100 HP to isolate income, seed 1207 and the same 12 stage configurations yielded:

| Spending plan | Cost curve | First stage with full Damage + Fire Rate | Cookies earned | Spent | Wallet after 12 |
|---|---|---:|---:|---:|---:|
| Offensive rush | P2 | 5 | 1,727 | 315 | 1,412 |
| Offensive rush | New | 10 | 1,733 | 1,030 | 703 |
| Balanced offense/defense | New | Not by 12 | 1,740 | 1,205 | 535 |
| Conservative offense | New | Not by 12 | 1,746 | 1,075 | 671 |

This bot fires simulated projectiles and earns only destroyed-enemy/boss rewards. Its 100 HP and predictive aim make it an optimistic economic probe; defense purchases are included as spending but do not change that artificial HP pool. It cannot establish real player income, retry frequency or fairness.

| Boss | P2 HP + protection | New HP + protection | First actual attack | Max offense boss-focus bot, 390×550, seed 1207 |
|---|---:|---:|---:|---:|
| Barbarian | 16 + 0 | 65 + 18 | 1.21 s | 2.94 s; 1 attack |
| Knight | 20 + 8 | 75 + 28 | 1.21 s | 3.61 s; 1 attack |
| Berserker | 26 + 0 | 100 + 0 | 1.01 s | 2.29 s; 1 attack |
| Cookieng | 32 + 10 | 130 + 40 | 1.32 s | 4.61 s; 2 attacks |

Warnings start immediately and mark the actual lanes of the first volley. Subsequent attacks alternate across lanes. The Barbarian's armor, Knight's shield, Berserker's Rage and Cookieng's crown/Golden Form remain distinct. Boss damage is never scaled to the player's upgrade level. A deterministic no-upgrade adaptive bot using projectile lead won all four at 390×550 in 23.95–54.62 s, without losing HP. At 960×614, the same bot timed out against Berserker and lost 18 HP against Cookieng; desktop no-upgrade difficulty needs human review. The max-offense horizontal barrage bot did not win every encounter. The bot aims with knowledge of model positions and is a measurement tool, not evidence of human difficulty. The P2 human diagnostic Cookieng reference was 2.142 s and zero attacks; its viewport/seed/session differ from the synthetic row above.

## New campaign cookies

| Type | First stage | HP | SP | Cookies | Base damage | Campaign fall input |
|---|---:|---:|---:|---:|---:|---:|
| Reinforced | 4 | 6 | 5 | 9 | 1 | 5.4 s |
| Bomb | 7 | 1 | 0 | 0 | 3 | 4.2 s |
| Titan | 9 | 12 | 8 | 16 | 2 | 6.2 s |

These values are configurable in `src/p0/config.ts` and `src/v2/stages.ts`; P0's default waves and three original fall inputs are unchanged. Reinforced and Titan have larger physical radii matching their sprites. Bombs hitting the ground deal three HP once and do not explode. A cannon hit detonates a Bomb: radius = 3.2 base cookie radii, damage = 6 per explosion. Other Bombs inside the radius detonate once in ID order. Bombs grant no own SP/Cookies; indirectly destroyed enemies grant their normal full rewards once. Explosions do not damage the base or bosses. Stage wave budgets were adjusted to introduce each type gradually without a global stage timer. A large cookie trapped between the left wall and obstacle in compact arenas is moved past the obstacle after 2.5 s of no downward progress; it is not removed for free.

## Diagnostic tests

With Vite dev mode, open `/v2.html?diagnostic=1`. Select any stage and a seed (0–4,294,967,295), Damage, Fire Rate and base HP. **Preview selected boss** starts one of stages 3/6/9/12 in preparation; **Start boss battle** begins combat. **Preview enemies** creates an isolated Single Bomb, Bomb cluster, Bomb chain, or Reinforced + Titan scene. These previews have no storage and do not unlock stages or pay real currency. Metrics / JSON exports local results. The diagnostic controls have no handlers in production builds.

`npm run typecheck`, `npm run test`, and `npm run build` are the final gates. `node scripts/v2-p2r1-browser-review.mjs` requires Vite on 127.0.0.1:5187 and Chrome CDP on 127.0.0.1:9225. It captures real Phaser screenshots in [`screenshots/`](screenshots/) at 320×320, 360×640, 390×844, 568×320, 1280×720 and 2560×1440. It also tests Bomb interactions, four early boss attacks, touch victory/defeat/Retry, shop purchase/reload, and P0/M10 loading. Unit tests cover the full stage 1–12 transition using deterministic projectile injections; this proves state transitions, not human accuracy or enjoyment.

## Human playtest focus

Play a fresh campaign and separately load an existing maxed P2 save. Compare Damage-first, Fire Rate-first and mixed shopping. Record purchase stage, Cookies remaining, HP lost, retries, boss durations/attack counts, Bomb chains, and whether Titan is reachable on a phone. Recheck the horizontal barrage: it should remain useful while requiring aim changes at bosses. Final numbers require player feedback.

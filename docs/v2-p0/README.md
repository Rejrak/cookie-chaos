# Cookie Chaos V2 — P0 playtest

P0 is an isolated experiment. The M10 clicker remains at `/`; the shooter is at `/p0.html`. The local GDD still says implementation is unauthorized because it predates the explicit P0 authorization in the current request. The GDD is not approved for P1–P4. MaxHP purchases, repair, bosses, and saves are outside P0.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL followed by `/p0.html`, for example `http://localhost:5173/p0.html`. Hold mouse or touch on the arena to aim and fire. On touch, select Direct or Offset before starting. Select Free or Obstacle arena, seed, and test credit before the first wave. Test credit is session only: 0, 25, or 50 Cookies. It never reads or writes the old game's save.

For a phone on the same local network, run `npm run dev -- --host 0.0.0.0` and open `http://<computer-LAN-IP>:5173/p0.html` on the phone. Actual touch hardware still needs your playtest.

Click **Start wave** after shopping. Damage Lv1 costs 20 Cookies and doubles projectile damage. Fire Rate Lv1 costs 20 Cookies and changes 3 to 4 shots/s. Purchases use consolidated Cookies only. Each wave ends after its enemy budget resolves; a 14 s deadline stops further spawns but leaves active enemies in play. The next wave waits for **Start wave**. If the three ordinary waves yield fewer than 25 SP, up to two recovery waves appear. A second insufficient recovery wave or zero base HP causes defeat. Retry keeps upgrades and consolidated Cookies, clears pending Cookies, and starts at `max(stage-entry HP, ceil(max HP / 2))`, capped at max HP.

Open **Metrics / JSON** to pause and inspect the session. **Download JSON** saves local metrics without a server. Reload to compare the same seed and arena with another test credit or touch mode. The JSON includes seed, arena, viewport, shots, hits, accuracy, ricochet hits, destroyed/escaped by type, SP, HP, damage, wallet, purchases, retries, wave durations, recovery count, and rejected spawn attempts.

## Experimental values

| Parameter | P0 value |
|---|---:|
| Base HP / SP target | 5 / 25 |
| Ordinary wave deadline / spawn gap | 14 s / 1.25 s |
| Projectile speed / life | 1.7 arena heights/s / 1.5 s |
| Damage / fire rate | 1 / 3 shots/s |
| Normal / Hard / Golden SP | 1 / 3 / 5 |
| Normal / Hard / Golden HP | 1 / 3 / 1 |
| Normal / Hard / Golden Cookies | 1 / 6 / 5 |
| Approximate unobstructed fall times | 4.5 / 5.2 / 3.3 s |

The three ordinary waves contain 5 Normal + 1 Hard, 6 Normal + 2 Hard + 1 Golden, and 6 Normal + 3 Hard + 1 Golden. Their potential SP is 8 + 17 + 20 = **45**, 20 above the target. Recovery composition depends on the deficit. Its deadline expands with its budget so that every scheduled enemy has time to spawn; this avoids a mathematically impossible recovery. Values are test parameters, not balance approval.

## Verification and limits

The M10 baseline had 137 passing tests, typecheck, and build. P0 tests cover deterministic 30/60 FPS progression, high-speed projectile hits, bounce, collisions, wave transitions, recovery, wallet, Retry, and resize. Chrome headless was checked at 320×320, 360×640, 390×844, 568×320, and 1280×720. Screenshot evidence is in `screenshots/`. Browser interaction checks covered mouse hold/release, touch drag with Offset, both upgrades, and a paused metrics panel. Those checks are technical smoke tests; they do not establish human playability, balance, or real-device touch quality.

P0 does not persist progress. HP, costs, fall times, obstacle position, and recovery pressure require human playtest. Browser screenshots show one early moment of each wave; they do not prove every later encounter fits a small screen. The provided playtest metrics support that review.

# V2 P2-R1 + P3-A progress

- Baseline: `3a06aaae1529b345d1e4dc968c86104bffa77f00`; branch: `feat/cookie-chaos-v2-p2r1-p3a`.
- R1-A: complete. Clean P2 baseline; typecheck, 194 tests and build passed. P0 and M10 entries remain separate.
- R1-B: pending. Current offensive full cost is 315 Cookies (Damage 190, Fire Rate 125), well below the observed stage-12 balance of 1,156. Existing saves store levels and balance, not paid prices; a new price table needs no schema migration.
- R1-C: pending. Current first telegraph begins at 2.5 s; Cookieng has 32 body HP and 10 guard. P2 diagnostic playtest reported a 2.142 s kill with zero boss attacks at max offense.
- P3-A1: pending. P0 currently defines three kinds; campaign will need optional enemy definitions without changing P0 defaults.
- P3-A2: pending. Bomb detonation requires deterministic single-use processing and reward ownership in the simulation.
- QA: pending. Browser review script and P2 screenshots are available; final validation must be rerun.

Experimental decisions and next action: measure stage reward capacity and purchase timing before changing price curves. Then implement R1-B with tests and update this ledger.

# V2 P2-R1 + P3-A progress

- Baseline: `3a06aaae1529b345d1e4dc968c86104bffa77f00`; branch: `feat/cookie-chaos-v2-p2r1-p3a`.
- R1-A: complete. Clean P2 baseline; typecheck, 194 tests and build passed. P0 and M10 entries remain separate.
- R1-B: implemented, pending final checkpoint test/commit. Damage costs 30/80/180/360 and Fire Rate 30/100/250 (full 1,030 versus 315); first purchases remain within stage-1's 63-Cookie perfect-collection ceiling. Through stage 6, even perfect collection plus all boss bonuses and threat caps cannot buy every offensive level. Existing saves store levels and balance, not paid prices; no schema migration or retroactive debit.
- R1-C: pending. Current first telegraph begins at 2.5 s; Cookieng has 32 body HP and 10 guard. P2 diagnostic playtest reported a 2.142 s kill with zero boss attacks at max offense.
- P3-A1: pending. P0 currently defines three kinds; campaign will need optional enemy definitions without changing P0 defaults.
- P3-A2: pending. Bomb detonation requires deterministic single-use processing and reward ownership in the simulation.
- QA: pending. Browser review script and P2 screenshots are available; final validation must be rerun.

Experimental decisions and next action: reward potential of ordinary waves before boss bonuses is 1,199 Cookies through stage 12. The new costs remain experimental; measured player income and strategies must be checked in QA. Finish R1-B tests and commit, then validate the boss overhaul already in progress.

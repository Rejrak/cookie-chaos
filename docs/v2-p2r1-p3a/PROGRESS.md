# V2 P2-R1 + P3-A progress

- Baseline: `3a06aaae1529b345d1e4dc968c86104bffa77f00`; branch: `feat/cookie-chaos-v2-p2r1-p3a`.
- R1-A: complete. Clean P2 baseline; typecheck, 194 tests and build passed. P0 and M10 entries remain separate.
- R1-B: complete (`1ed3b20`). Damage costs 30/80/180/360 and Fire Rate 30/100/250 (full 1,030 versus 315); first purchases remain within stage-1's 63-Cookie perfect-collection ceiling. Through stage 6, even perfect collection plus all boss bonuses and threat caps cannot buy every offensive level. Existing saves store levels and balance, not paid prices; no schema migration or retroactive debit. Focused test 15/15 and typecheck passed.
- R1-C: implemented, pending final test/commit. First warnings begin at battle start; first attacks occur after 1.0–1.3 s with lane telegraphs. Threats alternate lanes; Barbarian/Knight/Cookieng protections and body HP were increased, Berserker Rage is reachable. The P2 diagnostic reference was Cookieng 2.142 s/zero attacks. Current simulated max-offense boss focus at 390×550, seed 1207: Barbarian 2.94 s/1 attack, Knight 3.61 s/1, Berserker 2.29 s/1, Cookieng 4.61 s/2. No-upgrade adaptive bot wins all four but takes 23.95–59.28 s. These are deterministic projectile simulations, not human balance proof.
- P3-A1: pending. P0 currently defines three kinds; campaign will need optional enemy definitions without changing P0 defaults.
- P3-A2: pending. Bomb detonation requires deterministic single-use processing and reward ownership in the simulation.
- QA: pending. Browser review script and P2 screenshots are available; final validation must be rerun.

Experimental decisions and next action: reward potential of ordinary waves before boss bonuses is 1,199 Cookies through stage 12. The new costs remain experimental; measured player income and strategies must be checked in QA. Finish R1-C tests and commit, then add campaign-only cookie definitions.

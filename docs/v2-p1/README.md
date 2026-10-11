# Cookie Chaos V2 — P1 campaign playtest

P1 is at `/v2.html`. The old clicker remains at `/`; the approved P0 shooter remains at `/p0.html`. The 12 Kingdom I stage configurations are experimental. Official progression stops at stage 3 after its waves: Cookie Barbarian is reserved for P2, so there is no fake boss victory or stage 4 unlock. In development, `/v2.html?diagnostic=1` exposes a stage selector for isolated technical previews of stages 4–12; previews have no saved currency or unlocks.

## Run and play

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173/v2.html` on PC, or `http://<computer-LAN-IP>:5173/v2.html` on a phone on the same network. Choose Touch Direct or Offset in the opening menu. Press **Play**, then **Start wave 1**. Aim and fire by holding the mouse or dragging a finger. The next wave starts only when you press its button. The Shop opens before a wave, between waves and before Retry. It uses consolidated Cookies only; stage earnings remain pending until victory.

Stage 1 and 2 can be completed officially. Stage 3 stops at **Cookie Barbarian awaits P2** after its ordinary and any recovery waves. A defeat discards pending Cookies. Press **Retry stage**, then **Start wave 1**; bought upgrades remain. The first three stage waves do not overlap. A wave deadline stops spawning, but existing enemies continue until resolved. At most two deficit-based recovery waves follow.

The Shop currently offers Damage, Fire Rate, Max Health and one repair per stage. Prices and limits are experimental: Damage costs 20/35/55/80 (up to +4 damage), Fire Rate 20/40/65 (up to 6 shots/s), Max Health 35/55/80/110/145 (up to 10 HP), and repair costs 25 for 50% of missing HP rounded up. Normal stage wins restore +1 HP. The future boss recovery rule is +2 HP; no boss victory is possible in P1. Before pre-Retry shopping, Retry HP and its reference are normalized to the greater of the prior reference and half the maximum HP rounded up. Repair and Max Health purchases then change that reference once.

## Save and diagnostics

P1 saves in the separate `cookie-chaos-v2-campaign-v1` localStorage key. It does not read or migrate old clicker saves. Purchases, official wins, stage unlocks, HP, Retry reference and repair state are stored. Pending Cookies and mid-wave progress are never saved. Reload during a wave restarts that stage from the saved remaining HP. An invalid or unavailable save triggers an on-screen warning and a memory-only session; the invalid value is left intact. The **Metrics / JSON** dialog exports local playtest data.

Use `npm run typecheck`, `npm run test`, and `npm run build` for automated checks. `node scripts/v2-browser-review.mjs` uses a running Vite server on port 5187 and Chrome CDP on port 9225 to capture six responsive viewports, touch input, Shop state, a persisted purchase, and stage 4 diagnostic preview. Its screenshots are in [`screenshots/`](screenshots/). The script seeds a valid save only inside its browser tab to verify purchases; this is not a production credit control. Real phone and human difficulty validation remain necessary.

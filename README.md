# Cookie Chaos

An arcade clicker game with timed stages for YouTube Playables.

## Concept

Cookies spawn randomly on screen.
Click or tap them to collect rewards, purchase upgrades,
discover special cookies and defeat cookie bosses.

## Technology

- TypeScript
- Phaser 3
- Vite
- SVG-first graphics
- YouTube Playables SDK

## Features planned

- Infinite incremental progression
- Random cookie spawning
- Upgrades and special cookies
- Cookie bosses
- Cookie Rain events
- Optional rewarded ads
- Persistent progress

## Development

Requires Node.js 22 and npm.

```sh
npm install
npm run dev
```

Run `npm run typecheck`, `npm run test`, and `npm run build` to verify the game.

Destroy cookies to earn spendable Cookies and separate Stage Points. Cookie Value increases currency only. Normal, Hard, Golden, Reinforced, and Titan cookies grant 1, 3, 5, 5, and 8 Stage Points respectively. Reinforced appears at stage 4 and Titan at stage 9. Hard, Reinforced, and Titan count as Tough; later stages require a few Tough destructions as well as a full points bar. A Tough spawn is guaranteed after six successful non-Tough spawns while the requirement is unmet. Cookie HP grows by Kingdom, so Click Power helps clear resistant cookies.

Every 12 stages form a Kingdom. Positions 3, 6, 9, and 12 of each Kingdom start separate timed fights against Cookie Barbarian, Cookie Knight, Cookie Berserker, and The Cookieng after both collection goals are met. Armor, shield, and crown absorb a full hit without passing excess damage to the body. Barbarian takes double body damage for three seconds after armor breaks; Berserker gains a timely three-hit combo in Rage. Boss bonuses grow with the Kingdom number and increase spendable and lifetime Cookies, not Stage Points or normal-cookie statistics. Defeating each Cookieng unlocks two more Click Power levels. Continue after victory or retry after a timeout; balance and upgrades survive failures. The shop is disabled during boss fights; on narrow screens its modal pauses collection time, spawns, and cookie lifetimes. Progress resets on reload.

Endless progression uses exact `bigint` currency, Stage Points, and targets. Stage numbers and HP use JavaScript safe integers; unsafe scaling is rejected. The deterministic balance test walks stages 1–240 for economy, combat, and balanced purchase strategies at 2 and 4 clicks/s across three RNG seeds. It pays for upgrades from earned currency and includes misses, expirations, partial hits, retries, and a restricted viewport. Its timings are a model, not measured human play.

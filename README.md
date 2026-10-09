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

Collect normal, Golden, and Hard cookies to fill each stage's earned-cookie bar before time runs out. Every 12 stages form a Kingdom. Positions 3, 6, 9, and 12 of each Kingdom start separate timed fights against Cookie Barbarian, Cookie Knight, Cookie Berserker, and The Cookieng. Boss body and protection HP grow each Kingdom, and Hard Cookie HP starts at 3 and grows by one per Kingdom. Armor, shield, and crown absorb a full hit without passing excess damage to the body. Barbarian takes double body damage for three seconds after armor breaks; Berserker gains a timely three-hit combo in Rage. Boss bonuses grow with the Kingdom number and increase spendable and lifetime cookies, not stage progress or normal-cookie statistics. Defeating each Cookieng unlocks two more Click Power levels; the first Kingdom keeps its original two-level cap. Continue to the next global stage after victory or retry from collection after a timeout. Balance and upgrades survive failures. The shop is disabled during boss fights; on narrow screens its modal pauses collection time, spawns, and cookie lifetimes. Progress resets on reload.

Endless progression uses exact `bigint` currency and targets. Stage numbers and boss HP use JavaScript safe integers. If scaled HP would exceed that range, stage entry rejects it instead of running with imprecise damage. The deterministic balance test walks stages 1–240 at 2 and 4 clicks/s, pays for upgrades from earned currency, and checks both a normal-only collection bound and a one-in-seven Hard Cookie mix without Golden Cookies.

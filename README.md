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

Collect normal, Golden, and Hard cookies to fill each stage's earned-cookie bar before time runs out. Stages 3, 6, 9, and 12 then start a separate timed boss fight against Cookie Barbarian, Cookie Knight, Cookie Berserker, and The Cookieng. Armor, shield, and crown absorb a full hit without passing excess damage to the body. Barbarian takes double body damage for three seconds after armor breaks; Berserker gains a timely three-hit combo in Rage. Boss bonuses increase spendable and lifetime cookies, not stage progress or normal-cookie statistics. Continue after victory or retry from collection after a timeout. Balance and upgrades survive failures. The shop is disabled during boss fights; on narrow screens its modal pauses collection time, spawns, and cookie lifetimes. Progress resets on reload.

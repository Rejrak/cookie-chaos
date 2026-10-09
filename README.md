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

Collect normal, Golden, and Hard cookies to fill each stage's earned-cookie bar before time runs out. Continue after victory or retry after a timeout. Your spendable balance and upgrades survive stage failures; stage progress resets. The shop offers Cookie Value, Cookie Size, Spawn Speed, Click Power, and Golden Luck. On narrow screens, open the shop with the bottom button; stage time, spawns, and cookie lifetimes pause while it is open. Progress resets on reload.

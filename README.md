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

## Features planned

- Infinite incremental progression
- Random cookie spawning
- Upgrades and special cookies
- Cookie bosses
- Cookie Rain and Auto-clicker abilities
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

Survival starts each stage at 5 HP. Bomb Cookies appear from stage 4: clicking one hurts, while letting it expire is safe. Expired Reinforced and Titan cookies deal 1 damage. Shields absorb one damage event each; 750 ms of invulnerability follows a damaging or blocked event. The Defense shop tab sells permanent Max Health and Shield upgrades plus up to three Time Warp charges. Time Warp lasts six active seconds and halves cookie expiry and boss attack timing, while stage timers and spawns stay at normal speed. Bosses telegraph attacks and display a separate PARRY target during touch-friendly windows. A successful parry blocks the strike and stuns the attacker for 800 ms. Loss of all HP ends the stage; Retry restores HP and purchased shields without losing currency or upgrades.

Endless progression uses exact `bigint` currency, Stage Points, and targets. Stage numbers and HP use JavaScript safe integers; unsafe scaling is rejected. The deterministic balance test walks stages 1–240 for economy, combat, and balanced purchase strategies at 2 and 4 clicks/s across three RNG seeds. It pays for upgrades from earned currency and includes misses, expirations, partial hits, retries, and a restricted viewport. Its timings are a model, not measured human play.

The isolated survival simulation checks stages 4, 6, 9, 12, 18, 24, and 36 across three seeds, with accidental bomb clicks, dangerous expiry, missed clicks, boss attacks, parry rates, and retries. It starts with a representative prior balance and pays for offensive and defensive upgrades. It measures survival separately from the full economy progression test; neither simulation replaces a human playtest.

The Special shop tab sells Cookie Rain and Auto-clicker charges for earned Cookies. The first Barbarian and Knight victory in each Kingdom grants one Rain or Auto-clicker charge respectively, up to three held charges per ability. Rain lasts 12 seconds and adds one bomb-free spawn opportunity per two normal spawn intervals; the usual spawn timer and Bomb odds stay unchanged. Auto-clicker lasts 9 seconds and hits the earliest-expiring Tough Cookie, then other collectible cookies, every 600 ms. It never selects Bombs or bosses and uses the same damage and reward path as a tap. Both abilities can be activated from the play field, end at a boss or stage result, and pause with the modal shop or lost focus. They keep normal timing while Time Warp slows threat timing. Charges survive Retry and Continue.

The M9 balance simulation walks stages 1–36 with earned currency, purchases, seeded spawns, misses, bombs, dangerous expiry, bosses, and retries. It compares no ability, Rain, Auto-clicker, both, both with Time Warp, and a higher-miss profile at 2 and 4 clicks/s over three seeds. Its results measure the deterministic model, not human touch performance.

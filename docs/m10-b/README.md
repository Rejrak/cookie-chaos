# M10 · Checkpoint B — asset review

Asset integrati nel gioco Phaser; nessuna regola di gioco cambiata. La [direzione artistica](../art-direction.md) registra palette, correzioni della review A e convenzioni SVG.

## Set consegnato

| Gruppo | File | ViewBox | Uso |
|---|---|---:|---|
| Cookie | `cookie.svg`, `hard-cookie.svg`, `golden-cookie.svg`, `reinforced-cookie.svg`, `titan-cookie.svg`, `bomb-cookie.svg` | 96×96 | Texture Phaser originali, stesse chiavi |
| Crepe | `hard-cracks.svg` | 96×96 | Overlay Tough esistente, contrasto aumentato |
| Boss | `boss-barbarian.svg`, `boss-knight.svg`, `boss-berserker.svg`, `boss-cookieng.svg`, `boss-cookieng-golden.svg` | 128×128 | Texture Phaser originali, stesse chiavi |
| Fasi boss | `boss-barbarian-exposed.svg`, `boss-knight-exposed.svg`, `boss-berserker-rage.svg` | 128×128 | Cambio texture sulla transizione già prodotta dal modello |
| Mondo | `kingdom-background.svg`, `boss-arena.svg` | 1280×720 | Sfondi statici scalati con cover, dietro gli oggetti interattivi |
| Icone | 12 SVG in `public/icons/` | 48×48 | Preparati per C; non usati nell'HUD di B |

Gli SVG non contengono script, font, filtri o URL remoti. Rasterizzazione a 4×: raggio visibile cookie 47,0–47,5 px entro hitbox 48; boss 59,2–59,9 px entro hitbox 60. Phaser mantiene scala, input e geometria esistenti. La variante esposta del Knight appare soltanto dopo la rottura dello scudo; la preview A ora mostra corpo 22/22 con scudo 5/12.

## Browser smoke reale

Chrome headless su Vite, DPR 1. Screenshot reali in [`screenshots/`](screenshots/). I boss e i tipi speciali sono stati raggiunti tramite un hook temporaneo **solo DEV**, rimosso prima dei quality gate e del commit. Gli screenshot non rappresentano una partita umana completa.

Confronto: rispetto alla [raccolta M9 a 390×844](../m10-a/current/gameplay-390x844.png), lo sfondo B definisce un luogo senza nascondere cookie e testi; rispetto ai [Tough/Bomb M9](../m10-a/current/bomb-tough-390x844.png), sagome, miccia e armature B restano più riconoscibili. HUD e shop rimangono quelli di M9, per scelta di scope.

- Viewport: [320×320](screenshots/gameplay-320x320.png), [360×640](screenshots/gameplay-360x640.png), [390×844](screenshots/gameplay-390x844.png), [568×320](screenshots/gameplay-568x320.png), [1280×720](screenshots/gameplay-1280x720.png).
- Sei tipi insieme: [raccolta](screenshots/all-cookie-types-390x844.png). Damage state: [Titan 5/9 HP](screenshots/titan-damaged-390x844.png).
- Boss: [Barbarian](screenshots/barbarian-390x844.png) / [armatura rotta](screenshots/barbarian-exposed-390x844.png); [Knight](screenshots/knight-390x844.png) / [scudo 5/12](screenshots/knight-shield-damaged-390x844.png) / [esposto](screenshots/knight-exposed-390x844.png); [Berserker](screenshots/berserker-390x844.png) / [Rage](screenshots/berserker-rage-390x844.png); [Cookieng](screenshots/cookieng-390x844.png) / [Golden](screenshots/cookieng-golden-390x844.png); [Knight 568×320](screenshots/knight-568x320.png).
- Verificato caricamento delle 16 texture principali più overlay crepe, sfondo corretto nelle due fasi e nessuna eccezione JavaScript/errore console nei percorsi catturati. Click mouse e tap touch sul primo Normal: sprite rimosso, balance `1`, Stage Points `1`. Le crepe seguono gli HP del modello.

## Dimensione e limiti

Gli SVG sorgente passano da 10.118 B (12 file) a 22.757 B (29 file), +12.639 B. Build JS minificata: 1.260,02 → 1.260,75 kB, +0,73 kB; gzip 346,65 → 346,81 kB, +0,16 kB. Warning Vite sopra 500 kB già presente prima di B. Gli sfondi rasterizzati richiedono memoria GPU; ottimizzazione e misura prestazionale completa restano nel checkpoint E. L'HUD e lo shop di produzione non sono stati ridisegnati in B.

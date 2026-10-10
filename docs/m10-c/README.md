# M10 · Checkpoint C — HUD, shop e responsive UX

HUD e Kingdom Market Phaser seguono la [variante A approvata](../art-direction.md): placca superiore, valuta distinta dagli SP, salute/scudi, timer, barra, Tough, dock e tre schede shop. Le regole di gioco, i raggi, le hitbox dei cookie, i prezzi, i clock e la pausa modale non sono cambiati.

## Geometria

`calculateGameLayout()` fornisce la stessa `playArea` a rendering e `SpawnManager`. I cookie non vengono posizionati sotto HUD, dock o sidebar. A 568×320 lo shop è modale; la sidebar parte da 960 px. Il boss dispone di una fascia di stato dedicata e di un bersaglio parry di 66 px.

| Viewport | HUD | Campo di raccolta | Dock | Shop |
|---|---:|---:|---:|---|
| 320×320 | 94 px | 320×166 px | 60 px | Modale, 3 card per pagina |
| 360×640 | 160 px | 360×404 px | 76 px | Modale |
| 390×844 | 160 px | 390×608 px | 76 px | Modale |
| 568×320 | 94 px | 568×166 px | 60 px | Modale, 3 card per pagina |
| 1280×720 | 160 px | 944×484 px | 76 px | Sidebar 336 px |

La pagina compatta usa i pulsanti 44×44 per scorrere le card. Shop nascosto, card non acquistabili e abilità prive di cariche non hanno hitbox attive. Il bottone shop mobile è 44 px o più; i pulsanti del dock sono almeno 44 px di altezza. Il campo compatto ammette un Normal iniziale anche con la geometria esistente.

## Screenshot Phaser reali

Catture Chrome headless, DPR 1, dal gioco Vite. Gli stati avanzati sono stati raggiunti con un hook temporaneo solo DEV, rimosso prima del commit; le immagini non rappresentano una partita umana completa.

- Gameplay: [320×320](screenshots/gameplay-320x320.png), [360×640](screenshots/gameplay-360x640.png), [390×844](screenshots/gameplay-390x844.png), [568×320](screenshots/gameplay-568x320.png), [1280×720](screenshots/gameplay-1280x720.png).
- Raccolta con [sei tipi](screenshots/collection-multiple-390x844.png), inclusa Bomb; bomba e indicatore HUD nello stage 4 a [390×844](screenshots/bomb-gameplay-390x844.png) e [320×320](screenshots/bomb-gameplay-320x320.png).
- Correzione Tough HUD: [390×844](screenshots/tough-hud-390x844.png), [1280×720](screenshots/tough-hud-1280x720.png), [360×640](screenshots/tough-hud-360x640.png), [320×320](screenshots/tough-hud-320x320.png). Stage 9 con target `123456789012345678901234567890` SP in stato di prova per verificare numeri lunghi e messaggio Tough; nessuna modifica alle regole di produzione.
- Shop: [OFFENSE 390](screenshots/shop-offense-390x844.png), [DEFENSE 390](screenshots/shop-defense-390x844.png), [SPECIAL 390](screenshots/shop-special-390x844.png), [BUY con fondi](screenshots/shop-buy-390x844.png), [OFFENSE 320](screenshots/shop-offense-320x320.png), [pagina 2 a 320](screenshots/shop-offense-page2-320x320.png), [OFFENSE 568](screenshots/shop-offense-568x320.png).
- Boss: [Knight 390](screenshots/boss-knight-390x844.png), [parry Knight 390](screenshots/boss-parry-now-390x844.png), [Barbarian 568](screenshots/boss-barbarian-568x320.png), [warning 568](screenshots/boss-warning-568x320.png), [parry 568](screenshots/boss-parry-568x320.png).
- [Dock attivo](screenshots/ability-active-390x844.png), [vittoria 390](screenshots/victory-390x844.png), [fallimento 390](screenshots/failure-390x844.png), [vittoria 320](screenshots/victory-320x320.png), [fallimento 320](screenshots/failure-320x320.png).

## Interazioni verificate

- Mouse e touch su Normal: sprite rimosso, saldo e SP `0 → 1 → 2` senza accrediti doppi.
- Shop mobile: clock stage invariato durante 500 ms di apertura, sprite senza input; alla chiusura il tempo riprende. A 320 il click su pagina successiva mostra Power/Luck e nasconde le card precedenti; chiusura ripristina il cookie.
- Acquisti reali nelle tre schede: Value `0 → 1`, Health `0 → 1`, Rain `0 → 1` da saldo di test 1000, saldo finale 832. Con saldo zero, il pulsante è disabilitato e non spende. Auto e Warp comprati e attivati; le due durate e il timer stage restano fermi nello shop modale.
- Bomb allo stage 4: click elimina la bomba, HP `5 → 4`, nessuna valuta o SP. Resize `390 → 320` conserva ID e scadenza del cookie; con shop aperto `320 → 568` resta modale e il cookie resta nascosto.
- L'icona Bomb appare mentre esiste una bomba attiva e scompare dopo il click; a 320 è compattata senza coprire stage, timer o Tough.
- Boss: click sul Knight riduce scudo `12 → 11`, corpo resta `22/22`; parry valida porta l'attacco a `RESOLVED` senza perdere HP. Barbarian senza parry perde un HP `5 → 4`. Il bersaglio non copre il boss.
- Continue avvia Stage 2 con un cookie; Retry riavvia Stage 2 con un cookie. Nessuna eccezione JavaScript o errore console nei percorsi acquisiti.

L'errore del primo script CDP era nel test: `UpgradeManager.level()` restituisce `bigint`, non serializzabile da `Runtime.evaluate({returnByValue:true})`. La conversione a stringa ha permesso di proseguire; nessuna modifica al gameplay è stata necessaria.

La revisione del Checkpoint C ha rilevato che Tough invadeva il bordo inferiore dell'HUD. La placca non compatta ora è alta 160 px e la riga Tough occupa y=131–149, con almeno 7 px dal bordo interno; `calculateGameLayout()` sposta coerentemente il limite superiore della PlayArea. A 320×320 il messaggio è abbreviato in `Break N Tough` quando la barra è piena: anche con SP in notazione scientifica i due testi non si toccano. Chrome headless ha verificato i bounds Phaser, un cookie iniziale raggiungibile in ogni viewport e zero errori console.

## Confronto con i mockup A

La disposizione A, la palette, le icone, la distinzione SP/Cookies, lo shop laterale/modale e il dock sono presenti nel gioco. Le card usano superfici Phaser semplici e non riproducono gli ornamenti del mockup; questo mantiene testo e hitbox leggibili. Le microanimazioni elaborate restano fuori dal Checkpoint C. I cookie e boss sono gli asset approvati in B.

Baseline B: 113 test. Checkpoint C: 122 test, typecheck e build verdi. Lo smoke browser verifica l'UX locale; non è un playtest umano di progressione completa.

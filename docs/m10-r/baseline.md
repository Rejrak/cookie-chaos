# M10-R1 · baseline prima della fisica

Branch `feat/cookie-chaos-m10`, SHA iniziale `337663e7cdf99de71a43eb6539221a3516dbdb10`. `npm ci`, typecheck, 125/125 test e build hanno superato il controllo prima delle modifiche. Il primo `npm ci` nel sandbox ha fallito con `spawnSync .../esbuild EPERM`; la stessa installazione fuori dal sandbox è riuscita. Nessun problema del progetto è emerso da quel fallimento.

## Problema osservato

Il playtest umano fornito dalla revisione ha completato stage 1–12, inclusi i boss, senza upgrade, con 4/5 HP e circa 1.000 Cookies non spesi. Prima di R1 i cookie erano immobili, tutti i collezionabili duravano 8 s e le Bomb 5 s. Il giocatore poteva attendere il prossimo bersaglio senza riposizionarsi; Click Power e durata dei bersagli avevano poca urgenza nel primo Kingdom. Stage Points e valuta erano già separati, Tough e anti-sfortuna erano attivi, e i prezzi degli upgrade erano gestiti con bigint.

La simulazione M9 esistente usa click sintetici, target selezionati dal modello, risoluzione a 100 ms e nessun costo di spostamento del puntatore. Sui tre seed `1, 37, 911`, con 2/4 click/s, arrivava allo stage 36 in tutti i profili. Questo misura la coerenza delle regole, non la difficoltà percepita. Il browser smoke M10-C aveva verificato la UI ma non il movimento o il tasso di raccolta umano.

## Confronto controllato della raccolta

`src/r1-balance.test.ts` riproduce il comportamento precedente con durata 8 s/5 s e velocità zero, lasciando invariati stage, spawn, probabilità, economia e obiettivi. Il bot R1 attende 250 ms prima di scegliere un nuovo cookie, impiega tempo per spostare il puntatore a 900 px/s, introduce errori di mira, può colpire Bomb per errore e deve applicare ogni hit agli HP reali. Acquista upgrade solo con valuta raccolta. I boss vengono completati dopo la raccolta senza simularne il combattimento o attribuire bonus: questo confronto isola R1 e sottostima il denaro disponibile dopo i boss.

| Profilo precedente | Click/s | Stage raggiunto, seed 1/37/911 | Retry totali | Golden raccolti/generati | Danni totali |
|---|---:|---|---:|---:|---:|
| Nessun upgrade | 2 | 12/12/12 | 6 | 69/71 | 50 |
| Nessun upgrade | 4 | 12/12/12 | 0 | 47/47 | 0 |
| Solo Click Power | 2 | 12/12/12 | 0 | 46/46 | 0 |
| Solo Click Power | 4 | 12/12/12 | 0 | 40/40 | 0 |

I risultati sono coerenti con il playtest: un giocatore veloce completa il primo Kingdom senza pressione significativa nella raccolta. La simulazione non convalida la difficoltà dei boss; quella è fuori scope fino a R2.

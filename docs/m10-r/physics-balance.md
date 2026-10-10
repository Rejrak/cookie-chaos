# M10-R1 · fisica e bilanciamento sperimentale

## Regole implementate

| Tipo | Durata base | Con Lifetime Lv4 | Conseguenza alla scadenza |
|---|---:|---:|---|
| Normal | 3 s | 5 s | Nessuna |
| Golden | 1 s | 3 s | Nessuna |
| Hard | 4 s | 6 s | Nessuna |
| Reinforced | 5 s | 7 s | −1 HP |
| Titan | 6 s | 8 s | −1 HP |
| Bomb | 2,5 s | 2,5 s | Nessuna |

Cookie Lifetime è in OFFENSE: +500 ms per livello, massimo quattro livelli, prezzi esatti 30/45/70/105 Cookies. Si applica solo ai nuovi spawn; livello e saldo restano dopo Retry/Continue. I primi acquisti nella simulazione avvengono allo stage 3 per la strategia solo Lifetime e allo stage 5 quando si compra prima Click Power. Il costo totale di 250 Cookies per Lv4 è sostenibile con valuta realmente raccolta nei primi stage simulati. La Bomb non riceve bonus.

Il movimento usa passi fissi di 16 ms nel `SpawnManager`, con velocità deterministica ricavata da ID e stage. Nessuna chiamata RNG aggiuntiva altera spawn o anti-sfortuna. Velocità base dei quattro gruppi di stage: 35/52/70/90 px/s; i Kingdom successivi aggiungono fino a 30 px/s. La velocità è limitata al 35% dell'altezza del campo al secondo, minimo 25 px/s: nelle viewport quadrate i rimbalzi restano leggibili. Bordi e coppie di cookie usano raggio individuale, margine e gap preesistenti. In caso di resize restano ID, HP, scadenza e direzione; la velocità viene limitata solo se il nuovo campo è più basso. La simulazione gira sul threat clock: shop modale, blur e tab nascosta fermano il movimento; Time Warp dimezza movimento e consumo della durata senza rallentare il timer stage.

Golden ha 1.000 ms dal momento dello spawn; la comparsa visiva di 180 ms lascia circa 820 ms a piena opacità. Il browser a 390×844 ha mostrato Golden in movimento e ancora entro il campo dopo circa 500 ms; dopo oltre 1 s è sparito. Su [320×320](screenshots/golden-320x320-touch.png) un tap reale nella hitbox ha rimosso Golden prima della scadenza e attribuito 5 Cookies e 5 SP. Il raggio interattivo Phaser 48 moltiplicato per la scala 0,8333 coincide con il raggio logico di 40 px. Il requisito temporale è volutamente stretto: un futuro playtest touch dovrà misurarne il tasso di raccolta umano.

## Simulazione comparativa

Eseguita da `src/r1-balance.test.ts`: 144 corse, seed 1/37/911, 2/4/6/8 click/s, sei strategie, prima e dopo R1. Massimo quattro Retry per singolo stage; boss esclusi dal modello di tempo e danno. Acquisti solo con valuta guadagnata. Nessuna precisione perfetta: 250 ms di reazione, spostamento del puntatore, errori di mira più frequenti sui bersagli veloci, scadenze, HP Tough, Bomb occasionali e spawn respinti sono modellati. La frequenza dei click è una capacità teorica; il numero di hit validi è inferiore.

| Profilo R1 | Click/s | Stage raggiunto, seed 1/37/911 | Retry | Danni | Golden raccolti/generati | Tough scaduti | Hit validi/tentativi |
|---|---:|---|---:|---:|---:|---:|---:|
| Nessun upgrade | 2 | 3/4/4 | 16 | 61 | 0/52 | 133 | 783/973 |
| Nessun upgrade | 4 | 10/10/9 | 16 | 102 | 39/93 | 157 | 2220/3376 |
| Nessun upgrade | 6 | 12/12/12 | 0 | 20 | 23/50 | 23 | 1740/2424 |
| Nessun upgrade | 8 | 12/12/12 | 0 | 3 | 39/42 | 2 | 1612/2243 |
| Solo Click Power | 4 | 12/12/12 | 0 | 4 | 30/42 | 4 | 1000/1564 |
| Solo Lifetime | 4 | 11/12/10 | 16 | 107 | 73/78 | 153 | 2488/3945 |
| Power + Lifetime | 4 | 12/12/12 | 0 | 3 | 37/38 | 1 | 997/1564 |
| Speed + Lifetime | 4 | 9/10/9 | 14 | 93 | 55/80 | 163 | 1814/2735 |
| Bilanciata | 4 | 11/11/11 | 13 | 85 | 84/93 | 134 | 1356/2263 |

Click Power risolve concretamente i Tough: a 4 click/s i tre seed completano lo stage 12, mentre senza upgrade si fermano allo stage 9–10. Lifetime aumenta nettamente la raccolta Golden a 4 click/s (73/78 contro 39/93), ma non sostituisce Click Power contro Tough. A 2 click/s Lifetime consente stage 5–6 anziché 3–4; Golden rimane difficile senza investimento (0/52), una pressione da verificare con persone reali. Spawn Speed senza Click Power può peggiorare la situazione: più Tough contemporanei scadono e aumentano i danni. R3 dovrà misurare questo trade-off insieme agli obiettivi e a Cookie Rain; R1 non cambia quelle meccaniche.

Il vecchio test M9 presumeva che Auto-clicker riducesse sempre il tempo totale. Con le nuove scadenze, il profilo Auto a 2/4 click/s richiede 1.494.400 ms aggregati contro 1.441.100 ms senza abilità in quel test: la condizione di miglioramento universale è stata sostituita da misurazione esplicita. Il funzionamento e la protezione contro Bomb restano testati. L'efficienza economica di Auto e Rain appartiene a R3.

## Browser smoke e prestazioni

Catture Phaser a due istanti, circa 600 ms di distanza, per [320×320](screenshots/movement-320x320-t0.png), [360×640](screenshots/movement-360x640-t0.png), [390×844](screenshots/movement-390x844-t0.png), [568×320](screenshots/movement-568x320-t0.png), [1280×720](screenshots/movement-1280x720-t0.png). Sostituire `t0` con `t600` nel nome per vedere il secondo fotogramma. Lo stesso ID si è spostato di circa 10–25 px, con sprite e posizione del modello identici; il cookie iniziale è rimasto cliccabile e dentro la PlayArea. [Golden t0](screenshots/golden-390x844-t0.png) e [Golden t500](screenshots/golden-390x844-t500.png) mostrano il bersaglio rapido. Shop Lifetime leggibile a [320×320](screenshots/lifetime-shop-320x320.png) e [568×320](screenshots/lifetime-shop-568x320.png).

Nel browser, acquistare Lifetime Lv1 ha scalato 30 Cookies, aggiornato la card e dato 3.500 ms al Normal generato dopo l'acquisto; un tap ha rimosso quel cookie e aggiunto 1 Cookie e 1 SP. Lo shop modale ha lasciato invariato il threat clock per 500 ms. Time Warp ha fatto avanzare il gameplay di 632 ms e il threat clock di 316 ms; il cookie si è mosso di 10,6 px mentre il timer stage avanzava normalmente. Nessun errore JavaScript è stato rilevato nelle verifiche eseguite. Un microbenchmark Chrome headless locale, non un benchmark mobile, ha eseguito 10.000 passi da 16 ms con sette cookie in 30,5 ms complessivi.

Gli screenshot degli stage avanzati e l'acquisto usano un hook solo DEV, rimosso prima del commit. Le simulazioni non modellano gesti touch reali, fatica, scelta imperfetta dei target, rendering sui dispositivi lenti, parry o combattimento boss. Le durate e i prezzi restano valori sperimentali da sottoporre a review R1 e playtest umano; non sono un verdetto sul bilanciamento finale.

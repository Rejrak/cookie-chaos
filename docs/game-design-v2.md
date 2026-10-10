# Cookie Chaos — Game Design Document V2

**Versione:** 2.0  
**Stato:** Bozza consolidata, in attesa di approvazione  
**Target:** HTML5 responsive / YouTube Playables  
**Implementazione:** Non autorizzata

## 1. Visione del gioco

Cookie Chaos V2 è uno **shooter arcade difensivo con progressione incremental**.

Il giocatore controlla un cannone fisso in basso al centro dell'arena. Deve sparare ai biscotti che cadono verso il terreno, impedire che danneggino la base, ottenere Stage Points e Cookies e acquistare potenziamenti.

Il gameplay deve premiare:

- Precisione e velocità di reazione.
- Selezione delle minacce prioritarie.
- Utilizzo strategico di ostacoli e rimbalzi.
- Scelte economiche fra upgrade e abilità.
- Capacità di attaccare i boss e intercettare contemporaneamente le loro minacce.

Un giocatore particolarmente abile può completare il gioco senza upgrade, ma i potenziamenti devono offrire benefici significativi e misurabili.

## 2. Cannone e controlli

- Cannone fisso al centro inferiore.
- Rotazione nell'intero semipiano superiore.
- Munizioni infinite.
- Fuoco continuo tenendo premuto mouse o touchscreen.
- Linea di mira breve, senza previsione dei rimbalzi.
- Nessuna barra HP separata per il cannone.

Su mobile il giocatore trascina il dito per mirare e sparare. Il prototipo confronterà una mira diretta e una mira con offset rispetto al dito.

## 3. Fisica e proiettili

I proiettili del cannone viaggiano in linea retta, senza gravità, a velocità costante.

Rimbalzano su ostacoli e pareti laterali senza perdere velocità. Scompaiono quando raggiungono soffitto o terreno, quando termina il loro lifespan o, normalmente, al primo impatto con un nemico.

I biscotti seguono invece una gravità arcade, con accelerazione e velocità terminale. Collidono tra loro e rimbalzano su pareti, soffitto e ostacoli, perdendo energia.

Un biscotto bloccato riceve progressivamente una spinta verso il basso e un minore coefficiente di rimbalzo. Se necessario, viene liberato con una procedura sicura.

Quando raggiunge il terreno, applica il danno previsto una sola volta e viene rimosso.

## 4. Tipi di biscotto

| Tipo | Danno al terreno |
|---|---:|
| Normal | 1 HP |
| Hard | 1 HP |
| Golden | 0 HP |
| Reinforced | 1 HP |
| Titan | 2 HP |
| Bomb | 3 HP |

I Golden mancati comportano la perdita della ricompensa, non della salute.

Una Bomb colpita esplode e infligge danno ad area fisso ai nemici vicini, senza danneggiare la base. Le Bomb possono innescare reazioni a catena, ma ciascuna può detonare una sola volta.

Le eliminazioni indirette assegnano SP e Cookies completi, senza premi duplicati.

## 5. Ostacoli

Gli ostacoli deviano sia i biscotti sia i proiettili.

Nella campagna vengono introdotti negli stage 4–6. I layout del primo Kingdom sono progettati manualmente; successivamente si utilizza una generazione procedurale controllata.

Il prototipo P0 confronta un'arena libera e una con un unico ostacolo statico inclinato e decentrato.

I layout non devono produrre nemici permanentemente irraggiungibili o situazioni di danno inevitabile.

## 6. Stage e ondate

Ogni stage contiene un numero di ondate progettato individualmente nel primo Kingdom.

Ogni ondata possiede un tema, un budget di difficoltà e una composizione generata con casualità controllata.

Per completare lo stage occorre:

1. Raggiungere gli Stage Points richiesti.
2. Completare tutte le ondate ordinarie.
3. Sopravvivere alle minacce e, negli stage checkpoint, sconfiggere il boss.

Raggiungere gli SP in anticipo non permette di saltare le ondate.

Le ondate ordinarie devono offrire più SP potenziali dell'obiettivo, per consentire qualche errore.

Se, dopo la completa risoluzione delle ondate ordinarie, gli SP sono insufficienti, possono essere generate **al massimo due ondate di recupero**, dimensionate sul deficit e progressivamente più impegnative. Dopo la completa risoluzione della seconda ondata di recupero, se gli SP sono ancora inferiori all'obiettivo, lo stage termina in **sconfitta anche con HP della base superiori a zero**. Non si generano altre ondate di recupero. Il giocatore può effettuare Retry; le Cookies provvisorie dello stage vengono annullate, mentre upgrade acquistati e spese effettuate con valuta consolidata rimangono persistenti.

Ogni ondata e ogni boss hanno un proprio timer. Non esiste un timer globale dello stage.

Le ondate dei primi stage non si sovrappongono; la sovrapposizione controllata può comparire negli stage avanzati. Alla scadenza del timer cessano gli spawn e si risolvono le minacce rimaste.

Il numero massimo di nemici simultanei dipende dalle dimensioni dell'arena e dalla difficoltà.

## 7. Boss Battle

Boss agli stage 3, 6, 9 e 12.

Terminata la fase a ondate e raggiunti gli SP, l'arena viene liberata; dopo una breve introduzione inizia il combattimento.

Il sistema PARRY viene eliminato. Il cannone serve sia per danneggiare il boss sia per intercettare i suoi attacchi.

I boss possono normalmente essere colpiti, ma protezioni e finestre vulnerabili modificano l'efficacia del danno.

### Cookie Barbarian — Stage 3

Alterna grossi biscotti resistenti e brevi raffiche di Normal.

### Cookie Knight — Stage 6

Utilizza uno scudo che blocca parte dei colpi. Intercettare i suoi attacchi apre finestre vulnerabili.

### Cookie Berserker — Stage 9

Durante Rage alterna combo e raffiche veloci, lasciando pause leggibili per contrattaccare.

### The Cookieng — Stage 12

Combina fasi differenti, evocazioni e pattern derivati dalle meccaniche dei tre boss precedenti.

I biscotti lanciati dai boss assegnano Cookies, ma non SP. Ogni boss dispone di un budget massimo di ricompense per evitare farming infinito.

Quando gli HP del boss raggiungono zero, il boss smette **immediatamente** di generare attacchi e il suo timer si ferma. Le minacce già presenti continuano a muoversi normalmente: il giocatore deve intercettarle oppure sopravvivere ai loro impatti. Se la base raggiunge zero HP durante questa fase di cleanup, lo stage è **fallito**. Solo dopo la completa risoluzione delle minacce, con la base ancora in vita, si confermano vittoria, ricompense del boss e avanzamento della campagna. Nessuna ricompensa di vittoria viene consolidata prima di quel momento.

## 8. Upgrade del cannone

Damage e Fire Rate costituiscono la progressione offensiva principale.

Gli upgrade speciali sono:

- **Enhanced Ricochet:** si sblocca dopo lo stage 3. Il primo rimbalzo abilita un bonus danno al prossimo impatto; ulteriori rimbalzi non lo accumulano.
- **Multishot:** si sblocca dopo lo stage 6. Un colpo centrale ha danno normale, due laterali hanno danno ridotto.
- **Piercing:** si sblocca dopo lo stage 9. Permette di attraversare un numero limitato di nemici distinti.

Tutti gli upgrade speciali possono essere combinati, con costi crescenti e livelli massimi differenti.

Il danno frazionario di Multishot viene rappresentato mediante unità intere scalate, evitando errori di arrotondamento.

Ogni proiettile deve mantenere uno stato sufficiente a prevenire impatti e ricompense duplicati.

## 9. Abilità speciali

**Cookie Rain:** ondata bonus di Normal e Golden. Le eliminazioni forniscono ricompense, mentre i Normal persi danneggiano la base. Massimo un utilizzo per ondata ordinaria o di recupero. Non disponibile durante i boss.

**Auto-clicker:** torretta temporanea che intercetta prioritariamente i biscotti pericolosi. Le sue eliminazioni assegnano SP e Cookies completi, rispettando le regole della Boss Battle.

**Time Warp:** rallenta nemici, boss e attacchi ostili, lasciando invariati cannone, proiettili alleati e timer.

Le abilità consumano Cookies consolidate, hanno cooldown e costi riducibili tramite upgrade, ma sempre strettamente positivi.

## 10. Shop, economia e Retry

Il negozio è accessibile nelle pause dedicate tra ondate e tra stage.

Gli upgrade sono permanenti lungo la progressione, inclusi Kingdom successivi ed Endless Mode.

Nella campagna le Cookies raccolte durante uno stage sono provvisorie. Diventano spendibili soltanto dopo la vittoria e vengono annullate in caso di sconfitta.

Gli acquisti e gli utilizzi delle abilità consumano invece valuta già consolidata e non vengono rimborsati al Retry.

Gli HP persistono tra stage, con recupero di:

- +1 HP dopo uno stage normale.
- +2 HP dopo uno stage con boss.

In caso di sconfitta il giocatore può ritentare lo stage corrente mantenendo gli upgrade. Gli HP disponibili all'ingresso dello stage vengono registrati una sola volta come `HP_ingresso`; i Retry successivi non sostituiscono questo riferimento con gli HP del tentativo precedente.

Gli HP iniziali di ogni Retry sono:

`HP_retry = min(MaxHP, max(HP_ingresso + HP_riparati, ceil(MaxHP / 2)))`

`HP_riparati` è il totale degli HP **effettivamente recuperati** tramite l'unica riparazione consentita nello stage. La riparazione aggiorna il riferimento dei Retry una sola volta, rimane valida nei tentativi successivi e non può essere riacquistata nello stesso stage. Il costo resta speso anche dopo una sconfitta.

Esempio: con `MaxHP = 10` e `HP_ingresso = 4`, il primo Retry senza riparazione parte da 5 HP. Se durante un tentativo l'unica riparazione recupera effettivamente 3 HP, il riferimento diventa 7 e i Retry successivi partono da 7 HP. La percentuale di riparazione e le regole di arrotondamento restano parametri sperimentali.

## 11. Kingdom ed Endless Mode

Dopo Cookieng allo stage 12 il giocatore sceglie fra Kingdom 2 ed Endless Mode.

Nei Kingdom successivi aumentano gradualmente statistiche e complessità, rispettando i limiti di pressione simultanea.

L'Endless Mode presenta:

- Ondate illimitate e difficoltà crescente.
- Boss alle ondate 3, 6, 9 e 12 di ogni ciclo da 12.
- Difficoltà basata sulle ondate raggiunte, non sugli upgrade posseduti.
- Upgrade condivisi con la campagna.
- HP Endless separati dagli HP Campagna.
- Ogni tentativo avviato con HP pieni.
- Fine del tentativo a zero HP, senza Retry.
- Cookies consolidate al completamento delle singole ondate.
- Possibilità di tornare alla campagna durante le pause.
- Record ordinato prima per ondate completate, poi per punteggio.

## 12. Salvataggi

Si salvano checkpoint degli stage, progressione sbloccata, upgrade, valuta consolidata e record.

Uno stage interrotto ricomincia dall'inizio.

Gli acquisti già effettuati devono essere persistiti in modo coerente, anche se l'avanzamento della singola ondata non viene salvato.

Non devono essere possibili duplicazioni di Cookies, rimborsi accidentali o recuperi gratuiti degli HP tramite riavvio.

## 13. Prototipo P0

Il primo prototipo è una vertical slice indipendente dal vecchio clicker.

Deve contenere:

- Un mini-stage di tre ondate.
- Normal, Hard e Golden.
- Cannone, proiettili, gravità e collisioni.
- SP, HP, vittoria, sconfitta e Retry.
- Fino a due ondate di recupero.
- Shop Damage e Fire Rate.
- Credito consolidato configurabile esclusivamente per i test, con scenario anche a zero Cookies.
- Arena libera e arena con un ostacolo inclinato.
- Mira touch diretta e con offset.
- Metriche locali esportabili.
- Test desktop e mobile.

### Parametri sperimentali

| Parametro | Valore iniziale |
|---|---:|
| Danno cannone | 1 |
| Fire Rate | 3 colpi/s |
| Velocità proiettile | 1,7 altezze del campo/s |
| Lifespan proiettile | 1,5 s |
| Damage Lv1 | +1 danno |
| Fire Rate Lv1 | 4 colpi/s |
| HP iniziali | 5 |
| Caduta Normal | ~4,5 s |
| Caduta Hard | ~5,2 s |
| Caduta Golden | ~3,3 s |
| Obiettivo | 25 SP |

Composizione di prova:

- Ondata 1: 5 Normal, 1 Hard.
- Ondata 2: 6 Normal, 2 Hard, 1 Golden.
- Ondata 3: 6 Normal, 3 Hard, 1 Golden.

Tutti questi numeri sono **sperimentali**, non approvati come bilanciamento definitivo.

### Validazione

Il prototipo deve superare i gate tecnici: collisioni, economia, progressione, responsive, test, build e assenza di softlock.

Si registreranno colpi, precisione, nemici distrutti e persi, SP, danni, acquisti, Retry, tempi delle ondate e utilizzo dei rimbalzi.

Il bilanciamento sarà valutato confrontando stessi seed, differenti arene e loadout con e senza upgrade.

**L'approvazione finale appartiene all'utente dopo un playtest reale.** Il superamento dei test automatici non autorizza lo sviluppo completo.

## 14. Questioni aperte e sviluppo successivo

Restano da precisare:

- Destino del tentativo Endless quando il giocatore abbandona volontariamente la modalità.
- Parametri numerici di fisica, costi, livelli massimi, riparazioni e abilità.
- Ricompensa specifica per la vittoria dei boss, distinta dai biscotti intercettati.
- Catalogo definitivo degli upgrade economici e difensivi ereditati dalla versione precedente.
- Persistenza e migrazione di eventuali salvataggi V1.
- Ambito esatto della riparazione: momento d'acquisto consentito e trattamento di un eventuale aumento di `MaxHP` durante lo stage.

Questi elementi non devono essere interpretati come decisioni già approvate.

La sequenza di sviluppo prevista è:

1. P0 — Prototipo giocabile e validazione umana.
2. P1 — Campagna, progressione e shop completi.
3. P2 — Quattro Boss Battle.
4. P3 — Abilità, Bomb, Tough avanzati e upgrade speciali.
5. P4 — Kingdom successivi, Endless, bilanciamento e polish.

**Stato del documento:** pronto per revisione, non autorizzato per implementazione.

**Nessun prompt Astra deve essere prodotto o eseguito prima dell'approvazione del Game Design Document V2.**

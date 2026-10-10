# Cookie Chaos · Checkpoint A — art direction

**Status:** Checkpoint A e B approvati; Checkpoint C in revisione. I mockup sono statici: non sostituiscono la UI Phaser, non cambiano regole, dimensioni logiche, asset o hitbox. Le cifre nelle scene rappresentano uno stato illustrativo, non una nuova configurazione di gameplay.

## 1. Visione

**Whimsical Fantasy Cookie Kingdom:** un piccolo regno di biscotti, caramello e armature di cioccolato. La scena resta ariosa e leggibile come un arcade touch. Sagome nette, bordi color cacao di spessore uniforme, luci piatte e una sola ombra corta danno profondità senza glow diffuso. La gerarchia è: bersaglio/pericolo, stato vitale e timer, obiettivo, economia, decorazione.

L'arte va costruita con SVG originali locali; nessuna risorsa remota a runtime. La composizione riusa texture Phaser e `GameObjects` già presenti. I pannelli proposti possono essere rettangoli arrotondati e testi Phaser; gli ornamenti non richiedono un nuovo framework UI. L'anteprima HTML/CSS/SVG è solo un mezzo di revisione.

## 2. Audit dell'interfaccia M9

Audit reale con Chrome headless e Vite, branch M10 prima di modifiche di produzione. Le schermate in [`docs/m10-a/current/`](m10-a/current/) sono catture browser a 320×320, 360×640, 390×844, 568×320 e 1280×720. Stati Bomb/Tough, boss, shop e terminali sono stati riprodotti tramite un hook **temporaneo solo DEV**; l'hook viene rimosso prima del commit. Non sono screenshot di un percorso umano completo. Chrome non ha segnalato eccezioni JavaScript negli scenari catturati.

| Ambito | Evidenza | Valutazione |
|---|---|---|
| Identità | Sfondo uniforme crema; pannelli e pulsanti come rettangoli piatti in gameplay, shop e terminali. | Estetica: il mondo non ha luogo o materiali riconoscibili. |
| Gerarchia | A 390×844 il testo dello HUD concentra titolo, saldo, salute, stage, tempo, SP e Tough in 120 px. Timer e Tough competono visivamente con informazioni secondarie. | UX: priorità leggibili solo dopo lettura ravvicinata. |
| Tipi di cookie | Bomb ha miccia/segno `!`; Golden è giallo, Tough ha dettagli propri. Le sagome restano soprattutto cerchi simili e piccoli sul campo ampio. | Estetica/riconoscimento: rafforzare profili, simboli e armature; mantenere l'identità attuale. |
| Pericolo e parry | Il bersaglio `PARRY` è un cerchio di diametro 54 px; boss warning è testo. Lo scudo del Knight copre parte del viso. | UX: aumentare bersaglio e separare avviso da HP. Non modificare finestre temporali. |
| Shop | OFFENSE, DEFENSE, SPECIAL sono selezionabili; su 390×844 alcune schede lasciano grande vuoto. Stato `Need more` è una riga di testo in una card poco distinta. | Estetica/UX: card semantiche, prezzo e azione separati, motivo del blocco visibile. |
| Compatto | A 568×320 lo shop laterale prende 312 px: campo di gioco 256×128 px. Righe shop circa 42 px; dimensione inferiore al target touch proposto di 44 px. A 320×320 il campo verticale utile è 128 px. | Funzionale/UX: il campo resta utilizzabile ma ristretto; soglia sidebar e layout compatto vanno rivisti al checkpoint C. |
| Vittoria/fallimento | Overlay centrato e funzionale, ma senza gerarchia visiva per SP, Tough, valuta e bonus; tutti sono testo bianco simile. | Estetica/UX: distinguere risorse e azione successiva. |

Screenshot esistenti: [320×320](m10-a/current/gameplay-320x320.png), [360×640](m10-a/current/gameplay-360x640.png), [390×844](m10-a/current/gameplay-390x844.png), [568×320](m10-a/current/gameplay-568x320.png), [1280×720](m10-a/current/gameplay-1280x720.png), [Bomb/Tough](m10-a/current/bomb-tough-390x844.png), [shop OFFENSE](m10-a/current/shop-offense-390x844.png), [DEFENSE](m10-a/current/shop-defense-390x844.png), [SPECIAL](m10-a/current/shop-special-390x844.png), [boss warning](m10-a/current/boss-warning-390x844.png), [parry](m10-a/current/boss-parry-390x844.png), [vittoria](m10-a/current/victory-390x844.png), [fallimento](m10-a/current/failure-390x844.png).

### Vincoli tecnici da rispettare in B–D

- `src/game.ts`: sei tipi di cookie; raggio logico iniziale 40 px, fino a 56 tramite upgrade, `COOKIE_SOURCE_RADIUS = 48`, `RULES.gap = 12`, massimo 7 attivi. La geometria deve restare governata dal modello. Lo SVG 96×96 ha bordo esterno fino a raggio 48; modificare il disegno senza adeguare il raggio visibile creerebbe hitbox incoerente.
- `src/main.ts`: SVG preload → texture Phaser; sprite, cerchio interattivo e overlay crepe separati; il resize ricalcola PlayArea e riposiziona soltanto i cookie invalidi. Lo shop laterale appare da 560 px di larghezza se altezza sufficiente, e occupa 312 px. HUD attuale 120 px, dock basso 72 px. La nuova UI deve fornire le proprie esclusioni geometriche al modello, senza coprire bersagli.
- Boss: texture SVG 128×128, sprite scalato, hitbox circolare; parry target è separato dal boss. `BossManager` e `BossAttackController` restano fonti di verità per fase e finestre. `TimeWarp`, Rain e Auto usano clock e stati indipendenti dal rendering.
- Font e CSS globali attuali sono locali; Phaser `Text` usa `system-ui`. La preview non dimostra l'implementazione in Phaser né la sua resa effettiva su ogni dispositivo.

## 3. Palette semantica

I colori esprimono **ruolo**; icona, testo e forma devono confermare gli stati. La tabella è la fonte dei token da usare nei checkpoint successivi.

| Token | HEX | Uso |
|---|---|---|
| `world.paper` | `#F3D6A0` | Fondo regno, tonalità calda uniforme |
| `world.battle` | `#D4AB78` | Arena boss, leggermente più scura |
| `world.hill` | `#BD844F` | Colline decorative a basso contrasto |
| `panel` | `#FFF6DF` | HUD, card, shop |
| `panel.secondary` | `#F5E4BF` | Superfici secondarie |
| `border` | `#845236` | Bordo cacao |
| `text.primary` | `#35251E` | Testo su fondo chiaro |
| `text.secondary` | `#6C5243` | Dettagli su fondo chiaro |
| `button.primary` | `#236451` | Compra / conferma |
| `button.secondary` | `#6B3E29` | Shop / tab selezionata |
| `button.disabled` | `#A79C8B` | Azione non disponibile, con testo di motivo |
| `currency` | `#9B6327` | Valuta; icona rombo/moneta |
| `stage.points` | `#276B93` | SP; barra e abbreviazione SP |
| `health` | `#A93438` | Cuore / HP persi |
| `shield` | `#426F9F` | Scudo / cariche |
| `timer.critical` | `#A93438` | Ultimi 10 secondi, insieme a `!` e testo |
| `danger.bomb` | `#392F3C` | Bomba, miccia e `!` chiari |
| `golden` | `#EAB650` | Cookie premio / metallo oro |
| `time.warp` | `#5A4D9C` | Clessidra / Time Warp |
| `cookie.rain` | `#176D7A` | Pioggia / gocce |
| `auto.clicker` | `#7653A0` | Auto / stella meccanica |
| `parry.ready` | `#236451` | Parry attiva; scudo con bersaglio e testo |
| `boss.rage` | `#9F3437` | Rage; sopracciglia, segni e banner |

Verifica dei contrasti dei ruoli principali: testo `#35251E`/pannello `#FFF6DF` 13,59:1; secondario 6,67:1; testo chiaro/pulsante primario 6,47:1; testo chiaro/pericolo 6,03:1; testo chiaro/SP 5,40:1. Gli accenti chiari come oro non sono usati per testo piccolo su crema.

## 4. Typography e design tokens

- Titoli: `Georgia, Cambria, serif`, 700–900, aspetto di libro illustrato; fallback serif locale. Numeri, stat, pulsanti: `system-ui, -apple-system, Arial, sans-serif`, 700–900. Solo font di sistema in A, quindi preview offline; se la fedeltà cross-device risulta insufficiente, approvare un font locale con licenza verificata in B/C.
- Minimi consigliati: 16 px per valori prioritari e pulsanti, 14 px per spiegazioni, 12 px solo per metadata non essenziali; target touch 44×44 px, parry ≥64×64 px su piccolo mobile, preferibile 72–82 px quando c'è spazio. La preview a 390 usa alcuni dettagli da 11–12 px: **obiettivo di revisione**, da rialzare dove possibile nell'implementazione Phaser.
- Gerarchia: display 24–26, titolo 20–22, dato 16–18, etichetta 12–14. Numeri `tabular-nums`; abbreviazioni K/M/B/T dal formatter esistente; valore pieno dove serve conferma di acquisto. Non troncare il timer.
- Spaziatura 4/8/12/16 px; bordo esterno 3 px; angoli 9–15 px; ombra rigida 4–5 px, non bagliore. Una sola famiglia di pannelli biscotto/pergamena. Stato selezionato = superficie più scura **e** bordo/posizione; stato disabilitato = contrasto ridotto **e** etichetta esplicita.
- Icone semanticamente stabili: `♥` HP, `◆` Shield, `⌛` timer, `◈` Cookies, `SP` punti, `✦` Tough, `!` Bomb, `✦/PARRY` bersaglio. In produzione le icone richiederanno SVG originali con tratti coerenti; i glifi della preview sono segnaposto grafici.

## 5. Cookie: sagoma prima del colore

| Tipo | Sagoma e materiale | Indicatore piccolo / danno |
|---|---|---|
| Normal | Disco irregolare dorato, bordo cacao, 4–5 gocce grandi. | Due riflessi zucchero, silhouette più semplice. |
| Hard | Bordo spesso spezzato, crosta scura. | Crepe a 2 livelli leggibili; nessun cambio di hitbox. |
| Golden | Profilo a punte morbide, medaglione/stella inciso. | Riflesso statico e rotazione minima opzionale; `✧` premio, mai simile alla bomba. |
| Reinforced | Disco con due bande diagonali di cioccolato e rivetto centrale. | Le bande si fessurano per HP residui. |
| Titan | Ottagono ampio, piastre e nucleo a rombo. | Piastre segnate in 3 stati, nessun cambio della dimensione logica. |
| Bomb | Corpo scuro con miccia, forma più sferica e `!` centrale. | Pericolo leggibile in scala di grigi; scadenza = uscita innocua. |

La preview illustra le sagome ma non è un asset B. Al prossimo checkpoint gli SVG dovranno allineare bordo visibile, scala Phaser, cerchio interattivo e raggio modello, lasciando invariati HP, reward, SP e probabilità.

## 6. Boss e stati

| Boss | Identità visiva | Stati da rendere evidenti |
|---|---|---|
| Cookie Barbarian | Profilo largo, elmo con corna, clava corta, marrone tostato/rosso. | Armatura integra → frammentata; vulnerabilità con crepa grande + badge `2× DAMAGE`; sconfitta con abbassamento arma. |
| Cookie Knight | Elmo argento, scudo grande a croce caramello, mantello rosso. | Scudo pieno → incrinato → abbassato; corpo esposto con testo; Shield Bash con simbolo scudo e countdown visivo. |
| Cookie Berserker | Bordo sbrecciato, ciocche di glassa, occhi obliqui. | Rage: sopracciglia/segni rossi e banner `RAGE`; combo 1/3–3/3; attacco doppio con `1/2`, `2/2`. |
| The Cookieng | Corona alta, mantello, scettro di cioccolato; silhouette più alta. | Corona protetta → rotta; Golden Form con corpo oro e forma riconoscibile; Royal Decree con sigillo `!`. |

Il telegraph in tutti i boss ha tre segnali: nome breve dell'attacco, simbolo/forma, stato `WARNING` o `PARRY NOW`. Il bersaglio di parata è **separato** dal corpo e non copre HP o Time Warp. Vulnerabile/stordito/sconfitto usano postura e testo oltre al colore. Le finestre e gli HP rimangono quelli del modello.

## 7. Background

Tre piani leggeri: carta calda quasi uniforme, colline di caramello con bordi poco contrastati, 2–4 scintille di zucchero. L'arena boss usa una base più scura e un arco/castello astratto, senza distrarre dal boss. Decorazioni lontane dai bersagli; nessuna animazione continua obbligatoria. Il background non viene usato per indicare collisioni o aree cliccabili.

## 8. HUD e composizioni

**Variante A — placca superiore a due fasce (raccomandata; nei quattro mockup).** Riga 1: marchio piccolo, Kingdom/Stage, timer. Riga 2: ♥ HP, ◆ Shield, ◈ valuta. Riga 3: SP numerici + barra. Riga 4 solo quando richiesto: Tough e istruzione sintetica. Dock basso: Shop, Rain, Auto, Warp; abilità senza cariche restano visibili ma disattivate, se lo spazio lo consente. Boss: stessa placca, barra HP/protezione nella PlayArea, telegraph sotto; Shop disabilitato.

**Variante B — fascia singola compressa con popover obiettivo.** Occupa meno altezza a 320×320 ma costringe a nascondere Tough o valuta, aumentando letture e tocchi. La preview M9 dimostra che il collo di bottiglia 320×320 è reale; la variante B va usata solo come adattamento di A nella viewport quadrata, conservando timer/HP/SP visibili.

| Criterio | A | B |
|---|---|---|
| SP vs valuta | Distinti sempre | Possibile popover |
| Touch e parry | Spazio verticale maggiore richiesto | Spazio arena maggiore |
| Scansione su 390×844 / 1280×720 | Migliore | Più densa |
| 320×320 | Necessita versione compatta | Più comoda ma nasconde informazioni |

Scelta raccomandata: **A, con adattamento compatto a 320×320 e 568×320**, da validare in Phaser al checkpoint C. Non aumentare l'HUD a costo di nascondere cookie: PlayArea e soglia sidebar devono seguire il layout effettivo.

## 9. Shop

- Mobile: pannello modale con chiusura 44×44 in alto, saldo fisso, tre tab `OFFENSE / DEFENSE / SPECIAL` con etichetta e selezione visibile. Card = icona, nome/livello, effetto, prezzo in una zona di azione 44+ px. `BUY`, `NEED`, `LOCKED`, `WAIT UNTIL STAGE…`, `MAX` hanno testi distinti. Conferma acquisto: flash breve del bordo e numero aggiornato. Fondi insufficienti: pulsante inattivo con prezzo e motivo, nessuna animazione di errore invadente.
- Desktop: pannello laterale in bordo cacao, collassabile se necessario. Il campo resta protetto da esclusione geometrica. A 568×320 **non** mantenere automaticamente 312 px di sidebar: usare la variante compatta/modale con almeno un cookie normale giocabile e righe ≥44 px.
- La preview OFFENSE usa costi/esempi coerenti con `UpgradeManager` per livelli mostrati: balance 100; Cookie Value Lv5 costa 218 (`NEED`), Size Lv2 36, Speed Lv3 68, Power Lv1 38, Luck Lv0 40. DEFENSE/SPECIAL seguono la stessa struttura visiva; non sono ancora implementate nella preview statica. Il pannello modale deve continuare a fermare i clock già previsti dal gioco.

## 10. Responsive e accessibilità

| Viewport | Regola di composizione proposta |
|---|---|
| 320×320 | HUD essenziale con HP, timer, SP e Tough; Wallet secondario. Shop modale compatto. Dock con accesso rapido, eventuale espansione abilità. Bersagli ≥44 px; cookie iniziale raggiungibile. |
| 360×640 | Placca a due fasce e dock, card shop a riga singola; arena protagonista. |
| 390×844 | Mockup principale: informazioni complete senza sovrapposizione. |
| 568×320 | Layout landscape compatto; preferire shop modale/collassato, non sidebar fissa da 312 px. Boss e parry occupano campo centrale. |
| 1280×720 | Shop laterale; HUD soltanto sopra PlayArea, dock sotto; nessun cookie sotto pannello. |

La UI non usa solo colore: `!` + miccia per Bomb, cuore per HP, scudo per protezione, testo per parry e Tough, simboli per abilità. Contrasto testo primario ≥4.5:1 nei token principali; indicazioni critiche mai sotto 12 px e da puntare a 14–16 px. Focus/hover per mouse e target touch ≥44 px, salvo decorazioni non interattive. Le animazioni opzionali rispettano `prefers-reduced-motion`; i cambiamenti di stato rimangono visibili anche senza movimento. Evitare layout che facciano scrollare la pagina.

## 11. Specifiche di animazione per D

Solo indicazioni visive, senza lavoro implementativo in A: comparsa cookie 120–160 ms; hit 80–120 ms; crepa aggiornamento immediato; distruzione 140–200 ms; feedback SP/valuta compatto 450–650 ms; bomba 180 ms con `!`; scudo/blocco 150 ms; parry 160 ms con `PARRY!`; boss phase 250–350 ms; Clear 300 ms. In `prefers-reduced-motion` sostituire spostamenti/scale con cambio di bordo/testo o dissolvenza ≤100 ms. Nessun tween determina reward, danno o durata: gli eventi logici restano nel modello.

## 12. Convenzioni SVG e asset del checkpoint B

SVG originali, `viewBox` coerente (cookie 96×96, boss 128×128 se le texture esistenti restano tali), stroke a spessore ripetibile, path semplici e pochi layer; niente font embedded, filtri costosi o link esterni. Misurare il raggio visivo **incluso lo stroke**; allinearlo al `COOKIE_SOURCE_RADIUS` e alla hitbox Phaser. I dettagli essenziali devono restare leggibili a 80 px. Per ciascun tipo, un contorno stabile; per stato danneggiato, riutilizzare l'overlay già presente dove possibile.

Asset da produrre **solo dopo approvazione A**: sei SVG cookie nelle texture già denominate; quattro SVG boss e variante Golden Cookieng; sfondo leggero di Kingdom e arena boss; piccole icone locali per HP, Shield, SP, valuta, Bomb, Shop, Time Warp, Rain, Auto, Tough e Parry; eventuali overlay crepe/protezioni. Conservare nomi texture e path esistenti quando possibile. Nessun asset di B è stato sostituito in A.

## 13. Mockup e come vederli

Preview statica: [`docs/m10-a/preview.html`](m10-a/preview.html). Avviare `npm run dev` e aprire:

- `/docs/m10-a/preview.html?screen=gameplay-mobile` — [PNG 390×844](m10-a/mockups/gameplay-mobile-390x844.png)
- `/docs/m10-a/preview.html?screen=shop-mobile` — [PNG 390×844](m10-a/mockups/shop-mobile-390x844.png)
- `/docs/m10-a/preview.html?screen=boss-mobile` — [PNG 390×844](m10-a/mockups/boss-mobile-390x844.png)
- `/docs/m10-a/preview.html?screen=gameplay-desktop` — [PNG 1280×720](m10-a/mockups/gameplay-desktop-1280x720.png)

I quattro PNG sono screenshot effettivi della preview acquisiti con Chrome headless, DPR 1. Non sono screenshot di Phaser o prova di fattibilità del layout finale.

## 14. Decisioni da approvare prima di B

1. Confermare la direzione **Cookie Kingdom** e la palette cacao/pergamena con accenti semantici.
2. Confermare le sagome (Golden a stella, Titan ottagonale, Bomb con miccia/`!`) e il livello di dettaglio degli SVG.
3. Confermare HUD A e l'adattamento compatto per 320×320 / 568×320, inclusa la proposta di shop modale in landscape stretto.
4. Confermare font di sistema offline o chiedere un font locale specifico con licenza da integrare più avanti.
5. Confermare se il dock abilità deve mostrare sempre le cariche a 390×844 o collassarsi quando non disponibili.

**Nessuna scelta modifica le meccaniche M1–M9.** Le scelte di A sono state approvate; C, D ed E restano fermi durante B.

## 15. Checkpoint B — correzioni della review A e asset

- Mockup Knight corretto: con scudo `5/12`, corpo `22/22 HP` e barra corpo piena. La protezione assorbe interamente i colpi finché è attiva.
- Hard distingue ora la propria sagoma dal Normal con bordo angolare spezzato, crosta più scura e fenditure grandi. Normal mantiene bordo morbido e gocce riconoscibili.
- Golden usa corona a punte morbide e medaglione/stella; Titan usa ottagono con piastre; Bomb usa miccia e grande `!`. Sagoma e segno restano leggibili senza colore.
- Le sei texture cookie mantengono `viewBox="0 0 96 96"`. I boss mantengono `viewBox="0 0 128 128"`. Rasterizzate a 4×, le sagome occupano raggi 47,0–47,5 px e 59,2–59,9 px: restano entro le hitbox circolari di raggio 48 e 60, con tolleranza touch inferiore a 1 px per i cookie. Raggi logici, scala, `SpawnManager`, input e regole restano invariati.
- Le texture di fase aggiunte sono `boss-barbarian-exposed.svg`, `boss-knight-exposed.svg` e `boss-berserker-rage.svg`. Il gioco cambia soltanto texture quando il modello segnala una fase; `boss-cookieng-golden.svg` conserva la propria chiave. Il guard dello scudo Knight è reso leggero e spostato sullo scudo illustrato, per non nascondere il viso.
- `kingdom-background.svg` e `boss-arena.svg` hanno `viewBox="0 0 1280 720"`; Phaser li scala con modalità cover, senza stirarli. Le decorazioni hanno basso contrasto e restano dietro ai GameObjects interattivi.
- `public/icons/` contiene 12 SVG da 48×48, pronti per l'HUD del checkpoint C. Non sono ancora caricati né mostrati nella UI di produzione.
- SVG locali validati come XML, senza font, filtri, script o dipendenze remote. Dimensione totale dei 29 SVG: **22.757 byte**; il set precedente era **10.118 byte** in 12 file. Incremento degli asset sorgente: **12.639 byte**. Lo sfondo rasterizzato occupa memoria GPU; la verifica prestazionale completa è riservata al checkpoint E.

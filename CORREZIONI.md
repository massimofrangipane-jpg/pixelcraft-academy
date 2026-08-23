# Correzioni applicate — v2

## 1. La percentuale di sicurezza non è più un contatore

**Com'era.** `js/knn.js` calcolava:

```
conf = 0.18 + 0.42 × evidenza + 0.22 × (accordo − 0.5) × 2 + 0.12 × margine
evidenza = min(n_gatti, n_case) / 10
```

Due problemi. Con due classi `(accordo − 0.5) × 2` e `margine` sono
**algebricamente lo stesso numero**: due termini su quattro erano un
duplicato. E il 42% del valore mostrato era il numero di foto scattate.

Conseguenza misurata: un classificatore **perfetto** con 1 esempio per
classe mostrava 56%; uno che **tirava a indovinare** con 10 esempi
mostrava 60%. Su due categorie il caso puro vale 50%, e veniva premiato.

**Com'è adesso.** `predictKnn` restituisce solo misure. Il conteggio degli
esempi non entra in nessun punteggio.

| valore | che cosa misura davvero |
|---|---|
| `agreement` | quota di voto pesato andata alla categoria vincente |
| `nearestDist` | distanza coseno dal disegno più simile fra quelli visti |
| `familiarity` | `nearestDist` rapportata alla scala dei dati del bambino |
| `isNew` | l'immagine non è una di quelle già memorizzate |

La **scala** non è una costante inventata: è la mediana della distanza fra
disegni della stessa categoria, ricalcolata a ogni aggiunta o rimozione
(`neighbourScale`). Vuol dire "questo disegno è vicino a ciò che ho visto
quanto i miei esempi sono vicini fra loro".

## 2. Due barre invece di una

Il numero unico fondeva grandezze diverse. Ora:

- **Sicurezza** — quanto i disegni simili sono d'accordo fra loro
- **Somiglianza** — quanto assomiglia a ciò che EDO ha già visto
- **riga di testo** — "Ho visto 6 gatti e 6 case", dichiarato come conteggio,
  non travestito da misura

Il bambino vede due cose muoversi e ricava il legame da solo.

## 3. Due incertezze diverse, due frasi diverse

Prima esisteva una sola frase per ogni caso di dubbio. Adesso il segnale
che si abbassa dice quale sia il problema:

- somiglianza sotto il 35% → *"Non ho mai visto niente di simile."*
- accordo sotto il 70% → *"Alcuni disegni dicono una cosa, altri un'altra."*

Sono due lezioni distinte: dati assenti contro dati contraddittori.

## 4. La terza stella non si compra con le foto

Prima era agganciata alla percentuale, cioè in gran parte al contatore. Un
modello perfetto con 3 esempi non poteva superare la soglia; a 5 esempi la
superava comunque.

Adesso si vince solo confermando un riconoscimento corretto su un disegno
che **non è fra quelli memorizzati** (`isNew`, distanza > 0.02). Se il
bambino inquadra un disegno già fotografato, EDO lo dice e la stella non
scatta.

## 5. Bug: si confermava un fotogramma diverso da quello visto

Il ciclo live sovrascriveva `state.freeze` ogni 550 ms. Toccando "No, è una
casa" il bambino etichettava il fotogramma **corrente**, non quello mostrato
quando aveva deciso — quindi finiva in archivio un'immagine sbagliata, con
un'etichetta giusta. Avvelenamento silenzioso del training set.

Corretto: canvas e predizione ora viaggiano come coppia atomica
(`state.shown`), e il ciclo si mette in pausa durante la conferma.

## 6. Bug: il service worker falliva in silenzio

`cache.addAll()` è tutto-o-niente. Su rete mobile un solo file fallito fra i
3,4 MB scartava l'intero precache **senza errori visibili**: l'app sembrava
funzionare finché c'era rete e poi non partiva in modalità aereo.

Adesso ogni file va per conto suo. I file vitali, se mancano, fanno fallire
l'install in modo esplicito e loggato; le icone no. Aggiunti al precache
`apple-touch-icon.png`, `404.html`, `og.jpg`, che mancavano.

## 7. Miniature 10 volte più leggere

Erano JPEG a 224 px (~10 KB l'una in base64) per un pollice che si vede a
40 px. Con 48 esempi si arrivava vicino alla quota di `localStorage`. Ora
88 px, e se la quota si riempie comunque, `savePersist` scarta le miniature
e **conserva i vettori**: il modello addestrato non si perde.

## 8. Etichette non più cablate

`knn.js` aveva `cat` e `house` scritti nel codice. Ora lavora su qualunque
insieme di etichette; `app.js` le dichiara in `MISSION_LABELS`. Le missioni
2 e 3 si aggiungono senza toccare il classificatore.

---

## 9. Terza categoria: ALTRO (v3)

Il modello era costretto a scegliere fra gatto e casa anche davanti a un
tavolo. Un classificatore che non puo' dire "nessuno dei due" e' il difetto
che l'app dovrebbe insegnare a riconoscere, e ce l'aveva dentro.

- nella raccolta c'e' un terzo riquadro **ALTRO**, facoltativo: non concorre
  alla soglia dei 3 esempi, serve solo a dare contro-esempi
- nella prova i pulsanti sono tre: *Si', e' giusto* e due correzioni verso le
  altre categorie, calcolate a runtime
- la riga di conteggio dice anche quante "altre cose" EDO ha visto

Effetto verificato su dati sintetici: senza esempi ALTRO un tavolo veniva
classificato *casa* con accordo 60%; con 5 esempi ALTRO diventa *altro* con
accordo 100%, senza peggiorare gatto e casa.

## 10. Layout: barra dei pulsanti in mezzo al contenuto

`.screen` aveva `overflow-y: auto` ma nessun `min-height: 0`. In un
contenitore flex in colonna un figlio non si comprime sotto il proprio
contenuto, quindi `.screen` non diventava mai un contenitore di scorrimento:
scorreva la pagina intera e la barra `position: sticky; bottom: 0` finiva
ancorata a meta' schermo, con il contenuto visibile sotto.

Corretto con `min-height: 0` su `.screen` e altezza fissa sul guscio.

## 11. La svolta: si impara facendo (v4)

Le due barre erano oneste ma non spiegavano niente a un bambino. "68%" non
e' comprensione, e' un numero che si muove. La spiegazione pero' era gia'
dentro l'algoritmo: KNN decide guardando i vicini piu' simili e contando i
voti. Bastava mostrarlo.

**Scommessa prima della risposta.** Il bambino blocca l'immagine e dichiara
cosa dira' EDO, poi vede. Il punto si vince prevedendo EDO, non avendo un
modello bravo: per prevederlo bisogna averlo capito. Funziona anche quando
EDO sbaglia, anzi meglio.

**I vicini, con le loro facce.** Al posto della percentuale ci sono le tre
foto che hanno votato, con la loro etichetta e il bordo acceso su quelle
d'accordo. "2 su 3 dicono CASA" e' la stessa informazione della barra, ma
guardabile.

**Buttare via un esempio.** Toccando una foto la si elimina: EDO ricalcola
all'istante e dice se ha cambiato idea. Con KNN non serve riaddestrare.
Questo e' addestrare davvero: capire perche' ha sbagliato e togliere la causa.

**"Dove ho guardato".** Occlusione a griglia 5x5: copro un quadretto alla
volta, rimisuro, e dove la risposta crolla quel pezzo contava. Sull'immagine
resta illuminato solo cio' che il modello usava. 25 passaggi del modello,
tutti in locale, deterministici.

**Niente predizione continua.** Prima EDO ricalcolava ogni 550 ms: rumore.
Ora risponde solo quando il bambino blocca, cosi' la risposta e' un evento.

**Voce.** Selezione della voce di sistema piu' morbida (enhanced/premium se
presenti, poi le italiane note), lettura piu' lenta, tono leggermente alto,
micro-pause sulle virgole, e sblocco al primo tocco perche' su iOS la sintesi
resta muta finche' non nasce da un gesto.

## 12. Bug: "Dove ho guardato" non misurava niente (v7)

Il punteggio usato dall'occlusione era la quota di voto KNN. Con k=3 vale
0, 1/3, 2/3 o 1: quantizzata. Con tre vicini concordi resta incollata a 1,0
e coprire un quadretto non la sposta. Risultato: tutti i cali a zero,
immagine scurita in modo uniforme, e `hottestCell` che sceglieva il primo
quadretto a pari merito — la frase "guardavo in alto a sinistra" era rumore
presentato come misura.

Sostituito con un segnale **continuo**: la somiglianza col disegno piu'
vicino della categoria scelta. Verificato: al degradare dell'immagine la
quota di voto resta 1,0000 su tutta la scala, mentre il nuovo punteggio
scende da 0,869 a 0,683.

Aggiunto anche `hasSignal()`: se nessun quadretto sposta il risultato piu'
del rumore di fondo, EDO lo dice invece di indicare un punto a caso.

## 13. "Guarda qui!" — il bambino indica a EDO dove guardare

L'inverso dell'occlusione. Sul fotogramma bloccato compare una griglia 5x5:
il bambino tocca i quadretti dove sta la cosa da riconoscere, l'app ritaglia
quell'area e richiede la risposta.

Serve a far scoprire che l'inquadratura fa parte del dato: la stessa foto,
ritagliata sul soggetto, puo' dare una risposta diversa. E' il modo piu'
diretto per capire perche' EDO si distrae con lo sfondo.

## 14. Categorie libere (v8)

Gatto/casa aveva un tasso di errore vicino a zero: 7 previsioni azzeccate su
8 significa che il bambino non ha piu' niente da scoprire.

La correzione non e' imporre una coppia piu' difficile, ma togliere le coppie
fisse: i due nomi li scrive lui. Il classificatore era gia' indipendente
dalle etichette, quindi serviva solo la schermata.

- schermata iniziale con due campi liberi e alcune coppie pronte
- cambiare i nomi azzera gli esempi: mescolare due missioni produrrebbe un
  modello incoerente
- migrazione automatica dai dati esistenti: `cat` -> `a`, `house` -> `b`,
  con i nomi storici "gatto" e "casa" gia' compilati
- rimossi i disegni finti (`samples.js`): sapevano disegnare solo gatti e
  case, con categorie libere non avevano piu' senso

Cosi' la difficolta' diventa una cosa che il bambino **scopre**: prova
gatto/cane, vede EDO annaspare, e capisce da solo che esistono coppie facili
e coppie impossibili.

## Da sapere prima del test

L'atto 2 — EDO che sbaglia con pochi esempi — **non è più garantito**, ed è
corretto così: prima era il contatore a farlo accadere. Adesso dipende dai
disegni veri. Se con 3 disegni per categoria EDO indovina lo stesso, non è
un difetto: è il modello che sta funzionando.

In quel caso la mossa giusta **non è rimettere una penalità**. È chiedere al
bambino di provare un gatto disegnato in modo diverso da quelli insegnati —
altro colore, di profilo, più piccolo. Lì la somiglianza scende davvero, e
la lezione che ne esce ("gli esempi devono essere diversi fra loro") è più
forte di quella di partenza.

## Non verificato qui

Non ho un browser né un telefono in questo ambiente. Sono verificati: la
sintassi di tutti i moduli, la coerenza fra import ed export, gli `id` del
DOM usati da `app.js`, le chiavi di `strings.js`, l'assenza di URL esterni,
e il comportamento numerico di `knn.js` su dati sintetici. **Non** sono
verificati fotocamera, Web Speech, installazione PWA e modalità aereo:
quelli si provano solo sul dispositivo.

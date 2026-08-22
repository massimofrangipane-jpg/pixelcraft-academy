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

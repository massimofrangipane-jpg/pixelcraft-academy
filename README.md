# PixelCraft Academy

PWA educativa (Missione 1). **HTML + CSS + JS vanilla**, nessun build, nessun backend.
Tutto gira nel browser: foto, modello MobileNet e classificatore KNN restano sul telefono.

## Pesi MobileNet — già nel repo

Non si generano: sono file binari. In questa cartella ci sono già:

| File | Dimensione | Ruolo |
|---|---|---|
| `models/mobilenet/model.json` | ~50 KB | grafo Keras (layer `global_average_pooling2d_1`) |
| `models/mobilenet/weights.bin` | ~1,9 MB | pesi MobileNet **v1 width 0.25**, input **224×224** |
| `vendor/tf.min.js` | ~1,5 MB | TensorFlow.js locale |

A runtime l’app carica **solo** questi path relativi. Nessuna CDN.

Se i binari mancano (clone senza Git LFS, copia incompleta), **una volta sola** dalla root di questa cartella:

```bash
chmod +x vendor-mobilenet.sh
./vendor-mobilenet.sh
```

Oppure a mano (stesso risultato, 55 shard uniti in un file solo):

```bash
mkdir -p models/mobilenet
curl -fsSL -o /tmp/mbn-model.json \
  https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json
# poi lo script python in vendor-mobilenet.sh unisce gli shard in weights.bin
```

Quell’URL è **solo per vendere i file nel repo**. Non va messo nell’app.

Copia anche TensorFlow.js in locale (già presente):

```bash
mkdir -p vendor
# da un install locale di @tensorflow/tfjs@4.22.0:
cp node_modules/@tensorflow/tfjs/dist/tf.min.js vendor/tf.min.js
```

## Parametri della Missione 1 (misurati nel preview)

| Parametro | Valore |
|---|---|
| Risoluzione input | **224 × 224**, RGB, normalizzazione `(pixel − 127.5) / 127.5` |
| Estrattore | MobileNet v1 **α = 0.25**, embedding dal layer `global_average_pooling2d_1` (256 dim) |
| k del KNN | `min(5, max(3, floor(N/4)))` → con 6 esempi **k = 3**, con 20 esempi **k = 5** |
| Distanza | coseno; voto pesato `1 / (dist + 0.05)` |
| Soglia “non sono sicuro” | **70%** |
| Formula della % | `18% + 42%·evidenza + 22%·accordo + 12%·margine` dove evidenza = `min(n_gatto, n_casa) / 10` |
| 3 esempi per classe | sicurezza misurata **65%** (sotto soglia, atto 2) |
| 10 esempi per classe | sicurezza misurata **94%** (atto 3) |

La percentuale **non** è il voto grezzo del KNN: include un prior sulla quantità di esempi, così “pochi disegni → poco sicuro” è visibile, non solo spiegato.

## Pubblicare su GitHub Pages

1. Crea un repository pubblico (es. `pixelcraft-academy`).
2. Carica **il contenuto di questa cartella** nella **root** del repo
   (`index.html` al primo livello, non dentro un’altra cartella):

   ```bash
   git init
   git add .
   git commit -m "PixelCraft Academy v1"
   git branch -M main
   git remote add origin https://github.com/TUO-USER/pixelcraft-academy.git
   git push -u origin main
   ```

3. **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: **/ (root)**
   - Save

4. URL: `https://TUO-USER.github.io/pixelcraft-academy/`
5. Dal telefono apri **quell’HTTPS** (non `file://`) → Condividi → Aggiungi a schermata Home.

### Importante

- La fotocamera **non funziona** da `file://`. Serve HTTPS (Pages lo dà).
- Non rinominare `vendor/tf.min.js` né `models/mobilenet/`.
- Lascia `.nojekyll`.
- I path sono relativi (`./`): funzionano anche in sottocartella `/nome-repo/`.

## Cartelle

```
index.html
styles.css
manifest.json           standalone, portrait, icone 192/512 maskable
sw.js                   precache di tutti gli asset, modello incluso
vendor/tf.min.js
models/mobilenet/       model.json + weights.bin
js/                     strings, knn, brain, app
icon-192.png  icon-512.png  favicon.svg
.nojekyll
vendor-mobilenet.sh     solo se devi rigenerare i pesi
```

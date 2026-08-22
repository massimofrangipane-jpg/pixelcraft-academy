/* PixelCraft Academy — classificatore KNN.
   Regola di progetto: qui non si "aggiusta" nulla. Ogni numero restituito
   è una misura di ciò che il modello ha davvero fatto. Il conteggio degli
   esempi NON entra in nessun punteggio: viaggia separato, dichiarato per
   quello che è. */

const DIST_FLOOR = 0.01; // evita divisioni esplosive con esempi identici
const IDENTICAL = 0.02;  // sotto questa distanza l'immagine è la stessa già vista

export function cosineDistance(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom < 1e-8) return 1;
  return 1 - dot / denom;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function median(xs) {
  if (xs.length === 0) return null;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function labelsOf(examples) {
  return [...new Set(examples.map((e) => e.label))];
}

export function countByLabel(examples, known = []) {
  const out = {};
  for (const l of known) out[l] = 0;
  for (const e of examples) out[e.label] = (out[e.label] || 0) + 1;
  return out;
}

/* Scala di riferimento, misurata sui dati del bambino:
   quanto distano fra loro, tipicamente, due disegni della STESSA categoria.
   Serve a dare un metro a "questo assomiglia a ciò che ho visto".
   Non è una costante inventata: si ricalcola a ogni cambio degli esempi. */
export function neighbourScale(examples) {
  const dists = [];
  for (let i = 0; i < examples.length; i++) {
    let best = Infinity;
    for (let j = 0; j < examples.length; j++) {
      if (i === j || examples[i].label !== examples[j].label) continue;
      const d = cosineDistance(examples[i].vector, examples[j].vector);
      if (d < best) best = d;
    }
    if (best < Infinity) dists.push(best);
  }
  const m = median(dists);
  return m === null ? null : Math.max(DIST_FLOOR, m);
}

export function kFor(n) {
  return Math.min(5, Math.max(3, Math.floor(n / 4) || 3), n);
}

/* Restituisce SOLO misure:
   agreement   quota di voto pesato andata alla categoria vincente (0.5 = pareggio a 2 classi)
   nearestDist distanza dal disegno più simile fra quelli visti
   familiarity nearestDist rapportata alla scala dei dati del bambino
   neighbours  i k vicini usati, per poterli mostrare
   Il numero di esempi non compare in nessuno di questi valori. */
export function predictKnn(examples, vector, scale = null) {
  const labels = labelsOf(examples);
  if (examples.length === 0 || labels.length === 0) return null;

  const scored = examples
    .map((e) => ({ id: e.id, label: e.label, thumb: e.thumb, dist: cosineDistance(e.vector, vector) }))
    .sort((a, b) => a.dist - b.dist);

  const k = kFor(scored.length);
  const nearest = scored.slice(0, k);

  const weights = {};
  for (const l of labels) weights[l] = 0;
  for (const n of nearest) weights[n.label] += 1 / (n.dist + 0.05);
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  const ranked = labels.slice().sort((a, b) => weights[b] - weights[a]);
  const label = ranked[0];
  const agreement = weights[label] / total;

  const nearestDist = scored[0].dist;
  const s = scale ?? neighbourScale(examples);
  const familiarity = s === null ? null : clamp(2 - nearestDist / s, 0, 1);

  return {
    label,
    runnerUp: ranked[1] ?? null,
    agreement,
    nearestDist,
    familiarity,
    scale: s,
    isNew: nearestDist > IDENTICAL,
    k,
    neighbours: nearest,
    weights,
    labels,
  };
}

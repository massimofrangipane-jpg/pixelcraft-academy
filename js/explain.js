/* "Dove ho guardato": occlusione a griglia.
   Copro un quadretto alla volta e rimisuro. Dove la risposta crolla, quel
   pezzo contava. Nessun modello aggiuntivo, nessuna stima: e' lo stesso
   classificatore interrogato 25 volte. */

const GRID = 5;

export async function occlusionMap(source, embedFn, scoreFn, onStep) {
  const w = source.width;
  const h = source.height;
  const cw = w / GRID;
  const ch = h / GRID;

  const base = scoreFn(await embedFn(source));

  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d", { willReadFrequently: true });

  const cells = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(source, 0, 0, w, h);
      ctx.fillStyle = "#7f7f7f";
      ctx.fillRect(gx * cw, gy * ch, cw, ch);
      const s = scoreFn(await embedFn(work));
      cells.push({ gx, gy, drop: base - s });
      onStep?.(cells.length / (GRID * GRID));
    }
  }
  return { base, cells, grid: GRID };
}

/* Effetto torcia: l'immagine resta visibile solo dove il modello guardava.
   Piu' leggibile di una mappa a colori per un bambino. */
export function drawSpotlight(target, source, cells, grid = GRID) {
  target.width = source.width;
  target.height = source.height;
  const ctx = target.getContext("2d");
  ctx.drawImage(source, 0, 0, target.width, target.height);

  const drops = cells.map((c) => Math.max(0, c.drop));
  const max = Math.max(...drops);
  if (!(max > 1e-4)) return; // nulla da illuminare: lascio l'immagine com'e'

  const cw = target.width / grid;
  const ch = target.height / grid;

  for (const c of cells) {
    const t = Math.max(0, c.drop) / max; // 1 = decisivo, 0 = ininfluente
    ctx.fillStyle = `rgba(6, 10, 34, ${0.82 * (1 - t)})`;
    ctx.fillRect(c.gx * cw, c.gy * ch, cw + 1, ch + 1);
  }
}

/* Il quadretto piu' decisivo, per dire a voce dove si trova. */
/* Se nessun quadretto sposta il risultato piu' del rumore, la mappa non
   sta misurando niente: meglio dirlo che indicare un punto a caso. */
export function hasSignal(cells) {
  const max = Math.max(...cells.map((c) => c.drop));
  const mean = cells.reduce((a, c) => a + Math.abs(c.drop), 0) / cells.length;
  return max > 0.01 && max > mean * 1.6;
}

export function hottestCell(cells, grid = GRID) {
  const best = cells.reduce((a, b) => (b.drop > a.drop ? b : a), cells[0]);
  const col = best.gx < grid / 3 ? "sinistra" : best.gx > (2 * grid) / 3 ? "destra" : "centro";
  const row = best.gy < grid / 3 ? "alto" : best.gy > (2 * grid) / 3 ? "basso" : "mezzo";
  return { ...best, col, row };
}

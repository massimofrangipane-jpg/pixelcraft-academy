import { strings, DEFAULT_LOCALE } from "./strings.js";
import { predictKnn, countByLabel, neighbourScale, scoreFor } from "./knn.js";
import { occlusionMap, drawSpotlight, hottestCell, hasSignal } from "./explain.js";
import { canvasToSquare, cropToSquare, fileToSquare, toThumb, videoToSquare } from "./image.js";
import { speak, primeVoice } from "./speech.js";
import { emptyPersist, loadPersist, savePersist } from "./store.js";
import { initBrain, embedCanvas } from "./brain.js";

const s = strings[DEFAULT_LOCALE];
/* "other" e' la valvola di sfogo: senza una categoria per "nessuno dei due"
   il modello e' costretto a scegliere fra gatto e casa anche davanti a un
   tavolo, ed e' esattamente il difetto che l'app dovrebbe insegnare a vedere.
   Non concorre alle soglie di addestramento: e' facoltativa. */
const MISSION_LABELS = ["a", "b", "other"];
const TRAIN_LABELS = ["a", "b"];

/* I nomi delle categorie li sceglie il bambino: il classificatore e' gia'
   indipendente dalle etichette, qui serve solo leggerli. */
function labelName(l) {
  if (l === "other") return s.labels.other;
  return (state.persist?.labelNames?.[l] || "").toUpperCase() || (l === "a" ? "A" : "B");
}

/* Ogni testo che nomina le categorie passa da qui: nessun "gatto" o "casa"
   scritto nel codice. */
function fill(tpl) {
  return String(tpl)
    .replaceAll("{a}", labelName("a"))
    .replaceAll("{b}", labelName("b"));
}

function paintLabelNames() {
  MISSION_LABELS.forEach((l) => {
    const head = document.querySelector(`[data-select="${l}"] strong`);
    if (head) head.textContent = labelName(l);
  });
  document.querySelectorAll("[data-bet]").forEach((b) => {
    b.textContent = b.dataset.bet === "other" ? s.ui.neither : labelName(b.dataset.bet);
  });
  const t = $("mission-title");
  if (t) t.textContent = `${labelName("a")} o ${labelName("b")}?`;
  const ph = $("pick-hint");
  if (ph) ph.textContent = fill(s.ui.pickLabel);
  const oh = $("other-hint");
  if (oh) oh.textContent = fill(s.ui.otherHint);
}
const MIN_EACH = 3;
const GOAL_EACH = 10;
const MAX_EACH = 24;
// Soglie su MISURE reali, non su conteggi.

/* EDO: personaggio a blocchi in stile voxel. Testa cubica con volto a
   pixel — riccioli quadrati, occhi azzurro ghiaccio, sorriso aperto —
   e corpo da robottino. Le classi .edo-eye e .edo-light restano perche'
   le animazioni degli stati d'animo lavorano su quelle. */
const EDO_HTML = `
  <div class="edo idle">
    <div class="edo-curls">
      <i style="--x: 2px;   --y: 16px; --s: 22px"></i>
      <i style="--x: 20px;  --y: 4px;  --s: 26px"></i>
      <i style="--x: 44px;  --y: -2px; --s: 28px"></i>
      <i style="--x: 70px;  --y: 3px;  --s: 26px"></i>
      <i style="--x: 94px;  --y: 15px; --s: 22px"></i>
      <i style="--x: 14px;  --y: 30px; --s: 18px"></i>
      <i style="--x: 36px;  --y: 22px; --s: 20px"></i>
      <i style="--x: 62px;  --y: 21px; --s: 20px"></i>
      <i style="--x: 86px;  --y: 30px; --s: 18px"></i>
      <i class="side" style="--x: -2px; --y: 40px; --s: 16px"></i>
      <i class="side" style="--x: 102px; --y: 40px; --s: 16px"></i>
    </div>
    <div class="edo-head">
      <div class="edo-face">
        <span class="edo-brow left"></span>
        <span class="edo-brow right"></span>
        <span class="edo-eye left"><span class="edo-pupil"></span></span>
        <span class="edo-eye right"><span class="edo-pupil"></span></span>
        <span class="edo-nose"></span>
        <span class="edo-cheek left"></span>
        <span class="edo-cheek right"></span>
        <span class="edo-mouth"><span class="edo-teeth"></span></span>
      </div>
    </div>
    <span class="edo-arm left"></span>
    <span class="edo-arm right"></span>
    <div class="edo-body"><span class="edo-light"></span></div>
  </div>`;

const SPEAKER_SVG = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l6-4v14l-6-4H4V9z" fill="currentColor"/><path d="M17 9.5c1.2 1 1.8 2.2 1.8 3.5S18.2 15 17 16M19.5 7c2 1.8 3 3.8 3 6s-1 4.2-3 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>`;

const STAR_SVG_ON = `<svg class="icon" viewBox="0 0 24 24"><path d="M12 3.5 14.7 9l6.1.7-4.5 4.1 1.2 6.1L12 16.8 6.5 19.9 7.7 13.8 3.2 9.7 9.3 9z" fill="currentColor" stroke="currentColor" stroke-width="2"/></svg>`;
const STAR_SVG_OFF = `<svg class="icon" viewBox="0 0 24 24"><path d="M12 3.5 14.7 9l6.1.7-4.5 4.1 1.2 6.1L12 16.8 6.5 19.9 7.7 13.8 3.2 9.7 9.3 9z" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

const $ = (id) => document.getElementById(id);

const state = {
  persist: emptyPersist(),
  screen: "boot",
  overlay: null,
  activeLabel: "a",
  mood: "idle",
  line: s.edo.welcome,
  prediction: null,
  alts: [],
  phase: "aim",
  frozen: null,
  focus: new Set(),
  childBet: null,
  scale: null,
  liveTimer: null,
  liveStream: null,
  drawInk: "#16183a",
};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function say(text, mood = "talk") {
  state.line = text;
  state.mood = mood;
  speak(text);
  paintSpeech();
  paintMood();
}

function showScreen(name) {
  state.screen = name;
  ["boot", "welcome", "setup", "collect", "test", "lesson", "complete"].forEach((id) => {
    $("screen-" + id).classList.toggle("hidden", id !== name);
  });
  const back = name !== "welcome" && name !== "boot";
  $("btn-back").classList.toggle("hidden", !back);
  $("header-spacer").style.display = back ? "none" : "block";
  if (name !== "test") stopLive();
}

function paintMood() {
  document.querySelectorAll(".edo").forEach((el) => {
    el.className = "edo " + state.mood;
  });
}

function paintSpeech() {
  document.querySelectorAll("[data-line]").forEach((el) => {
    el.textContent = state.line;
  });
}

function paintStars() {
  const map = { 1: state.persist.stars.one, 2: state.persist.stars.two, 3: state.persist.stars.three };
  document.querySelectorAll("[data-star]").forEach((el) => {
    const on = map[el.dataset.star];
    el.classList.toggle("on", on);
    el.innerHTML = on ? STAR_SVG_ON : STAR_SVG_OFF;
  });
}

function enterCollect() {
  showScreen("collect");
  paintLabelNames();
  paintCollect();
}

function paintCollect() {
  const c = countByLabel(state.persist.examples, MISSION_LABELS);
  const goal = state.persist.trainCount > 0 ? GOAL_EACH : MIN_EACH;
  $("count-a").textContent = `${c.a} ${s.ui.countOf} ${goal}`;
  $("count-b").textContent = `${c.b} ${s.ui.countOf} ${goal}`;
  $("count-other").textContent = String(c.other);
  MISSION_LABELS.forEach((l) =>
    $("card-" + l).classList.toggle("ring", state.activeLabel === l),
  );
  MISSION_LABELS.forEach((l) => renderThumbs(l, $("thumbs-" + l)));
  const can = c.a >= MIN_EACH && c.b >= MIN_EACH;
  $("btn-train").disabled = !can;
  $("btn-train").textContent = state.persist.trainCount > 0 ? s.ui.retrain : s.ui.train;
  $("btn-goto-test").classList.toggle("hidden", state.persist.trainCount === 0);
  let hint = "";
  if (!can) hint = s.ui.needThree;
  else if (state.persist.trainCount > 0 && (c.a < GOAL_EACH || c.b < GOAL_EACH))
    hint = s.ui.goalTen;
  $("collect-hint").textContent = fill(hint);
}

function renderThumbs(label, root) {
  const items = state.persist.examples.filter((e) => e.label === label).slice(-6);
  if (items.length === 0) {
    root.innerHTML = `<p class="muted" style="grid-column:1/-1;align-self:center;text-align:center;font-size:12px">${
      s.ui.emptySlot
    }</p>`;
    return;
  }
  root.innerHTML = items
    .map(
      (it) =>
        `<div class="thumb"><img src="${it.thumb}" alt=""><button class="thumb-x" data-del="${it.id}" aria-label="Rimuovi">×</button></div>`,
    )
    .join("");
}

/* ---- Schermata di prova: scommessa -> rivelazione -> perche' ----
   Il bambino dichiara COSA DIRA' EDO prima di vederlo. Il punto si vince
   prevedendo EDO, non avendo un modello bravo: per prevederlo bisogna
   averlo capito. */

function setPhase(phase) {
  state.phase = phase;
  $("phase-bet").classList.toggle("hidden", phase !== "bet");
  $("phase-reveal").classList.toggle("hidden", phase !== "reveal");
  $("btn-freeze").classList.toggle("hidden", phase !== "aim");
  $("btn-again").classList.toggle("hidden", phase === "aim");
  $("frozen-canvas").classList.toggle("hidden", phase === "aim");
  $("live-video").classList.toggle("hidden", phase !== "aim" || !state.liveStream);
  $("fix-row").classList.add("hidden");
  $("where-bar").classList.add("hidden");
  closeFocus();
  $("btn-lesson").classList.toggle("hidden", !state.persist.lessonUnlocked);
  // meno pulsanti a schermo nelle fasi in cui non servono: tutto deve stare
  // in una schermata sola, senza scorrere
  $("secondary-row").classList.toggle("hidden", phase !== "aim");
  paintBetScore();
}

function paintBetScore() {
  const p = state.persist;
  $("bet-score").textContent = p.betTries
    ? `Hai previsto EDO ${p.betHits} volte su ${p.betTries}.`
    : "";
}

function showFrozen(canvas) {
  const c = $("frozen-canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  c.getContext("2d").drawImage(canvas, 0, 0);
  state.frozen = canvas;
  $("cam-fallback").classList.add("hidden");
}

/* Congela il fotogramma e passa alla scommessa. Nessuna risposta ancora. */
async function freezeAndBet(canvas) {
  stopLive();
  showFrozen(canvas);
  state.prediction = null;
  state.childBet = null;
  setPhase("bet");
  say(s.edo.betAsk, "think");
  try {
    state.prediction = predictKnn(
      state.persist.examples,
      await embedCanvas(canvas),
      state.scale,
    );
  } catch {
    state.prediction = null;
  }
}

function placeBet(label) {
  if (state.phase !== "bet" || !state.prediction) return;
  state.childBet = label;
  const p = state.persist;
  p.betTries += 1;
  if (label === state.prediction.label) p.betHits += 1;
  persistNow();
  setPhase("reveal");
  paintReveal();
}

/* La spiegazione non e' una percentuale: sono i disegni che hanno votato.
   Sono gli stessi che l'algoritmo ha davvero usato. */
function paintReveal() {
  const p = state.prediction;
  if (!p) return;
  const hit = state.childBet === p.label;
  $("verdict").textContent = hit ? s.edo.betRight : s.edo.betWrong;
  $("verdict").className = "verdict " + (hit ? "good" : "miss");
  $("edo-answer").textContent = labelName(p.label);

  const votes = p.neighbours.filter((n) => n.label === p.label).length;
  $("vote-line").textContent = `${votes} ${s.ui.outOf} ${p.neighbours.length} ${s.ui.sayThis} ${labelName(p.label)}.`;

  const root = $("neighbours");
  root.innerHTML = "";
  p.neighbours.forEach((n) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "neigh-cell" + (n.label === p.label ? " agrees" : "");
    cell.dataset.drop = n.id;
    cell.innerHTML =
      (n.thumb ? `<img src="${n.thumb}" alt="" />` : `<span class="neigh-blank"></span>`) +
      `<span class="neigh-tag">${labelName(n.label)}</span>`;
    root.appendChild(cell);
  });

  const alts = MISSION_LABELS.filter((l) => l !== p.label);
  state.alts = alts;
  $("btn-fix1").textContent = labelName(alts[0]);
  $("btn-fix2").textContent = labelName(alts[1]);

  say(hit ? s.edo.betRight : s.edo.betWrong, hit ? "happy" : "idle");
}

/* Buttare via un esempio e vedere cambiare la risposta all'istante:
   questo E' addestrare, e con KNN non serve nemmeno riaddestrare. */
async function dropExample(id) {
  const ex = state.persist.examples.find((e) => e.id === id);
  if (!ex || !state.frozen) return;
  state.persist.examples = state.persist.examples.filter((e) => e.id !== id);
  refreshScale();
  persistNow();
  const before = state.prediction?.label;
  state.prediction = predictKnn(
    state.persist.examples,
    await embedCanvas(state.frozen),
    state.scale,
  );
  paintReveal();
  const after = state.prediction?.label;
  say(before !== after ? s.edo.changedMind : s.edo.sameMind, "think");
}

/* ---- "Guarda qui": e' il bambino a dire a EDO dove guardare ----
   L'inverso dell'occlusione. Sceglie i quadretti, l'app ritaglia solo
   quell'area e richiede la risposta: si scopre che l'inquadratura fa parte
   del dato, non e' una cornice neutra. */

const FOCUS_GRID = 5;

function buildFocusGrid() {
  const root = $("focus-grid");
  if (root.childElementCount) return;
  for (let i = 0; i < FOCUS_GRID * FOCUS_GRID; i++) {
    const cell = document.createElement("i");
    cell.dataset.cell = String(i);
    root.appendChild(cell);
  }
  root.onclick = (e) => {
    const cell = e.target.closest("[data-cell]");
    if (!cell) return;
    const k = cell.dataset.cell;
    if (state.focus.has(k)) state.focus.delete(k);
    else state.focus.add(k);
    cell.classList.toggle("on", state.focus.has(k));
  };
}

function openFocus() {
  if (!state.frozen) return;
  buildFocusGrid();
  state.focus.clear();
  $("focus-grid").querySelectorAll("i").forEach((c) => c.classList.remove("on"));
  $("focus-grid").classList.remove("hidden");
  $("focus-row").classList.remove("hidden");
  say(s.edo.focusAsk, "think");
}

function closeFocus() {
  $("focus-grid")?.classList.add("hidden");
  $("focus-row")?.classList.add("hidden");
  state.focus.clear();
}

async function focusHere() {
  if (!state.frozen) return;
  if (!state.focus.size) {
    say(s.edo.focusNone, "unsure");
    return;
  }
  const idx = [...state.focus].map(Number);
  const cols = idx.map((i) => i % FOCUS_GRID);
  const rows = idx.map((i) => Math.floor(i / FOCUS_GRID));
  const cw = state.frozen.width / FOCUS_GRID;
  const ch = state.frozen.height / FOCUS_GRID;
  const x = Math.min(...cols) * cw;
  const y = Math.min(...rows) * ch;
  const w = (Math.max(...cols) + 1) * cw - x;
  const h = (Math.max(...rows) + 1) * ch - y;

  const cropped = cropToSquare(state.frozen, x, y, w, h);
  closeFocus();
  showFrozen(cropped);
  say(s.edo.focusDone, "think");
  try {
    state.prediction = predictKnn(
      state.persist.examples,
      await embedCanvas(cropped),
      state.scale,
    );
    paintReveal();
  } catch {
    say(s.edo.noWhere, "unsure");
  }
}

/* Occlusione: 25 passaggi del modello, tutto in locale. */
async function whereLooked() {
  const p = state.prediction;
  if (!p || !state.frozen) return;
  $("btn-where").disabled = true;
  $("where-bar").classList.remove("hidden");
  $("where-fill").style.width = "0%";
  say(s.edo.looking2, "think");
  try {
    const { cells } = await occlusionMap(
      state.frozen,
      (c) => embedCanvas(c),
      (v) => scoreFor(state.persist.examples, v, p.label),
      (t) => {
        $("where-fill").style.width = Math.round(t * 100) + "%";
      },
    );
    if (!hasSignal(cells)) {
      say(s.edo.noSpot, "unsure");
    } else {
      drawSpotlight($("frozen-canvas"), state.frozen, cells);
      const hot = hottestCell(cells);
      say(`${s.edo.lookedAt} ${hot.row}, a ${hot.col}.`, "happy");
    }
  } catch {
    say(s.edo.noWhere, "unsure");
  } finally {
    $("where-bar").classList.add("hidden");
    $("btn-where").disabled = false;
  }
}

function judge(correct) {
  const p = state.prediction;
  if (!p) return;
  if (correct) {
    $("fix-row").classList.add("hidden");
    if (!p.isNew) say(s.edo.sameDrawing, "unsure");
    else if (!state.persist.stars.three) {
      state.persist.stars.three = true;
      persistNow();
      paintStars();
      say(s.edo.star3, "happy");
    } else say(s.edo.thanks, "happy");
  } else {
    $("fix-row").classList.remove("hidden");
    say(s.edo.whatIsIt, "unsure");
  }
}

function fixWith(label) {
  if (!label || !state.frozen) return;
  state.activeLabel = label;
  void addCanvas(state.frozen, label);
  $("fix-row").classList.add("hidden");
  say(s.edo.learnNow, "idle");
}

function persistNow() {
  savePersist(state.persist);
}

/* La scala di somiglianza dipende dai disegni del bambino:
   va ricalcolata a ogni aggiunta o rimozione. */
function refreshScale() {
  state.scale = neighbourScale(state.persist.examples);
}

async function addCanvas(canvas, label) {
  const n = state.persist.examples.filter((e) => e.label === label).length;
  if (n >= MAX_EACH) {
    say(s.edo.enough, "idle");
    return;
  }
  const square = canvasToSquare(canvas);
  const vector = Array.from(await embedCanvas(square));
  state.persist.examples.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    thumb: toThumb(square),
    vector,
  });
  refreshScale();
  persistNow();
  hideOverlays();
  const nextN = n + 1;
  if (label !== "other" && nextN < MIN_EACH) say(`${s.edo.needMore} ${labelName(label)}.`, "idle");
  else if (nextN < GOAL_EACH && state.persist.trainCount > 0) say(s.edo.addMore, "idle");
  else say(s.edo.thanks, "happy");
  paintCollect();
}

function hideOverlays() {
  ["overlay-permission", "overlay-camera", "overlay-draw", "overlay-train"].forEach((id) =>
    $(id).classList.add("hidden"),
  );
  stopCamPreview();
}

async function runTrain() {
  const c = countByLabel(state.persist.examples, MISSION_LABELS);
  if (TRAIN_LABELS.some((l) => c[l] < MIN_EACH)) return;
  $("overlay-train").classList.remove("hidden");
  state.mood = "think";
  paintMood();
  state.line = s.edo.studying;
  paintSpeech();
  speak(s.edo.studying);
  await wait(reducedMotion() ? 200 : 1200);

  const p = state.persist;
  p.stars.one = true;
  const nextCount = p.trainCount + 1;
  if (nextCount >= 2 && p.examples.length > p.examplesAtLastTrain) p.stars.two = true;
  const reachedTen = Math.min(c.a, c.b) >= GOAL_EACH;
  if (reachedTen) {
    p.lessonUnlocked = true;
    p.seenAct3 = true;
  }
  p.trainCount = nextCount;
  p.examplesAtLastTrain = p.examples.length;
  persistNow();
  hideOverlays();
  state.prediction = null;
  state.frozen = null;
  refreshScale();
  showScreen("test");
  paintStars();
  setPhase("aim");
  if (reachedTen) say(s.edo.highConf, "happy");
  else say(s.edo.trained, "happy");
  startLive();
}

function stopLive() {
  if (state.liveTimer) {
    clearInterval(state.liveTimer);
    state.liveTimer = null;
  }
  if (state.liveStream) {
    state.liveStream.getTracks().forEach((t) => t.stop());
    state.liveStream = null;
  }
}

function stopCamPreview() {
  const v = $("cam-video");
  const stream = v.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  v.srcObject = null;
}

async function startLive() {
  stopLive();
  const video = $("live-video");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    state.liveStream = stream;
    video.srcObject = stream;
    await video.play();
    video.classList.remove("hidden");
    $("cam-fallback").classList.add("hidden");
    /* Nessuna predizione continua: EDO risponde solo quando il bambino
       blocca l'immagine, cosi' la risposta e' un evento e non un rumore. */
  } catch {
    video.classList.add("hidden");
    $("cam-fallback").classList.remove("hidden");
    $("cam-fallback").textContent = s.edo.noCamera;
  }
}

async function openCamera() {
  $("overlay-camera").classList.remove("hidden");
  $("cam-label").textContent = labelName(state.activeLabel);
  $("cam-fail").classList.add("hidden");
  const v = $("cam-video");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    v.srcObject = stream;
    await v.play();
  } catch {
    $("cam-fail").classList.remove("hidden");
  }
}

function initDraw() {
  const c = $("draw-canvas");
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f3ede0";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 10;
  let drawing = false;
  const pos = (e) => {
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };
  c.onpointerdown = (e) => {
    drawing = true;
    const p = pos(e);
    ctx.strokeStyle = state.drawInk;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    c.setPointerCapture(e.pointerId);
  };
  c.onpointermove = (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  c.onpointerup = c.onpointercancel = () => {
    drawing = false;
  };
}

function mountEdo() {
  document.querySelectorAll("[data-edo-slot]").forEach((el) => {
    el.innerHTML = EDO_HTML;
  });
  document.querySelectorAll("[data-speak], #btn-lesson-speak").forEach((el) => {
    if (!el.innerHTML.trim()) el.innerHTML = SPEAKER_SVG;
  });
  const backSvg = $("btn-back").innerHTML;
  $("btn-cam-close").innerHTML = backSvg;
  $("btn-draw-close").innerHTML = backSvg;
}

function bind() {
  $("btn-back").onclick = () => {
    if (state.screen === "test") {
      showScreen("collect");
      paintCollect();
    } else if (state.screen === "lesson") showScreen("test");
    else if (state.screen === "complete") showScreen(state.persist.lessonUnlocked ? "lesson" : "test");
    else if (state.screen === "collect") showScreen("welcome");
  };
  document.querySelectorAll("[data-speak]").forEach((b) => {
    b.onclick = () => speak(state.line);
  });
  document.addEventListener("pointerdown", primeVoice, { once: true });
  $("preset-row").onclick = (e) => {
    const chip = e.target.closest("[data-preset]");
    if (!chip) return;
    const [a, b] = chip.dataset.preset.split("|");
    $("name-a").value = a;
    $("name-b").value = b;
  };
  $("btn-names-go").onclick = () => {
    const a = $("name-a").value.trim();
    const b = $("name-b").value.trim();
    if (!a || !b) return say(s.edo.namesShort, "unsure");
    if (a.toLowerCase() === b.toLowerCase()) return say(s.edo.namesSame, "unsure");
    const changed =
      a.toLowerCase() !== (state.persist.labelNames.a || "").toLowerCase() ||
      b.toLowerCase() !== (state.persist.labelNames.b || "").toLowerCase();
    if (changed && state.persist.examples.length) {
      /* Nomi nuovi = missione nuova: mescolare vecchi e nuovi esempi
         produrrebbe un modello incoerente. */
      state.persist.examples = [];
      state.persist.stars = { one: false, two: false, three: false };
      state.persist.trainCount = 0;
      state.persist.examplesAtLastTrain = 0;
      state.persist.lessonUnlocked = false;
      state.persist.seenAct2 = false;
      state.persist.seenAct3 = false;
    }
    state.persist.labelNames = { a, b };
    refreshScale();
    persistNow();
    paintLabelNames();
    state.activeLabel = "a";
    enterCollect();
    say(s.edo.namesSet, "happy");
  };
  $("btn-start").onclick = () => {
    const n = state.persist.labelNames;
    if (!n.a || !n.b) {
      $("name-a").value = n.a || "";
      $("name-b").value = n.b || "";
      showScreen("setup");
      say(s.edo.askNames, "think");
    } else {
      enterCollect();
      say(s.edo.intro, "idle");
    }
  };
  $("btn-change-labels").onclick = () => {
    const n = state.persist.labelNames;
    $("name-a").value = n.a || "";
    $("name-b").value = n.b || "";
    showScreen("setup");
    say(s.edo.askNames, "think");
  };
  document.querySelectorAll("[data-select]").forEach((b) => {
    b.onclick = () => {
      state.activeLabel = b.dataset.select;
      paintCollect();
    };
  });
  $("thumbs-a").onclick = $("thumbs-b").onclick = $("thumbs-other").onclick = (e) => {
    const id = e.target.dataset.del;
    if (!id) return;
    state.persist.examples = state.persist.examples.filter((ex) => ex.id !== id);
    refreshScale();
    persistNow();
    paintCollect();
  };
  $("btn-photo").onclick = () => {
    if (state.persist.cameraAsked) openCamera();
    else $("overlay-permission").classList.remove("hidden");
  };
  $("btn-perm-cancel").onclick = hideOverlays;
  $("btn-perm-ok").onclick = () => {
    state.persist.cameraAsked = true;
    persistNow();
    hideOverlays();
    openCamera();
  };
  $("btn-cam-close").onclick = hideOverlays;
  $("btn-snap").onclick = () => {
    const v = $("cam-video");
    if (v && v.readyState >= 2 && v.videoWidth) {
      void addCanvas(videoToSquare(v), state.activeLabel);
      return;
    }
    $("file-input").click();
  };
  $("btn-draw").onclick = () => {
    say(s.edo.drawHint, "idle");
    $("overlay-draw").classList.remove("hidden");
    $("draw-label").textContent =
      s.ui.draw + " · " + labelName(state.activeLabel);
    initDraw();
  };
  $("btn-draw-close").onclick = hideOverlays;
  $("btn-draw-clear").onclick = () => initDraw();
  $("btn-draw-save").onclick = () => void addCanvas($("draw-canvas"), state.activeLabel);
  document.querySelectorAll("[data-ink]").forEach((b) => {
    b.onclick = () => {
      state.drawInk = b.dataset.ink;
    };
  });
  $("btn-train").onclick = () => void runTrain();
  $("btn-goto-test").onclick = () => {
    showScreen("test");
    state.frozen = null;
    setPhase("aim");
    say(s.edo.looking, "idle");
    startLive();
  };
  $("btn-freeze").onclick = () => {
    const v = $("live-video");
    if (state.liveStream && v.readyState >= 2) void freezeAndBet(videoToSquare(v));
    else $("file-input").click();
  };
  $("btn-again").onclick = () => {
    state.frozen = null;
    setPhase("aim");
    say(s.edo.looking, "idle");
    if (!state.liveStream) startLive();
  };
  document.querySelectorAll("[data-bet]").forEach((b) => {
    b.onclick = () => placeBet(b.dataset.bet);
  });
  $("neighbours").onclick = (e) => {
    const cell = e.target.closest("[data-drop]");
    if (cell) void dropExample(cell.dataset.drop);
  };
  $("btn-where").onclick = () => void whereLooked();
  $("btn-focus").onclick = () => openFocus();
  $("btn-focus-go").onclick = () => void focusHere();
  $("btn-focus-cancel").onclick = () => {
    closeFocus();
    say(s.edo.thanks, "idle");
  };
  $("btn-right").onclick = () => judge(true);
  $("btn-wrong").onclick = () => judge(false);
  $("btn-fix1").onclick = () => fixWith((state.alts || [])[0]);
  $("btn-fix2").onclick = () => fixWith((state.alts || [])[1]);
  $("btn-shutter").onclick = () => $("file-input").click();
  $("file-input").onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const square = await fileToSquare(f);
    if (state.screen === "test") void freezeAndBet(square);
    else void addCanvas(square, state.activeLabel);
  };
  $("btn-add-more").onclick = () => {
    showScreen("collect");
    say(s.edo.addMore, "idle");
    paintCollect();
  };
  $("btn-lesson").onclick = () => {
    showScreen("lesson");
    $("lesson-p1").textContent = s.lesson.p1;
    $("lesson-p2").textContent = s.lesson.p2;
    $("lesson-p3").textContent = s.lesson.p3;
    $("lesson-p4").textContent = s.lesson.p4;
    say(s.edo.lessonIntro, "talk");
  };
  $("btn-lesson-speak").onclick = () =>
    speak(`${s.lesson.p1} ${s.lesson.p2} ${s.lesson.p3} ${s.lesson.p4}`);
  $("btn-lesson-done").onclick = () => {
    showScreen("complete");
    say(s.edo.complete, "happy");
  };
}

async function boot() {
  mountEdo();
  bind();
  state.persist = loadPersist();
  refreshScale();
  paintLabelNames();
  paintStars();
  $("btn-start").textContent = state.persist.trainCount > 0 ? s.ui.continue : s.ui.start;
  $("lesson-p1").textContent = s.lesson.p1;
  $("lesson-p2").textContent = s.lesson.p2;
  $("lesson-p3").textContent = s.lesson.p3;
  $("lesson-p4").textContent = s.lesson.p4;
  try {
    await initBrain((p) => {
      $("boot-bar").style.width = Math.round(p * 100) + "%";
    });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    }
    showScreen("welcome");
    state.mood = "idle";
    paintMood();
    say(s.edo.welcome, "idle");
  } catch (err) {
    console.error(err);
    $("boot-text").textContent = s.ui.bootError;
  }
}

boot();

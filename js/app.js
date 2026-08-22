import { strings, DEFAULT_LOCALE } from "./strings.js";
import { predictKnn, countByLabel, neighbourScale } from "./knn.js";
import { canvasToSquare, fileToSquare, toThumb, videoToSquare } from "./image.js";
import { drawSample } from "./samples.js";
import { speak } from "./speech.js";
import { emptyPersist, loadPersist, savePersist } from "./store.js";
import { initBrain, embedCanvas } from "./brain.js";

const s = strings[DEFAULT_LOCALE];
const MISSION_LABELS = ["cat", "house"];
const MIN_EACH = 3;
const GOAL_EACH = 10;
const MAX_EACH = 24;
// Soglie su MISURE reali, non su conteggi.
const AGREE_LOW = 0.70;    // sotto: i vicini non sono d'accordo fra loro
const FAMILIAR_LOW = 0.35; // sotto: nulla di simile fra i disegni visti

const EDO_HTML = `
  <div class="edo idle">
    <span class="edo-knob"></span>
    <span class="edo-antenna"></span>
    <div class="edo-head">
      <div class="edo-visor">
        <span class="edo-eye left"><span class="edo-pupil"></span></span>
        <span class="edo-eye right"><span class="edo-pupil"></span></span>
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
  activeLabel: "cat",
  mood: "idle",
  line: s.edo.welcome,
  prediction: null,
  shown: null,
  livePaused: false,
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
  ["boot", "welcome", "collect", "test", "lesson", "complete"].forEach((id) => {
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

function paintCollect() {
  const c = countByLabel(state.persist.examples, MISSION_LABELS);
  const goal = state.persist.trainCount > 0 ? GOAL_EACH : MIN_EACH;
  $("count-cat").textContent = `${c.cat} ${s.ui.countOf} ${goal}`;
  $("count-house").textContent = `${c.house} ${s.ui.countOf} ${goal}`;
  $("card-cat").classList.toggle("ring", state.activeLabel === "cat");
  $("card-house").classList.toggle("ring", state.activeLabel === "house");
  renderThumbs("cat", $("thumbs-cat"));
  renderThumbs("house", $("thumbs-house"));
  const can = c.cat >= MIN_EACH && c.house >= MIN_EACH;
  $("btn-train").disabled = !can;
  $("btn-train").textContent = state.persist.trainCount > 0 ? s.ui.retrain : s.ui.train;
  $("btn-goto-test").classList.toggle("hidden", state.persist.trainCount === 0);
  let hint = "";
  if (!can) hint = s.ui.needThree;
  else if (state.persist.trainCount > 0 && (c.cat < GOAL_EACH || c.house < GOAL_EACH))
    hint = s.ui.goalTen;
  $("collect-hint").textContent = hint;
}

function renderThumbs(label, root) {
  const items = state.persist.examples.filter((e) => e.label === label).slice(-6);
  if (items.length === 0) {
    root.innerHTML = `<p class="muted" style="grid-column:1/-1;align-self:center;text-align:center;font-size:12px">${
      label === "cat" ? s.ui.emptyCat : s.ui.emptyHouse
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

function paintTest() {
  const p = state.prediction;
  $("conf-box").classList.toggle("hidden", !p);
  $("guess-label").classList.toggle("hidden", !p);
  $("confirm-row").classList.toggle("hidden", !p);
  $("btn-lesson").classList.toggle("hidden", !state.persist.lessonUnlocked);
  if (!p) return;
  setMeter("conf", p.agreement, AGREE_LOW);
  setMeter("fam", p.familiarity, FAMILIAR_LOW);
  const c = countByLabel(state.persist.examples, MISSION_LABELS);
  $("seen-line").textContent =
    `${s.ui.seenCount} ${c.cat} ${s.ui.seenCats} ${s.ui.and} ${c.house} ${s.ui.seenHouses}.`;
  $("guess-label").textContent = p.label === "cat" ? s.labels.cat : s.labels.house;
  $("btn-yes").textContent = p.label === "cat" ? s.ui.yesCat : s.ui.yesHouse;
  $("btn-no").textContent = p.label === "cat" ? s.ui.noHouse : s.ui.noCat;
}

/* Una barra = una misura. Nessun termine additivo, nessuna costante di comodo. */
function setMeter(prefix, value, low) {
  const el = $(prefix + "-value");
  const fill = $(prefix + "-fill");
  if (value === null || value === undefined) {
    el.textContent = "--";
    fill.style.width = "0%";
    fill.className = "conf-fill";
    return;
  }
  const pct = Math.round(value * 100);
  el.textContent = pct + "%";
  fill.style.width = pct + "%";
  fill.className =
    "conf-fill" + (value >= 0.85 ? " high" : value >= low ? " ok" : "");
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
  if (label === "cat" && nextN < MIN_EACH) say(s.edo.needCat, "idle");
  else if (label === "house" && nextN < MIN_EACH) say(s.edo.needHouse, "idle");
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
  if (c.cat < MIN_EACH || c.house < MIN_EACH) return;
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
  const reachedTen = Math.min(c.cat, c.house) >= GOAL_EACH;
  if (reachedTen) {
    p.lessonUnlocked = true;
    p.seenAct3 = true;
  }
  p.trainCount = nextCount;
  p.examplesAtLastTrain = p.examples.length;
  persistNow();
  hideOverlays();
  state.prediction = null;
  state.shown = null;
  refreshScale();
  showScreen("test");
  paintStars();
  paintTest();
  if (reachedTen) say(s.edo.highConf, "happy");
  else say(s.edo.trained, "happy");
  startLive();
}

/* Due incertezze diverse meritano due frasi diverse:
   "non ho mai visto niente di simile" != "i disegni simili non sono d'accordo". */
function onPredict(p, canvas) {
  state.prediction = p;
  state.shown = p ? { canvas, prediction: p } : null;
  if (!p) {
    paintTest();
    return;
  }
  const unfamiliar = p.familiarity !== null && p.familiarity < FAMILIAR_LOW;
  const split = p.agreement < AGREE_LOW;
  let line, mood;
  if (unfamiliar) {
    line = s.edo.unfamiliar + " " + s.edo.askMore;
    mood = "unsure";
  } else if (split) {
    line = s.edo.split + " " + s.edo.askMore;
    mood = "unsure";
  } else {
    line = p.label === "cat" ? s.edo.guessCat : s.edo.guessHouse;
    mood = "idle";
  }
  if ((unfamiliar || split) && !state.persist.seenAct2) {
    state.persist.seenAct2 = true;
    persistNow();
    say(line, mood);
  } else {
    state.line = line;
    state.mood = mood;
    paintSpeech();
    paintMood();
  }
  paintTest();
}

/* La terza stella si vince riconoscendo un disegno NUOVO, non raggiungendo
   una percentuale. Se l'immagine e' una di quelle gia' memorizzate, non conta. */
function confirmGuess(ok) {
  const shot = state.shown;
  if (!shot) return;
  state.livePaused = true;
  const p = shot.prediction;
  if (ok) {
    if (!p.isNew) {
      say(s.edo.sameDrawing, "unsure");
    } else if (!state.persist.stars.three) {
      state.persist.stars.three = true;
      persistNow();
      paintStars();
      say(s.edo.star3, "happy");
    } else {
      say(s.edo.thanks, "happy");
    }
  } else {
    const other = p.label === "cat" ? "house" : "cat";
    say(s.edo.learnNow, "idle");
    state.activeLabel = other;
    void addCanvas(shot.canvas, other);
  }
  setTimeout(() => {
    state.livePaused = false;
  }, 1400);
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
    state.liveTimer = setInterval(async () => {
      if (video.readyState < 2 || state.livePaused) return;
      try {
        const square = videoToSquare(video);
        const p = predictKnn(state.persist.examples, await embedCanvas(square), state.scale);
        if (state.livePaused) return; // arrivata una conferma mentre calcolavo
        onPredict(p, square);
      } catch {
        /* fotogramma saltato */
      }
    }, 550);
  } catch {
    video.classList.add("hidden");
    $("cam-fallback").classList.remove("hidden");
    $("cam-fallback").textContent = s.edo.noCamera;
  }
}

async function openCamera() {
  $("overlay-camera").classList.remove("hidden");
  $("cam-label").textContent = state.activeLabel === "cat" ? s.labels.cat : s.labels.house;
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
  $("btn-start").onclick = () => {
    showScreen("collect");
    say(s.edo.intro, "idle");
    paintCollect();
  };
  document.querySelectorAll("[data-select]").forEach((b) => {
    b.onclick = () => {
      state.activeLabel = b.dataset.select;
      paintCollect();
    };
  });
  $("thumbs-cat").onclick = $("thumbs-house").onclick = (e) => {
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
      s.ui.draw + " · " + (state.activeLabel === "cat" ? s.labels.cat : s.labels.house);
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
  $("btn-sample").onclick = () => {
    const c = countByLabel(state.persist.examples, MISSION_LABELS);
    const seed = c[state.activeLabel] + state.persist.examples.length + 1;
    void addCanvas(drawSample(state.activeLabel, seed), state.activeLabel);
  };
  $("btn-train").onclick = () => void runTrain();
  $("btn-goto-test").onclick = () => {
    showScreen("test");
    say(s.edo.looking, "idle");
    paintTest();
    startLive();
  };
  $("btn-shutter").onclick = () => $("file-input").click();
  $("file-input").onchange = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const square = await fileToSquare(f);
    if (state.screen === "test") {
      onPredict(predictKnn(state.persist.examples, await embedCanvas(square), state.scale), square);
    } else {
      void addCanvas(square, state.activeLabel);
    }
  };
  $("btn-test-sample").onclick = async () => {
    const guess = Math.random() > 0.5 ? "cat" : "house";
    const square = canvasToSquare(drawSample(guess, Date.now() % 99991));
    onPredict(predictKnn(state.persist.examples, await embedCanvas(square), state.scale), square);
  };
  $("btn-yes").onclick = () => confirmGuess(true);
  $("btn-no").onclick = () => confirmGuess(false);
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

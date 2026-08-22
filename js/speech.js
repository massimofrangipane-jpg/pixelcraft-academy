/* Voce di EDO.
   Le voci di sistema arrivano in modo asincrono e la prima chiamata su iOS
   deve nascere da un tocco: entrambe le cose sono gestite qui. */

let cached = { lang: null, voice: null };
let primed = false;

/* Nomi delle voci italiane e inglesi piu' morbide sui dispositivi Apple e
   Android. L'ordine conta: la prima trovata vince. */
const PREFERRED = {
  it: ["alice", "federica", "emma", "eloisa", "paola", "luca", "carlo"],
  en: ["samantha", "ava", "serena", "karen", "daniel", "aria"],
};

function score(v, short) {
  const n = v.name.toLowerCase();
  let s = 0;
  // le voci "enhanced/premium/neural" sono nettamente meno robotiche
  if (/enhanced|premium|neural|natural|siri/.test(n)) s += 100;
  const list = PREFERRED[short] || [];
  const i = list.findIndex((p) => n.includes(p));
  if (i >= 0) s += 60 - i;
  if (v.localService) s += 10; // funziona anche offline
  if (v.default) s += 4;
  return s;
}

function pickVoice(lang) {
  if (!("speechSynthesis" in window)) return null;
  const short = lang.slice(0, 2).toLowerCase();
  if (cached.lang === short && cached.voice) return cached.voice;
  const all = window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(short));
  if (!all.length) return null;
  const best = all.slice().sort((a, b) => score(b, short) - score(a, short))[0];
  cached = { lang: short, voice: best };
  return best;
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    cached = { lang: null, voice: null };
  });
}

/* Su iOS la sintesi resta muta finche' non parte da un gesto dell'utente.
   Chiamare questa al primo tocco sblocca tutte le frasi successive. */
export function primeVoice() {
  if (primed || !("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    primed = true;
  } catch {
    /* niente voce su questo dispositivo */
  }
}

/* Le frasi di EDO sono corte: leggerle un po' lente, con un tono leggermente
   alto ma non stridulo, e' cio' che le rende comprensibili a otto anni. */
export function speak(text, lang = "it-IT") {
  try {
    if (!("speechSynthesis" in window) || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    // le virgole diventano micro-pause: la lettura smette di sembrare un elenco
    const clean = String(text)
      .replace(/\s+/g, " ")
      .replace(/([,;:])\s*/g, "$1 ")
      .trim();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang;
    u.rate = 0.88;
    u.pitch = 1.18;
    u.volume = 1;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    synth.speak(u);
  } catch {
    /* nessun pacchetto vocale disponibile */
  }
}

export function speak(text, lang = "it-IT") {
  try {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.92;
    u.pitch = 1.05;
    const voices = synth.getVoices();
    const match =
      voices.find((v) => v.lang.toLowerCase().startsWith("it") && v.localService) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("it")) ||
      null;
    if (match) u.voice = match;
    synth.speak(u);
  } catch {
    /* offline / no voice pack */
  }
}

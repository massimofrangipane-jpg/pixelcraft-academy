const KEY = "pixelcraft-academy-v1";

export function emptyPersist() {
  return {
    examples: [],
    stars: { one: false, two: false, three: false },
    trainCount: 0,
    examplesAtLastTrain: 0,
    lessonUnlocked: false,
    seenAct2: false,
    seenAct3: false,
    cameraAsked: false,
  };
}

export function loadPersist() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyPersist();
    const parsed = JSON.parse(raw);
    const base = emptyPersist();
    return {
      ...base,
      ...parsed,
      stars: { ...base.stars, ...(parsed.stars || {}) },
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
    };
  } catch {
    return emptyPersist();
  }
}

export function savePersist(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    /* Quota piena: si liberano prima le miniature, che sono solo decorative.
       I vettori restano, quindi il modello addestrato non si perde. */
    try {
      const lean = { ...data, examples: data.examples.map((e) => ({ ...e, thumb: "" })) };
      localStorage.setItem(KEY, JSON.stringify(lean));
      console.warn("[store] quota piena: miniature rimosse, modello conservato");
      return true;
    } catch {
      console.error("[store] salvataggio non riuscito", err);
      return false;
    }
  }
}

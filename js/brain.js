let embedModel = null;
let embedChain = Promise.resolve();

export function brainReady() {
  return embedModel !== null;
}

export async function initBrain(onProgress) {
  if (embedModel) return;
  const tf = window.tf;
  if (!tf) throw new Error("tfjs");
  await tf.ready();
  try {
    await tf.setBackend("webgl");
    await tf.ready();
  } catch {
    await tf.setBackend("cpu");
    await tf.ready();
  }
  const url = new URL("models/mobilenet/model.json", document.baseURI).href;
  const full = await tf.loadLayersModel(url, {
    onProgress: (p) => onProgress?.(p),
  });
  const layer = full.getLayer("global_average_pooling2d_1");
  embedModel = tf.model({ inputs: full.inputs, outputs: layer.output });
  tf.tidy(() => {
    const z = tf.zeros([1, 224, 224, 3]);
    embedModel.predict(z);
  });
}

export async function embedCanvas(canvas) {
  const job = embedChain.then(
    () => embedNow(canvas),
    () => embedNow(canvas),
  );
  embedChain = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

async function embedNow(canvas) {
  const tf = window.tf;
  if (!tf || !embedModel) throw new Error("brain");
  const tensor = tf.tidy(() => {
    const img = tf.browser.fromPixels(canvas);
    const resized =
      img.shape[0] === 224 && img.shape[1] === 224
        ? img
        : tf.image.resizeBilinear(img, [224, 224]);
    const f = tf.cast(resized, "float32");
    const norm = tf.div(tf.sub(f, 127.5), 127.5);
    const batched = tf.expandDims(norm, 0);
    const pred = embedModel.predict(batched);
    return pred.reshape([pred.size]);
  });
  const data = await tensor.data();
  tensor.dispose();
  return new Float32Array(data);
}

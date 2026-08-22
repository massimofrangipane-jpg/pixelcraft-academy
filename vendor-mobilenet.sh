#!/bin/sh
# One-time LOCAL vendor of MobileNet v1 0.25 weights.
# Run from the GitHub Pages root (the folder that contains index.html).
# Output: models/mobilenet/model.json + models/mobilenet/weights.bin
# This is a build-your-repo step. The app at runtime never talks to this URL.
set -eu
BASE="https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224"
DEST="models/mobilenet"
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "$TMP/model.json" "$BASE/model.json"

python3 - "$TMP" "$DEST" "$BASE" <<'PY'
import json, os, sys, urllib.request
tmp, dest, base = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(os.path.join(tmp, "model.json")))
ordered = []
seen = set()
for e in m["weightsManifest"]:
    for p in e["paths"]:
        if p not in seen:
            seen.add(p)
            ordered.append(p)
blobs = []
specs = []
for e in m["weightsManifest"]:
    specs.extend(e["weights"])
for i, p in enumerate(ordered, 1):
    out = os.path.join(tmp, p)
    urllib.request.urlretrieve(base + "/" + p, out)
    blobs.append(open(out, "rb").read())
    print(f"{i:02d}/{len(ordered)} {p} {os.path.getsize(out)}", flush=True)
open(os.path.join(dest, "weights.bin"), "wb").write(b"".join(blobs))
m["weightsManifest"] = [{"paths": ["weights.bin"], "weights": specs}]
json.dump(m, open(os.path.join(dest, "model.json"), "w"))
print("ok", dest, "weights.bin", os.path.getsize(os.path.join(dest, "weights.bin")))
PY

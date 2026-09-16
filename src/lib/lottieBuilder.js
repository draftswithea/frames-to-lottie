import JSZip from "jszip";
import { svgToShapeItems } from "./svgPath.js";

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// frames: ordered array of { type: 'svg'|'png', name, text?, bytes?, width, height }
// opts: { fr, hold, size }
// Returns the Lottie JSON with PNG assets embedded as base64 data URIs
// (a fully self-contained single-file .json).
export function buildLottie(frames, name, opts) {
  const { fr, hold, size } = opts;
  const n = frames.length;
  const totalFrames = n * hold;
  const layers = [];
  const assets = [];

  frames.forEach((frame, i) => {
    const start = i * hold;
    const end = start + hold;
    const opKeyframes = [];
    if (start > 0) opKeyframes.push({ t: 0, s: [0], h: 1 });
    opKeyframes.push({ t: start, s: [100], h: 1 });
    opKeyframes.push({ t: end, s: [0], h: 1 });

    const baseKs = {
      o: { a: 1, k: opKeyframes },
      r: { a: 0, k: 0 },
    };

    if (frame.type === "svg") {
      const { shapeItems, width } = svgToShapeItems(frame.text);
      const scale = size / width;
      layers.push({
        ddd: 0,
        ind: i + 1,
        ty: 4,
        nm: frame.name,
        sr: 1,
        ks: {
          ...baseKs,
          p: { a: 0, k: [0, 0, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [scale * 100, scale * 100, 100] },
        },
        shapes: shapeItems,
        ao: 0,
        ip: 0,
        op: totalFrames,
        st: 0,
        bm: 0,
      });
    } else {
      // png frame -> embedded image asset + image layer
      const assetId = "img_" + i;
      const b64 = arrayBufferToBase64(frame.bytes);
      assets.push({
        id: assetId,
        w: frame.width,
        h: frame.height,
        u: "",
        p: "data:image/png;base64," + b64,
        e: 1,
      });
      const scale = size / frame.width;
      layers.push({
        ddd: 0,
        ind: i + 1,
        ty: 2,
        nm: frame.name,
        refId: assetId,
        sr: 1,
        ks: {
          ...baseKs,
          p: { a: 0, k: [size / 2, size / 2, 0] },
          a: { a: 0, k: [frame.width / 2, frame.height / 2, 0] },
          s: { a: 0, k: [scale * 100, scale * 100, 100] },
        },
        ao: 0,
        ip: 0,
        op: totalFrames,
        st: 0,
        bm: 0,
      });
    }
  });

  return {
    v: "5.9.6",
    fr,
    ip: 0,
    op: totalFrames,
    w: size,
    h: size,
    nm: name,
    ddd: 0,
    assets,
    layers,
  };
}

// Builds the .lottie (dotLottie) zip container. PNG assets are stored as
// separate files under images/ (referenced by relative path) rather than
// base64-inlined, which keeps the archive smaller than the plain .json.
export async function buildDotLottie(lottieJson, name) {
  const zip = new JSZip();
  const lottieCopy = JSON.parse(JSON.stringify(lottieJson));

  if (lottieCopy.assets && lottieCopy.assets.length) {
    const imagesFolder = zip.folder("images");
    lottieCopy.assets = lottieCopy.assets.map((asset) => {
      if (typeof asset.p === "string" && asset.p.startsWith("data:")) {
        const [, b64] = asset.p.split(",", 2);
        const filename = asset.id + ".png";
        imagesFolder.file(filename, b64, { base64: true });
        return { id: asset.id, w: asset.w, h: asset.h, u: "images/", p: filename, e: 0 };
      }
      return asset;
    });
  }

  zip.file(
    "manifest.json",
    JSON.stringify({
      version: "1",
      generator: "svg-lottie-studio",
      animations: [{ id: name, speed: 1, loop: true }],
    })
  );
  zip.file("animations/" + name + ".json", JSON.stringify(lottieCopy));

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

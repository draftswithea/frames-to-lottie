// Our vector parser only understands flat path/circle/ellipse/rect/line/
// polyline/polygon geometry with plain fill/stroke paint. Anything beyond
// that -- gradients, filters, masks, clip-paths, <use> references, text,
// or transforms -- would either be silently dropped or rendered wrong.
//
// Rather than guess at partial support, we detect those cases up front and
// rasterize just that frame to a PNG via a real <canvas>, which renders the
// SVG exactly as a browser would (gradients and all). The frame then flows
// through the same PNG image-layer path as a natively-uploaded PNG.
const RASTER_TRIGGER_RE =
  /<(lineargradient|radialgradient|filter|mask|clippath|use|text|tspan|image|foreignobject)\b|url\(\s*#|transform\s*=/i;

// Our path parser only recognizes absolute M/L/C/Z tokens. Any other SVG
// path command letter -- arcs (A), quadratics (Q/T), smooth curves (S),
// lineto shortcuts (H/V), or *any* lowercase (relative) command including
// relative m/l/c/z -- would silently corrupt the parsed geometry rather
// than error out, so a path using them should also raster-fallback.
const UNSUPPORTED_PATH_COMMAND_RE = /[AaQqTtSsHhVvmlcz]/;
const D_ATTR_RE = /\bd\s*=\s*"([^"]*)"/g;

function pathDataHasUnsupportedCommands(svgText) {
  let m;
  D_ATTR_RE.lastIndex = 0;
  while ((m = D_ATTR_RE.exec(svgText))) {
    if (UNSUPPORTED_PATH_COMMAND_RE.test(m[1])) return true;
  }
  return false;
}

export function svgNeedsRaster(svgText) {
  return RASTER_TRIGGER_RE.test(svgText) || pathDataHasUnsupportedCommands(svgText);
}

// Rasterizes one SVG frame to a PNG at targetSize x targetSize via canvas.
// Returns { bytes: Uint8Array, width, height }. Throws if the browser
// refuses to load/draw the SVG (e.g. it references something that taints
// the canvas) -- callers should catch and decide how to degrade.
export async function rasterizeSvgToPng(svgText, targetSize) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;

  // Explicit width/height (rather than relying solely on viewBox) makes
  // <img>/Image loading behave consistently across browsers.
  if (!root.getAttribute("viewBox")) {
    const w = parseFloat(root.getAttribute("width")) || 1000;
    const h = parseFloat(root.getAttribute("height")) || 1000;
    root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  root.setAttribute("width", String(targetSize));
  root.setAttribute("height", String(targetSize));

  const serialized = new XMLSerializer().serializeToString(doc);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("browser could not load/rasterize this SVG frame"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, 0, 0, targetSize, targetSize);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), "image/png");
    });
    const buf = await pngBlob.arrayBuffer();
    return { bytes: new Uint8Array(buf), width: targetSize, height: targetSize };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Picks a sensible raster resolution: at least 800px so small source SVGs
// don't come out blurry, but capped so we don't generate huge files for
// already-oversized source art (Moho-style exports are often ~2000px).
export function pickRasterSize(sourceWidth, sourceHeight) {
  const native = Math.max(sourceWidth || 0, sourceHeight || 0);
  return Math.min(2000, Math.max(800, native));
}

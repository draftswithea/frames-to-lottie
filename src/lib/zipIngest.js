import JSZip from "jszip";
import { svgNeedsRaster, rasterizeSvgToPng, pickRasterSize } from "./svgRaster.js";

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

async function pngDimensions(bytes) {
  const blob = new Blob([bytes], { type: "image/png" });
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(blob);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close && bmp.close();
    return dims;
  }
  // Fallback for environments without createImageBitmap
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Reads a zip File/Blob and returns an ordered array of frame descriptors:
//   { id, type: 'svg'|'png', name, text?, bytes?, width, height, thumbUrl }
// Frames are naturally sorted by filename. Mixed svg+png zips are supported,
// though in practice a sequence is normally all one type.
export async function ingestZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files)
    .filter((f) => !f.dir && /\.(svg|png)$/i.test(f.name))
    .sort((a, b) => naturalCompare(a.name, b.name));

  if (!entries.length) {
    throw new Error("no .svg or .png frames found in zip");
  }

  const frames = [];
  for (const entry of entries) {
    const baseName = entry.name.split("/").pop();
    if (/\.svg$/i.test(entry.name)) {
      const text = await entry.async("text");
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const root = doc.documentElement;
      const w = parseFloat((root.getAttribute("width") || "1000").replace(/[a-zA-Z%]/g, "")) || 1000;
      const h = parseFloat((root.getAttribute("height") || "1000").replace(/[a-zA-Z%]/g, "")) || 1000;

      if (svgNeedsRaster(text)) {
        try {
          const rasterSize = pickRasterSize(w, h);
          const { bytes, width, height } = await rasterizeSvgToPng(text, rasterSize);
          const blob = new Blob([bytes], { type: "image/png" });
          const thumbUrl = URL.createObjectURL(blob);
          frames.push({
            id: entry.name,
            type: "png",
            name: baseName,
            bytes,
            width,
            height,
            thumbUrl,
            rasterized: true,
          });
          continue;
        } catch (err) {
          // Best effort: fall through and try converting as vector anyway
          // rather than dropping the frame entirely.
          console.warn("raster fallback failed for", entry.name, err);
        }
      }

      const thumbUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(text)));
      frames.push({
        id: entry.name,
        type: "svg",
        name: baseName,
        text,
        width: w,
        height: h,
        thumbUrl,
      });
    } else {
      const bytes = await entry.async("uint8array");
      const { width, height } = await pngDimensions(bytes);
      const blob = new Blob([bytes], { type: "image/png" });
      const thumbUrl = URL.createObjectURL(blob);
      frames.push({
        id: entry.name,
        type: "png",
        name: baseName,
        bytes,
        width,
        height,
        thumbUrl,
      });
    }
  }
  return frames;
}

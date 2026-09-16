// Parses an SVG path 'd' string containing only M/L/C/Z commands (absolute
// coordinates) into subpaths of Lottie-style bezier vertices with in/out
// tangent handles relative to their own vertex.
//
// This covers the common case for flat, path-only SVG exports (icon tools,
// Moho/Anime Studio, most vector illustration exports that don't rely on
// arcs or quadratic curves). Arcs (A) and quadratics (Q/T) are not
// supported -- if your source uses them, convert to cubics first.
export function parsePathD(d) {
  const tokenRe = /[MLCZ]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
  const tokens = d.match(tokenRe) || [];
  let i = 0;
  let cmd = null;
  let cur = null;
  const subpaths = [];

  function newSubpath(px, py) {
    return { closed: false, verts: [[px, py]], in: [[0, 0]], out: [[0, 0]] };
  }
  function num(tok) {
    return parseFloat(tok);
  }

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "M" || tok === "L" || tok === "C" || tok === "Z") {
      cmd = tok;
      i++;
    }
    if (cmd === "M") {
      const x = num(tokens[i]);
      const y = num(tokens[i + 1]);
      i += 2;
      if (cur) subpaths.push(cur);
      cur = newSubpath(x, y);
    } else if (cmd === "L") {
      const x = num(tokens[i]);
      const y = num(tokens[i + 1]);
      i += 2;
      cur.verts.push([x, y]);
      cur.in.push([0, 0]);
      cur.out.push([0, 0]);
    } else if (cmd === "C") {
      const c1x = num(tokens[i]);
      const c1y = num(tokens[i + 1]);
      const c2x = num(tokens[i + 2]);
      const c2y = num(tokens[i + 3]);
      const ex = num(tokens[i + 4]);
      const ey = num(tokens[i + 5]);
      i += 6;
      const prev = cur.verts[cur.verts.length - 1];
      cur.out[cur.out.length - 1] = [c1x - prev[0], c1y - prev[1]];
      cur.verts.push([ex, ey]);
      cur.in.push([c2x - ex, c2y - ey]);
      cur.out.push([0, 0]);
    } else if (cmd === "Z") {
      cur.closed = true;
      if (cur.verts.length > 1) {
        const [sx, sy] = cur.verts[0];
        const [lx, ly] = cur.verts[cur.verts.length - 1];
        if (Math.abs(sx - lx) < 1e-6 && Math.abs(sy - ly) < 1e-6) {
          cur.in[0] = cur.in[cur.in.length - 1];
          cur.verts.pop();
          cur.in.pop();
          cur.out.pop();
        }
      }
      i++;
    } else {
      i++;
    }
  }
  if (cur) subpaths.push(cur);
  return subpaths;
}

export function hexToRgb1(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substr(0, 2), 16) / 255;
  const g = parseInt(h.substr(2, 2), 16) / 255;
  const b = parseInt(h.substr(4, 2), 16) / 255;
  return [r, g, b];
}

function shapeGroupFromPathEl(el, idx) {
  const d = el.getAttribute("d");
  if (!d) return null;
  const subpaths = parsePathD(d);
  if (!subpaths.length) return null;

  const fill = el.getAttribute("fill");
  const stroke = el.getAttribute("stroke");
  const strokeWidth = el.getAttribute("stroke-width");
  const fillRule = el.getAttribute("fill-rule") || "nonzero";
  const lottieFillRule = fillRule === "evenodd" ? 2 : 1;

  const items = [];
  for (const sp of subpaths) {
    items.push({
      ty: "sh",
      ix: 1,
      ks: { a: 0, k: { c: sp.closed, i: sp.in, o: sp.out, v: sp.verts } },
      nm: "Path",
    });
  }
  if (fill && fill !== "none") {
    items.push({
      ty: "fl",
      c: { a: 0, k: [...hexToRgb1(fill), 1] },
      o: { a: 0, k: 100 },
      r: lottieFillRule,
      nm: "Fill",
    });
  }
  if (stroke && stroke !== "none") {
    items.push({
      ty: "st",
      c: { a: 0, k: [...hexToRgb1(stroke), 1] },
      o: { a: 0, k: 100 },
      w: { a: 0, k: strokeWidth ? parseFloat(strokeWidth) : 1 },
      lc: 2,
      lj: 2,
      nm: "Stroke",
    });
  }
  items.push({
    ty: "tr",
    p: { a: 0, k: [0, 0] },
    a: { a: 0, k: [0, 0] },
    s: { a: 0, k: [100, 100] },
    r: { a: 0, k: 0 },
    o: { a: 0, k: 100 },
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
  });

  return {
    ty: "gr",
    it: items,
    nm: el.getAttribute("id") || "path_" + idx,
    np: items.length,
    cix: 2,
    bm: 0,
    ix: idx,
    mn: "path_" + idx,
  };
}

function stripUnits(val, fallback) {
  if (!val) return fallback;
  const n = parseFloat(String(val).replace(/[a-zA-Z%]/g, ""));
  return isNaN(n) ? fallback : n;
}

// Parses one SVG document's <path> elements (in SVG paint order) into
// Lottie shape-group items, reversed so the first item in the returned
// array is the topmost shape (Lottie's convention).
export function svgToShapeItems(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  let width = stripUnits(root.getAttribute("width"), null);
  let height = stripUnits(root.getAttribute("height"), null);
  if (width == null || height == null) {
    const vb = root.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4) {
        width = width ?? parts[2];
        height = height ?? parts[3];
      }
    }
  }
  if (width == null) width = 1000;
  if (height == null) height = 1000;

  const pathEls = Array.from(root.querySelectorAll("path"));
  const shapeItems = [];
  pathEls.reverse().forEach((el, idx) => {
    const item = shapeGroupFromPathEl(el, idx);
    if (item) shapeItems.push(item);
  });
  return { shapeItems, width, height };
}

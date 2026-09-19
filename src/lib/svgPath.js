import { getInheritedProp, getCumulativeOpacity, parseOpacityValue, resolveColorToRgba, parseStylesheetRules } from "./svgStyle.js";

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

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// Converts one already-classified shape element (circle/ellipse/rect/line/
// polyline/polygon/path) into the array of Lottie "shape content" items
// (the "sh"/"el"/"rc" entries that go before fill/stroke/transform in a
// shape group). Returns null if the element has nothing renderable.
function shapeContentFromEl(el) {
  const tag = el.tagName.toLowerCase();

  if (tag === "path") {
    const d = el.getAttribute("d");
    if (!d) return null;
    const subpaths = parsePathD(d);
    if (!subpaths.length) return null;
    return subpaths.map((sp) => ({
      ty: "sh",
      ix: 1,
      ks: { a: 0, k: { c: sp.closed, i: sp.in, o: sp.out, v: sp.verts } },
      nm: "Path",
    }));
  }

  if (tag === "circle") {
    const cx = num(el.getAttribute("cx"));
    const cy = num(el.getAttribute("cy"));
    const r = num(el.getAttribute("r"));
    if (r <= 0) return null;
    return [
      {
        ty: "el",
        p: { a: 0, k: [cx, cy] },
        s: { a: 0, k: [r * 2, r * 2] },
        nm: "Ellipse",
      },
    ];
  }

  if (tag === "ellipse") {
    const cx = num(el.getAttribute("cx"));
    const cy = num(el.getAttribute("cy"));
    const rx = num(el.getAttribute("rx"));
    const ry = num(el.getAttribute("ry"));
    if (rx <= 0 || ry <= 0) return null;
    return [
      {
        ty: "el",
        p: { a: 0, k: [cx, cy] },
        s: { a: 0, k: [rx * 2, ry * 2] },
        nm: "Ellipse",
      },
    ];
  }

  if (tag === "rect") {
    const x = num(el.getAttribute("x"));
    const y = num(el.getAttribute("y"));
    const w = num(el.getAttribute("width"));
    const h = num(el.getAttribute("height"));
    if (w <= 0 || h <= 0) return null;
    let rx = el.hasAttribute("rx") ? num(el.getAttribute("rx")) : null;
    let ry = el.hasAttribute("ry") ? num(el.getAttribute("ry")) : null;
    if (rx == null && ry != null) rx = ry;
    if (ry == null && rx != null) ry = rx;
    return [
      {
        ty: "rc",
        p: { a: 0, k: [x + w / 2, y + h / 2] },
        s: { a: 0, k: [w, h] },
        r: { a: 0, k: rx || 0 },
        nm: "Rectangle",
      },
    ];
  }

  if (tag === "line") {
    const x1 = num(el.getAttribute("x1"));
    const y1 = num(el.getAttribute("y1"));
    const x2 = num(el.getAttribute("x2"));
    const y2 = num(el.getAttribute("y2"));
    return [
      {
        ty: "sh",
        ix: 1,
        ks: {
          a: 0,
          k: {
            c: false,
            i: [[0, 0], [0, 0]],
            o: [[0, 0], [0, 0]],
            v: [[x1, y1], [x2, y2]],
          },
        },
        nm: "Line",
      },
    ];
  }

  if (tag === "polyline" || tag === "polygon") {
    const pointsAttr = el.getAttribute("points") || "";
    const nums = pointsAttr.trim().split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
    const verts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) verts.push([nums[i], nums[i + 1]]);
    if (verts.length < 2) return null;
    return [
      {
        ty: "sh",
        ix: 1,
        ks: {
          a: 0,
          k: {
            c: tag === "polygon",
            i: verts.map(() => [0, 0]),
            o: verts.map(() => [0, 0]),
            v: verts,
          },
        },
        nm: tag === "polygon" ? "Polygon" : "Polyline",
      },
    ];
  }

  return null;
}

function shapeGroupFromEl(el, idx, rules) {
  const shapeContent = shapeContentFromEl(el);
  if (!shapeContent || !shapeContent.length) return null;

  const tag = el.tagName.toLowerCase();
  // Bare <line> elements have no fill by definition even if a fill value
  // resolves to something -- SVG never paints a fill for <line>.
  const allowFill = tag !== "line";

  const fillRaw = allowFill ? getInheritedProp(el, rules, "fill", "black") : "none";
  const strokeRaw = getInheritedProp(el, rules, "stroke", "none");
  const strokeWidthRaw = getInheritedProp(el, rules, "stroke-width", "1");
  const fillRuleRaw = getInheritedProp(el, rules, "fill-rule", "nonzero");
  const fillOpacityRaw = getInheritedProp(el, rules, "fill-opacity", "1");
  const strokeOpacityRaw = getInheritedProp(el, rules, "stroke-opacity", "1");
  const elementOpacity = getCumulativeOpacity(el, rules);

  const fillColor = resolveColorToRgba(fillRaw);
  const strokeColor = resolveColorToRgba(strokeRaw);
  const lottieFillRule = fillRuleRaw === "evenodd" ? 2 : 1;

  const items = [...shapeContent];
  if (fillColor) {
    items.push({
      ty: "fl",
      c: { a: 0, k: [fillColor.r, fillColor.g, fillColor.b, 1] },
      o: { a: 0, k: Math.round(fillColor.a * parseOpacityValue(fillOpacityRaw) * 100) },
      r: lottieFillRule,
      nm: "Fill",
    });
  }
  if (strokeColor) {
    items.push({
      ty: "st",
      c: { a: 0, k: [strokeColor.r, strokeColor.g, strokeColor.b, 1] },
      o: { a: 0, k: Math.round(strokeColor.a * parseOpacityValue(strokeOpacityRaw) * 100) },
      w: { a: 0, k: parseFloat(strokeWidthRaw) || 1 },
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
    o: { a: 0, k: Math.round(elementOpacity * 100) },
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
  });

  return {
    ty: "gr",
    it: items,
    nm: el.getAttribute("id") || tag + "_" + idx,
    np: items.length,
    cix: 2,
    bm: 0,
    ix: idx,
    mn: tag + "_" + idx,
  };
}

function stripUnits(val, fallback) {
  if (!val) return fallback;
  const n = parseFloat(String(val).replace(/[a-zA-Z%]/g, ""));
  return isNaN(n) ? fallback : n;
}

// Parses one SVG document's shape elements (path, circle, ellipse, rect,
// line, polyline, polygon) in SVG paint order into Lottie shape-group
// items, reversed so the first item in the returned array is the topmost
// shape (Lottie's convention).
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

  const rules = parseStylesheetRules(doc);
  const shapeEls = Array.from(
    root.querySelectorAll("path, circle, ellipse, rect, line, polyline, polygon")
  );
  const shapeItems = [];
  shapeEls.reverse().forEach((el, idx) => {
    const item = shapeGroupFromEl(el, idx, rules);
    if (item) shapeItems.push(item);
  });
  return { shapeItems, width, height };
}

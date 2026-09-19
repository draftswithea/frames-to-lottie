import { CSS_COLOR_NAMES } from "./cssColorNames.js";

// Properties that inherit down the tree by default in SVG/CSS (nearest
// explicit value wins; walking to the root falls back to the initial value).
const INHERITED_PROPS = new Set(["fill", "stroke", "stroke-width", "fill-rule", "fill-opacity", "stroke-opacity"]);

function parseInlineStyle(styleAttr) {
  const map = {};
  (styleAttr || "").split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx === -1) return;
    const k = decl.slice(0, idx).trim().toLowerCase();
    const v = decl.slice(idx + 1).trim();
    if (k) map[k] = v;
  });
  return map;
}

// Parses every <style> block in the document into a flat list of
// { selectors: string[], props: {prop: value} } rules. Handles the common
// case emitted by design tools: simple class/tag/id selectors with a flat
// declaration block (no nesting, no media queries, no combinators).
export function parseStylesheetRules(doc) {
  const rules = [];
  const styleEls = Array.from(doc.querySelectorAll("style"));
  for (const styleEl of styleEls) {
    const css = (styleEl.textContent || "").replace(/\/\*[\s\S]*?\*\//g, "");
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(css))) {
      const selectors = m[1].split(",").map((s) => s.trim()).filter(Boolean);
      const props = {};
      m[2].split(";").forEach((decl) => {
        const idx = decl.indexOf(":");
        if (idx === -1) return;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if (prop) props[prop] = val;
      });
      if (selectors.length) rules.push({ selectors, props });
    }
  }
  return rules;
}

function matchesSelector(el, sel) {
  if (sel.startsWith(".")) {
    const cls = sel.slice(1);
    const classList = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
    return classList.includes(cls);
  }
  if (sel.startsWith("#")) {
    return el.getAttribute("id") === sel.slice(1);
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function classRuleValue(el, rules, prop) {
  // Later matching rules win (simple last-match, ignoring full CSS
  // specificity -- sufficient for the flat class stylesheets design tools
  // typically emit).
  let found = null;
  for (const rule of rules) {
    if (prop in rule.props && rule.selectors.some((sel) => matchesSelector(el, sel))) {
      found = rule.props[prop];
    }
  }
  return found;
}

// Resolves one property on a single element (no ancestor walk), in the
// order a real cascade would apply: inline style wins, then a matching
// class/tag/id rule, then the plain presentation attribute.
function ownValue(el, rules, prop) {
  const inline = parseInlineStyle(el.getAttribute("style"));
  if (prop in inline && inline[prop] !== "inherit") return inline[prop];
  const classVal = classRuleValue(el, rules, prop);
  if (classVal != null && classVal !== "inherit") return classVal;
  const attr = el.getAttribute(prop);
  if (attr != null && attr !== "inherit") return attr;
  return null;
}

// Resolves an inherited property by walking from the element up to the
// document root, returning the nearest explicit value (own element wins,
// else nearest ancestor, else the given SVG-spec initial value).
export function getInheritedProp(el, rules, prop, initial) {
  let node = el;
  while (node && node.nodeType === 1) {
    const v = ownValue(node, rules, prop);
    if (v != null) return v;
    node = node.parentElement;
  }
  return initial;
}

// SVG/CSS 'opacity' is NOT an inherited property -- instead, an ancestor's
// opacity composites its whole subtree, which for our flattened (one shape
// layer per leaf element) output is best approximated by multiplying the
// element's own opacity by every ancestor's own opacity.
export function getCumulativeOpacity(el, rules) {
  let node = el;
  let product = 1;
  while (node && node.nodeType === 1) {
    const v = ownValue(node, rules, "opacity");
    if (v != null) product *= parseOpacityValue(v);
    node = node.parentElement;
  }
  return product;
}

export function parseOpacityValue(v, fallback = 1) {
  if (v == null) return fallback;
  const s = String(v).trim();
  if (s.endsWith("%")) {
    const n = parseFloat(s);
    return isNaN(n) ? fallback : Math.min(1, Math.max(0, n / 100));
  }
  const n = parseFloat(s);
  return isNaN(n) ? fallback : Math.min(1, Math.max(0, n));
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1, g1, b1;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return { r: r1 + m, g: g1 + m, b: b1 + m };
}

function hexToRgba(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substr(0, 2), 16) / 255;
  const g = parseInt(h.substr(2, 2), 16) / 255;
  const b = parseInt(h.substr(4, 2), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1;
  return { r, g, b, a };
}

// Resolves any valid CSS/SVG paint color string -- hex (#rgb/#rrggbb/#rrggbbaa),
// rgb()/rgba(), hsl()/hsla(), or a named color keyword -- into {r,g,b,a} with
// each channel in the 0-1 range Lottie expects. Returns null for "none",
// "transparent", "currentColor" (unsupported without a resolved context), or
// any value that can't be parsed -- callers should treat null as "no paint",
// which is safer than guessing.
export function resolveColorToRgba(raw) {
  if (raw == null) return null;
  const str = String(raw).trim().toLowerCase();
  if (str === "none" || str === "transparent" || str === "currentcolor" || str === "") return null;

  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(str)) {
    return hexToRgba(str);
  }
  if (CSS_COLOR_NAMES[str]) {
    return hexToRgba(CSS_COLOR_NAMES[str]);
  }

  let m = str.match(/^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*(?:,\s*([\d.]+%?)\s*)?\)$/);
  if (m) {
    const toChannel = (v) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    const r = toChannel(m[1]) / 255;
    const g = toChannel(m[2]) / 255;
    const b = toChannel(m[3]) / 255;
    const a = m[4] != null ? parseOpacityValue(m[4]) : 1;
    return { r, g, b, a };
  }

  m = str.match(/^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+%?)\s*)?\)$/);
  if (m) {
    const { r, g, b } = hslToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
    const a = m[4] != null ? parseOpacityValue(m[4]) : 1;
    return { r, g, b, a };
  }

  return null;
}

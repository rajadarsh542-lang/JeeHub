/* Recover only baseline character runs from the archived MathJax glyph IDs.
 * This is deliberately NOT an SVG-to-equation parser. Fractions, scripts,
 * stretched symbols, unknown fonts and positioned diagrams need source semantics.
 */
const svgNS = "http://www.w3.org/2000/svg";
const attributes = {
  svg: new Set(["width", "height", "viewBox"]),
  g: new Set(["stroke", "fill", "stroke-width", "transform"]),
  use: new Set(["href", "transform"]),
};
function character(href) {
  const match = /^#MJX-TEX-(N|I|V)-([0-9A-F]{2,6})$/.exec(href || "");
  if (!match) return null;
  const [, font, hex] = match, point = parseInt(hex, 16);
  if (point > 0x10ffff) return null;
  // This variant is a documented chemical arrow, not a font-style inference.
  if (font === "V") return hex === "21CC" ? "⇌" : null;
  const value = String.fromCodePoint(point);
  if (font === "N") return /^[A-Za-z0-9+−=()[\].,_/%]$/.test(value) ? value : null;
  // Italic identifiers have Unicode character identities. Do not fold bold,
  // calligraphic or other potentially meaningful font variants into plain text.
  const plain = value.normalize("NFKC");
  return /^[A-Za-zα-ωΑ-Ω]$/.test(plain) ? plain : null;
}

export function baselineMathText(container) {
  if (container.localName !== "mjx-container" || container.attributes.length ||
      container.children.length !== 1) return null;
  const svg = container.firstElementChild;
  if (svg.localName !== "svg" || svg.children.length !== 1) return null;
  const origin = svg.firstElementChild;
  if (origin.localName !== "g" || origin.getAttribute("transform") !== "scale(1,-1)") return null;
  let lastX = -Infinity, count = 0;
  function read(node, x) {
    if (node.nodeType === 3) return node.textContent.trim() ? null : "";
    if (node.nodeType !== 1 || node.namespaceURI !== svgNS) return null;
    const tag = node.localName, allowed = attributes[tag];
    if (!allowed || (tag === "svg" && node !== svg)) return null;
    if ([...node.attributes].some(a => !allowed.has(a.name))) return null;
    // Reject appearance changes that could conceal/reinterpret glyphs.
    for (const name of ["fill", "stroke"]) {
      if (node.hasAttribute(name) && node.getAttribute(name) !== "currentColor") return null;
    }
    if (node.hasAttribute("stroke-width") && node.getAttribute("stroke-width") !== "0") return null;
    const transform = node.getAttribute("transform");
    if (transform && node !== origin) {
      const move = /^translate\((\d+(?:\.\d+)?)[ ,]+0\)$/.exec(transform);
      if (!move) return null;
      x += Number(move[1]);
    }
    if (tag === "use") {
      if (node.childNodes.length || ++count > 300 || x <= lastX) return null;
      lastX = x;
      return character(node.getAttribute("href"));
    }
    let text = "";
    for (const child of node.childNodes) {
      const part = read(child, x);
      if (part === null) return null;
      text += part;
    }
    return text;
  }
  if ([...container.childNodes].some(n => n.nodeType !== 1 && n.textContent.trim())) return null;
  return read(svg, 0) || null;
}

export function exposeArchiveMath(container, text) {
  const svg = container.firstElementChild;
  if (!svg || svg.localName !== "svg") return;
  svg.setAttribute("focusable", "false");
  if (text) {
    const alternative = document.createElement("span");
    alternative.className = "archive-math-text";
    alternative.textContent = text;
    // Only the equivalent text is announced; the unchanged drawing is decorative.
    svg.setAttribute("aria-hidden", "true");
    container.append(alternative);
  } else {
    // Do not silently drop an expression or claim a guessed linearization is math.
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Mathematical expression — accessible transcription unavailable.");
  }
}

//
// Theme registry and design tokens for PPT rendering via pptxgenjs.
// Provides color palettes, typography scales, and helper utilities.
//
// All exported functions are public interfaces (marked with PUBLIC_INTERFACE).
//

/** Normalize hex color to PPTX format (no '#', uppercase). */
function normalizeHex(hex, fallback = "FFFFFF") {
  const s = String(hex || "").trim();
  const raw = s.startsWith("#") ? s.slice(1) : s;
  const cleaned = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (cleaned.length === 3) {
    // e.g., ABC -> AABBCC
    return cleaned.split("").map(c => c + c).join("");
  }
  if (cleaned.length === 6) return cleaned;
  return fallback;
}

/** Build a default "azure" theme aligned with app CSS colors. */
function buildAzureTheme() {
  const colors = {
    primary: normalizeHex("#1976d2"),
    secondary: normalizeHex("#424242"),
    accent: normalizeHex("#ffc107"),
    background: normalizeHex("#ffffff"),
    backgroundSoft: normalizeHex("#f6f7f9"),
    text: normalizeHex("#1a1a1a"),
    muted: normalizeHex("#6b7280"),
    border: normalizeHex("#e5e7eb"),
    white: normalizeHex("#ffffff"),
    black: normalizeHex("#000000")
  };

  const typography = {
    title: { fontSize: 32, bold: true, color: colors.text },
    h1: { fontSize: 28, bold: true, color: colors.text },
    h2: { fontSize: 22, bold: true, color: colors.text },
    body: { fontSize: 16, color: colors.text },
    caption: { fontSize: 12, color: colors.muted }
  };

  const spacing = {
    pageMarginX: 0.5, // inches
    pageMarginY: 0.5,
    gutter: 0.25
  };

  const cards = {
    fill: { color: colors.white },
    line: { color: colors.border, width: 1 },
    shadow: { type: "outer", opacity: 0.2, blur: 3, offset: 1 },
    shape: "roundRect" // pptxgen 'roundRect'
  };

  const bullets = {
    indentLevel: 0.5, // inches
    bulletSize: 14,
    bulletColor: colors.text
  };

  return {
    name: "azure",
    colors,
    typography,
    spacing,
    cards,
    bullets
  };
}

/** Theme registry */
const THEMES = {
  azure: buildAzureTheme()
};

// PUBLIC_INTERFACE
export function listThemes() {
  /** Returns the list of available theme names. */
  return Object.keys(THEMES);
}

// PUBLIC_INTERFACE
export function getTheme(name = "azure") {
  /**
   * Retrieve a theme object by name, defaulting to "azure".
   * Unknown names will fall back to "azure".
   */
  const key = String(name || "azure").toLowerCase();
  return THEMES[key] || THEMES.azure;
}

// PUBLIC_INTERFACE
export function slideOptionsForTheme(theme) {
  /**
   * Returns slide creation options for pptx.addSlide, such as background color.
   * @param {object} theme - theme object from getTheme()
   * @returns {{ bkgd?: string }}
   */
  return {
    bkgd: theme?.colors?.background || "FFFFFF"
  };
}

// PUBLIC_INTERFACE
export function titleTextStyle(theme) {
  /** Returns pptx text style for slide titles. */
  const t = theme?.typography?.h1 || { fontSize: 28, bold: true, color: "000000" };
  return {
    fontSize: t.fontSize,
    bold: !!t.bold,
    color: t.color || "000000"
  };
}

// PUBLIC_INTERFACE
export function bodyTextStyle(theme) {
  /** Returns pptx text style for body text. */
  const t = theme?.typography?.body || { fontSize: 16, color: "000000" };
  return {
    fontSize: t.fontSize,
    color: t.color || "000000"
  };
}

// PUBLIC_INTERFACE
export function captionTextStyle(theme) {
  /** Returns pptx text style for captions. */
  const t = theme?.typography?.caption || { fontSize: 12, color: "666666" };
  return {
    fontSize: t.fontSize,
    color: t.color || "666666",
    italic: true
  };
}

// PUBLIC_INTERFACE
export function cardShapeOptions(theme) {
  /**
   * Returns default shape options for card-like rectangles.
   * Use with slide.addShape(theme.cards.shape, { ...cardShapeOptions(theme), x, y, w, h })
   */
  const c = theme?.cards || {};
  const line = c.line || {};
  return {
    fill: { color: c.fill?.color || theme.colors.white },
    line: {
      color: line.color || theme.colors.border,
      width: typeof line.width === "number" ? line.width : 1
    },
    shadow: c.shadow || undefined
  };
}

// PUBLIC_INTERFACE
export function primaryColor(theme) {
  /** Returns the primary color (hex without '#') for the given theme. */
  return theme?.colors?.primary || "1976D2";
}

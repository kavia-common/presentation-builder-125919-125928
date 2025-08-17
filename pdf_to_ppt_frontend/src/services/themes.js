//
//
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
    title: { fontSize: 34, bold: true, color: colors.text },
    h1: { fontSize: 30, bold: true, color: colors.text },
    h2: { fontSize: 22, bold: true, color: colors.text },
    body: { fontSize: 18, color: colors.text },
    caption: { fontSize: 13, color: colors.muted }
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

/** Midnight (dark) theme for high-contrast slides. */
function buildMidnightTheme() {
  const colors = {
    primary: normalizeHex("#60A5FA"),     // sky-400
    secondary: normalizeHex("#94A3B8"),   // slate-400
    accent: normalizeHex("#C084FC"),      // violet-400
    background: normalizeHex("#0F172A"),  // slate-900
    backgroundSoft: normalizeHex("#111827"),
    text: normalizeHex("#F8FAFC"),        // slate-50
    muted: normalizeHex("#CBD5E1"),       // slate-300
    border: normalizeHex("#1F2937"),      // gray-800
    white: normalizeHex("#FFFFFF"),
    black: normalizeHex("#000000")
  };

  const typography = {
    title: { fontSize: 36, bold: true, color: colors.text },
    h1: { fontSize: 32, bold: true, color: colors.text },
    h2: { fontSize: 22, bold: true, color: colors.text },
    body: { fontSize: 18, color: colors.text },
    caption: { fontSize: 13, color: colors.muted }
  };

  const spacing = { pageMarginX: 0.5, pageMarginY: 0.5, gutter: 0.3 };

  const cards = {
    fill: { color: colors.backgroundSoft },
    line: { color: colors.border, width: 1 },
    shadow: { type: "outer", opacity: 0.35, blur: 4, offset: 1 },
    shape: "roundRect"
  };

  const bullets = {
    indentLevel: 0.5,
    bulletSize: 14,
    bulletColor: colors.text
  };

  return {
    name: "midnight",
    colors,
    typography,
    spacing,
    cards,
    bullets
  };
}

/** Slate (subtle cool light) theme. */
function buildSlateTheme() {
  const colors = {
    primary: normalizeHex("#334155"),       // slate-700
    secondary: normalizeHex("#64748B"),     // slate-500
    accent: normalizeHex("#3B82F6"),        // blue-500
    background: normalizeHex("#F8FAFC"),    // slate-50
    backgroundSoft: normalizeHex("#F1F5F9"),// slate-100
    text: normalizeHex("#0F172A"),          // slate-900
    muted: normalizeHex("#475569"),         // slate-600
    border: normalizeHex("#E2E8F0"),        // slate-200
    white: normalizeHex("#FFFFFF"),
    black: normalizeHex("#000000")
  };

  const typography = {
    title: { fontSize: 32, bold: true, color: colors.text },
    h1: { fontSize: 28, bold: true, color: colors.text },
    h2: { fontSize: 22, bold: true, color: colors.text },
    body: { fontSize: 16, color: colors.text },
    caption: { fontSize: 12, color: colors.muted }
  };

  const spacing = { pageMarginX: 0.5, pageMarginY: 0.5, gutter: 0.25 };

  const cards = {
    fill: { color: colors.white },
    line: { color: colors.border, width: 1 },
    shadow: { type: "outer", opacity: 0.14, blur: 3, offset: 1 },
    shape: "roundRect"
  };

  const bullets = {
    indentLevel: 0.5,
    bulletSize: 14,
    bulletColor: colors.text
  };

  return {
    name: "slate",
    colors,
    typography,
    spacing,
    cards,
    bullets
  };
}

/** Coral/Sunset warm theme. */
function buildCoralTheme() {
  const colors = {
    primary: normalizeHex("#EA580C"),      // orange-600
    secondary: normalizeHex("#92400E"),    // amber-800-ish
    accent: normalizeHex("#F97316"),       // orange-500
    background: normalizeHex("#FFF7ED"),   // orange-50
    backgroundSoft: normalizeHex("#FFFBEB"),// amber-50
    text: normalizeHex("#1F2937"),         // gray-800
    muted: normalizeHex("#6B7280"),        // gray-500
    border: normalizeHex("#FED7AA"),       // orange-200
    white: normalizeHex("#FFFFFF"),
    black: normalizeHex("#000000")
  };

  const typography = {
    title: { fontSize: 32, bold: true, color: colors.text },
    h1: { fontSize: 28, bold: true, color: colors.text },
    h2: { fontSize: 22, bold: true, color: colors.text },
    body: { fontSize: 16, color: colors.text },
    caption: { fontSize: 12, color: colors.muted }
  };

  const spacing = { pageMarginX: 0.5, pageMarginY: 0.5, gutter: 0.25 };

  const cards = {
    fill: { color: colors.white },
    line: { color: colors.border, width: 1 },
    shadow: { type: "outer", opacity: 0.18, blur: 3, offset: 1 },
    shape: "roundRect"
  };

  const bullets = {
    indentLevel: 0.5,
    bulletSize: 14,
    bulletColor: colors.text
  };

  return {
    name: "coral",
    colors,
    typography,
    spacing,
    cards,
    bullets
  };
}

/** Emerald (fresh green) theme. */
function buildEmeraldTheme() {
  const colors = {
    primary: normalizeHex("#065F46"),        // emerald-800
    secondary: normalizeHex("#047857"),      // emerald-700
    accent: normalizeHex("#10B981"),         // emerald-500
    background: normalizeHex("#F0FDF4"),     // emerald-50
    backgroundSoft: normalizeHex("#ECFDF5"), // emerald-50 alt
    text: normalizeHex("#052E16"),           // emerald-950
    muted: normalizeHex("#475569"),          // slate-600
    border: normalizeHex("#A7F3D0"),         // emerald-200
    white: normalizeHex("#FFFFFF"),
    black: normalizeHex("#000000")
  };

  const typography = {
    title: { fontSize: 32, bold: true, color: colors.text },
    h1: { fontSize: 28, bold: true, color: colors.text },
    h2: { fontSize: 22, bold: true, color: colors.text },
    body: { fontSize: 16, color: colors.text },
    caption: { fontSize: 12, color: colors.muted }
  };

  const spacing = { pageMarginX: 0.5, pageMarginY: 0.5, gutter: 0.25 };

  const cards = {
    fill: { color: colors.white },
    line: { color: colors.border, width: 1 },
    shadow: { type: "outer", opacity: 0.14, blur: 3, offset: 1 },
    shape: "roundRect"
  };

  const bullets = {
    indentLevel: 0.5,
    bulletSize: 14,
    bulletColor: colors.text
  };

  return {
    name: "emerald",
    colors,
    typography,
    spacing,
    cards,
    bullets
  };
}

/** Minimal theme with monochrome accents. */
function buildMinimalTheme() {
  const colors = {
    primary: normalizeHex("#111827"),        // gray-900
    secondary: normalizeHex("#6B7280"),      // gray-500
    accent: normalizeHex("#6B7280"),         // gray-500
    background: normalizeHex("#FFFFFF"),
    backgroundSoft: normalizeHex("#F9FAFB"), // gray-50
    text: normalizeHex("#111827"),           // gray-900
    muted: normalizeHex("#6B7280"),          // gray-500
    border: normalizeHex("#E5E7EB"),         // gray-200
    white: normalizeHex("#FFFFFF"),
    black: normalizeHex("#000000")
  };

  const typography = {
    title: { fontSize: 32, bold: true, color: colors.text },
    h1: { fontSize: 28, bold: true, color: colors.text },
    h2: { fontSize: 22, bold: true, color: colors.text },
    body: { fontSize: 16, color: colors.text },
    caption: { fontSize: 12, color: colors.muted }
  };

  const spacing = { pageMarginX: 0.6, pageMarginY: 0.6, gutter: 0.25 };

  const cards = {
    fill: { color: colors.white },
    line: { color: colors.border, width: 1 },
    shadow: undefined,
    shape: "roundRect"
  };

  const bullets = {
    indentLevel: 0.5,
    bulletSize: 14,
    bulletColor: colors.text
  };

  return {
    name: "minimal",
    colors,
    typography,
    spacing,
    cards,
    bullets
  };
}

/** Theme registry */
const THEMES = {
  azure: buildAzureTheme(),
  midnight: buildMidnightTheme(),
  slate: buildSlateTheme(),
  coral: buildCoralTheme(),
  emerald: buildEmeraldTheme(),
  minimal: buildMinimalTheme()
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

/**
 * Internal helper: ensure minimum contrast for text against the current background.
 * Uses adjustForContrast with a configurable minimum ratio.
 */
function ensureContrastColorForBg(baseHex, theme, minRatio) {
  const bg = theme?.colors?.background || "FFFFFF";
  return adjustForContrast(baseHex || "000000", bg, typeof minRatio === "number" ? minRatio : 4.5);
}

// PUBLIC_INTERFACE
export function titleTextStyle(theme) {
  /** Returns pptx text style for slide titles with enforced contrast. */
  const t = theme?.typography?.h1 || { fontSize: 28, bold: true, color: "000000" };
  const contrasted = ensureContrastColorForBg(t.color || "000000", theme, 4.5); // titles: AA
  const fontSize = Math.max(30, t.fontSize || 30); // nudge titles a bit larger for readability
  return {
    fontSize,
    bold: !!t.bold,
    color: contrasted,
    // subtle shadow to improve readability on light/detailed backgrounds
    shadow: { type: "outer", color: "000000", opacity: 0.18, blur: 1.2, offset: 0.4 }
  };
}

// PUBLIC_INTERFACE
export function bodyTextStyle(theme) {
  /** Returns pptx text style for body text with enforced high contrast. */
  const t = theme?.typography?.body || { fontSize: 16, color: "000000" };
  // Aim for AAA-like contrast for normal-size text
  const contrasted = ensureContrastColorForBg(t.color || "000000", theme, 7.0);
  const fontSize = Math.max(18, t.fontSize || 18); // bump to 18 for better legibility
  return {
    fontSize,
    color: contrasted
  };
}

// PUBLIC_INTERFACE
export function captionTextStyle(theme) {
  /** Returns pptx text style for captions with enforced contrast. */
  const t = theme?.typography?.caption || { fontSize: 12, color: "666666" };
  // Captions can be slightly lower contrast but still strong
  const contrasted = ensureContrastColorForBg(t.color || "666666", theme, 6.0);
  const fontSize = Math.max(13, t.fontSize || 13);
  return {
    fontSize,
    color: contrasted,
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

// PUBLIC_INTERFACE
export function accentColor(theme) {
  /** Returns the accent color (hex without '#') for the given theme. */
  return theme?.colors?.accent || "FFC107";
}

/* ----------------------- Color utilities (internal) ----------------------- */

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return (
    clamp(r).toString(16).padStart(2, "0") +
    clamp(g).toString(16).padStart(2, "0") +
    clamp(b).toString(16).padStart(2, "0")
  ).toUpperCase();
}

/** sRGB to relative luminance per WCAG */
function relativeLuminanceHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((v) => v / 255);
  const linear = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const [R, G, B] = linear;
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(hex1, hex2) {
  const L1 = relativeLuminanceHex(hex1);
  const L2 = relativeLuminanceHex(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function isLight(hex) {
  return relativeLuminanceHex(hex) > 0.5;
}

function mix(hex1, hex2, t) {
  // linear mix of two hex colors
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  const r = a.r + (b.r - a.r) * t;
  const g = a.g + (b.g - a.g) * t;
  const bl = a.b + (b.b - a.b) * t;
  return rgbToHex(r, g, bl);
}

/** Try to adjust color towards required contrast against a background */
function adjustForContrast(candidateHex, bgHex, minRatio = 3.0) {
  const MAX_STEPS = 20;
  let color = normalizeHex(candidateHex);
  const bg = normalizeHex(bgHex);

  // If already sufficient, return as-is
  if (contrastRatio(color, bg) >= minRatio) return color;

  // Decide direction: if background is light, darken candidate; else lighten it
  const bgIsLight = isLight(bg);
  const target = bgIsLight ? "000000" : "FFFFFF";

  for (let i = 1; i <= MAX_STEPS; i += 1) {
    const t = i / MAX_STEPS; // 0->1
    const adjusted = bgIsLight ? mix(color, target, t) : mix(color, target, t);
    if (contrastRatio(adjusted, bg) >= minRatio) {
      return normalizeHex(adjusted);
    }
  }
  // Fallback to original if we could not meet the ratio
  return color;
}

/* ---------------------- Image dominant color (internal) ---------------------- */

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

async function dominantColorFromImage(dataUrl, { sampleSize = 48 } = {}) {
  try {
    const img = await loadImage(dataUrl);
    const w = Math.max(1, Math.min(sampleSize, img.naturalWidth || img.width || sampleSize));
    const h = Math.max(1, Math.min(sampleSize, img.naturalHeight || img.height || sampleSize));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    let rSum = 0, gSum = 0, bSum = 0, count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 16) continue; // skip very transparent
      const r = data[i + 0];
      const g = data[i + 1];
      const b = data[i + 2];
      rSum += r;
      gSum += g;
      bSum += b;
      count += 1;
    }

    if (!count) return null;
    const r = Math.round(rSum / count);
    const g = Math.round(gSum / count);
    const b = Math.round(bSum / count);
    return rgbToHex(r, g, b);
  } catch {
    return null;
  }
}

/* ---------------------- PUBLIC auto-accent interfaces ---------------------- */

// PUBLIC_INTERFACE
export async function deriveThemeWithAutoAccent(baseTheme, candidateImageDataUrls = [], options = {}) {
  /**
   * Derives a new theme whose accent color is computed from the first available image.
   * Uses an in-memory canvas to compute the average dominant color and validates
   * contrast against the theme background per WCAG. Falls back to the original
   * accent if any step fails.
   *
   * @param {object} baseTheme - Theme object from getTheme()
   * @param {string[]} candidateImageDataUrls - ordered list of candidate images (data URLs); the first valid one is used
   * @param {{ minContrastBg?: number }} options - tuning options (default minContrastBg=3.0)
   * @returns {Promise<object>} - a cloned theme with possibly updated colors.accent
   */
  const minContrastBg = typeof options.minContrastBg === "number" ? options.minContrastBg : 3.0;

  const clone = JSON.parse(JSON.stringify(baseTheme || {}));
  const colors = clone.colors || {};
  const bg = colors.background || "FFFFFF";
  const originalAccent = colors.accent || "FFC107";

  const firstImage = (Array.isArray(candidateImageDataUrls) ? candidateImageDataUrls : []).find(Boolean);
  if (!firstImage) return clone; // nothing to do

  // Extract dominant color
  const dom = await dominantColorFromImage(firstImage);
  if (!dom) return clone;

  // Validate/adjust for contrast against background
  const adjusted = adjustForContrast(dom, bg, minContrastBg);

  // Ensure final check meets threshold, else fallback
  if (contrastRatio(adjusted, bg) >= minContrastBg) {
    colors.accent = normalizeHex(adjusted);
  } else {
    colors.accent = normalizeHex(originalAccent);
  }

  clone.colors = colors;
  return clone;
}

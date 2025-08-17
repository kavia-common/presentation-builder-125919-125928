//
//
// Template renderers for slides using pptxgenjs.
//
// Each renderer receives:
//  - pptx: the PptxGenJS instance (not always needed)
//  - slide: the created slide to draw on
//  - data: normalized content for the template
//  - theme: design tokens from themes.js
//
// PUBLIC_INTERFACE helpers and registry are exported.
//
import { slideOptionsForTheme, titleTextStyle, bodyTextStyle, captionTextStyle, cardShapeOptions, primaryColor, accentColor } from "./themes";

// Layout constants
const SLIDE_WIDTH = 10;  // standard widescreen: 10" x 5.625"
const SLIDE_HEIGHT = 5.625;

/* ---------------- Bullet helpers (native PPT bullets, sub-levels supported) ---------------- */

/**
 * Normalize arbitrary bullets input into a uniform nested structure.
 * Accepts:
 *  - string -> { text }
 *  - { text, children?, level? }
 *  - array (possibly nested arrays)
 */
function normalizeBulletsInput(bullets) {
  if (!bullets) return [];
  const arr = Array.isArray(bullets) ? bullets : [bullets];

  const toNode = (item) => {
    if (typeof item === "string") {
      return { text: (item || "").toString(), children: [] };
    }
    if (Array.isArray(item)) {
      // Nested array: first item is text, rest are children or nested arrays
      if (item.length === 0) return null;
      const [head, ...rest] = item;
      const node = toNode(head);
      if (!node) return null;
      node.children = rest.map(toNode).filter(Boolean);
      return node;
    }
    if (item && typeof item === "object") {
      const text = (item.text ?? "").toString();
      const children = Array.isArray(item.children) ? item.children.map(toNode).filter(Boolean) : [];
      return { text, children };
    }
    return null;
  };

  return arr.map(toNode).filter(Boolean);
}

/**
 * Generate pptxgenjs paragraph chunks supporting nested bullet levels.
 * Returns an array of paragraph pieces acceptable by slide.addText([...], options)
 * Each piece has its own bullet, indentLevel/indent and fontSize derived from theme and level.
 */
function paragraphsFromBullets(bullets, theme, baseLevel = 0) {
  const pieces = [];
  const nodes = normalizeBulletsInput(bullets);

  const baseBody = bodyTextStyle(theme);
  const baseFontSize = Math.max(12, baseBody.fontSize || 18);
  const baseIndent = (theme?.bullets?.indentLevel != null ? theme.bullets.indentLevel : 0.5) || 0.5;

  const bulletColor = (lvl) => {
    // Allow per-level override if present in theme; else use default
    return (theme?.bullets?.colors && theme.bullets.colors[lvl]) || theme?.bullets?.bulletColor || theme?.typography?.body?.color || "000000";
  };

  const bulletSizeFor = (lvl) => {
    // Scale down on deeper levels for hierarchy
    const base = (typeof theme?.bullets?.bulletSize === "number" ? theme.bullets.bulletSize : baseBody.fontSize || 18);
    return Math.max(10, Math.round(base - (lvl * 2)));
  };

  const fontSizeFor = (lvl) => {
    return Math.max(12, Math.round(baseFontSize - (lvl * 2)));
  };

  const walk = (list, level) => {
    for (const node of list) {
      if (!node || !node.text) continue;
      const lvl = Math.max(0, level);
      const indentInches = Math.max(0, baseIndent * lvl);
      pieces.push({
        text: node.text,
        options: {
          bullet: true,
          bulletColor: bulletColor(lvl),
          bulletSize: bulletSizeFor(lvl),
          // Provide both indent and indentLevel for broader pptxgenjs compatibility
          indentLevel: indentInches,
          indent: indentInches,
          fontSize: fontSizeFor(lvl),
          color: bulletColor(lvl),
        },
      });
      if (node.children && node.children.length) {
        walk(node.children, lvl + 1);
      }
    }
  };

  walk(nodes, baseLevel);
  return pieces;
}

/**
 * Legacy single-level bullets helper (still used in some paths).
 * Turns an array of bullet strings into multi-paragraph text for pptxgenjs.
 * pptxgenjs will bullet each paragraph when options.bullet === true.
 */
function bulletListText(bullets = []) {
  return (Array.isArray(bullets) ? bullets : [])
    .map(b => String(b ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Build bullet options from theme tokens for top-level .addText call.
 * Also sets "indent" mirror for broader compatibility across pptxgenjs versions.
 * Note: sub-level overrides are applied per-paragraph in paragraphsFromBullets().
 */
function bulletListOptions(theme) {
  const b = theme?.bullets || {};
  const color = b.bulletColor || theme?.typography?.body?.color || "000000";
  const size = typeof b.bulletSize === "number" ? b.bulletSize : undefined;
  const indentIn = typeof b.indentLevel === "number" ? b.indentLevel : 0.5;

  const opts = {
    bullet: true,
    bulletColor: color
  };
  if (size) opts.bulletSize = size;
  if (indentIn !== undefined && indentIn !== null) {
    // Some pptxgenjs versions use indent, others support indentLevel for list level vs. paragraph indent.
    // Provide both for best compatibility; non-recognized props are ignored by the lib.
    opts.indentLevel = indentIn;
    opts.indent = indentIn;
  }
  return opts;
}

/**
 * Render nested bullets: builds per-paragraph definitions and uses theme tokens for levels.
 * Also sets top-level bullet options so existing tests that inspect options.bullet still pass.
 */
function renderBulletedText(slide, { x, y, w, h }, bullets, theme, extraStyle = {}) {
  const paras = paragraphsFromBullets(bullets, theme, 0);
  const base = { x, y, w, h };
  slide.addText(
    paras.length ? paras : bulletListText(bullets),
    {
      ...extraStyle,
      ...bulletListOptions(theme),
      // Base body style applied as default; per-paragraph overrides fontSize/color as needed
      ...bodyTextStyle(theme),
      ...base
    }
  );
}

/* ---------------- Spacing and decorations ---------------- */

function getSpacing(theme) {
  return {
    mx: theme?.spacing?.pageMarginX ?? 0.5,
    my: theme?.spacing?.pageMarginY ?? 0.5,
    gutter: theme?.spacing?.gutter ?? 0.25,
  };
}

/**
 * Draw a subtle alternating backdrop overlay (instead of changing slide options),
 * so tests expecting static background tokens still pass.
 * Will apply a soft background on odd-indexed slides to create visual rhythm.
 */
function maybeRenderAlternatingBackdrop(slide, theme, data) {
  const idx = data?._slideIndex;
  const bgSoft = theme?.colors?.backgroundSoft || null;
  if (typeof idx === "number" && idx % 2 === 1 && bgSoft) {
    // Full-bleed soft background rectangle drawn first (under other elements)
    slide.addShape("rect", {
      x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT,
      fill: { color: bgSoft },
      line: { color: bgSoft, width: 0 }
    });
  }
}

/**
 * Draw an angled stripe for a bold/modern divider effect.
 * Uses a rotated rectangle to simulate a diagonal overlay.
 */
function drawAngledStripe(slide, theme, {
  color = accentColor(theme),
  angle = -8,
  thickness = 0.8,
  align = "top", // "top" | "bottom"
} = {}) {
  // Make rectangle wider than slide width to cover corners when rotated
  const w = SLIDE_WIDTH * 1.4;
  const x = -(w - SLIDE_WIDTH) / 2;
  const y = align === "top" ? -0.2 : SLIDE_HEIGHT - thickness + 0.2;

  slide.addShape("rect", {
    x, y, w, h: thickness,
    fill: { color },
    line: { color, width: 0 },
    rotate: angle,
  });
}

// PUBLIC_INTERFACE
export function normalizeTemplateKey(key) {
  /**
   * Normalize various template labels/hints to registry keys.
   * Examples:
   *  - "title-bullets" -> "TITLE_BULLETS"
   *  - "image-right"   -> "IMAGE_RIGHT"
   */
  const raw = String(key || "").trim().toLowerCase();
  const map = {
    "title": "TITLE",
    "title-only": "TITLE",
    "title_bullets": "TITLE_BULLETS",
    "title-bullets": "TITLE_BULLETS",
    "bullets": "BULLETS",
    "image": "IMAGE_CARD",
    "image-card": "IMAGE_CARD",
    "image_left": "IMAGE_LEFT",
    "image-left": "IMAGE_LEFT",
    "image_right": "IMAGE_RIGHT",
    "image-right": "IMAGE_RIGHT",
    "two-column": "TWO_COLUMN",
    "two_column": "TWO_COLUMN",
    "flowchart": "FLOWCHART",
    "quote": "QUOTE",
    "comparison": "COMPARISON",
    "section-divider": "SECTION_DIVIDER",
    "section_divider": "SECTION_DIVIDER",
    "chart": "CHART",
    // tables
    "table": "TABLE",
    // New creative/divider and split/asym layouts
    "section-divider-angled": "SECTION_DIVIDER_ANGLED",
    "section_divider_angled": "SECTION_DIVIDER_ANGLED",
    "divider-angled": "SECTION_DIVIDER_ANGLED",
    "divider-stripe": "SECTION_DIVIDER_ANGLED",
    "split-section": "SPLIT_SECTION",
    "split": "SPLIT_SECTION",
    "split-image-left": "SPLIT_IMAGE_LEFT",
    "split_image_left": "SPLIT_IMAGE_LEFT",
    "split-image-right": "SPLIT_IMAGE_RIGHT",
    "split_image_right": "SPLIT_IMAGE_RIGHT",
    "asym-1-2": "ASYM_1_2",
    "asym_1_2": "ASYM_1_2",
    "asym-2-1": "ASYM_2_1",
    "asym_2_1": "ASYM_2_1",
  };
  return map[raw] || raw.toUpperCase() || "BULLETS";
}

// PUBLIC_INTERFACE
export function chooseTemplateRenderer(templateKey) {
  /**
   * Returns a renderer function for the requested templateKey.
   * Falls back to TITLE_BULLETS or BULLETS if unknown.
   */
  const key = normalizeTemplateKey(templateKey);
  return TEMPLATES[key] || TEMPLATES.TITLE_BULLETS || TEMPLATES.BULLETS;
}

// PUBLIC_INTERFACE
export function renderSlide(pptx, slide, templateKey, data, theme) {
  /** Dispatch rendering to the proper template function. */
  const normalized = normalizeTemplateKey(templateKey);
  console.log('[ThemeTrace] [templates.renderSlide] dispatch', { requested: templateKey, normalized, themeName: theme?.name, colors: theme?.colors });

  // Apply alternating backdrop before content for a modern rhythm without changing slide options
  try {
    maybeRenderAlternatingBackdrop(slide, theme, data || {});
  } catch { /* ignore overlay errors */ }

  const renderer = chooseTemplateRenderer(normalized);
  return renderer(pptx, slide, data, theme);
}

/* ------------------ Template Implementations ------------------ */

// TITLE: Centered title (and optional subtitle)
function renderTitle(_pptx, slide, data, theme) {
  const title = data?.title || "Untitled";
  const subtitle = data?.subtitle || "";
  const { mx, my } = getSpacing(theme);

  const titleStyle = { ...titleTextStyle(theme), align: "center" };
  slide.addText(title, {
    x: mx, y: 2.0, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 1, ...titleStyle
  });

  // Accent divider under the title for visual emphasis
  slide.addShape("line", {
    x: mx + 1.0, y: 2.9, w: Math.max(0.5, SLIDE_WIDTH - 2 * (mx + 1.0)), h: 0,
    line: { color: accentColor(theme), width: 3 }
  });

  if (subtitle) {
    const subStyle = { ...captionTextStyle(theme), align: "center" };
    slide.addText(subtitle, {
      x: mx, y: 3.1, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...subStyle
    });
  }
}

// TITLE_BULLETS: Title top, bullets below
function renderTitleBullets(_pptx, slide, data, theme) {
  const title = data?.title || "Untitled";
  const bullets = data?.bullets || [];
  const { mx, my } = getSpacing(theme);

  // Title
  slide.addText(title, {
    x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7,
    ...titleTextStyle(theme)
  });

  // Accent divider
  slide.addShape("line", {
    x: mx, y: my + 0.65, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0, line: { color: accentColor(theme), width: 2 }
  });

  if ((Array.isArray(bullets) ? bullets.length : !!bullets)) {
    const y = my + 0.8;
    renderBulletedText(
      slide,
      { x: mx + 0.2, y, w: Math.max(1, SLIDE_WIDTH - 2 * mx - 0.4), h: Math.max(0.5, SLIDE_HEIGHT - y - my) },
      bullets,
      theme
    );
  }
}

// BULLETS only (no distinct title header)
function renderBullets(_pptx, slide, data, theme) {
  const title = data?.title || "";
  const bullets = data?.bullets || [];
  const { mx, my } = getSpacing(theme);
  let y = my;

  if (title) {
    slide.addText(title, { x: mx, y, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...titleTextStyle(theme) });
    y += 0.8;
  }

  renderBulletedText(
    slide,
    { x: mx + 0.2, y, w: Math.max(1, SLIDE_WIDTH - 2 * mx - 0.4), h: Math.max(0.5, SLIDE_HEIGHT - y - my) },
    bullets,
    theme
  );
}

// IMAGE_CARD: Large image centered with caption; optional title on top
function renderImageCard(_pptx, slide, data, theme) {
  const title = data?.title || "";
  const image = data?.image; // primary data URL
  const images = Array.isArray(data?.images) ? data.images.filter(Boolean) : (image ? [image] : []);
  const caption = data?.caption || "";
  const { mx, my, gutter } = getSpacing(theme);

  let y = my;
  if (title) {
    slide.addText(title, { x: mx, y, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.6, ...titleTextStyle(theme) });
    y += 0.7;
  }

  if (images.length >= 2) {
    // Mosaic layout: two images side-by-side centered
    const totalW = Math.max(2, SLIDE_WIDTH - 2 * mx);
    const itemW = (totalW - gutter) / 2;
    const itemH = 4.0;
    const startX = mx;

    slide.addImage({
      data: images[0],
      x: startX, y, w: itemW, h: itemH,
      sizing: { type: "contain", w: itemW, h: itemH }
    });
    slide.addImage({
      data: images[1],
      x: startX + itemW + gutter, y, w: itemW, h: itemH,
      sizing: { type: "contain", w: itemW, h: itemH }
    });
    y += itemH + 0.2;
  } else if (images.length === 1) {
    const w = Math.max(2, SLIDE_WIDTH - 2 * mx);
    const h = 4.0;
    slide.addImage({
      data: images[0],
      x: mx, y, w, h,
      sizing: { type: "contain", w, h }
    });
    y += h + 0.2;
  }

  if (caption) {
    slide.addText(caption, { x: mx, y, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.6, ...captionTextStyle(theme), align: "center" });
  }
}

// IMAGE_LEFT / IMAGE_RIGHT: image one side, bullets on the other
function renderImageSide(_pptx, slide, data, theme, side = "right") {
  const title = data?.title || "";
  const bullets = data?.bullets || [];
  const image = data?.image; // data URL
  const { mx, my, gutter } = getSpacing(theme);

  // Title
  slide.addText(title, { x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...titleTextStyle(theme) });

  // Accent divider
  slide.addShape("line", {
    x: mx, y: my + 0.65, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0, line: { color: (theme?.colors?.accent || "FFC107"), width: 2 }
  });

  // Content area below title
  const contentY = my + 0.8;
  const contentH = Math.max(1, SLIDE_HEIGHT - contentY - my);

  // Allocate widths
  const contentW = Math.max(2, SLIDE_WIDTH - 2 * mx);
  const imageW = 3.2;
  const textW = Math.max(1, contentW - imageW - gutter);

  const imageBox = {
    x: side === "left" ? mx : mx + textW + gutter,
    y: contentY,
    w: imageW,
    h: Math.min(4.0, contentH)
  };
  const textBox = {
    x: side === "left" ? mx + imageW + gutter : mx,
    y: contentY,
    w: textW,
    h: Math.min(4.2, contentH)
  };

  if (image) {
    slide.addImage({ data: image, ...imageBox, sizing: { type: "contain", w: imageBox.w, h: imageBox.h } });
  }

  if ((Array.isArray(bullets) ? bullets.length : !!bullets)) {
    renderBulletedText(slide, textBox, bullets, theme);
  }
}

// TWO_COLUMN: two bullets columns (or text blocks)
function renderTwoColumn(_pptx, slide, data, theme) {
  const title = data?.title || "";
  const col1 = data?.col1 || data?.bullets || [];
  const col2 = data?.col2 || [];
  const { mx, my, gutter } = getSpacing(theme);

  slide.addText(title, { x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...titleTextStyle(theme) });

  const contentY = my + 0.8;
  const contentH = Math.max(1, SLIDE_HEIGHT - contentY - my);
  const colW = (Math.max(2, SLIDE_WIDTH - 2 * mx) - gutter) / 2;

  renderBulletedText(
    slide,
    { x: mx + 0.2, y: contentY, w: Math.max(1, colW - 0.2), h: Math.min(4.0, contentH) },
    col1,
    theme
  );

  renderBulletedText(
    slide,
    { x: mx + colW + gutter, y: contentY, w: Math.max(1, colW - 0.2), h: Math.min(4.0, contentH) },
    col2,
    theme
  );
}

/**
 * FLOWCHART: advanced auto-layout with robust connectors.
 * - If <= 5 nodes: vertical centered flow
 * - If 6–8 nodes: 2-column simple grid with serpentine connectors
 * Boxes use theme card shape with stroke/shadow; arrows use theme primary color.
 */
function renderFlowchart(_pptx, slide, data, theme) {
  const title = data?.title || "";
  const stepsRaw = Array.isArray(data?.flow?.steps) ? data.flow.steps : (Array.isArray(data?.bullets) ? data.bullets : []);
  const steps = (stepsRaw || []).map((s) => String(s || "").replace(/\s+/g, " ").trim()).filter(Boolean);

  // Title
  const { mx, my, gutter } = getSpacing(theme);
  slide.addText(title, { x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...titleTextStyle(theme) });

  // Helper tokens
  const spacing = {
    mx,
    my,
    gutter,
  };
  const arrowColor = primaryColor(theme);
  const arrowLine = { color: arrowColor, width: 2, endArrow: "triangle" }; // use end arrow on final segment
  const arrowLineNoHead = { color: arrowColor, width: 2 };

  // Helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const trunc = (s, n = 120) => (String(s || "").length > n ? String(s || "").slice(0, n - 1) + "…" : String(s || ""));

  function boxTextStyle(theme) {
    const st = { ...bodyTextStyle(theme) };
    // Tweak for better center fit in nodes
    return { ...st, align: "center", valign: "middle" };
  }

  function addBox(slide, { x, y, w, h, text }) {
    // Card with theme-driven fill/line/shadow
    slide.addShape(theme.cards?.shape || "roundRect", {
      x, y, w, h,
      ...cardShapeOptions(theme),
    });
    slide.addText(trunc(text), {
      x: x + 0.15, y: y + 0.1, w: Math.max(0.1, w - 0.3), h: Math.max(0.1, h - 0.2),
      ...boxTextStyle(theme),
    });
  }

  function lineH(slide, { x, y, w, line }) {
    slide.addShape("line", { x, y, w, h: 0, line });
  }
  function lineV(slide, { x, y, h, line }) {
    slide.addShape("line", { x, y, w: 0, h, line });
  }
  function connectVertical(slide, a, b) {
    // From bottom center of A to top center of B
    const startX = a.x + a.w / 2;
    const startY = a.y + a.h;
    const endY = b.y;
    const h = Math.max(0.05, endY - startY);
    lineV(slide, { x: startX, y: startY, h, line: arrowLine });
  }
  function connectHorizontal(slide, a, b) {
    // From center-right of A to center-left of B
    const startX = a.x + a.w;
    const y = a.y + a.h / 2;
    const w = Math.max(0.05, b.x - startX);
    lineH(slide, { x: startX, y, w, line: arrowLine });
  }
  function connectSerpentine(slide, a, b) {
    // Multi-segment: down, horizontal, up/down depending on relative positions
    // We'll create 2-3 segments and put arrowhead on the last one.
    const midY = (a.y + a.h + b.y) / 2;

    // Segment 1: vertical from bottom of A to mid
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h;
    const v1 = Math.max(0.05, midY - y1);
    lineV(slide, { x: x1, y: y1, h: v1, line: arrowLineNoHead });

    // Segment 2: horizontal from A center to B center (at midY)
    const x2 = b.x + b.w / 2;
    const w2 = x2 - x1;
    lineH(slide, { x: x1, y: midY, w: w2, line: arrowLineNoHead });

    // Segment 3: vertical from midY to top of B (arrow here)
    const v3 = Math.max(0.05, b.y - midY);
    lineV(slide, { x: x2, y: midY, h: v3, line: arrowLine });
  }

  // Layout selection
  const n = steps.length;

  if (n === 0) {
    slide.addText("No steps provided.", { x: mx + 0.7, y: my + 1.3, w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.7)), h: 0.6, ...captionTextStyle(theme) });
    return;
  }

  if (n <= 5) {
    // Vertical centered layout
    const topY = my + 0.7; // below title
    const bottomPad = my + 0.3;
    const availableH = Math.max(1.5, SLIDE_HEIGHT - topY - bottomPad);

    const vGap = clamp(availableH / (n * 4), 0.15, 0.35);
    const boxH = clamp((availableH - vGap * (n - 1)) / n, 0.55, 1.0);
    const contentW = SLIDE_WIDTH - 2 * mx - 0.8;
    const boxW = clamp(contentW, 6.8, 8.4);
    const x = (SLIDE_WIDTH - boxW) / 2;

    const nodes = [];
    for (let i = 0; i < n; i += 1) {
      const y = topY + i * (boxH + vGap);
      const node = { x, y, w: boxW, h: boxH };
      nodes.push(node);
      addBox(slide, { ...node, text: steps[i] });
      if (i < n - 1) connectVertical(slide, node, { x, y: y + boxH + vGap, w: boxW, h: boxH }); // use target's top y
    }
  } else {
    // 2-column grid with serpentine connectors (good for 6–8 steps)
    const cols = 2;
    const rows = Math.ceil(n / cols);

    const topY = my + 0.7;
    const bottomPad = my + 0.3;
    const availableH = Math.max(2.0, SLIDE_HEIGHT - topY - bottomPad);

    const vGap = Math.max(0.15, Math.min(availableH / (rows * 5), 0.3));
    const boxH = Math.max(0.5, Math.min((availableH - vGap * (rows - 1)) / rows, 1.1));

    const contentX = mx + 0.4;
    const contentW = SLIDE_WIDTH - 2 * mx - 0.8;
    const colW = (contentW - spacing.gutter) / cols;
    const boxW = Math.max(3.0, Math.min(colW, 4.6));

    const xLeft = contentX + (colW - boxW) / 2;
    const xRight = contentX + colW + spacing.gutter + (colW - boxW) / 2;

    const nodes = [];
    for (let r = 0; r < rows; r += 1) {
      const y = topY + r * (boxH + vGap);
      for (let c = 0; c < cols; c += 1) {
        const i = r * cols + c;
        if (i >= n) break;
        const x = c === 0 ? xLeft : xRight;
        const node = { x, y, w: boxW, h: boxH, row: r, col: c, idx: i };
        nodes.push(node);
        addBox(slide, { ...node, text: steps[i] });
      }
    }

    // Connectors in reading order with serpentine path between rows
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const a = nodes[i];
      const b = nodes[i + 1];
      if (a.row === b.row) {
        // Same row -> horizontal
        connectHorizontal(slide, a, b);
      } else {
        // Row change -> serpentine (multi-segment)
        connectSerpentine(slide, a, b);
      }
    }
  }
}

// QUOTE: centered quote with attribution
function renderQuote(_pptx, slide, data, theme) {
  const quote = data?.quote || (Array.isArray(data?.bullets) ? data.bullets.join(" ") : data?.title || "");
  const attribution = data?.attribution || "";
  const { mx } = getSpacing(theme);

  slide.addText(`“${quote}”`, {
    x: mx + 0.5, y: 1.8, w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.5)), h: 1.6,
    ...bodyTextStyle(theme),
    fontSize: Math.max(18, (theme.typography?.h2?.fontSize || 22)),
    italic: true,
    align: "center"
  });

  if (attribution) {
    slide.addText(`— ${attribution}`, {
      x: mx + 0.5, y: 3.2, w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.5)), h: 0.6,
      ...captionTextStyle(theme),
      align: "center"
    });
  }
}

// COMPARISON: left vs right columns with titles and bullets
function renderComparison(_pptx, slide, data, theme) {
  const title = data?.title || "Comparison";
  const left = data?.left || { title: "Option A", bullets: [] };
  const right = data?.right || { title: "Option B", bullets: [] };
  const { mx, my, gutter } = getSpacing(theme);

  slide.addText(title, { x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...titleTextStyle(theme) });

  // Left card
  slide.addShape(theme.cards?.shape || "roundRect", {
    x: mx, y: my + 0.8, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2), h: 3.8, ...cardShapeOptions(theme)
  });
  slide.addText(left.title || "Left", {
    x: mx + 0.2, y: my + 0.9, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2 - 0.4), h: 0.5, ...bodyTextStyle(theme), bold: true
  });
  renderBulletedText(
    slide,
    { x: mx + 0.2, y: my + 1.5, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2 - 0.4), h: 2.9 },
    left.bullets || [],
    theme
  );

  // Right card
  const rightX = mx + ((SLIDE_WIDTH - 2 * mx - gutter) / 2) + gutter;
  slide.addShape(theme.cards?.shape || "roundRect", {
    x: rightX, y: my + 0.8, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2), h: 3.8, ...cardShapeOptions(theme)
  });
  slide.addText(right.title || "Right", {
    x: rightX + 0.2, y: my + 0.9, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2 - 0.4), h: 0.5, ...bodyTextStyle(theme), bold: true
  });
  renderBulletedText(
    slide,
    { x: rightX + 0.2, y: my + 1.5, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2 - 0.4), h: 2.9 },
    right.bullets || [],
    theme
  );
}

// SECTION_DIVIDER: big centered section title and optional subtitle
function renderSectionDivider(_pptx, slide, data, theme) {
  const title = data?.title || "Section";
  const subtitle = data?.subtitle || "";
  const { mx } = getSpacing(theme);

  slide.addText(title, {
    x: mx, y: 2.0, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 1.0,
    ...titleTextStyle(theme),
    align: "center",
    color: accentColor(theme)
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: mx, y: 3.1, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.6,
      ...captionTextStyle(theme),
      align: "center"
    });
  }
}

// SECTION_DIVIDER_ANGLED: bold diagonal stripe with title
function renderSectionDividerAngled(_pptx, slide, data, theme) {
  const title = data?.title || "Section";
  const subtitle = data?.subtitle || "";
  const { mx } = getSpacing(theme);

  // Draw an angled accent stripe across the top for dramatic effect
  drawAngledStripe(slide, theme, { color: accentColor(theme), angle: -10, thickness: 0.8, align: "top" });

  // Title left-centered
  slide.addText(title, {
    x: mx, y: 1.8, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 1.0,
    ...titleTextStyle(theme),
    color: theme?.colors?.text,
    align: "center"
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: mx, y: 2.9, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.6,
      ...captionTextStyle(theme),
      align: "center"
    });
  }
}

// CHART: if image provided, display; else fall back to bullets or placeholder
function renderChart(_pptx, slide, data, theme) {
  const title = data?.title || "Chart";
  const image = data?.image;
  const bullets = data?.bullets || [];
  const { mx, my } = getSpacing(theme);

  slide.addText(title, {
    x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...titleTextStyle(theme)
  });

  if (image) {
    slide.addImage({
      data: image,
      x: mx + 0.3, y: my + 0.7, w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.3)), h: 3.8,
      sizing: { type: "contain", w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.3)), h: 3.8 }
    });
  } else if ((Array.isArray(bullets) ? bullets.length : !!bullets)) {
    renderBulletedText(
      slide,
      { x: mx + 0.2, y: my + 0.8, w: Math.max(1, SLIDE_WIDTH - 2 * mx - 0.4), h: 3.8 },
      bullets,
      theme
    );
  } else {
    slide.addShape(theme.cards?.shape || "roundRect", {
      x: mx + 0.3, y: my + 0.7, w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.3)), h: 3.8, ...cardShapeOptions(theme)
    });
    slide.addText("Chart Placeholder", {
      x: mx + 0.3, y: my + 2.3, w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.3)), h: 0.6, ...captionTextStyle(theme), align: "center"
    });
  }
}

/* ---------------- TABLE template (native pptxgenjs) ---------------- */

function normalizeTableData(table) {
  // Accepts either:
  // - { headers?: string[], rows: string[][] }
  // - string[][] (first row maybe header)
  if (!table) return { rows: [] };
  if (Array.isArray(table)) {
    // assume array of rows
    return { rows: table };
  }
  const headers = Array.isArray(table.headers) ? table.headers : null;
  const rows = Array.isArray(table.rows) ? table.rows : [];
  if (headers && rows.length) {
    return { rows: [headers, ...rows] };
  }
  if (headers && (!rows.length)) return { rows: [headers] };
  return { rows };
}

function renderTable(_pptx, slide, data, theme) {
  const title = data?.title || "Table";
  const tableInput = data?.table;
  const { rows } = normalizeTableData(tableInput);
  const { mx, my } = getSpacing(theme);

  // Title
  slide.addText(title, {
    x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7,
    ...titleTextStyle(theme)
  });

  const contentY = my + 0.8;
  const tableW = Math.max(2, SLIDE_WIDTH - 2 * mx);

  // Derive simple header/body styles
  const headerFill = { color: theme?.colors?.accent || "FFC107" };
  const headerColor = theme?.colors?.white || "FFFFFF";
  const bodyFill = { color: theme?.colors?.white || "FFFFFF" };
  const borderColor = theme?.colors?.border || "E5E7EB";

  const tableRows = rows.map((r, rIdx) =>
    (Array.isArray(r) ? r : [String(r ?? "")]).map((cell) => {
      const cellText = (cell == null) ? "" : String(cell);
      if (rIdx === 0) {
        return { text: cellText, options: { bold: true, fill: headerFill, color: headerColor } };
      }
      return { text: cellText, options: { fill: bodyFill } };
    })
  );

  try {
    slide.addTable(tableRows, {
      x: mx,
      y: contentY,
      w: tableW,
      border: { pt: 1, color: borderColor },
      valign: "middle",
      fontSize: Math.max(12, (theme?.typography?.body?.fontSize || 16)),
      color: theme?.typography?.body?.color || theme?.colors?.text || "000000",
    });
  } catch (e) {
    // fallback: if addTable not supported in this env/mocked lib, show notice
    slide.addText("Table rendering not supported in this environment.", {
      x: mx, y: contentY + 0.5, w: tableW, h: 0.6, ...captionTextStyle(theme), align: "center", italic: true
    });
  }
}

/* --------- New modern/asymmetric and split-section templates --------- */

/**
 * Split-section layout: left and right panels with a narrow angled divider accent.
 * Supports content+image or double content based on provided data.
 */
function renderSplitSection(_pptx, slide, data, theme, { imageOn = "right" } = {}) {
  const title = data?.title || "";
  const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
  const image = data?.image;
  const { mx, my, gutter } = getSpacing(theme);

  // Title and subtle angled stripe below header
  if (title) {
    slide.addText(title, { x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...titleTextStyle(theme) });
    drawAngledStripe(slide, theme, { color: accentColor(theme), angle: -8, thickness: 0.35, align: "top" });
  }

  const contentY = title ? my + 0.8 : my;
  const contentH = Math.max(1, SLIDE_HEIGHT - contentY - my);
  const contentW = Math.max(2, SLIDE_WIDTH - 2 * mx);
  const leftW = (contentW - gutter) / 2;
  const rightW = (contentW - gutter) / 2;

  // Soft backgrounds per panel for structure
  const leftBg = theme?.colors?.backgroundSoft || null;
  const rightBg = theme?.colors?.background || null;
  if (leftBg) {
    slide.addShape("rect", { x: mx, y: contentY, w: leftW, h: contentH, fill: { color: leftBg }, line: { color: leftBg, width: 0 } });
  }
  if (rightBg && rightBg !== leftBg) {
    slide.addShape("rect", { x: mx + leftW + gutter, y: contentY, w: rightW, h: contentH, fill: { color: rightBg }, line: { color: rightBg, width: 0 } });
  }

  // Thin accent "divider" line between panels
  slide.addShape("line", {
    x: mx + leftW + gutter / 2, y: contentY, w: 0, h: contentH,
    line: { color: accentColor(theme), width: 2 }
  });

  const leftBox = { x: mx + 0.2, y: contentY + 0.2, w: Math.max(1, leftW - 0.4), h: Math.max(1, contentH - 0.4) };
  const rightBox = { x: mx + leftW + gutter + 0.2, y: contentY + 0.2, w: Math.max(1, rightW - 0.4), h: Math.max(1, contentH - 0.4) };

  // Content placement
  if (image && (imageOn === "left")) {
    slide.addImage({ data: image, ...leftBox, sizing: { type: "contain", w: leftBox.w, h: leftBox.h } });
    renderBulletedText(slide, rightBox, bullets, theme);
  } else if (image && (imageOn === "right")) {
    renderBulletedText(slide, leftBox, bullets, theme);
    slide.addImage({ data: image, ...rightBox, sizing: { type: "contain", w: rightBox.w, h: rightBox.h } });
  } else {
    // Double-content (fallback to col1/col2 if present)
    const c1 = Array.isArray(data?.col1) ? data.col1 : bullets;
    const c2 = Array.isArray(data?.col2) ? data.col2 : [];
    renderBulletedText(slide, leftBox, c1, theme);
    renderBulletedText(slide, rightBox, c2, theme);
  }
}

function renderSplitImageLeft(pptx, slide, data, theme) {
  return renderSplitSection(pptx, slide, data, theme, { imageOn: "left" });
}
function renderSplitImageRight(pptx, slide, data, theme) {
  return renderSplitSection(pptx, slide, data, theme, { imageOn: "right" });
}

/**
 * Asymmetric grid: 1/3 + 2/3 layout with optional cards per column.
 * Uses col1 / col2 arrays if provided; otherwise falls back to bullets+image.
 */
function renderAsym(pptx, slide, data, theme, { bigOn = "right" } = {}) {
  const title = data?.title || "";
  const { mx, my, gutter } = getSpacing(theme);
  const bullets = Array.isArray(data?.bullets) ? data.bullets : [];
  const col1 = Array.isArray(data?.col1) ? data.col1 : bullets;
  const col2 = Array.isArray(data?.col2) ? data.col2 : [];
  const image = data?.image;

  if (title) {
    slide.addText(title, { x: mx, y: my, w: Math.max(1, SLIDE_WIDTH - 2 * mx), h: 0.7, ...titleTextStyle(theme) });
  }

  const contentY = title ? my + 0.8 : my;
  const contentH = Math.max(1, SLIDE_HEIGHT - contentY - my);
  const contentW = Math.max(2, SLIDE_WIDTH - 2 * mx);

  const smallW = (contentW - gutter) * 0.33;
  const bigW = (contentW - gutter) * 0.67;

  const leftW = bigOn === "left" ? bigW : smallW;
  const rightW = bigOn === "left" ? smallW : bigW;

  const leftX = mx;
  const rightX = mx + leftW + gutter;

  // Card background containers for structure
  slide.addShape(theme.cards?.shape || "roundRect", { x: leftX, y: contentY, w: leftW, h: contentH, ...cardShapeOptions(theme) });
  slide.addShape(theme.cards?.shape || "roundRect", { x: rightX, y: contentY, w: rightW, h: contentH, ...cardShapeOptions(theme) });

  // Content placement: prefer double-content; else mix bullets+image
  const leftBox = { x: leftX + 0.2, y: contentY + 0.2, w: Math.max(1, leftW - 0.4), h: Math.max(1, contentH - 0.4) };
  const rightBox = { x: rightX + 0.2, y: contentY + 0.2, w: Math.max(1, rightW - 0.4), h: Math.max(1, contentH - 0.4) };

  if (col2.length || col1.length) {
    // Use provided content columns
    const leftContent = col1; // col1 is conceptually left
    const rightContent = col2; // keep columns aligned with user intent
    if (leftContent.length) {
      renderBulletedText(slide, leftBox, leftContent, theme);
    }
    if (rightContent.length) {
      renderBulletedText(slide, rightBox, rightContent, theme);
    } else if (image) {
      slide.addImage({ data: image, ...rightBox, sizing: { type: "contain", w: rightBox.w, h: rightBox.h } });
    }
  } else if (image) {
    // Asym image+bullets
    if (bigOn === "left") {
      slide.addImage({ data: image, ...leftBox, sizing: { type: "contain", w: leftBox.w, h: leftBox.h } });
      renderBulletedText(slide, rightBox, bullets, theme);
    } else {
      renderBulletedText(slide, leftBox, bullets, theme);
      slide.addImage({ data: image, ...rightBox, sizing: { type: "contain", w: rightBox.w, h: rightBox.h } });
    }
  }
}

function renderAsym12(pptx, slide, data, theme) {
  // small left (1), big right (2/3)
  return renderAsym(pptx, slide, data, theme, { bigOn: "right" });
}
function renderAsym21(pptx, slide, data, theme) {
  // big left (2/3), small right (1/3)
  return renderAsym(pptx, slide, data, theme, { bigOn: "left" });
}

// IMAGE_LEFT and IMAGE_RIGHT wrappers
function renderImageLeft(pptx, slide, data, theme) { return renderImageSide(pptx, slide, data, theme, "left"); }
function renderImageRight(pptx, slide, data, theme) { return renderImageSide(pptx, slide, data, theme, "right"); }

// PUBLIC_INTERFACE
export const TEMPLATES = {
  TITLE: renderTitle,
  TITLE_BULLETS: renderTitleBullets,
  BULLETS: renderBullets,
  IMAGE_CARD: renderImageCard,
  IMAGE_LEFT: renderImageLeft,
  IMAGE_RIGHT: renderImageRight,
  TWO_COLUMN: renderTwoColumn,
  FLOWCHART: renderFlowchart,
  QUOTE: renderQuote,
  COMPARISON: renderComparison,
  SECTION_DIVIDER: renderSectionDivider,
  SECTION_DIVIDER_ANGLED: renderSectionDividerAngled,
  CHART: renderChart,
  TABLE: renderTable,
  // new modern layouts
  SPLIT_SECTION: renderSplitSection,
  SPLIT_IMAGE_LEFT: renderSplitImageLeft,
  SPLIT_IMAGE_RIGHT: renderSplitImageRight,
  ASYM_1_2: renderAsym12,
  ASYM_2_1: renderAsym21,
};

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

// Bullet helpers (native PPT bullets, no manual "•" prefix)
/**
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
 * Build bullet options from theme tokens.
 * Applies bulletColor, bulletSize, and indentLevel via native PPT list formatting.
 * Also sets "indent" mirror for broader compatibility across pptxgenjs versions.
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
 * Compute spacing tokens with safe defaults.
 * Used to parameterize x/y offsets and widths across templates to respect theme spacing.
 */
function getSpacing(theme) {
  return {
    mx: theme?.spacing?.pageMarginX ?? 0.5,
    my: theme?.spacing?.pageMarginY ?? 0.5,
    gutter: theme?.spacing?.gutter ?? 0.25,
  };
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
    "chart": "CHART"
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

  if (bullets.length) {
    const y = my + 0.8;
    slide.addText(bulletListText(bullets), {
      x: mx + 0.2, y, w: Math.max(1, SLIDE_WIDTH - 2 * mx - 0.4), h: Math.max(0.5, SLIDE_HEIGHT - y - my),
      ...bodyTextStyle(theme),
      ...bulletListOptions(theme)
    });
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

  slide.addText(bulletListText(bullets), {
    x: mx + 0.2, y, w: Math.max(1, SLIDE_WIDTH - 2 * mx - 0.4), h: Math.max(0.5, SLIDE_HEIGHT - y - my),
    ...bodyTextStyle(theme),
    ...bulletListOptions(theme)
  });
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

  if (bullets.length) {
    slide.addText(bulletListText(bullets), {
      ...textBox,
      ...bodyTextStyle(theme),
      ...bulletListOptions(theme)
    });
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

  slide.addText(bulletListText(col1), {
    x: mx + 0.2, y: contentY, w: Math.max(1, colW - 0.2), h: Math.min(4.0, contentH),
    ...bodyTextStyle(theme),
    ...bulletListOptions(theme)
  });

  slide.addText(bulletListText(col2), {
    x: mx + colW + gutter, y: contentY, w: Math.max(1, colW - 0.2), h: Math.min(4.0, contentH),
    ...bodyTextStyle(theme),
    ...bulletListOptions(theme)
  });
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

    const vGap = clamp(availableH / (rows * 5), 0.15, 0.3);
    const boxH = clamp((availableH - vGap * (rows - 1)) / rows, 0.5, 1.1);

    const contentX = mx + 0.4;
    const contentW = SLIDE_WIDTH - 2 * mx - 0.8;
    const colW = (contentW - spacing.gutter) / cols;
    const boxW = clamp(colW, 3.0, 4.6);

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
  slide.addText(bulletListText(left.bullets || []), {
    x: mx + 0.2, y: my + 1.5, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2 - 0.4), h: 2.9,
    ...bodyTextStyle(theme),
    ...bulletListOptions(theme)
  });

  // Right card
  const rightX = mx + ((SLIDE_WIDTH - 2 * mx - gutter) / 2) + gutter;
  slide.addShape(theme.cards?.shape || "roundRect", {
    x: rightX, y: my + 0.8, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2), h: 3.8, ...cardShapeOptions(theme)
  });
  slide.addText(right.title || "Right", {
    x: rightX + 0.2, y: my + 0.9, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2 - 0.4), h: 0.5, ...bodyTextStyle(theme), bold: true
  });
  slide.addText(bulletListText(right.bullets || []), {
    x: rightX + 0.2, y: my + 1.5, w: Math.max(1, (SLIDE_WIDTH - 2 * mx - gutter) / 2 - 0.4), h: 2.9,
    ...bodyTextStyle(theme),
    ...bulletListOptions(theme)
  });
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
  } else if (bullets.length) {
    slide.addText(bulletListText(bullets), {
      x: mx + 0.2, y: my + 0.8, w: Math.max(1, SLIDE_WIDTH - 2 * mx - 0.4), h: 3.8,
      ...bodyTextStyle(theme),
      ...bulletListOptions(theme)
    });
  } else {
    slide.addShape(theme.cards?.shape || "roundRect", {
      x: mx + 0.3, y: my + 0.7, w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.3)), h: 3.8, ...cardShapeOptions(theme)
    });
    slide.addText("Chart Placeholder", {
      x: mx + 0.3, y: my + 2.3, w: Math.max(1, SLIDE_WIDTH - 2 * (mx + 0.3)), h: 0.6, ...captionTextStyle(theme), align: "center"
    });
  }
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
  CHART: renderChart
};

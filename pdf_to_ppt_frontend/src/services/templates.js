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

import { slideOptionsForTheme, titleTextStyle, bodyTextStyle, captionTextStyle, cardShapeOptions, primaryColor } from "./themes";

// Layout constants
const SLIDE_WIDTH = 10;  // standard widescreen: 10" x 5.625"
const SLIDE_HEIGHT = 5.625;

// Utility to join bullets
function bulletsText(bullets = []) {
  return (Array.isArray(bullets) ? bullets : []).map(b => `• ${String(b)}`).join("\n");
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
  const renderer = chooseTemplateRenderer(templateKey);
  return renderer(pptx, slide, data, theme);
}

/* ------------------ Template Implementations ------------------ */

// TITLE: Centered title (and optional subtitle)
function renderTitle(_pptx, slide, data, theme) {
  const title = data?.title || "Untitled";
  const subtitle = data?.subtitle || "";

  const titleStyle = { ...titleTextStyle(theme), align: "center" };
  slide.addText(title, { x: 0.5, y: 2.0, w: 9, h: 1, ...titleStyle });

  if (subtitle) {
    const subStyle = { ...bodyTextStyle(theme), align: "center", color: theme.colors.muted };
    slide.addText(subtitle, { x: 0.5, y: 3.0, w: 9, h: 0.7, ...subStyle });
  }
}

// TITLE_BULLETS: Title top, bullets below
function renderTitleBullets(_pptx, slide, data, theme) {
  const title = data?.title || "Untitled";
  const bullets = data?.bullets || [];

  slide.addText(title, {
    x: 0.6,
    y: 0.4,
    w: 8.8,
    h: 0.7,
    ...titleTextStyle(theme)
  });

  if (bullets.length) {
    slide.addText(bulletsText(bullets), {
      x: 0.8, y: 1.2, w: 8.4, h: 4.0,
      ...bodyTextStyle(theme)
    });
  }
}

// BULLETS only (no distinct title header)
function renderBullets(_pptx, slide, data, theme) {
  const title = data?.title || "";
  const bullets = data?.bullets || [];
  let y = 0.6;

  if (title) {
    slide.addText(title, { x: 0.6, y, w: 8.8, h: 0.7, ...titleTextStyle(theme) });
    y += 0.8;
  }

  slide.addText(bulletsText(bullets), {
    x: 0.8, y, w: 8.2, h: 4.5, ...bodyTextStyle(theme)
  });
}

// IMAGE_CARD: Large image centered with caption; optional title on top
function renderImageCard(_pptx, slide, data, theme) {
  const title = data?.title || "";
  const image = data?.image; // data URL
  const caption = data?.caption || "";

  let y = 0.4;
  if (title) {
    slide.addText(title, { x: 0.6, y, w: 8.8, h: 0.6, ...titleTextStyle(theme) });
    y += 0.7;
  }

  if (image) {
    slide.addImage({
      data: image,
      x: 1.0, y, w: 8.0, h: 4.0,
      sizing: { type: "contain", w: 8.0, h: 4.0 }
    });
    y += 4.2;
  }

  if (caption) {
    slide.addText(caption, { x: 1.0, y, w: 8.0, h: 0.6, ...captionTextStyle(theme), align: "center" });
  }
}

// IMAGE_LEFT / IMAGE_RIGHT: image one side, bullets on the other
function renderImageSide(_pptx, slide, data, theme, side = "right") {
  const title = data?.title || "";
  const bullets = data?.bullets || [];
  const image = data?.image; // data URL

  const imageBox = { x: side === "left" ? 0.6 : 6.1, y: 1.2, w: 3.2, h: 4.0 };
  const textBox = { x: side === "left" ? 4.0 : 0.8, y: 1.2, w: 5.2, h: 4.2 };

  slide.addText(title, { x: 0.6, y: 0.4, w: 8.8, h: 0.7, ...titleTextStyle(theme) });

  if (image) {
    slide.addImage({ data: image, ...imageBox, sizing: { type: "contain", w: imageBox.w, h: imageBox.h } });
  }

  if (bullets.length) {
    slide.addText(bulletsText(bullets), { ...textBox, ...bodyTextStyle(theme) });
  }
}

// TWO_COLUMN: two bullets columns (or text blocks)
function renderTwoColumn(_pptx, slide, data, theme) {
  const title = data?.title || "";
  const col1 = data?.col1 || data?.bullets || [];
  const col2 = data?.col2 || [];

  slide.addText(title, { x: 0.6, y: 0.4, w: 8.8, h: 0.7, ...titleTextStyle(theme) });

  slide.addText(bulletsText(col1), {
    x: 0.8, y: 1.2, w: 4.2, h: 4.0, ...bodyTextStyle(theme)
  });

  slide.addText(bulletsText(col2), {
    x: 5.2, y: 1.2, w: 4.2, h: 4.0, ...bodyTextStyle(theme)
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
  slide.addText(title, { x: 0.6, y: 0.4, w: 8.8, h: 0.7, ...titleTextStyle(theme) });

  // Helper tokens
  const spacing = {
    mx: theme?.spacing?.pageMarginX ?? 0.5,
    my: theme?.spacing?.pageMarginY ?? 0.5,
    gutter: theme?.spacing?.gutter ?? 0.25,
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
    slide.addText("No steps provided.", { x: 1.2, y: 1.8, w: 7.6, h: 0.6, ...captionTextStyle(theme) });
    return;
  }

  if (n <= 5) {
    // Vertical centered layout
    const topY = 1.2; // below title
    const bottomPad = spacing.my + 0.3;
    const availableH = Math.max(1.5, SLIDE_HEIGHT - topY - bottomPad);

    const vGap = clamp(availableH / (n * 4), 0.15, 0.35);
    const boxH = clamp((availableH - vGap * (n - 1)) / n, 0.55, 1.0);
    const contentW = SLIDE_WIDTH - 2 * spacing.mx - 0.8;
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

    const topY = 1.2;
    const bottomPad = spacing.my + 0.3;
    const availableH = Math.max(2.0, SLIDE_HEIGHT - topY - bottomPad);

    const vGap = clamp(availableH / (rows * 5), 0.15, 0.3);
    const boxH = clamp((availableH - vGap * (rows - 1)) / rows, 0.5, 1.1);

    const contentX = spacing.mx + 0.4;
    const contentW = SLIDE_WIDTH - 2 * spacing.mx - 0.8;
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

  slide.addText(`“${quote}”`, {
    x: 1.0, y: 1.8, w: 8.0, h: 1.6,
    ...bodyTextStyle(theme),
    fontSize: Math.max(18, (theme.typography?.h2?.fontSize || 22)),
    italic: true,
    align: "center"
  });

  if (attribution) {
    slide.addText(`— ${attribution}`, {
      x: 1.0, y: 3.2, w: 8.0, h: 0.6,
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

  slide.addText(title, { x: 0.6, y: 0.4, w: 8.8, h: 0.7, ...titleTextStyle(theme) });

  // Left card
  slide.addShape(theme.cards?.shape || "roundRect", {
    x: 0.6, y: 1.2, w: 4.4, h: 3.8, ...cardShapeOptions(theme)
  });
  slide.addText(left.title || "Left", {
    x: 0.8, y: 1.3, w: 4.0, h: 0.5, ...bodyTextStyle(theme), bold: true
  });
  slide.addText(bulletsText(left.bullets || []), {
    x: 0.8, y: 1.9, w: 4.0, h: 2.9, ...bodyTextStyle(theme)
  });

  // Right card
  slide.addShape(theme.cards?.shape || "roundRect", {
    x: 5.0, y: 1.2, w: 4.4, h: 3.8, ...cardShapeOptions(theme)
  });
  slide.addText(right.title || "Right", {
    x: 5.2, y: 1.3, w: 4.0, h: 0.5, ...bodyTextStyle(theme), bold: true
  });
  slide.addText(bulletsText(right.bullets || []), {
    x: 5.2, y: 1.9, w: 4.0, h: 2.9, ...bodyTextStyle(theme)
  });
}

// SECTION_DIVIDER: big centered section title and optional subtitle
function renderSectionDivider(_pptx, slide, data, theme) {
  const title = data?.title || "Section";
  const subtitle = data?.subtitle || "";

  slide.addText(title, {
    x: 0.5, y: 2.0, w: 9.0, h: 1.0,
    ...titleTextStyle(theme),
    align: "center",
    color: primaryColor(theme)
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 3.1, w: 9.0, h: 0.6,
      ...bodyTextStyle(theme),
      align: "center",
      color: theme.colors.muted
    });
  }
}

// CHART: if image provided, display; else fall back to bullets or placeholder
function renderChart(_pptx, slide, data, theme) {
  const title = data?.title || "Chart";
  const image = data?.image;
  const bullets = data?.bullets || [];

  slide.addText(title, {
    x: 0.6, y: 0.4, w: 8.8, h: 0.7, ...titleTextStyle(theme)
  });

  if (image) {
    slide.addImage({
      data: image,
      x: 0.9, y: 1.1, w: 8.2, h: 3.8,
      sizing: { type: "contain", w: 8.2, h: 3.8 }
    });
  } else if (bullets.length) {
    slide.addText(bulletsText(bullets), {
      x: 0.8, y: 1.2, w: 8.4, h: 3.8, ...bodyTextStyle(theme)
    });
  } else {
    slide.addShape(theme.cards?.shape || "roundRect", {
      x: 0.9, y: 1.1, w: 8.2, h: 3.8, ...cardShapeOptions(theme)
    });
    slide.addText("Chart Placeholder", {
      x: 0.9, y: 2.7, w: 8.2, h: 0.6, ...captionTextStyle(theme), align: "center"
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

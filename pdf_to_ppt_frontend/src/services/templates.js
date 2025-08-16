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

// FLOWCHART: simple vertical flow from data.flow.steps (array of strings)
function renderFlowchart(_pptx, slide, data, theme) {
  const title = data?.title || "";
  const steps = Array.isArray(data?.flow?.steps) ? data.flow.steps : (Array.isArray(data?.bullets) ? data.bullets : []);

  slide.addText(title, { x: 0.6, y: 0.4, w: 8.8, h: 0.7, ...titleTextStyle(theme) });

  const count = Math.max(1, steps.length);
  const topY = 1.2;
  const availableH = 4.0;
  const boxH = Math.min(0.9, availableH / count - 0.1);
  const boxW = 7.6;
  const x = 1.2;
  const lineColor = primaryColor(theme);

  for (let i = 0; i < steps.length; i++) {
    const y = topY + i * (boxH + 0.2);
    // Card background (rounded)
    slide.addShape(theme.cards?.shape || "roundRect", {
      x, y, w: boxW, h: boxH,
      ...cardShapeOptions(theme)
    });
    slide.addText(steps[i], {
      x: x + 0.2, y: y + 0.1, w: boxW - 0.4, h: boxH - 0.2,
      ...bodyTextStyle(theme)
    });

    // Connector to next
    if (i < steps.length - 1) {
      slide.addShape("line", {
        x: x + boxW / 2, y: y + boxH, w: 0, h: 0.15,
        line: { color: lineColor, width: 1.5 }
      });
    }
  }

  if (steps.length === 0) {
    slide.addText("No steps provided.", { x: 1.2, y: 1.8, w: 7.6, h: 0.6, ...captionTextStyle(theme) });
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

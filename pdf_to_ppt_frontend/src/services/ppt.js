/**
 * PPT generation utilities using pptxgenjs, now with theme and template support.
 * Backward-compatible public interfaces:
 *  - generatePptx(slides, fileNameTitle)
 *  - generatePptxFromOutline(outline, imagesByPage, fileNameTitle)
 */

import PptxGenJS from "pptxgenjs";
import { getTheme, slideOptionsForTheme, titleTextStyle, deriveThemeWithAutoAccent } from "./themes";
import { renderSlide, normalizeTemplateKey } from "./templates";

/**
 * downloadBlob
 * Creates a temporary object URL and programmatically clicks an anchor to download the blob.
 * This is a robust fallback when pptx.writeFile may be blocked or unavailable in the environment.
 * @param {Blob} blob
 * @param {string} fileName
 */
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke the object URL to avoid memory leaks
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// PUBLIC_INTERFACE
/**
 * generatePptx
 * Creates a PPTX file with one slide per selected item and triggers a download.
 * Backward-compatible simple renderer (image-focused), now styled with default theme.
 * @param {Array<{ imageDataUrl: string, title?: string, caption?: string }>} slides
 * @param {string} fileNameTitle
 * @returns {Promise<void>}
 */
export async function generatePptx(slides, fileNameTitle = "Presentation", options = {}) {
  /**
   * @param {Array<{ imageDataUrl: string, title?: string, caption?: string }>} slides
   * @param {string} fileNameTitle
   * @param {{ themeName?: string }} options - optional theme selector; defaults to "azure"
   */
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error("No slides provided to generatePptx.");
  }

  const themeSelectionName = (options && options.themeName) ? String(options.themeName) : "azure";
  const baseTheme = getTheme(themeSelectionName);
  const candidateImages = (Array.isArray(slides) ? slides.map(s => s?.imageDataUrl).filter(Boolean) : []);
  const theme = await deriveThemeWithAutoAccent(baseTheme, candidateImages);
  const pptx = new PptxGenJS();

  // Title slide
  const titleSlide = pptx.addSlide(slideOptionsForTheme(theme));
  titleSlide.addText(fileNameTitle, {
    x: 0.5, y: 1.5, w: 9, h: 1,
    ...titleTextStyle(theme),
    align: "center",
    fontSize: Math.max(32, (theme.typography?.title?.fontSize || 32))
  });

  for (const s of slides) {
    const slide = pptx.addSlide(slideOptionsForTheme(theme));

    // Prefer the IMAGE_CARD template semantics
    const data = {
      title: s.title || "",
      image: s.imageDataUrl,
      caption: s.caption || ""
    };
    // Render using template engine
    renderSlide(pptx, slide, "IMAGE_CARD", data, theme);
  }

  const fileName = `${sanitize(fileNameTitle)}.pptx`;

  // Try built-in file save first, then fallback to Blob/manual download.
  try {
    await pptx.writeFile({ fileName });
  } catch (_err) {
    try {
      const blob = await pptx.write("blob");
      downloadBlob(blob, fileName);
    } catch (inner) {
      const details = inner?.message || inner?.toString?.() || "Unknown error";
      throw new Error(`Failed to generate or download PPTX: ${details}`);
    }
  }
}

// PUBLIC_INTERFACE
/**
 * generatePptxFromOutline
 * Creates a PPTX from a structured outline with titles, bullets, images and template/theme hints.
 * Supports the enhanced outline JSON including:
 *  - slide.template (e.g., "title-bullets", "image-right", "two-column", "flowchart")
 *  - outline.theme (e.g., "azure")
 *  - slide.imagePages (array of page numbers)
 *
 * @param {{theme?: string, title?: string, slides:Array<{template?: string, title:string, bullets?:string[], imagePages?:number[], notes?:string, subtitle?:string, flow?:{steps?:string[]}, left?:{title?:string, bullets?:string[]}, right?:{title?:string, bullets?:string[]}}>} outline
 * @param {Record<number, string>} imagesByPage - map of pageNumber -> image dataUrl
 * @param {string} fileNameTitle
 * @returns {Promise<void>}
 */
export async function generatePptxFromOutline(outline, imagesByPage, fileNameTitle = "Presentation", options = {}) {
  /**
   * options:
   *  - themeName?: string           // Enforce selected theme regardless of outline.theme
   *  - pageMeta?: Record<number,{ title?: string, caption?: string }>
   */
  if (!outline || !Array.isArray(outline.slides) || outline.slides.length === 0) {
    throw new Error("Outline is empty. Nothing to generate.");
  }

  // Enforce selected theme (override outline.theme) if provided
  const enforcedThemeName = options?.themeName ? String(options.themeName) : (outline.theme || "azure");
  const baseTheme = getTheme(enforcedThemeName);

  // Use first available image per slide to derive accent
  const candidateImages = (Array.isArray(outline.slides) ? outline.slides.map(s => pickFirstImage(s, imagesByPage)).filter(Boolean) : []);
  const theme = await deriveThemeWithAutoAccent(baseTheme, candidateImages);
  const pptx = new PptxGenJS();

  // Title slide (use doc title if provided; otherwise use fileNameTitle)
  const deckTitle = outline.title || fileNameTitle;
  const titleSlide = pptx.addSlide(slideOptionsForTheme(theme));
  titleSlide.addText(deckTitle, {
    x: 0.5, y: 1.5, w: 9, h: 1,
    ...titleTextStyle(theme),
    align: "center",
    fontSize: Math.max(32, (theme.typography?.title?.fontSize || 32))
  });

  for (const s of outline.slides) {
    const slide = pptx.addSlide(slideOptionsForTheme(theme));

    // Determine images: prefer slide.imagePages, fallback to slide.sources[].page
    const images = pickImages(s, imagesByPage, 2);
    const primaryImage = images.length ? images[0] : null;

    // Caption fallback: if slide.caption absent, try first page's meta caption
    let caption = s.caption || "";
    if (!caption && Array.isArray(s.imagePages) && s.imagePages.length && options?.pageMeta) {
      const firstPage = s.imagePages.find((p) => options.pageMeta[p]?.caption);
      if (firstPage) caption = options.pageMeta[firstPage].caption || "";
    } else if (!caption && Array.isArray(s.sources) && s.sources.length && options?.pageMeta) {
      const firstSourcePage = (s.sources.map(src => src?.page).filter(Boolean) || []).find((p) => options.pageMeta[p]?.caption);
      if (firstSourcePage) caption = options.pageMeta[firstSourcePage].caption || "";
    }

    // Normalize data for templates
    const data = {
      title: s.title || "",
      subtitle: s.subtitle || "",
      bullets: Array.isArray(s.bullets) ? s.bullets : [],
      image: primaryImage,
      images, // pass all selected images for templates capable of mosaics
      caption: caption || "",
      flow: s.flow,
      left: s.left,
      right: s.right,
      col1: s.col1,
      col2: s.col2
    };

    const templateKey = inferTemplateKey(s, data);
    renderSlide(pptx, slide, templateKey, data, theme);

    // Optional notes
    if (s.notes) {
      try { slide.addNotes(s.notes); } catch { /* ignore */ }
    }
  }

  const fileName = `${sanitize(deckTitle)}.pptx`;

  try {
    await pptx.writeFile({ fileName });
  } catch (_err) {
    try {
      const blob = await pptx.write("blob");
      downloadBlob(blob, fileName);
    } catch (inner) {
      const details = inner?.message || inner?.toString?.() || "Unknown error";
      throw new Error(`Failed to generate or download PPTX from outline: ${details}`);
    }
  }
}

/* ------------------------ Helpers ------------------------ */

function sanitize(name) {
  return String(name).replace(/[^\w\-]+/g, "_");
}

function pickFirstImage(slideDef, imagesByPage) {
  if (!slideDef) return null;
  const pages = Array.isArray(slideDef.imagePages) ? slideDef.imagePages : [];
  for (const p of pages) {
    if (imagesByPage && imagesByPage[p]) return imagesByPage[p];
  }
  // Fallback to sources[].page
  const srcPages = Array.isArray(slideDef.sources) ? slideDef.sources.map(s => s?.page).filter(Boolean) : [];
  for (const p of srcPages) {
    if (imagesByPage && imagesByPage[p]) return imagesByPage[p];
  }
  return null;
}

/**
 * Pick up to maxCount images for a slide. Prefers imagePages then falls back to sources[].page.
 * @param {object} slideDef
 * @param {Record<number,string>} imagesByPage
 * @param {number} maxCount
 * @returns {string[]} dataUrls
 */
function pickImages(slideDef, imagesByPage, maxCount = 2) {
  const out = [];
  if (!slideDef || !imagesByPage) return out;

  const seen = new Set();
  const pushIf = (url) => {
    if (!url) return;
    if (seen.has(url)) return;
    out.push(url);
    seen.add(url);
  };

  const pageList = Array.isArray(slideDef.imagePages) ? slideDef.imagePages : [];
  for (const p of pageList) {
    if (imagesByPage[p]) {
      pushIf(imagesByPage[p]);
      if (out.length >= maxCount) return out;
    }
  }
  const srcPages = Array.isArray(slideDef.sources) ? slideDef.sources.map(s => s?.page).filter(Boolean) : [];
  for (const p of srcPages) {
    if (imagesByPage[p]) {
      pushIf(imagesByPage[p]);
      if (out.length >= maxCount) return out;
    }
  }
  return out;
}

function inferTemplateKey(slideDef, data) {
  // Use provided template if present
  if (slideDef?.template) return normalizeTemplateKey(slideDef.template);

  // Heuristics
  const hasImage = !!data.image;
  const bulletsLen = Array.isArray(data.bullets) ? data.bullets.length : 0;

  if (slideDef?.flow?.steps?.length) return "FLOWCHART";
  if (slideDef?.left || slideDef?.right) return "COMPARISON";
  if (slideDef?.col1 || slideDef?.col2) return "TWO_COLUMN";
  if (hasImage && bulletsLen > 0) return "IMAGE_RIGHT"; // default side
  if (hasImage) return "IMAGE_CARD";
  if (!hasImage && bulletsLen > 0 && data.title) return "TITLE_BULLETS";
  if (data.title && !bulletsLen) return "TITLE";
  return "BULLETS";
}

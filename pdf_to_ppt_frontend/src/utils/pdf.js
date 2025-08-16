import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

/**
 * Configure pdf.js worker via CDN to avoid bundler worker issues in CRA.
 * If you pin a different pdfjs-dist version, update the URL below accordingly.
 */
GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/**
 * PUBLIC_INTERFACE
 * pdfToImages
 * Converts a PDF File into an array of page images as data URLs.
 * @param {File} pdfFile - the input PDF file (from input[type=file])
 * @param {number} maxWidth - maximum width of rendered page image
 * @returns {Promise<Array<{page: number, dataUrl: string}>>}
 */
export async function pdfToImages(pdfFile, maxWidth = 1024) {
  if (!pdfFile) return [];
  const ab = await pdfFile.arrayBuffer();
  const loadingTask = getDocument({ data: ab });
  const pdf = await loadingTask.promise;

  const results = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    const scale = Math.min(maxWidth / viewport.width, 2.0);
    const scaledViewport = page.getViewport({ scale: scale || 1 });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = Math.floor(scaledViewport.width);
    canvas.height = Math.floor(scaledViewport.height);

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    const dataUrl = canvas.toDataURL('image/png', 0.92);

    results.push({ page: pageNum, dataUrl });
  }

  return results;
}

/**
 * PUBLIC_INTERFACE
 * pdfToText
 * Extracts text and structural chunks from each page of the provided PDF file.
 *
 * Backward-compatible: Still returns an array with { page, text }, and additionally
 * includes "chunks" for downstream semantic processing. Existing consumers that only
 * read {page,text} will continue to work as-is.
 *
 * Coordinates note:
 * - The bbox coordinates are reported in the PDF.js text space (roughly page units) at scale=1,
 *   using the transform matrix returned by pdfjs-dist. They are not CSS pixels.
 *
 * Chunk structure:
 *   {
 *     type: 'heading' | 'paragraph' | 'list',
 *     text: string,
 *     bbox: { x: number, y: number, width: number, height: number },  // approx per line/block
 *     font: { size: number, family?: string, bold?: boolean, italic?: boolean },
 *     spans: Array<{ text: string, x: number, y: number, width: number, height: number, fontSize: number, fontName?: string }>
 *   }
 *
 * @param {File} pdfFile - the input PDF file (from input[type=file])
 * @param {number} maxCharsPerPage - truncate each page's extracted text to this many characters
 * @returns {Promise<Array<{ page: number, text: string, chunks?: Array<any>, stats?: any }>>}
 */
export async function pdfToText(pdfFile, maxCharsPerPage = 4000) {
  if (!pdfFile) return [];
  const ab = await pdfFile.arrayBuffer();
  const loadingTask = getDocument({ data: ab });
  const pdf = await loadingTask.promise;

  const results = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Build normalized spans from pdf.js items
    const spans = (textContent.items || []).map((it) => {
      const t = it.transform || [1, 0, 0, 1, 0, 0];
      const x = t[4] || 0;
      const y = t[5] || 0;
      // Font size heuristic (pdf.js exposes transform matrix; height may be available)
      const sizeCandidates = [
        Math.abs(it.height || 0),
        Math.abs(t[0] || 0),
        Math.abs(t[3] || 0),
      ].filter(Boolean);
      const fontSize = sizeCandidates.length
        ? median(sizeCandidates)
        : 0;

      // Width/height fallbacks
      const width = typeof it.width === 'number' ? it.width : estimateWidth(it.str, fontSize);
      const height = typeof it.height === 'number' ? it.height : Math.max(fontSize, 1);

      const style = textContent.styles?.[it.fontName] || {};
      const fontFamily = style.fontFamily || undefined;
      const fontName = it.fontName || undefined;

      return {
        text: it.str || '',
        x,
        y,
        width,
        height,
        fontSize,
        fontName,
        fontFamily,
      };
    }).filter(s => !!s.text);

    // Sort top-to-bottom (y desc) then left-to-right (x asc)
    spans.sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2) return b.y - a.y; // larger y first (top)
      return a.x - b.x;
    });

    // Group spans into lines by y position using a tolerance
    const yTolerance = dynamicYTolerance(spans);
    const lines = groupSpansIntoLines(spans, yTolerance);

    // Build per-line aggregated structures
    const lineBlocks = lines.map((lineSpans) => {
      lineSpans.sort((a, b) => a.x - b.x);
      const text = joinLineText(lineSpans);
      const fontSize = median(lineSpans.map(s => s.fontSize || 0)) || 0;
      const fontFamilies = lineSpans.map(s => s.fontFamily).filter(Boolean);
      const fontFamily = mostCommon(fontFamilies);
      const fontNameSamples = lineSpans.map(s => s.fontName || '').join(' ');
      const bold = /(bold|semibold|medium)/i.test([fontFamily, fontNameSamples].filter(Boolean).join(' '));
      const italic = /(italic|oblique)/i.test([fontFamily, fontNameSamples].filter(Boolean).join(' '));
      const bbox = computeBBox(lineSpans);

      return {
        text,
        fontSize,
        fontFamily,
        bold,
        italic,
        spans: lineSpans,
        bbox,
      };
    });

    // Heuristics to assign structure types (heading/paragraph/list)
    const fontSizes = lineBlocks.map(lb => lb.fontSize || 0).filter(Boolean);
    const maxFont = fontSizes.length ? Math.max(...fontSizes) : 0;
    const medFont = fontSizes.length ? median(fontSizes) : 0;
    const headingCutoff = maxFont ? Math.max(maxFont * 0.9, medFont * 1.35) : medFont * 1.35;

    const chunks = lineBlocks.map((lb) => {
      const isList = looksLikeList(lb.text);
      const isHeading = !isList
        && lb.text.length <= 120
        && (lb.fontSize >= headingCutoff || (medFont > 0 && lb.fontSize >= medFont * 1.5))
        && !/^\d{1,3}$/.test(lb.text.trim()); // avoid classifying bare numbers as headings

      const type = isList ? 'list' : (isHeading ? 'heading' : 'paragraph');

      return {
        type,
        text: lb.text,
        bbox: lb.bbox,
        font: {
          size: round(lb.fontSize, 2),
          family: lb.fontFamily,
          bold: !!lb.bold,
          italic: !!lb.italic,
        },
        spans: lb.spans.map(s => ({
          text: s.text,
          x: round(s.x, 2),
          y: round(s.y, 2),
          width: round(s.width, 2),
          height: round(s.height, 2),
          fontSize: round(s.fontSize, 2),
          fontName: s.fontName,
        })),
      };
    });

    // Build raw text (top-to-bottom). Keep newlines between lines
    const raw = lineBlocks.map(lb => lb.text).join('\n').replace(/\s+\n/g, '\n').trim();
    const normalized = raw.replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    const truncated = normalized.slice(0, Math.max(0, maxCharsPerPage));

    results.push({
      page: pageNum,
      text: truncated,  // backward-compatible raw text
      chunks,           // structured chunks for semantic processing
      stats: {
        maxFont: round(maxFont, 2),
        medianFont: round(medFont, 2),
        lineCount: lineBlocks.length,
      }
    });
  }
  return results;
}

/* ------------------------ Helpers (internal) ------------------------ */

/**
 * Estimate width as a fallback if pdf.js does not provide it.
 * Very rough; assumes ~0.6em per character.
 */
function estimateWidth(str, fontSize) {
  const chars = (str || '').length;
  return Math.max(0, chars * fontSize * 0.6);
}

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const n = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(n.length / 2);
  return n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2;
}

function mostCommon(arr) {
  if (!arr || arr.length === 0) return undefined;
  const counts = new Map();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let best = undefined;
  let max = 0;
  for (const [k, v] of counts.entries()) {
    if (v > max) { max = v; best = k; }
  }
  return best;
}

/**
 * Determine y tolerance dynamically based on typical text height.
 */
function dynamicYTolerance(spans) {
  if (!spans || spans.length === 0) return 3;
  const heights = spans.map(s => Math.abs(s.height || s.fontSize || 0)).filter(Boolean);
  const med = median(heights);
  // Tolerance is a fraction of typical height, clamped to a sensible range
  return Math.min(6, Math.max(2, med * 0.35));
}

/**
 * Group spans into lines by similar Y values (within tolerance).
 * Returns an array of arrays (each is a line's spans).
 */
function groupSpansIntoLines(spans, yTolerance = 3) {
  const lines = [];
  for (const s of spans) {
    let placed = false;
    for (const line of lines) {
      // Lines store reference y as average of their spans to stabilize
      const refY = average(line.map(it => it.y));
      if (Math.abs(s.y - refY) <= yTolerance) {
        line.push(s);
        placed = true;
        break;
      }
    }
    if (!placed) lines.push([s]);
  }
  // Sort lines top-to-bottom by average y desc
  lines.sort((a, b) => average(b.map(s => s.y)) - average(a.map(s => s.y)));
  return lines;
}

function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

/**
 * Join text from spans in a line, inserting spaces when horizontal gaps are large.
 */
function joinLineText(lineSpans) {
  if (!lineSpans || lineSpans.length === 0) return '';
  const parts = [];
  for (let i = 0; i < lineSpans.length; i += 1) {
    const s = lineSpans[i];
    if (i === 0) {
      parts.push(s.text);
      continue;
    }
    const prev = lineSpans[i - 1];
    const gap = s.x - (prev.x + prev.width);
    // Insert a space if there's a reasonable gap between spans
    if (gap > Math.max(1.5, (s.fontSize || 10) * 0.2)) {
      parts.push(' ');
    }
    parts.push(s.text);
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function computeBBox(spans) {
  if (!spans || spans.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const minX = Math.min(...spans.map(s => s.x));
  const maxX = Math.max(...spans.map(s => s.x + s.width));
  // For Y, because PDF y grows upward in pdf.js space, we can compute min/max similarly
  const minY = Math.min(...spans.map(s => s.y));
  const maxY = Math.max(...spans.map(s => s.y + s.height));
  return {
    x: round(minX, 2),
    y: round(minY, 2),
    width: round(maxX - minX, 2),
    height: round(maxY - minY, 2),
  };
}

function round(n, digits = 2) {
  const p = Math.pow(10, digits);
  return Math.round((n + Number.EPSILON) * p) / p;
}

/**
 * Detect bullet/numbered list lines via simple prefixes.
 */
function looksLikeList(text) {
  const t = (text || '').trim();
  if (!t) return false;
  // Common bullets and dashes
  if (/^(\u2022|\u2023|\u25E6|•|‣|◦|–|—|-|\*)\s+/.test(t)) return true;
  // Numbered like: 1. 2) (3) a. b) i.
  if (/^(\(?\d{1,3}\)?[.)]|[a-zA-Z][.)])\s+/.test(t)) return true;
  // Checkbox-like lists: [] [x]
  if (/^\[(?: |x|X)\]\s+/.test(t)) return true;
  return false;
}

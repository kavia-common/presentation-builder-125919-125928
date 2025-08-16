/**
 * PPT generation utilities using pptxgenjs.
 */
import PptxGenJS from 'pptxgenjs';

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
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
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
 * It attempts pptx.writeFile (built-in save) and falls back to a Blob download if needed.
 * @param {Array<{ imageDataUrl: string, title?: string, caption?: string }>} slides
 * @param {string} fileNameTitle
 * @returns {Promise<void>}
 */
export async function generatePptx(slides, fileNameTitle = 'Presentation') {
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error('No slides provided to generatePptx.');
  }

  const pptx = new PptxGenJS();

  // Title slide
  pptx.addSlide().addText(fileNameTitle, {
    x: 0.5, y: 1.5, w: 9, h: 1,
    fontSize: 36, bold: true, align: 'center'
  });

  for (const s of slides) {
    const slide = pptx.addSlide();

    // Image sized to fit slide with margins
    slide.addImage({
      data: s.imageDataUrl,
      x: 0.5, y: 0.5, w: 9, h: 5.5,
      sizing: { type: 'contain', w: 9, h: 5.5 }
    });

    // Title and caption if present
    if (s.title) {
      slide.addText(s.title, { x: 0.5, y: 6.2, w: 9, h: 0.5, fontSize: 20, bold: true });
    }
    if (s.caption) {
      slide.addText(s.caption, { x: 0.5, y: 6.7, w: 9, h: 1, fontSize: 14, color: '666666' });
    }
  }

  const fileName = `${sanitize(fileNameTitle)}.pptx`;

  // Try built-in file save first, then fallback to Blob/manual download.
  try {
    await pptx.writeFile({ fileName });
  } catch (err) {
    // Fallback to blob approach (more robust across environments)
    try {
      const blob = await pptx.write('blob');
      downloadBlob(blob, fileName);
    } catch (inner) {
      // If both methods fail, surface the original error context
      const details = inner?.message || inner?.toString?.() || 'Unknown error';
      throw new Error(`Failed to generate or download PPTX: ${details}`);
    }
  }
}

// PUBLIC_INTERFACE
/**
 * generatePptxFromOutline
 * Creates a PPTX from a structured outline with titles, bullets, and optional images.
 * @param {{slides:Array<{title:string, bullets:string[], imagePages?:number[], notes?:string}>}} outline
 * @param {Record<number,string>} imagesByPage - map of pageNumber -> image dataUrl
 * @param {string} fileNameTitle
 * @returns {Promise<void>}
 */
export async function generatePptxFromOutline(outline, imagesByPage, fileNameTitle = 'Presentation') {
  if (!outline || !Array.isArray(outline.slides) || outline.slides.length === 0) {
    throw new Error('Outline is empty. Nothing to generate.');
  }

  const pptx = new PptxGenJS();

  // Title slide
  pptx.addSlide().addText(fileNameTitle, {
    x: 0.5, y: 1.5, w: 9, h: 1,
    fontSize: 36, bold: true, align: 'center'
  });

  for (const s of outline.slides) {
    const slide = pptx.addSlide();

    // Title
    if (s.title) {
      slide.addText(s.title, { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 26, bold: true });
    }

    // Bullets
    if (Array.isArray(s.bullets) && s.bullets.length) {
      slide.addText(
        s.bullets.map((b) => `• ${b}`).join('\n'),
        { x: 0.7, y: 1.2, w: 5.2, h: 4.5, fontSize: 16, color: '363636' }
      );
    }

    // Optional image: choose first referenced image page if exists
    const imgPage = Array.isArray(s.imagePages) && s.imagePages.length ? s.imagePages[0] : null;
    const imgData = imgPage ? imagesByPage?.[imgPage] : null;
    if (imgData) {
      slide.addImage({
        data: imgData,
        x: 6.1, y: 1.2, w: 3.2, h: 4.5,
        sizing: { type: 'contain', w: 3.2, h: 4.5 }
      });
    }

    // Optional notes
    if (s.notes) {
      slide.addNotes(s.notes);
    }
  }

  const fileName = `${sanitize(fileNameTitle)}.pptx`;

  // Try built-in file save first, then fallback to Blob/manual download.
  try {
    await pptx.writeFile({ fileName });
  } catch (err) {
    try {
      const blob = await pptx.write('blob');
      downloadBlob(blob, fileName);
    } catch (inner) {
      const details = inner?.message || inner?.toString?.() || 'Unknown error';
      throw new Error(`Failed to generate or download PPTX from outline: ${details}`);
    }
  }
}

function sanitize(name) {
  return String(name).replace(/[^\w\-]+/g, '_');
}

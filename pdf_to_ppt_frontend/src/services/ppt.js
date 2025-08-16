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

function sanitize(name) {
  return String(name).replace(/[^\w\-]+/g, '_');
}

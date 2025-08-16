/**
 * PPT generation utilities using pptxgenjs.
 */
import PptxGenJS from 'pptxgenjs';

// PUBLIC_INTERFACE
/**
 * generatePptx
 * Creates a PPTX file with one slide per selected item.
 * @param {Array<{ imageDataUrl: string, title?: string, caption?: string }>} slides
 * @param {string} fileNameTitle
 * @returns {Promise<void>}
 */
export async function generatePptx(slides, fileNameTitle = 'Presentation') {
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
  await pptx.writeFile({ fileName });
}

function sanitize(name) {
  return String(name).replace(/[^\w\-]+/g, '_');
}

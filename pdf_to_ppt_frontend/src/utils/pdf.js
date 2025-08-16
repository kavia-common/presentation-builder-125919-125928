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

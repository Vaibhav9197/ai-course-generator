/**
 * Rasterises a DOM element into a multi-page A4 PDF.
 *
 * Both libraries are imported dynamically: together they are a few hundred kilobytes, and
 * most visits never export anything, so they stay out of the initial bundle.
 *
 * html2canvas-pro rather than html2canvas: the original is unmaintained at 1.4.1 and
 * throws on modern CSS colour functions (oklch/lab/color-mix). Chakra v3's token layer can
 * emit those, so the maintained fork removes an entire class of "export silently broken
 * after a dependency bump" failure.
 */

const A4 = { widthMm: 210, heightMm: 297 };

export async function exportElementToPdf(element, { filename, scale = 2 } = {}) {
  if (!element) throw new Error('Nothing to export.');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    // 2x for legible text on high-DPI screens and when zoomed in a PDF reader.
    scale,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    // The element is positioned off-screen; without this the capture can come out blank.
    scrollX: 0,
    scrollY: 0,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

  // Scale the capture to the full page width; height follows to preserve aspect ratio.
  const imageHeightMm = (canvas.height * A4.widthMm) / canvas.width;
  const pageCount = Math.max(1, Math.ceil(imageHeightMm / A4.heightMm));
  const imageData = canvas.toDataURL('image/jpeg', 0.92);

  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) pdf.addPage();
    // Slice by shifting the same image up by one page height per page, and let the page
    // boundary clip it. Simpler and more reliable than re-cropping the canvas per page.
    pdf.addImage(
      imageData,
      'JPEG',
      0,
      -(page * A4.heightMm),
      A4.widthMm,
      imageHeightMm,
      undefined,
      'FAST',
    );
  }

  pdf.save(filename || 'lesson.pdf');

  return { pageCount };
}

/**
 * Turns a lesson title into a safe, readable download filename.
 *
 * `\p{M}` (Mark) has to be in the keep-set alongside letters and numbers. In Devanagari
 * and many other scripts, vowel signs are separate combining marks — without it "हिंदी"
 * degrades to "ह-द", which matters for an app that explicitly supports Hindi content.
 */
export function pdfFilename(courseTitle, lessonTitle) {
  const slug = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

  const parts = [slug(courseTitle), slug(lessonTitle)].filter(Boolean);
  return `${parts.join('--') || 'lesson'}.pdf`;
}

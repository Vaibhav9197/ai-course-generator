import { useRef, useState } from 'react';
import { Box, Button } from '@chakra-ui/react';
import { FiDownload } from 'react-icons/fi';
import PdfLessonSheet, { PDF_WIDTH_PX } from './PdfLessonSheet.jsx';
import { exportElementToPdf, pdfFilename } from '../utils/pdf.js';
import ErrorMessage from './ErrorMessage.jsx';

/**
 * Download button plus the hidden print tree it captures.
 *
 * The sheet is always mounted rather than mounted on click, because the rasteriser needs
 * a laid-out element with real dimensions — fonts resolved, text wrapped. Mounting it in
 * the same tick as the capture produces a blank or half-styled page.
 *
 * It is hidden by being positioned far off-screen rather than with `display: none` or
 * `visibility: hidden`: both of those collapse layout, and an element with no geometry
 * captures as nothing. `aria-hidden` plus inert keeps it out of the accessibility tree and
 * tab order so it is invisible to assistive technology despite being rendered.
 */
export function LessonPDFExporter({ lesson, courseTitle, moduleTitle, size = 'sm' }) {
  const sheetRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await exportElementToPdf(sheetRef.current, {
        filename: pdfFilename(courseTitle, lesson?.title),
      });
    } catch (err) {
      setError(err);
    } finally {
      setExporting(false);
    }
  };

  const canExport = Boolean(lesson?.isEnriched && lesson.content?.length);

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={handleExport}
        loading={exporting}
        loadingText="Preparing PDF…"
        disabled={!canExport}
        title={canExport ? 'Download this lesson as a PDF' : 'Available once the lesson has content'}
      >
        <FiDownload />
        PDF
      </Button>

      {error && (
        <Box mt="3">
          <ErrorMessage error={error} title="Could not create the PDF" />
        </Box>
      )}

      <Box
        aria-hidden="true"
        // `inert` is a standard HTML attribute supported natively by React 19; it removes
        // the subtree from tab order and the accessibility tree.
        inert=""
        position="fixed"
        top="0"
        left={`-${PDF_WIDTH_PX + 100}px`}
        width={`${PDF_WIDTH_PX}px`}
        pointerEvents="none"
        // Not display:none — a collapsed element has no geometry and captures blank.
        opacity="0"
      >
        <PdfLessonSheet
          ref={sheetRef}
          lesson={lesson}
          courseTitle={courseTitle}
          moduleTitle={moduleTitle}
        />
      </Box>
    </>
  );
}

export default LessonPDFExporter;

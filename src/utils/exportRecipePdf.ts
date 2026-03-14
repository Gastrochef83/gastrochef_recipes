import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Stable PDF export for the existing "Export PDF" button.
 * - Keeps the current workflow.
 * - Avoids the infinite/very-long loop issue on the last page.
 * - Reduces visible page seams with a tiny overlap.
 */
export async function exportRecipePdf() {
  const element = document.getElementById("recipe-print-card");

  if (!element) {
    alert("Recipe card not found");
    return;
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });

    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const margin = 6;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    const pageCanvasHeight = Math.max(
      1,
      Math.floor((canvas.width * usableHeight) / usableWidth)
    );

    const overlapPx = 10;

    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < canvas.height) {
      const remainingHeight = canvas.height - renderedHeight;
      const sliceHeight = Math.min(pageCanvasHeight, remainingHeight);

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      const ctx = pageCanvas.getContext("2d");
      if (!ctx) {
        alert("Unable to prepare PDF page");
        return;
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

      ctx.drawImage(
        canvas,
        0,
        renderedHeight,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );

      const pageData = pageCanvas.toDataURL("image/png", 1.0);

      if (pageIndex > 0) {
        pdf.addPage();
      }

      const pageImageHeightMm = (sliceHeight * usableWidth) / canvas.width;

      pdf.addImage(
        pageData,
        "PNG",
        margin,
        margin,
        usableWidth,
        pageImageHeightMm,
        undefined,
        "FAST"
      );

      // Last page: stop cleanly.
      if (renderedHeight + sliceHeight >= canvas.height) {
        break;
      }

      // Otherwise move down with a tiny overlap to hide seams.
      renderedHeight += Math.max(1, sliceHeight - overlapPx);
      pageIndex += 1;
    }

    pdf.save("recipe-card.pdf");
  } catch (error) {
    console.error("PDF export failed:", error);
    alert("PDF export failed. Check console for details.");
  }
}

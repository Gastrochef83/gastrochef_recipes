import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * Improved screenshot-based PDF export that keeps the existing Export PDF button.
 *
 * Notes:
 * - This greatly reduces the visible seam between PDF pages.
 * - Because this method still exports from a canvas image, very long tables can
 *   still break across pages. It improves the result, but does not give true
 *   table-aware pagination.
 */
export async function exportRecipePdf() {
  const element = document.getElementById("recipe-print-card");

  if (!element) {
    alert("Recipe card not found");
    return;
  }

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

  // Small page margins make the result look cleaner and reduce edge artifacts.
  const margin = 6;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  // Convert one PDF page height into canvas pixels.
  const pageCanvasHeight = Math.floor((canvas.width * usableHeight) / usableWidth);

  // Tiny overlap to hide the seam between pages visually.
  const overlapPx = 10;

  let renderedHeight = 0;
  let pageIndex = 0;

  while (renderedHeight < canvas.height) {
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedHeight);

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

    // Move down by one page, but with a very small overlap to hide the seam.
    renderedHeight += sliceHeight - overlapPx;
    pageIndex += 1;
  }

  pdf.save("recipe-card.pdf");
}

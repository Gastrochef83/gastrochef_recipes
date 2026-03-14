import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// Configuration Constants
const CONFIG = {
  scale: 2,
  margin: 6,
  overlapPx: 10,
  imageQuality: 0.9, // Reduced slightly to decrease file size
  imageFormat: "PNG",
};

/**
 * Export recipe card as PDF with improved performance and UX
 * @param {string} recipeTitle - Optional recipe title for dynamic filename
 */
export async function exportRecipePdf(recipeTitle = "recipe") {
  const element = document.getElementById("recipe-print-card");
  const btn = document.getElementById("export-btn"); // Assume button exists for state management

  // Validate element exists
  if (!element) {
    showNotification("Error: Recipe card not found", "error");
    return;
  }

  // UX Improvement: Activate loading state
  const originalBtnText = btn ? btn.innerText : "";
  if (btn) {
    btn.disabled = true;
    btn.innerText = "Exporting...";
  }

  try {
    // Performance Improvement: Focus only on element dimensions
    const canvas = await html2canvas(element, {
      scale: CONFIG.scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      // Remove general windowWidth/Height to focus on element
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const usableWidth = pageWidth - CONFIG.margin * 2;
    const usableHeight = pageHeight - CONFIG.margin * 2;

    // Calculate page height inside canvas in pixels
    const pageCanvasHeight = Math.max(
      1,
      Math.floor((canvas.width * usableHeight) / usableWidth)
    );

    // Memory Improvement: Create one temporary canvas and reuse it
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    const ctx = sliceCanvas.getContext("2d");

    if (!ctx) {
      throw new Error("Unable to prepare PDF context");
    }

    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < canvas.height) {
      const remainingHeight = canvas.height - renderedHeight;
      const sliceHeight = Math.min(pageCanvasHeight, remainingHeight);

      // Update temporary canvas height only
      sliceCanvas.height = sliceHeight;

      // Draw white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

      // Slice image from original canvas
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

      const pageData = sliceCanvas.toDataURL(
        `image/${CONFIG.imageFormat}`,
        CONFIG.imageQuality
      );

      if (pageIndex > 0) {
        pdf.addPage();
      }

      const pageImageHeightMm = (sliceHeight * usableWidth) / canvas.width;

      pdf.addImage(
        pageData,
        CONFIG.imageFormat,
        CONFIG.margin,
        CONFIG.margin,
        usableWidth,
        pageImageHeightMm,
        undefined,
        "FAST"
      );

      if (renderedHeight + sliceHeight >= canvas.height) {
        break;
      }

      renderedHeight += Math.max(1, sliceHeight - CONFIG.overlapPx);
      pageIndex += 1;
    }

    // Dynamic filename with text sanitization
    const safeFileName = recipeTitle
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    pdf.save(`${safeFileName}.pdf`);

    showNotification("Recipe exported successfully", "success");
  } catch (error) {
    console.error("PDF export failed:", error);
    showNotification("Export failed. Please try again.", "error");
  } finally {
    // Restore button state
    if (btn) {
      btn.disabled = false;
      btn.innerText = originalBtnText;
    }
  }
}

/**
 * Helper function for notifications (can be replaced with a library like Toastify)
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 */
function showNotification(message, type) {
  // Here you can call a real notification library
  console.log(`[${type.toUpperCase()}] ${message}`);
  // alert(message); // Temporary fallback
}

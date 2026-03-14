import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// إعدادات محسنة للأداء والحجم
const CONFIG = {
  scale: 2,
  margin: 6,
  overlapPx: 10,
  imageQuality: 0.75, // تقليل الجودة لتخفيف الحجم بشكل ملحوظ
  imageFormat: "JPEG", // تغيير من PNG إلى JPEG لتقليل الحجم
  maxPages: 20, // حد أقصى للصفحات لمنع الحلقة اللانهائية
  maxFileSize: 10 * 1024 * 1024, // 10MB حد أقصى لحجم الملف
};

export async function exportRecipePdf(recipeTitle = "recipe") {
  const element = document.getElementById("recipe-print-card");
  const btn = document.getElementById("export-btn");

  if (!element) {
    showNotification("Error: Recipe card not found", "error");
    return;
  }

  // تحسين تجربة المستخدم: حالة التحميل
  const originalBtnText = btn ? btn.innerText : "";
  if (btn) {
    btn.disabled = true;
    btn.innerText = "Exporting...";
  }

  try {
    // تحسين الأداء: التركيز على العنصر فقط بدون أبعاد النافذة العامة
    const canvas = await html2canvas(element, {
      scale: CONFIG.scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      // إزالة windowWidth/Height لتسريع العملية
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const usableWidth = pageWidth - CONFIG.margin * 2;
    const usableHeight = pageHeight - CONFIG.margin * 2;

    const pageCanvasHeight = Math.max(
      1,
      Math.floor((canvas.width * usableHeight) / usableWidth)
    );

    // تحسين الذاكرة: Canvas مؤقت واحد بدلاً من إنشاء جديد في كل مرة
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    const ctx = sliceCanvas.getContext("2d");

    if (!ctx) {
      throw new Error("Unable to prepare PDF context");
    }

    let renderedHeight = 0;
    let pageIndex = 0;

    while (renderedHeight < canvas.height) {
      // حماية من الحلقة اللانهائية
      if (pageIndex >= CONFIG.maxPages) {
        console.warn(`Max pages (${CONFIG.maxPages}) reached. Stopping export.`);
        showNotification("Recipe too long. Exported first 20 pages.", "warning");
        break;
      }

      const remainingHeight = canvas.height - renderedHeight;
      const sliceHeight = Math.min(pageCanvasHeight, remainingHeight);

      sliceCanvas.height = sliceHeight;

      // خلفية بيضاء (مهمة لصيغة JPEG)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

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

      // التحقق من حجم البيانات
      const estimatedSize = (pageData.length * 3) / 4; // تقريب حجم Base64
      if (pageIndex > 0 && estimatedSize > CONFIG.maxFileSize) {
        console.warn("File size limit approaching.");
      }

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

    // اسم ملف ديناميكي
    const safeFileName = recipeTitle
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    pdf.save(`${safeFileName}.pdf`);

    showNotification(
      `Exported ${pageIndex + 1} pages successfully`,
      "success"
    );
  } catch (error) {
    console.error("PDF export failed:", error);
    showNotification("Export failed. Please try again.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = originalBtnText;
    }
  }
}

function showNotification(message, type) {
  console.log(`[${type.toUpperCase()}] ${message}`);
}

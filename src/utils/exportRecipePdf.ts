// src/utils/exportRecipePdf.ts
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

interface ExportConfig {
  scale?: number;
  margin?: number;
  overlapPx?: number;
  imageQuality?: number;
  imageFormat?: "JPEG" | "PNG";
  maxPages?: number;
  pageOrientation?: "portrait" | "landscape";
  includeTimestamp?: boolean;
}

const DEFAULT_CONFIG: ExportConfig = {
  scale: 2,
  margin: 8,
  overlapPx: 15,
  imageQuality: 0.85,
  imageFormat: "JPEG",
  maxPages: 30,
  pageOrientation: "portrait",
  includeTimestamp: true,
};

export async function exportRecipePdf(
  recipeTitle?: string,
  config?: ExportConfig
): Promise<void> {
  const element = document.getElementById("recipe-print-card");
  const btn = document.getElementById("export-btn") as HTMLButtonElement | null;
  
  const options = { ...DEFAULT_CONFIG, ...config };
  const title = recipeTitle || document.querySelector("h1")?.innerText || "recipe";

  if (!element) {
    showNotification("Recipe card not found. Make sure element with id 'recipe-print-card' exists.", "error");
    return;
  }

  const originalBtnText = btn?.innerText;
  if (btn) {
    btn.disabled = true;
    btn.innerText = "⏳ Exporting...";
  }

  try {
    showNotification("Preparing recipe card...", "info");

    await waitForImages(element);

    const canvas = await html2canvas(element, {
      scale: options.scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    const pdf = new jsPDF(
      options.pageOrientation === "landscape" ? "l" : "p",
      "mm",
      "a4"
    );

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = options.margin!;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    const pageCanvasHeight = Math.floor(
      (canvas.width * usableHeight) / usableWidth
    );

    const totalPages = Math.ceil(
      canvas.height / (pageCanvasHeight - options.overlapPx!)
    );
    const maxPages = options.maxPages!;

    if (totalPages > maxPages) {
      showNotification(
        `Recipe is long (${totalPages} pages). Exporting first ${maxPages} pages.`,
        "warning"
      );
    }

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    const ctx = sliceCanvas.getContext("2d");

    if (!ctx) {
      throw new Error("Cannot create canvas context");
    }

    let renderedHeight = 0;
    let pageIndex = 0;
    const pages: string[] = [];

    while (renderedHeight < canvas.height && pageIndex < maxPages) {
      const remaining = canvas.height - renderedHeight;
      const sliceHeight = Math.min(pageCanvasHeight, remaining);

      sliceCanvas.height = sliceHeight;

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

      const imageData = sliceCanvas.toDataURL(
        `image/${options.imageFormat}`,
        options.imageQuality
      );

      pages.push(imageData);
      renderedHeight += Math.max(1, sliceHeight - options.overlapPx!);
      pageIndex++;
    }

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) pdf.addPage();

      const img = new Image();
      img.src = pages[i];

      await new Promise<void>((resolve) => {
        img.onload = () => {
          const imgHeightMm = (img.height * usableWidth) / canvas.width;
          pdf.addImage(
            pages[i],
            options.imageFormat,
            margin,
            margin,
            usableWidth,
            imgHeightMm,
            undefined,
            "FAST"
          );
          resolve();
        };
        img.onerror = () => resolve();
      });
    }

    let fileName = title.replace(/[^a-z0-9\u0600-\u06FF]/gi, "_").toLowerCase();
    if (options.includeTimestamp) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      fileName = `${fileName}_${timestamp}`;
    }

    pdf.save(`${fileName}.pdf`);
    showNotification(`Successfully exported ${pages.length} page(s)!`, "success");
  } catch (error) {
    console.error("Export failed:", error);
    showNotification(
      `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error"
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = originalBtnText || "Export PDF";
    }
  }
}

async function waitForImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll("img"));
  if (images.length === 0) return;

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalHeight > 0) {
            resolve();
          } else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        })
    )
  );
}

function showNotification(message: string, type: "success" | "error" | "warning" | "info" = "info") {
  // Remove existing notification
  const existing = document.querySelector(".pdf-notification");
  if (existing) existing.remove();

  // Create notification element
  const notification = document.createElement("div");
  notification.className = `pdf-notification pdf-notification-${type}`;
  
  const icons = { success: "✓", error: "✗", warning: "⚠", info: "ℹ" };
  
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${icons[type]}</span>
      <span class="notification-message">${message}</span>
      <button class="notification-close">×</button>
    </div>
  `;
  
  // Add styles
  const style = document.createElement("style");
  if (!document.querySelector("#pdf-notification-styles")) {
    style.id = "pdf-notification-styles";
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
      .pdf-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10001;
        background: ${type === "success" ? "#4caf50" : type === "error" ? "#f44336" : type === "warning" ? "#ff9800" : "#2196f3"};
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease-out;
        max-width: 350px;
      }
      .notification-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .notification-icon {
        font-size: 18px;
        font-weight: bold;
      }
      .notification-close {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        margin-left: 8px;
        opacity: 0.7;
      }
      .notification-close:hover {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Close button handler
  const closeBtn = notification.querySelector(".notification-close");
  closeBtn?.addEventListener("click", () => {
    notification.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  });
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = "slideOut 0.3s ease-out";
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
}

// Also export as default for convenience
export default exportRecipePdf;

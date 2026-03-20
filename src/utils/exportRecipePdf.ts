import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// Enhanced configuration with more options
const CONFIG = {
  scale: 2,
  margin: 6,
  overlapPx: 10,
  imageQuality: 0.75,
  imageFormat: "JPEG",
  maxPages: 20,
  maxFileSize: 10 * 1024 * 1024,
  showProgress: true,
  pageOrientation: "portrait",
  includeTimestamp: true,
  retryAttempts: 2,
  debug: false,
  compressPDF: true,
};

// Add notification styles
function addNotificationStyles() {
  if (document.getElementById("pdf-notification-styles")) return;
  
  const style = document.createElement("style");
  style.id = "pdf-notification-styles";
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    
    .pdf-progress {
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      border-radius: 12px;
      padding: 12px 16px;
      color: white;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      animation: slideIn 0.3s ease-out;
    }
    
    .progress-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .progress-bar-wrapper {
      flex: 1;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      overflow: hidden;
    }
    
    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #4caf50, #8bc34a);
      transition: width 0.3s ease;
      border-radius: 3px;
    }
    
    .progress-text {
      font-size: 13px;
      font-weight: 500;
      min-width: 80px;
      text-align: right;
    }
    
    .pdf-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      padding: 14px 20px;
      border-radius: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      animation: slideIn 0.3s ease-out;
      max-width: 350px;
      backdrop-filter: blur(8px);
    }
    
    .pdf-notification-success {
      background: linear-gradient(135deg, #4caf50, #45a049);
      color: white;
    }
    
    .pdf-notification-error {
      background: linear-gradient(135deg, #f44336, #da190b);
      color: white;
    }
    
    .pdf-notification-warning {
      background: linear-gradient(135deg, #ff9800, #fb8c00);
      color: white;
    }
    
    .pdf-notification-info {
      background: linear-gradient(135deg, #2196f3, #0b7dda);
      color: white;
    }
    
    .notification-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .notification-icon {
      font-size: 18px;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);
}

// Enhanced notification system
function showNotification(message, type = "info") {
  addNotificationStyles();
  
  const existingNotification = document.querySelector(".pdf-notification");
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement("div");
  notification.className = `pdf-notification pdf-notification-${type}`;
  
  const icons = {
    success: "✓",
    error: "✗",
    warning: "⚠",
    info: "ℹ"
  };
  
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${icons[type] || "ℹ"}</span>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Progress bar management
let progressElement = null;

function showProgress(current, total) {
  if (!CONFIG.showProgress) return;
  
  if (!progressElement) {
    progressElement = document.createElement("div");
    progressElement.className = "pdf-progress";
    progressElement.innerHTML = `
      <div class="progress-container">
        <div class="progress-bar-wrapper">
          <div class="progress-bar"></div>
        </div>
        <div class="progress-text">0%</div>
      </div>
    `;
    document.body.appendChild(progressElement);
  }
  
  const percentage = Math.round((current / total) * 100);
  const bar = progressElement.querySelector(".progress-bar");
  const text = progressElement.querySelector(".progress-text");
  
  if (bar) {
    bar.style.width = `${percentage}%`;
  }
  if (text) {
    text.textContent = `${percentage}% (${current}/${total} pages)`;
  }
  
  if (current === total) {
    setTimeout(() => {
      if (progressElement) {
        progressElement.style.animation = "fadeOut 0.3s ease-out";
        setTimeout(() => {
          if (progressElement) {
            progressElement.remove();
            progressElement = null;
          }
        }, 300);
      }
    }, 1000);
  }
}

// Wait for all images to load
function waitForImages(element) {
  const images = Array.from(element.querySelectorAll("img"));
  if (images.length === 0) return Promise.resolve();
  
  const promises = images.map((img) => {
    if (img.complete && img.naturalHeight !== 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => {
        if (CONFIG.debug) console.warn("Failed to load image:", img.src);
        resolve();
      };
      if (img.complete) resolve();
    });
  });
  
  return Promise.all(promises);
}

// Optimize canvas size for mobile devices
function getOptimalScale() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return isMobile ? 1.5 : CONFIG.scale;
}

// Main export function with retry logic
export async function exportRecipePdf(recipeTitle = "recipe", retryCount = 0) {
  const element = document.getElementById("recipe-print-card");
  const btn = document.getElementById("export-btn");
  
  if (!element) {
    showNotification("Recipe card not found. Please check the element ID.", "error");
    return;
  }
  
  const originalBtnText = btn ? btn.innerText : "";
  const originalBtnDisabled = btn ? btn.disabled : false;
  
  if (btn) {
    btn.disabled = true;
    btn.innerText = "⏳ Exporting...";
  }
  
  try {
    showNotification("Preparing recipe card...", "info");
    
    // Wait for images to load
    await waitForImages(element);
    
    if (CONFIG.debug) {
      console.log("Starting PDF export for:", recipeTitle);
      console.log("Element dimensions:", element.offsetWidth, element.offsetHeight);
    }
    
    const optimalScale = getOptimalScale();
    
    const canvas = await html2canvas(element, {
      scale: optimalScale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: CONFIG.debug,
      allowTaint: false,
      foreignObjectRendering: false,
      onclone: (clonedDoc, element) => {
        if (CONFIG.debug) console.log("Document cloned successfully");
        
        // Fix any RTL issues in cloned document
        const clonedElement = clonedDoc.getElementById("recipe-print-card");
        if (clonedElement && document.dir === "rtl") {
          clonedElement.style.direction = "rtl";
        }
      }
    });
    
    const pdf = new jsPDF(
      CONFIG.pageOrientation === "landscape" ? "l" : "p",
      "mm",
      "a4"
    );
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const usableWidth = pageWidth - (CONFIG.margin * 2);
    const usableHeight = pageHeight - (CONFIG.margin * 2);
    
    const pageCanvasHeight = Math.max(
      1,
      Math.floor((canvas.width * usableHeight) / usableWidth)
    );
    
    const totalPages = Math.ceil(canvas.height / (pageCanvasHeight - CONFIG.overlapPx));
    
    if (totalPages > CONFIG.maxPages) {
      showNotification(`Recipe will be split into ${totalPages} pages. First ${CONFIG.maxPages} will be exported.`, "warning");
    }
    
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    const ctx = sliceCanvas.getContext("2d");
    
    if (!ctx) {
      throw new Error("Unable to create canvas context");
    }
    
    let renderedHeight = 0;
    let pageIndex = 0;
    const pageImages = [];
    
    while (renderedHeight < canvas.height) {
      if (pageIndex >= CONFIG.maxPages) {
        if (CONFIG.debug) console.warn(`Max pages (${CONFIG.maxPages}) reached`);
        showNotification(`Exported first ${CONFIG.maxPages} pages only`, "warning");
        break;
      }
      
      showProgress(pageIndex + 1, Math.min(totalPages, CONFIG.maxPages));
      
      const remainingHeight = canvas.height - renderedHeight;
      const sliceHeight = Math.min(pageCanvasHeight, remainingHeight);
      
      sliceCanvas.height = sliceHeight;
      
      // White background for JPEG
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
      
      // Check file size
      const estimatedSize = (pageData.length * 3) / 4;
      if (estimatedSize > CONFIG.maxFileSize) {
        if (CONFIG.debug) console.warn(`Page ${pageIndex + 1} size approaching limit: ${Math.round(estimatedSize / 1024 / 1024)}MB`);
      }
      
      pageImages.push(pageData);
      renderedHeight += Math.max(1, sliceHeight - CONFIG.overlapPx);
      pageIndex += 1;
    }
    
    // Add images to PDF
    for (let i = 0; i < pageImages.length; i++) {
      if (i > 0) pdf.addPage();
      
      const img = new Image();
      img.src = pageImages[i];
      
      await new Promise((resolve) => {
        img.onload = () => {
          const pageImageHeightMm = (img.height * usableWidth) / canvas.width;
          pdf.addImage(
            pageImages[i],
            CONFIG.imageFormat,
            CONFIG.margin,
            CONFIG.margin,
            usableWidth,
            pageImageHeightMm,
            undefined,
            "FAST"
          );
          resolve();
        };
        img.onerror = () => {
          if (CONFIG.debug) console.error("Failed to load image for page", i + 1);
          resolve();
        };
      });
    }
    
    // Generate filename with timestamp
    let fileName = recipeTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    if (CONFIG.includeTimestamp) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
      fileName = `${fileName}_${timestamp}`;
    }
    
    pdf.save(`${fileName}.pdf`);
    
    showNotification(
      `Successfully exported ${pageImages.length} page${pageImages.length !== 1 ? "s" : ""}!`,
      "success"
    );
    
  } catch (error) {
    console.error("PDF export failed:", error);
    
    if (retryCount < CONFIG.retryAttempts) {
      showNotification(`Retrying export... (${retryCount + 1}/${CONFIG.retryAttempts})`, "info");
      setTimeout(() => {
        exportRecipePdf(recipeTitle, retryCount + 1);
      }, 1000);
    } else {
      showNotification(`Export failed: ${error.message || "Unknown error"}`, "error");
    }
  } finally {
    if (btn) {
      btn.disabled = originalBtnDisabled;
      btn.innerText = originalBtnText;
    }
    
    // Clean up progress bar if still showing
    if (progressElement) {
      progressElement.remove();
      progressElement = null;
    }
  }
}

// Export with custom options
export async function exportRecipePdfWithOptions(recipeTitle = "recipe", options = {}) {
  const originalConfig = { ...CONFIG };
  
  // Merge custom options
  Object.assign(CONFIG, options);
  
  try {
    await exportRecipePdf(recipeTitle);
  } finally {
    // Restore original config
    Object.assign(CONFIG, originalConfig);
  }
}

// Preview function
export async function previewPdf(recipeTitle = "recipe") {
  const element = document.getElementById("recipe-print-card");
  
  if (!element) {
    showNotification("Recipe card not found", "error");
    return;
  }
  
  showNotification("Generating preview...", "info");
  
  try {
    await waitForImages(element);
    
    const canvas = await html2canvas(element, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false
    });
    
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 20000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      animation: fadeIn 0.2s ease-out;
    `;
    
    const previewContainer = document.createElement("div");
    previewContainer.style.cssText = `
      background: white;
      border-radius: 16px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: auto;
      padding: 20px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    `;
    
    previewContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0;">Preview: ${recipeTitle}</h3>
        <button id="close-preview-btn" style="
          background: #f44336;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 8px 16px;
          cursor: pointer;
          font-size: 14px;
        ">Close</button>
      </div>
      <img src="${canvas.toDataURL()}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
      <div style="margin-top: 16px; display: flex; gap: 12px; justify-content: flex-end;">
        <button id="export-from-preview" style="
          background: #4caf50;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        ">Export PDF</button>
      </div>
    `;
    
    modal.appendChild(previewContainer);
    document.body.appendChild(modal);
    
    const closeBtn = document.getElementById("close-preview-btn");
    const exportBtn = document.getElementById("export-from-preview");
    
    const closeModal = () => {
      modal.style.animation = "fadeOut 0.2s ease-out";
      setTimeout(() => modal.remove(), 200);
    };
    
    closeBtn.onclick = closeModal;
    exportBtn.onclick = () => {
      closeModal();
      exportRecipePdf(recipeTitle);
    };
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    
  } catch (error) {
    console.error("Preview failed:", error);
    showNotification("Failed to generate preview", "error");
  }
}

// Add fade animations
const fadeStyles = document.createElement("style");
fadeStyles.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(fadeStyles);

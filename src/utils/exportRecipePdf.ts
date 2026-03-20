// src/services/pdfExportService.ts
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export interface PdfExportConfig {
  scale?: number;
  margin?: number;
  overlapPx?: number;
  imageQuality?: number;
  imageFormat?: "JPEG" | "PNG";
  maxPages?: number;
  pageOrientation?: "portrait" | "landscape";
  includeTimestamp?: boolean;
}

export interface ExportProgress {
  current: number;
  total: number;
}

export type NotificationType = "success" | "error" | "warning" | "info";

const DEFAULT_CONFIG: Required<PdfExportConfig> = {
  scale: 2,
  margin: 8,
  overlapPx: 15,
  imageQuality: 0.85,
  imageFormat: "JPEG",
  maxPages: 30,
  pageOrientation: "portrait",
  includeTimestamp: true,
};

export class PdfExportService {
  private config: Required<PdfExportConfig>;

  constructor(config?: PdfExportConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private async waitForImages(element: HTMLElement): Promise<void> {
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

  async exportToPdf(
    elementId: string,
    title: string = "recipe",
    onProgress?: (progress: ExportProgress) => void,
    onNotification?: (message: string, type: NotificationType) => void
  ): Promise<void> {
    const element = document.getElementById(elementId);
    
    if (!element) {
      onNotification?.(`Element with id "${elementId}" not found`, "error");
      throw new Error(`Element "${elementId}" not found`);
    }

    try {
      onNotification?.("Preparing recipe card...", "info");
      await this.waitForImages(element);

      const canvas = await html2canvas(element, {
        scale: this.config.scale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      const pdf = new jsPDF(
        this.config.pageOrientation === "landscape" ? "l" : "p",
        "mm",
        "a4"
      );

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = this.config.margin;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const pageCanvasHeight = Math.floor(
        (canvas.width * usableHeight) / usableWidth
      );

      const totalPages = Math.ceil(
        canvas.height / (pageCanvasHeight - this.config.overlapPx)
      );
      const maxPages = this.config.maxPages;

      if (totalPages > maxPages) {
        onNotification?.(
          `Recipe is very long (${totalPages} pages). Only first ${maxPages} pages will be exported.`,
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
        onProgress?.({
          current: pageIndex + 1,
          total: Math.min(totalPages, maxPages),
        });

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
          `image/${this.config.imageFormat}`,
          this.config.imageQuality
        );

        pages.push(imageData);
        renderedHeight += Math.max(1, sliceHeight - this.config.overlapPx);
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
              this.config.imageFormat,
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
      if (this.config.includeTimestamp) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
        fileName = `${fileName}_${timestamp}`;
      }

      pdf.save(`${fileName}.pdf`);
      onNotification?.(`Successfully exported ${pages.length} page(s)!`, "success");
    } catch (error) {
      onNotification?.(
        `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error"
      );
      throw error;
    }
  }

  async preview(
    elementId: string,
    onNotification?: (message: string, type: NotificationType) => void
  ): Promise<string> {
    const element = document.getElementById(elementId);
    
    if (!element) {
      onNotification?.(`Element with id "${elementId}" not found`, "error");
      throw new Error(`Element "${elementId}" not found`);
    }

    await this.waitForImages(element);

    const canvas = await html2canvas(element, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    return canvas.toDataURL();
  }
}

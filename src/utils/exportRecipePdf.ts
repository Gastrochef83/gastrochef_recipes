import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function exportRecipePdf() {

  const element = document.getElementById("recipe-print-card");

  if (!element) {
    alert("Recipe card not found");
    return;
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff"
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pageCanvasHeight = (canvas.width * pageHeight) / pageWidth;

  let renderedHeight = 0;
  let page = 0;

  while (renderedHeight < canvas.height) {

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.min(pageCanvasHeight, canvas.height - renderedHeight);

    const ctx = pageCanvas.getContext("2d");

    ctx?.drawImage(
      canvas,
      0,
      renderedHeight,
      canvas.width,
      pageCanvas.height,
      0,
      0,
      canvas.width,
      pageCanvas.height
    );

    const pageData = pageCanvas.toDataURL("image/png");

    if (page > 0) pdf.addPage();

    const pageImgHeight = (pageCanvas.height * imgWidth) / canvas.width;

    pdf.addImage(pageData, "PNG", 0, 0, imgWidth, pageImgHeight);

    renderedHeight += pageCanvas.height;
    page++;

  }

  pdf.save("recipe-card.pdf");

}

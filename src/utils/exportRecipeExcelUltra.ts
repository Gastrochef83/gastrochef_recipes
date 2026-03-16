import ExcelJS from "exceljs"
import { saveAs } from "file-saver"

function safeMerge(sheet: ExcelJS.Worksheet, range: string) {
  try {
    const merges: any = (sheet as any)._merges
    if (!merges || !merges[range]) {
      sheet.mergeCells(range)
    }
  } catch (e) {
    // ignore if already merged
  }
}

async function addImageToSheet(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  url: string,
  position: any
) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const buffer = await blob.arrayBuffer()

    const imageId = workbook.addImage({
      buffer,
      extension: "jpeg"
    })

    sheet.addImage(imageId, position)
    return true
  } catch {
    return false
  }
}

export async function exportRecipeExcelUltra(recipe: any) {

  const workbook = new ExcelJS.Workbook()

  /* ---------------- SUMMARY ---------------- */

  const summary = workbook.addWorksheet("Summary")

  summary.columns = [
    { width: 25 },
    { width: 40 }
  ]

  summary.addRow(["Recipe", recipe.name || ""])
  summary.addRow(["Yield", recipe.yield || ""])
  summary.addRow(["Portion", recipe.portion || ""])
  summary.addRow(["Total Cost", recipe.total_cost || ""])
  summary.addRow(["Food Cost %", recipe.food_cost || ""])

  /* ---------------- INGREDIENTS ---------------- */

  const ing = workbook.addWorksheet("Ingredients")

  ing.columns = [
    { header: "Code", key: "code", width: 15 },
    { header: "Ingredient", key: "ingredient", width: 35 },
    { header: "Net", key: "net", width: 10 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Yield %", key: "yield", width: 10 },
    { header: "Gross", key: "gross", width: 12 },
    { header: "Unit Cost", key: "unit_cost", width: 14 },
    { header: "Line Cost", key: "line_cost", width: 14 },
    { header: "Note", key: "note", width: 30 }
  ]

  if (recipe.lines) {
    recipe.lines.forEach((l: any) => {
      ing.addRow({
        code: l.code || "",
        ingredient: l.name || l.ingredient || "",
        net: l.net || "",
        unit: l.unit || "",
        yield: l.yield || "",
        gross: l.gross || "",
        unit_cost: l.unit_cost || "",
        line_cost: l.line_cost || "",
        note: l.note || ""
      })
    })
  }

  /* ---------------- METHOD ---------------- */

  const method = workbook.addWorksheet("Method")

  method.columns = [
    { header: "Step", key: "step", width: 10 },
    { header: "Description", key: "desc", width: 90 }
  ]

  if (recipe.method) {
    recipe.method.forEach((m: any, i: number) => {
      method.addRow({
        step: i + 1,
        desc: m.description || ""
      })
    })
  }

  /* ---------------- PHOTOS ---------------- */

  const photos = workbook.addWorksheet("Photos")

  photos.columns = [
    { width: 40 },
    { width: 40 },
    { width: 40 }
  ]

  let row = 1
  let col = 1

  if (recipe.method) {

    for (const step of recipe.method) {

      const colLetter = String.fromCharCode(64 + col)

      photos.getCell(`${colLetter}${row}`).value = `Step ${step.step || ""}`

      const descRow = row + 12

      safeMerge(
        photos,
        `${colLetter}${descRow}:${colLetter}${descRow + 3}`
      )

      photos.getCell(`${colLetter}${descRow}`).value =
        step.description || ""

      if (step.photo_url) {

        const added = await addImageToSheet(
          workbook,
          photos,
          step.photo_url,
          {
            col: col - 1 + 0.1,
            row: row + 1,
            width: 360,
            height: 240
          }
        )

        if (!added) {
          photos.getCell(`${colLetter}${row + 6}`).value = "No photo"
        }
      }

      col++

      if (col > 3) {
        col = 1
        row += 18
      }
    }
  }

  /* ---------------- EXPORT ---------------- */

  const buffer = await workbook.xlsx.writeBuffer()

  const blob = new Blob(
    [buffer],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  )

  saveAs(blob, `${recipe.name || "recipe"}-Ultra Export.xlsx`)
}

import ExcelJS from "exceljs"
import { saveAs } from "file-saver"

type Line = {
  code?: string
  ingredient?: string
  net?: number
  unit?: string
  yield?: number
  gross?: number
  unit_cost?: number
  line_cost?: number
  note?: string
}

type MethodStep = {
  step?: number
  description?: string
  photo_url?: string | null
}

type Recipe = {
  name?: string
  yield?: number
  portion?: number
  cost?: number
  food_cost?: number
  lines?: Line[]
  method?: MethodStep[]
  photos?: MethodStep[]
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
  } catch (e) {
    return false
  }
}

export async function exportRecipeExcelUltra(recipe: Recipe) {
  const workbook = new ExcelJS.Workbook()

  const summarySheet = workbook.addWorksheet("Summary")
  const ingredientsSheet = workbook.addWorksheet("Ingredients")
  const methodSheet = workbook.addWorksheet("Method")
  const photosSheet = workbook.addWorksheet("Photos")

  // SUMMARY

  summarySheet.columns = [
    { width: 30 },
    { width: 20 }
  ]

  summarySheet.addRow(["Recipe", recipe.name || ""])
  summarySheet.addRow(["Yield", recipe.yield || ""])
  summarySheet.addRow(["Portion", recipe.portion || ""])
  summarySheet.addRow(["Cost", recipe.cost || ""])
  summarySheet.addRow(["Food Cost %", recipe.food_cost || ""])

  // INGREDIENTS

  ingredientsSheet.columns = [
    { header: "Code", key: "code", width: 15 },
    { header: "Ingredient", key: "ingredient", width: 30 },
    { header: "Net", key: "net", width: 10 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Yield %", key: "yield", width: 10 },
    { header: "Gross", key: "gross", width: 10 },
    { header: "Unit Cost", key: "unit_cost", width: 12 },
    { header: "Line Cost", key: "line_cost", width: 12 },
    { header: "Note", key: "note", width: 30 }
  ]

  if (recipe.lines) {
    recipe.lines.forEach(line => {
      ingredientsSheet.addRow({
        code: line.code || "",
        ingredient: line.ingredient || "",
        net: line.net || "",
        unit: line.unit || "",
        yield: line.yield || "",
        gross: line.gross || "",
        unit_cost: line.unit_cost || "",
        line_cost: line.line_cost || "",
        note: line.note || ""
      })
    })
  }

  // METHOD

  methodSheet.columns = [
    { header: "Step", key: "step", width: 10 },
    { header: "Description", key: "description", width: 80 }
  ]

  if (recipe.method) {
    recipe.method.forEach(step => {
      methodSheet.addRow({
        step: step.step || "",
        description: step.description || ""
      })
    })
  }

  // PHOTOS

  photosSheet.columns = [
    { width: 40 },
    { width: 40 },
    { width: 40 }
  ]

  if (recipe.photos && recipe.photos.length > 0) {
    let row = 1

    for (let i = 0; i < recipe.photos.length; i++) {
      const photo = recipe.photos[i]

      const col = (i % 3) + 1
      const colLetter = String.fromCharCode(64 + col)

      const stepCell = photosSheet.getCell(`${colLetter}${row}`)
      stepCell.value = `Step ${photo.step}`

      const descRow = row + 12
      const descCell = photosSheet.getCell(`${colLetter}${descRow}`)
      descCell.value = photo.description || ""

      // merge description only (fix for merge error)

      photosSheet.mergeCells(
        `${colLetter}${descRow}:${colLetter}${descRow + 3}`
      )

      if (photo.photo_url) {
        await addImageToSheet(
          workbook,
          photosSheet,
          photo.photo_url,
          {
            col: col - 1 + 0.1,
            row: row + 1,
            width: 380,
            height: 240
          }
        )
      }

      if (col === 3) {
        row += 18
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()

  const blob = new Blob([buffer], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  })

  saveAs(blob, `${recipe.name || "recipe"}-Ultra Export.xlsx`)
}

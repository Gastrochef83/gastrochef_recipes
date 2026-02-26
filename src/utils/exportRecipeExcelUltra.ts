import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

export type ExcelRecipeMeta = {
  id?: string
  name: string
  category?: string | null
  portions?: number | null
  yield_qty?: number | null
  yield_unit?: string | null
  currency?: string | null
  selling_price?: number | null
  target_food_cost_pct?: number | null
  description?: string | null
  steps?: string[] | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
}

export type ExcelLineRow = {
  type: 'ingredient' | 'subrecipe'
  name: string
  net_qty: number
  unit: string
  yield_percent: number
  gross_qty: number
  unit_cost: number
  line_cost: number
  notes?: string | null
  warnings?: string[]
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}

function safeNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function toTitle(s: string) {
  const t = (s || '').trim()
  return t ? t : 'Recipe'
}

function fmtPercent(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return ''
  return `${n.toFixed(1)}%`
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
  // btoa is available in browsers
  return btoa(binary)
}

async function tryAddLogo(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  opts?: { col?: number; row?: number; width?: number; height?: number },
) {
  try {
    // We try common asset paths (one of them will exist depending on your build)
    const candidates = ['/gastrochef-logo.png', '/logo.png', '/logo.svg']
    let ab: ArrayBuffer | null = null
    let mime: 'image/png' | 'image/jpeg' = 'image/png'

    for (const url of candidates) {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('jpeg') || ct.includes('jpg')) mime = 'image/jpeg'
      // SVG isn't supported reliably for Excel images, so prefer PNG/JPG
      if (ct.includes('svg')) continue
      ab = await res.arrayBuffer()
      break
    }

    if (!ab) return

    const base64 = arrayBufferToBase64(ab)
    const imgId = workbook.addImage({ base64, extension: mime === 'image/jpeg' ? 'jpeg' : 'png' })

    const col = opts?.col ?? 0.1
    const row = opts?.row ?? 0.1
    const width = opts?.width ?? 78
    const height = opts?.height ?? 78

    // Place logo top-left (small, non-overlapping)
    sheet.addImage(imgId, {
      tl: { col, row },
      ext: { width, height },
    })
  } catch {
    // ignore (export must still work)
  }
}

export async function exportRecipeExcelUltra(args: {
  meta: ExcelRecipeMeta
  totals: { totalCost: number; cpp: number; fcPct: number | null; margin: number; marginPct: number | null }
  lines: ExcelLineRow[]
}) {
  const { meta, totals, lines } = args

  const name = toTitle(meta.name)
  const currency = (meta.currency || 'USD').toUpperCase()
  const portions = Math.max(1, Math.floor(safeNum(meta.portions, 1)))
  const yieldQty = safeNum(meta.yield_qty, 0) || null
  const yieldUnit = (meta.yield_unit || '').trim() || null
  const sell = safeNum(meta.selling_price, 0)
  const targetFc = meta.target_food_cost_pct != null ? clamp(safeNum(meta.target_food_cost_pct, 0), 0, 100) : null

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GastroChef'
  workbook.created = new Date()

  // =======================
  // Sheet: Summary
  // =======================
  const summary = workbook.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  })

  summary.columns = [{ width: 22 }, { width: 34 }, { width: 18 }, { width: 22 }]

  // Provide vertical breathing room so the logo never overlaps text
  summary.getRow(1).height = 28
  summary.getRow(2).height = 18
  summary.getRow(3).height = 10
  summary.getRow(4).height = 10
  summary.getRow(5).height = 28

  await tryAddLogo(workbook, summary, { col: 0.15, row: 0.15, width: 76, height: 76 })

  // Title area
  summary.mergeCells('B1:D1')
  summary.getCell('B1').value = 'GastroChef'
  summary.getCell('B1').font = { name: 'Calibri', size: 18, bold: true }
  summary.getCell('B1').alignment = { vertical: 'middle', horizontal: 'left' }

  summary.mergeCells('B2:D2')
  summary.getCell('B2').value = 'Kitchen Intelligence — Recipe Export'
  summary.getCell('B2').font = { name: 'Calibri', size: 11, color: { argb: 'FF64748B' } }
  summary.getCell('B2').alignment = { vertical: 'middle', horizontal: 'left' }

  // Recipe title (pushed down to guarantee no overlap)
  summary.mergeCells('A5:D5')
  summary.getCell('A5').value = name
  summary.getCell('A5').font = { name: 'Calibri', size: 20, bold: true }
  summary.getCell('A5').alignment = { vertical: 'middle', horizontal: 'left' }

  // Key-Value block helper
  const kv = (row: number, label: string, value: any) => {
    summary.getCell(`A${row}`).value = label
    summary.getCell(`A${row}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
    summary.getCell(`B${row}`).value = value ?? ''
    summary.getCell(`B${row}`).font = { name: 'Calibri', size: 11 }
    summary.mergeCells(`B${row}:D${row}`)
    summary.getCell(`B${row}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  }

  let r = 7
  kv(r++, 'Category', meta.category || '')
  kv(r++, 'Portions', portions)
  kv(r++, 'Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '')
  kv(r++, 'Currency', currency)
  kv(r++, 'Selling Price', sell > 0 ? sell : '')
  kv(r++, 'Target FC%', targetFc != null ? fmtPercent(targetFc) : '')

  r++ // spacer

  kv(r++, 'Total Cost', totals.totalCost)
  kv(r++, 'Cost / Portion', totals.cpp)
  kv(r++, 'FC%', totals.fcPct != null ? totals.fcPct / 100 : null)
  kv(r++, 'Margin', totals.margin)
  kv(r++, 'Margin %', totals.marginPct != null ? totals.marginPct / 100 : null)

  // Formats
  // NOTE: These rows are dynamic (because we shifted the header down).
  // We derive the addresses from the known KPI block start row.
  const kpiStartRow = 14 // Total Cost row after the shift
  const moneyAddrs = [`B${kpiStartRow}`, `B${kpiStartRow + 1}`, `B${kpiStartRow + 3}`]
  for (const addr of moneyAddrs) {
    const c = summary.getCell(addr)
    if (typeof c.value === 'number') c.numFmt = `"${currency}" #,##0.00`
  }
  ;[`B${kpiStartRow + 2}`, `B${kpiStartRow + 4}`].forEach((addr) => {
    const c = summary.getCell(addr)
    if (typeof c.value === 'number') c.numFmt = '0.0%'
  })

  // Description block
  const desc = (meta.description || '').trim()
  if (desc) {
    summary.getCell('A19').value = 'Description'
    summary.getCell('A19').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
    summary.mergeCells('A20:D24')
    summary.getCell('A20').value = desc
    summary.getCell('A20').alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
    summary.getCell('A20').font = { name: 'Calibri', size: 11 }
    summary.getCell('A20').border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }
  }

  // =======================
  // Sheet: Ingredients
  // =======================
  const ingSheet = workbook.addWorksheet('Ingredients', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  ingSheet.columns = [
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Name', key: 'name', width: 34 },
    { header: 'Net Qty', key: 'net', width: 12 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Yield %', key: 'yield', width: 10 },
    { header: 'Gross Qty', key: 'gross', width: 12 },
    { header: 'Unit Cost', key: 'unitCost', width: 14 },
    { header: 'Line Cost', key: 'lineCost', width: 14 },
    { header: 'Notes', key: 'notes', width: 26 },
    { header: 'Warnings', key: 'warnings', width: 28 },
  ]

  // Header style
  const headerRow = ingSheet.getRow(1)
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 18
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
  })

  for (const row of lines) {
    const warnings = (row.warnings || []).join(', ')
    const r = ingSheet.addRow({
      type: row.type,
      name: row.name,
      net: row.net_qty,
      unit: row.unit,
      yield: row.yield_percent / 100,
      gross: row.gross_qty,
      unitCost: row.unit_cost,
      lineCost: row.line_cost,
      notes: row.notes || '',
      warnings,
    })

    r.getCell('yield').numFmt = '0.0%'
    ;['net', 'gross'].forEach((k) => {
      const c = r.getCell(k)
      if (typeof c.value === 'number') c.numFmt = '#,##0.000'
    })
    ;['unitCost', 'lineCost'].forEach((k) => {
      const c = r.getCell(k)
      if (typeof c.value === 'number') c.numFmt = `"${currency}" #,##0.000`
    })

    // borders
    r.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      }
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    })
    r.height = 18
  }

  // Totals footer
  const last = ingSheet.lastRow ? ingSheet.lastRow.number : 1
  const footer = ingSheet.addRow({
    name: 'TOTAL',
    lineCost: totals.totalCost,
  } as any)
  footer.font = { name: 'Calibri', size: 11, bold: true }
  footer.getCell('lineCost').numFmt = `"${currency}" #,##0.00`
  footer.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  })
  void last

  // =======================
  // Sheet: Method
  // =======================
  const method = workbook.addWorksheet('Method', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  method.columns = [{ width: 10 }, { width: 70 }]

  method.getCell('A1').value = name
  method.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  method.mergeCells('A1:B1')

  method.getCell('A3').value = 'Steps'
  method.getCell('A3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
  method.mergeCells('A3:B3')

  const steps = (meta.steps || []).map((s) => (s || '').trim()).filter(Boolean)
  let rowIdx = 5
  if (steps.length) {
    for (let i = 0; i < steps.length; i++) {
      method.getCell(`A${rowIdx}`).value = `${i + 1}.`
      method.getCell(`A${rowIdx}`).alignment = { vertical: 'top', horizontal: 'right' }
      method.getCell(`A${rowIdx}`).font = { name: 'Calibri', size: 11, bold: true }

      method.getCell(`B${rowIdx}`).value = steps[i]
      method.getCell(`B${rowIdx}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
      method.getCell(`B${rowIdx}`).font = { name: 'Calibri', size: 11 }
      rowIdx++
    }
  } else {
    method.getCell('A5').value = '—'
    method.getCell('B5').value = 'No steps provided.'
  }

  // =======================
  // Sheet: Nutrition
  // =======================
  const nut = workbook.addWorksheet('Nutrition', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  nut.columns = [{ width: 28 }, { width: 22 }]

  nut.getCell('A1').value = name
  nut.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  nut.mergeCells('A1:B1')

  const nkv = (row: number, label: string, value: any) => {
    nut.getCell(`A${row}`).value = label
    nut.getCell(`A${row}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
    nut.getCell(`B${row}`).value = value ?? ''
    nut.getCell(`B${row}`).font = { name: 'Calibri', size: 11 }
  }

  nkv(3, 'Calories', meta.calories ?? '')
  nkv(4, 'Protein (g)', meta.protein_g ?? '')
  nkv(5, 'Carbs (g)', meta.carbs_g ?? '')
  nkv(6, 'Fat (g)', meta.fat_g ?? '')

  // Export
  const buf = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `${name.replace(/[\\/:*?"<>|]+/g, '_')}.xlsx`)
}

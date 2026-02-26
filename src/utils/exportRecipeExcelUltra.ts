import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import QRCode from 'qrcode'

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

function dataUrlToBase64Png(dataUrl: string) {
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/)
  return m ? m[1] : null
}

function safeFileName(name: string) {
  const base = (name || 'recipe').trim().replace(/\s+/g, ' ')
  return base
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\.+$/g, '')
    .slice(0, 80)
    .trim() || 'recipe'
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

async function tryAddQr(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  payload: string,
  opts?: { col?: number; row?: number; size?: number },
) {
  try {
    const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 256, errorCorrectionLevel: 'M' })
    const base64 = dataUrlToBase64Png(dataUrl)
    if (!base64) return
    const imgId = workbook.addImage({ base64, extension: 'png' })
    const col = opts?.col ?? 3.15
    const row = opts?.row ?? 1.1
    const size = opts?.size ?? 86
    sheet.addImage(imgId, { tl: { col, row }, ext: { width: size, height: size } })
  } catch {
    // ignore
  }
}

function applyWatermark(sheet: ExcelJS.Worksheet, text: string) {
  try {
    sheet.mergeCells('A20:D26')
    const c = sheet.getCell('A20')
    c.value = text
    c.font = { name: 'Calibri', size: 44, bold: true, color: { argb: '11CBD5E1' } }
    c.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 45 }
  } catch {
    // ignore
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

  const now = new Date()
  const reportId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const recipeId = meta.id ? String(meta.id) : ''

  // =======================
  // Sheet: Summary
  // =======================
  const summary = workbook.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  })

  summary.columns = [{ width: 22 }, { width: 34 }, { width: 18 }, { width: 22 }]

  // Print + header/footer (Client Report Edition)
  summary.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 }
  summary.headerFooter.oddHeader = `&C&"Calibri,Bold"&12GastroChef — Client Report`
  summary.headerFooter.oddFooter = `&L&8Report: ${reportId}${recipeId ? `  |  Recipe: ${recipeId}` : ''}&R&8CONFIDENTIAL  |  ${now.toLocaleDateString()}`

  // Header (Kitopi-style)
  summary.getRow(1).height = 20
  summary.getRow(2).height = 56
  summary.getRow(3).height = 24
  summary.getRow(4).height = 6
  summary.getRow(5).height = 16
  summary.getRow(6).height = 10
  summary.getRow(7).height = 30

  // Centered logo (no overlap)
  await tryAddLogo(workbook, summary, { col: 1.55, row: 1.05, width: 64, height: 64 })

  // QR (links to app route if available)
  const baseUrl = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : ''
  const qrPayload = recipeId && baseUrl ? `${baseUrl}/#/recipe?id=${encodeURIComponent(recipeId)}` : (recipeId ? `GastroChef Recipe: ${recipeId}` : `GastroChef Recipe: ${name}`)
  await tryAddQr(workbook, summary, qrPayload, { col: 3.25, row: 1.05, size: 72 })

  // Wordmark (center)
  summary.mergeCells('A3:D3')
  summary.getCell('A3').value = 'GastroChef'
  summary.getCell('A3').font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF0F172A' } }
  summary.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' }

  // Accent line
  summary.mergeCells('B4:C4')
  summary.getCell('A4').value = ''
  summary.getCell('D4').value = ''
  summary.getCell('A4').value = ''
  summary.getCell('B4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
  summary.getCell('C4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }

  // Subtitle (center)
  summary.mergeCells('A5:D5')
  summary.getCell('A5').value = 'Kitchen Intelligence — Recipe Export'
  summary.getCell('A5').font = { name: 'Calibri', size: 11, color: { argb: 'FF475569' } }
  summary.getCell('A5').alignment = { vertical: 'middle', horizontal: 'center' }

  // Report meta row
  summary.mergeCells('A6:D6')
  summary.getCell('A6').value = `Report ID: ${reportId}${recipeId ? `   |   Recipe ID: ${recipeId}` : ''}`
  summary.getCell('A6').font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } }
  summary.getCell('A6').alignment = { vertical: 'middle', horizontal: 'center' }

  // Recipe title
  summary.mergeCells('A7:D7')
  summary.getCell('A7').value = name
  summary.getCell('A7').font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF0F172A' } }
  summary.getCell('A7').alignment = { vertical: 'middle', horizontal: 'left' }


    // Key-Value block helper
  const kv = (row: number, label: string, value: any) => {
    summary.getCell(`A${row}`).value = label
    summary.getCell(`A${row}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
    summary.getCell(`B${row}`).value = value ?? ''
    summary.getCell(`B${row}`).font = { name: 'Calibri', size: 11 }
    summary.mergeCells(`B${row}:D${row}`)
    summary.getCell(`B${row}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  }

  let r = 9
  kv(r++, 'Category', meta.category || '')
  kv(r++, 'Portions', portions)
  kv(r++, 'Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '')
  kv(r++, 'Currency', currency)
  kv(r++, 'Selling Price', sell > 0 ? sell : '')
  kv(r++, 'Target FC%', targetFc != null ? fmtPercent(targetFc) : '')

  r++ // spacer


  // KPI cards (Kitopi-style)
  const kpiTop = r

  const card = (
    topRow: number,
    left: 'A' | 'C',
    title: string,
    value: number | null,
    opts?: { isPercent?: boolean; accent?: boolean; note?: string },
  ) => {
    const col1 = left
    const col2 = left === 'A' ? 'B' : 'D'
    const r1 = topRow
    const r2 = topRow + 2

    summary.mergeCells(`${col1}${r1}:${col2}${r2}`)
    const base = summary.getCell(`${col1}${r1}`)
    base.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
    base.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: opts?.accent ? 'FF0F766E' : 'FFF8FAFC' },
    }
    base.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }

    // Title
    const t = summary.getCell(`${col1}${r1}`)
    t.value = title
    t.font = { name: 'Calibri', size: 11, bold: true, color: { argb: opts?.accent ? 'FFFFFFFF' : 'FF0F172A' } }

    // Value
    const vRow = r1 + 1
    summary.getCell(`${col1}${vRow}`).value = value == null ? '' : value
    summary.getCell(`${col1}${vRow}`).font = { name: 'Calibri', size: 16, bold: true, color: { argb: opts?.accent ? 'FFFFFFFF' : 'FF0F172A' } }
    summary.getCell(`${col1}${vRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
    if (opts?.isPercent) summary.getCell(`${col1}${vRow}`).numFmt = '0.0%'
    else summary.getCell(`${col1}${vRow}`).numFmt = '#,##0.00'

    // Note
    if (opts?.note) {
      const nRow = r1 + 2
      summary.getCell(`${col1}${nRow}`).value = opts.note
      summary.getCell(`${col1}${nRow}`).font = { name: 'Calibri', size: 9, color: { argb: opts?.accent ? 'FFE2E8F0' : 'FF64748B' } }
      summary.getCell(`${col1}${nRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
    }
  }

  // layout rows height
  summary.getRow(kpiTop).height = 18
  summary.getRow(kpiTop + 1).height = 20
  summary.getRow(kpiTop + 2).height = 16
  summary.getRow(kpiTop + 3).height = 18
  summary.getRow(kpiTop + 4).height = 20
  summary.getRow(kpiTop + 5).height = 16

  card(kpiTop, 'A', `Total Cost (${currency})`, totals.totalCost, { accent: true, note: 'Recipe total' })
  card(kpiTop, 'C', `Cost / Portion (${currency})`, totals.cpp, { note: 'Per serving' })
  card(kpiTop + 3, 'A', 'FC%', totals.fcPct != null ? totals.fcPct / 100 : null, { isPercent: true, note: targetFc != null ? `Target: ${fmtPercent(targetFc)}` : '' })
  card(kpiTop + 3, 'C', `Margin (${currency})`, totals.margin, { note: totals.marginPct != null ? `Margin: ${totals.marginPct.toFixed(1)}%` : '' })

  r = kpiTop + 7



  // Watermark + signature
  applyWatermark(summary, 'CONFIDENTIAL')

  const sigRow = Math.max(r + 2, 28)
  summary.getCell(`A${sigRow}`).value = 'Prepared by:'
  summary.getCell(`A${sigRow}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
  summary.mergeCells(`B${sigRow}:C${sigRow}`)
  summary.getCell(`B${sigRow}`).value = '__________________________'
  summary.getCell(`B${sigRow}`).font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } }
  summary.getCell(`D${sigRow}`).value = `Date: ${now.toLocaleDateString()}`
  summary.getCell(`D${sigRow}`).font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } }

  const sigRow2 = sigRow + 1
  summary.getCell(`A${sigRow2}`).value = 'Approved:'
  summary.getCell(`A${sigRow2}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
  summary.mergeCells(`B${sigRow2}:C${sigRow2}`)
  summary.getCell(`B${sigRow2}`).value = '__________________________'
  summary.getCell(`B${sigRow2}`).font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } }

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
  const cur = (meta.currency || 'USD').toUpperCase()
  const stamp = new Date().toISOString().slice(0, 10)
  const fileName = `${safeFileName(name)} — GastroChef (${cur}) — ${stamp}.xlsx`
  saveAs(blob, fileName)
}

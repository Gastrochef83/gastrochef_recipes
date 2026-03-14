import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import QRCode from 'qrcode'

// ================= Types =================
export type ExcelRecipeMeta = {
  id?: string
  code?: string | null
  kitchen_id?: string | null
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
  step_photos?: string[] | null
  photo_url?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
}

export type ExcelLineRow = {
  type: 'ingredient' | 'subrecipe'
  code?: string | null
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

// ================= Helpers =================
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
  return btoa(binary)
}

function dataUrlToBase64(dataUrl: string) {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/)
  if (!m) return null
  return {
    extension: m[1] === 'jpg' ? 'jpeg' : (m[1] as 'png' | 'jpeg'),
    base64: m[2],
  }
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_')
}

// ================= Styling =================
const COLORS = {
  primary: 'FF0F766E',
  primaryLight: 'FFF0FDFA',
  header: 'FFE2E8F0',
  border: 'FFCBD5E1',
  text: 'FF0F172A',
  textMuted: 'FF64748B',
  warning: 'FFFEF3C7',
  danger: 'FFFEE2E2',
  white: 'FFFFFFFF',
  bgSoft: 'FFF8FAFC',
}

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function thinBorder(cell: ExcelJS.Cell, color = COLORS.border) {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  }
}

function applyHeaderStyle(cell: ExcelJS.Cell) {
  fill(cell, COLORS.header)
  thinBorder(cell)
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.text } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

function moneyFmt(currency: string, decimals = 2) {
  const zeroes = '0'.repeat(Math.max(0, decimals))
  return `"${currency}" #,##0${decimals > 0 ? `.${zeroes}` : ''}`
}

// ================= Image Handling =================
async function fetchImageForExcel(url: string): Promise<{ base64: string; extension: 'png' | 'jpeg' } | null> {
  try {
    const finalUrl = (url || '').trim()
    if (!finalUrl) return null
    if (finalUrl.startsWith('data:image/')) {
      return dataUrlToBase64(finalUrl)
    }
    const res = await fetch(finalUrl, { cache: 'no-store', mode: 'cors' })
    if (!res.ok) return null
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('png') && !contentType.includes('jpeg') && !contentType.includes('jpg')) {
      return null
    }
    const ab = await res.arrayBuffer()
    const base64 = arrayBufferToBase64(ab)
    const extension: 'png' | 'jpeg' = contentType.includes('png') ? 'png' : 'jpeg'
    return { base64, extension }
  } catch {
    return null
  }
}

async function addImageFromUrl(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  url: string | null | undefined,
  opts: { col: number; row: number; width: number; height: number },
) {
  const img = await fetchImageForExcel(url || '')
  if (!img) return false
  const imgId = workbook.addImage({ base64: img.base64, extension: img.extension })
  sheet.addImage(imgId, {
    tl: { col: opts.col, row: opts.row },
    ext: { width: opts.width, height: opts.height },
  })
  return true
}

async function tryAddLogo(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  opts?: { col?: number; row?: number; width?: number; height?: number },
) {
  try {
    const candidates = ['/gastrochef-logo.png', '/logo.png']
    for (const url of candidates) {
      const ok = await addImageFromUrl(workbook, sheet, url, {
        col: opts?.col ?? 0.1,
        row: opts?.row ?? 0.1,
        width: opts?.width ?? 78,
        height: opts?.height ?? 78,
      })
      if (ok) return
    }
  } catch {
    // ignore
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
    const parsed = dataUrlToBase64(dataUrl)
    if (!parsed) return
    const imgId = workbook.addImage({ base64: parsed.base64, extension: parsed.extension })
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
    sheet.mergeCells('A22:D28')
    const c = sheet.getCell('A22')
    c.value = text
    c.font = { name: 'Calibri', size: 42, bold: true, color: { argb: '11CBD5E1' } }
    c.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 45 }
  } catch {
    // ignore
  }
}

function autosizeColumns(sheet: ExcelJS.Worksheet, min = 10, max = 40) {
  sheet.columns?.forEach((column) => {
    let longest = min
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const raw = cell.value
      const text = typeof raw === 'object' && raw != null && 'richText' in raw
        ? (raw as any).richText?.map((x: any) => x.text).join('') || ''
        : String(raw ?? '')
      const candidate = text.split('\n').reduce((acc, line) => Math.max(acc, line.length), 0)
      longest = Math.max(longest, Math.min(max, candidate + 2))
    })
    column.width = Math.max(min, Math.min(max, longest))
  })
}

function normalizeStepPhotos(steps: string[], photos: string[] | null | undefined) {
  const cleanPhotos = (photos || []).map((x) => (x || '').trim())
  return steps.map((_, i) => cleanPhotos[i] || '')
}

// ================= Photo Card Builder (Single Sheet) =================
async function createPhotoCard(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  title: string,
  description: string,
  imageUrl: string | null,
) {
  const colLetter = String.fromCharCode(65 + startCol)
  const mergeRange = `${colLetter}${startRow}:${String.fromCharCode(65 + startCol + 1)}${startRow + 11}`
  
  // 1. Create card border and background
  sheet.mergeCells(mergeRange)
  const cardCell = sheet.getCell(`${colLetter}${startRow}`)
  fill(cardCell, COLORS.white)
  cardCell.border = {
    top: { style: 'medium', color: { argb: COLORS.border } },
    left: { style: 'medium', color: { argb: COLORS.border } },
    bottom: { style: 'medium', color: { argb: COLORS.border } },
    right: { style: 'medium', color: { argb: COLORS.border } },
  }

  // 2. Title header
  const titleCell = sheet.getCell(`${colLetter}${startRow}`)
  titleCell.value = title
  titleCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.primary } }
  titleCell.alignment = { horizontal: 'center', vertical: 'bottom' }
  fill(titleCell, COLORS.primaryLight)

  // 3. Image
  if (imageUrl) {
    const img = await fetchImageForExcel(imageUrl)
    if (img) {
      const imgId = workbook.addImage({ base64: img.base64, extension: img.extension })
      sheet.addImage(imgId, {
        tl: { col: startCol + 0.1, row: startRow + 1.2 },
        ext: { width: 390, height: 260 },
        editAs: 'oneCell',
      })
    } else {
      const placeholderCell = sheet.getCell(`${colLetter}${startRow + 2}`)
      placeholderCell.value = '📷 Image not available'
      placeholderCell.alignment = { horizontal: 'center', vertical: 'middle' }
      placeholderCell.font = { color: { argb: COLORS.textMuted } }
    }
  }

  // 4. Description caption
  const captionRow = startRow + 10
  const captionCell = sheet.getCell(`${colLetter}${captionRow}`)
  captionCell.value = description || 'No description'
  captionCell.font = { name: 'Calibri', size: 10, color: { argb: COLORS.textMuted } }
  captionCell.alignment = { horizontal: 'left', vertical: 'bottom', wrapText: true }
}

// ================= Main Export Function =================
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
  const cleanSteps = (meta.steps || []).map((s) => (s || '').trim()).filter(Boolean)
  const stepPhotos = normalizeStepPhotos(cleanSteps, meta.step_photos)

  // --- Workbook Setup ---
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GastroChef'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.company = 'GastroChef'
  workbook.subject = `${name} recipe export`
  workbook.title = `${name} — Ultra Professional Export`
  workbook.properties = {
    keywords: 'recipe, costing, kitchen, management, gastrochef',
    description: `Professional recipe export for ${name}`,
  }

  const now = new Date()
  const reportId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const recipeId = meta.id ? String(meta.id) : ''
  const recipeCode = meta.code ? String(meta.code) : ''
  const kitchenRef = meta.kitchen_id ? String(meta.kitchen_id) : ''
  const auditStamp = (() => {
    const id6 = recipeId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'XXXXXX'
    const ymd = reportId.slice(0, 8)
    const hm = reportId.slice(-4)
    return `GC-${ymd}-${hm}-${id6}`
  })()

  const baseUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
  const qrPayload = recipeId && baseUrl ? `${baseUrl}/#/recipe?id=${encodeURIComponent(recipeId)}` : (recipeId ? `GastroChef Recipe: ${recipeId}` : `GastroChef Recipe: ${name}`)

  const totalWarnings = lines.reduce((acc, line) => acc + (line.warnings?.length || 0), 0)
  const ingredientCost = lines.filter((l) => l.type === 'ingredient').reduce((acc, l) => acc + safeNum(l.line_cost), 0)
  const subrecipeCost = lines.filter((l) => l.type === 'subrecipe').reduce((acc, l) => acc + safeNum(l.line_cost), 0)

  // ================= 1. SUMMARY SHEET =================
  const summary = workbook.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  })

  summary.columns = [{ width: 20 }, { width: 28 }, { width: 20 }, { width: 28 }]
  summary.pageSetup.margins = { left: 0.45, right: 0.45, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 }
  summary.pageSetup.printTitlesRow = '1:3'
  summary.headerFooter.oddHeader = `&C&"Calibri,Bold"&12GastroChef — Ultra Recipe Export`
  summary.headerFooter.oddFooter = `&L&8Report: ${reportId}${recipeCode ? `  |  Code: ${recipeCode}` : ''}${recipeId ? `  |  Recipe: ${recipeId}` : ''}  |  Audit: ${auditStamp}&R&8Page &P / &N`

  summary.getRow(1).height = 18
  summary.getRow(2).height = 54
  summary.getRow(3).height = 24
  summary.getRow(4).height = 8
  summary.getRow(5).height = 16
  summary.getRow(6).height = 10
  summary.getRow(7).height = 30

  await tryAddLogo(workbook, summary, { col: 0.8, row: 1.0, width: 58, height: 58 })
  await tryAddQr(workbook, summary, qrPayload, { col: 3.2, row: 1.0, size: 72 })

  summary.mergeCells('A3:D3')
  summary.getCell('A3').value = 'GastroChef'
  summary.getCell('A3').font = { name: 'Calibri', size: 20, bold: true, color: { argb: COLORS.text } }
  summary.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' }

  summary.mergeCells('B4:C4')
  fill(summary.getCell('B4'), COLORS.primary)
  fill(summary.getCell('C4'), COLORS.primary)

  summary.mergeCells('A5:D5')
  summary.getCell('A5').value = 'Kitchen Intelligence — Costing, Nutrition, Method & Images'
  summary.getCell('A5').font = { name: 'Calibri', size: 11, color: { argb: COLORS.textMuted } }
  summary.getCell('A5').alignment = { vertical: 'middle', horizontal: 'center' }

  summary.mergeCells('A6:D6')
  summary.getCell('A6').value = `Report ID: ${reportId}${recipeId ? `   |   Recipe ID: ${recipeId}` : ''}`
  summary.getCell('A6').font = { name: 'Calibri', size: 9, color: { argb: COLORS.textMuted } }
  summary.getCell('A6').alignment = { vertical: 'middle', horizontal: 'center' }

  summary.mergeCells('A7:D7')
  summary.getCell('A7').value = name
  summary.getCell('A7').font = { name: 'Calibri', size: 22, bold: true, color: { argb: COLORS.text } }
  summary.getCell('A7').alignment = { vertical: 'middle', horizontal: 'left' }

  const kv = (row: number, label: string, value: any) => {
    summary.getCell(`A${row}`).value = label
    summary.getCell(`A${row}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textMuted } }
    summary.getCell(`B${row}`).value = value ?? ''
    summary.getCell(`B${row}`).font = { name: 'Calibri', size: 11 }
    summary.mergeCells(`B${row}:D${row}`)
    summary.getCell(`B${row}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
  }

  let r = 9
  kv(r++, 'Code', recipeCode)
  kv(r++, 'Kitchen Ref', kitchenRef)
  kv(r++, 'Audit Stamp', auditStamp)
  kv(r++, 'Category', meta.category || '')
  kv(r++, 'Portions', portions)
  kv(r++, 'Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '')
  kv(r++, 'Currency', currency)
  kv(r++, 'Selling Price', sell > 0 ? sell : '')
  kv(r++, 'Target FC%', targetFc != null ? fmtPercent(targetFc) : '')
  kv(r++, 'Description', (meta.description || '').trim())
  r++

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
    fill(base, opts?.accent ? COLORS.primary : COLORS.bgSoft)
    thinBorder(base)
    const t = summary.getCell(`${col1}${r1}`)
    t.value = title
    t.font = { name: 'Calibri', size: 11, bold: true, color: { argb: opts?.accent ? COLORS.white : COLORS.text } }
    const vRow = r1 + 1
    summary.getCell(`${col1}${vRow}`).value = value == null ? '' : value
    summary.getCell(`${col1}${vRow}`).font = { name: 'Calibri', size: 16, bold: true, color: { argb: opts?.accent ? COLORS.white : COLORS.text } }
    summary.getCell(`${col1}${vRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
    summary.getCell(`${col1}${vRow}`).numFmt = opts?.isPercent ? '0.0%' : moneyFmt(currency, 2)
    if (opts?.note) {
      const nRow = r1 + 2
      summary.getCell(`${col1}${nRow}`).value = opts.note
      summary.getCell(`${col1}${nRow}`).font = { name: 'Calibri', size: 9, color: { argb: opts?.accent ? COLORS.header : COLORS.textMuted } }
      summary.getCell(`${col1}${nRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
    }
  }

  const kpiTop = r
  for (let i = 0; i < 6; i++) summary.getRow(kpiTop + i).height = i % 3 === 1 ? 20 : 18
  card(kpiTop, 'A', `Total Cost (${currency})`, totals.totalCost, { accent: true, note: 'Recipe total' })
  card(kpiTop, 'C', `Cost / Portion (${currency})`, totals.cpp, { note: 'Per serving' })
  card(kpiTop + 3, 'A', 'Food Cost %', totals.fcPct != null ? totals.fcPct / 100 : null, { isPercent: true, note: targetFc != null ? `Target: ${fmtPercent(targetFc)}` : '' })
  card(kpiTop + 3, 'C', `Margin (${currency})`, totals.margin, { note: totals.marginPct != null ? `Margin: ${totals.marginPct.toFixed(1)}%` : '' })

  r = kpiTop + 7
  summary.getCell(`A${r}`).value = 'Financial Summary'
  summary.getCell(`A${r}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.text } }
  r += 1

  const summaryRows = [
    ['Ingredient Cost', ingredientCost],
    ['Sub-Recipe Cost', subrecipeCost],
    ['Total Recipe Cost', totals.totalCost],
    ['Cost per Portion', totals.cpp],
    ['Selling Price', sell || null],
    ['Margin', totals.margin],
  ] as const

  summaryRows.forEach(([label, value]) => {
    summary.getCell(`A${r}`).value = label
    summary.getCell(`A${r}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMuted } }
    summary.getCell(`B${r}`).value = value ?? ''
    summary.getCell(`B${r}`).numFmt = moneyFmt(currency, 2)
    thinBorder(summary.getCell(`A${r}`))
    thinBorder(summary.getCell(`B${r}`))
    fill(summary.getCell(`A${r}`), COLORS.bgSoft)
    fill(summary.getCell(`B${r}`), COLORS.white)
    r += 1
  })

  summary.getCell(`C${r - 6}`).value = 'Lines'
  summary.getCell(`D${r - 6}`).value = lines.length
  summary.getCell(`C${r - 5}`).value = 'Warnings'
  summary.getCell(`D${r - 5}`).value = totalWarnings
  summary.getCell(`C${r - 4}`).value = 'Recipe Photo'
  summary.getCell(`D${r - 4}`).value = meta.photo_url ? 'Included when image is reachable' : 'Not available'
  summary.getCell(`C${r - 3}`).value = 'Step Photos'
  summary.getCell(`D${r - 3}`).value = stepPhotos.filter(Boolean).length
  summary.getCell(`C${r - 2}`).value = 'Method Steps'
  summary.getCell(`D${r - 2}`).value = cleanSteps.length
  summary.getCell(`C${r - 1}`).value = 'Prepared'
  summary.getCell(`D${r - 1}`).value = now.toLocaleDateString()

  for (let rr = r - 6; rr <= r - 1; rr++) {
    summary.getCell(`C${rr}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMuted } }
    summary.getCell(`D${rr}`).font = { name: 'Calibri', size: 10, color: { argb: COLORS.text } }
    thinBorder(summary.getCell(`C${rr}`))
    thinBorder(summary.getCell(`D${rr}`))
    fill(summary.getCell(`C${rr}`), COLORS.bgSoft)
    fill(summary.getCell(`D${rr}`), COLORS.white)
  }

  applyWatermark(summary, 'CONFIDENTIAL')

  const sigRow = Math.max(r + 2, 33)
  summary.getCell(`A${sigRow}`).value = 'Prepared by:'
  summary.getCell(`A${sigRow}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMuted } }
  summary.mergeCells(`B${sigRow}:C${sigRow}`)
  summary.getCell(`B${sigRow}`).value = '__________________________'
  summary.getCell(`D${sigRow}`).value = `Date: ${now.toLocaleDateString()}`
  summary.getCell(`D${sigRow}`).font = { name: 'Calibri', size: 10, color: { argb: COLORS.textMuted } }

  await summary.protect('GastroChef2024', {
    selectLockedCells: true,
    selectUnlockedCells: false,
    formatCells: false,
    insertRows: false,
    deleteRows: false,
  })

  // ================= 2. INGREDIENTS SHEET =================
  const ingredients = workbook.addWorksheet('Ingredients', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  ingredients.columns = [
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Code', key: 'code', width: 16 },
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

  ingredients.mergeCells('A1:K1')
  ingredients.getCell('A1').value = `${name} — Ingredients & Costing`
  ingredients.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.text } }
  ingredients.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' }

  const headerRow = ingredients.getRow(2)
  headerRow.values = ingredients.columns.map((col) => col.header)
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.text } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.height = 20
  headerRow.eachCell((cell) => {
    fill(cell, COLORS.header)
    thinBorder(cell, COLORS.border)
  })

  let rowNumber = 3
  for (const row of lines) {
    const warnings = (row.warnings || []).join(', ')
    const rAdded = ingredients.addRow({
      type: row.type,
      code: row.code || '',
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
    rAdded.eachCell((cell) => {
      thinBorder(cell)
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    })
    rAdded.getCell('yield').numFmt = '0.0%'
    rAdded.getCell('net').numFmt = '#,##0.000'
    rAdded.getCell('gross').numFmt = '#,##0.000'
    rAdded.getCell('unitCost').numFmt = moneyFmt(currency, 3)
    rAdded.getCell('lineCost').numFmt = moneyFmt(currency, 3)
    if (row.type === 'subrecipe') fill(rAdded.getCell('A'), COLORS.primaryLight)
    if (warnings) fill(rAdded.getCell('K'), COLORS.warning)
    rowNumber += 1
  }

  const footer = ingredients.addRow({
    name: 'TOTAL',
    lineCost: totals.totalCost,
  } as any)
  footer.font = { name: 'Calibri', size: 11, bold: true }
  footer.getCell('lineCost').numFmt = moneyFmt(currency, 2)
  footer.eachCell((cell) => {
    thinBorder(cell, COLORS.border)
    fill(cell, COLORS.bgSoft)
  })

  ingredients.autoFilter = 'A2:K2'
  autosizeColumns(ingredients, 10, 34)

  await ingredients.protect('GastroChef2024', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    sort: true,
    autoFilter: true,
    insertRows: false,
    deleteRows: false,
  })

  // ================= 3. SCALE LAB SHEET =================
  const scaleLab = workbook.addWorksheet('Scale Lab', {
    views: [{ showGridLines: false, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  scaleLab.columns = [
    { width: 30 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
  ]

  scaleLab.getCell('A1').value = `${name} — Kitchen Scaling Lab`
  scaleLab.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  scaleLab.mergeCells('A1:F1')

  scaleLab.getCell('A2').value = 'Base Portions'
  scaleLab.getCell('B2').value = portions
  scaleLab.getCell('D2').value = 'Target Portions'
  scaleLab.getCell('E2').value = portions
  scaleLab.getCell('A3').value = 'Scale Factor'
  scaleLab.getCell('B3').value = { formula: `IFERROR(E2/B2,1)` }
  scaleLab.getCell('B3').numFmt = '0.00x'

  ;['A2', 'B2', 'D2', 'E2', 'A3', 'B3'].forEach((ref) => {
    thinBorder(scaleLab.getCell(ref))
  })

  fill(scaleLab.getCell('A2'), COLORS.bgSoft)
  fill(scaleLab.getCell('D2'), COLORS.bgSoft)
  fill(scaleLab.getCell('A3'), COLORS.bgSoft)

  scaleLab.getCell('E2').protection = { locked: false }

  scaleLab.getRow(5).values = ['Ingredient / Sub-Recipe', 'Base Net Qty', 'Unit', 'Scaled Net Qty', 'Scaled Gross Qty', 'Scaled Line Cost']
  scaleLab.getRow(5).font = { name: 'Calibri', size: 11, bold: true }
  scaleLab.getRow(5).eachCell((cell) => {
    fill(cell, COLORS.header)
    thinBorder(cell)
  })

  let sr = 6
  lines.forEach((line) => {
    scaleLab.getCell(`A${sr}`).value = line.name
    scaleLab.getCell(`B${sr}`).value = line.net_qty
    scaleLab.getCell(`C${sr}`).value = line.unit
    scaleLab.getCell(`D${sr}`).value = { formula: `B${sr}*$B$3` }
    scaleLab.getCell(`E${sr}`).value = { formula: `${safeNum(line.gross_qty)}*$B$3` }
    scaleLab.getCell(`F${sr}`).value = { formula: `${safeNum(line.line_cost)}*$B$3` }
    ;['B', 'D', 'E'].forEach((col) => (scaleLab.getCell(`${col}${sr}`).numFmt = '#,##0.000'))
    scaleLab.getCell(`F${sr}`).numFmt = moneyFmt(currency, 2)
    ;['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => thinBorder(scaleLab.getCell(`${col}${sr}`)))
    sr += 1
  })

  autosizeColumns(scaleLab, 12, 34)

  await scaleLab.protect('GastroChef2024', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    insertRows: false,
    deleteRows: false,
  })

  // ================= 4. METHOD SHEET =================
  const method = workbook.addWorksheet('Method', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  method.columns = [{ width: 8 }, { width: 74 }]
  method.getCell('A1').value = name
  method.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  method.mergeCells('A1:B1')

  method.getCell('A3').value = 'Preparation Method'
  method.getCell('A3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textMuted } }
  method.mergeCells('A3:B3')

  let methodRow = 5
  if (cleanSteps.length) {
    for (let i = 0; i < cleanSteps.length; i++) {
      method.getCell(`A${methodRow}`).value = `${i + 1}.`
      method.getCell(`A${methodRow}`).alignment = { vertical: 'top', horizontal: 'right' }
      method.getCell(`A${methodRow}`).font = { name: 'Calibri', size: 11, bold: true }
      method.getCell(`B${methodRow}`).value = cleanSteps[i]
      method.getCell(`B${methodRow}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
      method.getCell(`B${methodRow}`).font = { name: 'Calibri', size: 11 }
      thinBorder(method.getCell(`A${methodRow}`))
      thinBorder(method.getCell(`B${methodRow}`))
      method.getRow(methodRow).height = Math.max(24, Math.ceil(cleanSteps[i].length / 90))
      methodRow += 1
    }
  } else {
    method.getCell('A5').value = '—'
    method.getCell('B5').value = 'No steps provided.'
  }

  await method.protect('GastroChef2024', {
    selectLockedCells: true,
    selectUnlockedCells: false,
  })

  // ================= 5. NUTRITION SHEET =================
  const nutrition = workbook.addWorksheet('Nutrition', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  nutrition.columns = [{ width: 28 }, { width: 22 }]
  nutrition.getCell('A1').value = `${name} — Nutrition`
  nutrition.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  nutrition.mergeCells('A1:B1')

  const nkv = (row: number, label: string, value: any) => {
    nutrition.getCell(`A${row}`).value = label
    nutrition.getCell(`A${row}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textMuted } }
    nutrition.getCell(`B${row}`).value = value ?? ''
    nutrition.getCell(`B${row}`).font = { name: 'Calibri', size: 11 }
    thinBorder(nutrition.getCell(`A${row}`))
    thinBorder(nutrition.getCell(`B${row}`))
  }

  nkv(3, 'Calories', meta.calories ?? '')
  nkv(4, 'Protein (g)', meta.protein_g ?? '')
  nkv(5, 'Carbs (g)', meta.carbs_g ?? '')
  nkv(6, 'Fat (g)', meta.fat_g ?? '')
  nkv(7, 'Portions', portions)
  nkv(8, 'Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '')

  await nutrition.protect('GastroChef2024', {
    selectLockedCells: true,
    selectUnlockedCells: false,
  })

  // ================= 6. PHOTOS SHEET (SINGLE PAGE - ENHANCED) =================
  const gallery = workbook.addWorksheet('Photos', {
    views: [{ showGridLines: false, zoom: 85 }],
    pageSetup: { 
      orientation: 'landscape', 
      paperSize: 9, 
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5 }
    },
  })

  // Setup columns for 2-column grid layout
  gallery.columns = [
    { width: 42 }, { width: 42 }, // Two photo columns
    { width: 2 }, { width: 2 }    // Spacing columns
  ]

  // Title
  gallery.getCell('A1').value = `${name} — Photo Gallery`
  gallery.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.text } }
  gallery.mergeCells('A1:D1')

  gallery.getCell('A2').value = 'Professional photo documentation for recipe preparation steps'
  gallery.getCell('A2').font = { name: 'Calibri', size: 10, color: { argb: COLORS.textMuted } }
  gallery.mergeCells('A2:D2')

  let currentRow = 4

  // Main Recipe Photo (Hero)
  if (meta.photo_url) {
    gallery.mergeCells(`A${currentRow}:D${currentRow}`)
    gallery.getCell(`A${currentRow}`).value = 'Recipe Hero Image'
    gallery.getCell(`A${currentRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.textMuted } }
    currentRow++

    const mainImg = await fetchImageForExcel(meta.photo_url)
    if (mainImg) {
      const imgId = workbook.addImage({ base64: mainImg.base64, extension: mainImg.extension })
      gallery.addImage(imgId, {
        tl: { col: 0.5, row: currentRow },
        ext: { width: 550, height: 300 },
        editAs: 'oneCell',
      })
      currentRow += 14
    } else {
      gallery.mergeCells(`A${currentRow}:D${currentRow + 8}`)
      gallery.getCell(`A${currentRow}`).value = 'Recipe photo could not be embedded. Check image format/CORS/public access.'
      gallery.getCell(`A${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      fill(gallery.getCell(`A${currentRow}`), COLORS.bgSoft)
      thinBorder(gallery.getCell(`A${currentRow}`))
      currentRow += 10
    }
  }

  // Step Photos in 2-Column Grid (ALL on ONE sheet)
  const stepPhotosWithDesc = cleanSteps.map((step, i) => ({
    step: i + 1,
    description: step,
    url: stepPhotos[i] || null,
  }))

  // Calculate how many cards fit per row (2 cards per row)
  const cardsPerRow = 2
  const rowsPerCard = 13

  for (let i = 0; i < stepPhotosWithDesc.length; i++) {
    const item = stepPhotosWithDesc[i]
    
    // Calculate position in grid
    const colOffset = (i % cardsPerRow) * 2  // 0 or 2
    const rowOffset = Math.floor(i / cardsPerRow) * rowsPerCard

    await createPhotoCard(
      workbook,
      gallery,
      currentRow + rowOffset,
      colOffset,
      `Step ${item.step}`,
      item.description,
      item.url
    )
  }

  // Final row count adjustment
  const totalCards = stepPhotosWithDesc.length
  const totalRowsNeeded = currentRow + (Math.ceil(totalCards / cardsPerRow) * rowsPerCard)
  
  // Set row heights for better visual spacing
  for (let rowIdx = currentRow; rowIdx < totalRowsNeeded; rowIdx++) {
    gallery.getRow(rowIdx).height = 12
  }

  // Protect Photos Sheet
  await gallery.protect('GastroChef2024', {
    selectLockedCells: true,
    selectUnlockedCells: false,
  })

  // ================= Finalize & Download =================
  const buf = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `${safeFileName(name)} - Ultra Export.xlsx`)
}

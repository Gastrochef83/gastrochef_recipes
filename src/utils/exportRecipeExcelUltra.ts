// src/utils/exportRecipeExcelUltra.ts
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
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function safeNum(x: any, fallback = 0): number {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function toTitle(s: string): string {
  const t = (s || '').trim()
  return t || 'Recipe'
}

function fmtPercent(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  return `${n.toFixed(1)}%`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return typeof window !== 'undefined' ? window.btoa(binary) : Buffer.from(buffer).toString('base64')
}

function parseDataUrl(dataUrl: string): { extension: 'png' | 'jpeg'; base64: string } | null {
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i)
  if (!match) return null
  return {
    extension: match[1] === 'jpg' ? 'jpeg' : (match[1] as 'png' | 'jpeg'),
    base64: match[2],
  }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'recipe'
}

function moneyFmt(currency: string, decimals = 2): string {
  const zeros = '0'.repeat(Math.max(0, decimals))
  return `"${currency}" #,##0${decimals > 0 ? '.' + zeros : ''}`
}

function fmtDate(d = new Date()): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function reportId(d = new Date()): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('') + '-' + [
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join('')
}

function auditStamp(d: Date, recipeId: string): string {
  const rid = (recipeId || '').replace(/-/g, '').slice(0, 6).toUpperCase()
  return `GC-${reportId(d)}-${rid || 'LOCAL'}`
}

function normalizeYieldPercent(value: number): number {
  const n = safeNum(value, 100)
  return n <= 1 ? n * 100 : n
}

// ================= Colors =================
const COLORS = {
  primary: 'FF0F766E',
  primaryLight: 'FFF0FDFA',
  header: 'FFE2E8F0',
  border: 'FFCBD5E1',
  text: 'FF0F172A',
  textMuted: 'FF64748B',
  warning: 'FFFEF3C7',
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

function styleLabel(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMuted } }
  thinBorder(cell)
  fill(cell, COLORS.bgSoft)
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
}

function styleValue(cell: ExcelJS.Cell) {
  thinBorder(cell)
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
}

function styleSectionTitle(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.text } }
  fill(cell, COLORS.header)
  thinBorder(cell)
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
}

// ================= Image Handling =================
async function fetchImageForExcel(url: string | null | undefined): Promise<{ base64: string; extension: 'png' | 'jpeg' } | null> {
  try {
    if (!url || typeof url !== 'string') return null
    const cleanUrl = url.trim()
    if (!cleanUrl) return null

    if (cleanUrl.startsWith('data:image/')) return parseDataUrl(cleanUrl)

    let fetchUrl = cleanUrl
    if (cleanUrl.startsWith('/')) {
      fetchUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${cleanUrl}`
    }

    const response = await fetch(fetchUrl, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit',
    })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('image/')) return null

    const blob = await response.blob()
    const buffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
    const extension: 'png' | 'jpeg' = contentType.includes('png') ? 'png' : 'jpeg'
    return { base64, extension }
  } catch {
    return null
  }
}

async function addImageToSheet(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  imageUrl: string | null | undefined,
  options: { col: number; row: number; width: number; height: number }
): Promise<boolean> {
  try {
    const imageData = await fetchImageForExcel(imageUrl)
    if (!imageData) return false

    const imageId = workbook.addImage({
      base64: imageData.base64,
      extension: imageData.extension,
    })

    sheet.addImage(imageId, {
      tl: { col: options.col, row: options.row },
      ext: { width: options.width, height: options.height },
      editAs: 'oneCell',
    })
    return true
  } catch {
    return false
  }
}

async function addLogo(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet) {
  try {
    const candidates = ['/gastrochef-logo.png', '/logo.png']
    for (const url of candidates) {
      const ok = await addImageToSheet(workbook, sheet, url, {
        col: 0.15, row: 0.15, width: 58, height: 58,
      })
      if (ok) return
    }
  } catch {}
}

async function addQRCode(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, payload: string) {
  try {
    const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
    const parsed = parseDataUrl(dataUrl)
    if (!parsed) return
    const imageId = workbook.addImage({ base64: parsed.base64, extension: parsed.extension })
    sheet.addImage(imageId, { tl: { col: 3.1, row: 0.3 }, ext: { width: 72, height: 72 }, editAs: 'oneCell' })
  } catch {}
}

function autosizeColumns(sheet: ExcelJS.Worksheet, min = 10, max = 45) {
  sheet.columns?.forEach((col) => {
    let longest = min
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const val = cell.value
      const text = typeof val === 'object' && val && 'richText' in val
        ? (val as any).richText?.map((x: any) => x.text).join('') || ''
        : String(val ?? '')
      const len = text.split('\n').reduce((a, l) => Math.max(a, l.length), 0)
      longest = Math.max(longest, Math.min(max, len + 2))
    })
    col.width = longest
  })
}

function normalizeStepPhotos(steps: string[], photos: string[] | null | undefined): string[] {
  const clean = (photos || []).map((p) => (p || '').trim())
  return steps.map((_, i) => clean[i] || '')
}

function countWarnings(lines: ExcelLineRow[]): number {
  return lines.reduce((acc, l) => acc + ((l.warnings || []).filter(Boolean).length > 0 ? 1 : 0), 0)
}

function countSubRecipeLines(lines: ExcelLineRow[]): number {
  return lines.filter(l => l.type === 'subrecipe').length
}

function countIngredientLines(lines: ExcelLineRow[]): number {
  return lines.filter(l => l.type === 'ingredient').length
}

// ================= Main Export Function =================
export async function exportRecipeExcelUltra(args: {
  meta: ExcelRecipeMeta
  totals: { totalCost: number; cpp: number; fcPct: number | null; margin: number; marginPct: number | null }
  lines: ExcelLineRow[]
}): Promise<void> {
  const { meta, totals, lines } = args
  const name = toTitle(meta.name)
  const currency = (meta.currency || 'USD').toUpperCase()
  const portions = Math.max(1, Math.floor(safeNum(meta.portions, 1)))
  const yieldQty = safeNum(meta.yield_qty, 0) || null
  const yieldUnit = (meta.yield_unit || '').trim() || null
  const sellingPrice = safeNum(meta.selling_price, 0)
  const targetFc = meta.target_food_cost_pct != null
    ? clamp(safeNum(meta.target_food_cost_pct, 0), 0, 100)
    : null
  const cleanSteps = (meta.steps || []).map((s) => (s || '').trim()).filter(Boolean)
  const stepPhotos = normalizeStepPhotos(cleanSteps, meta.step_photos)
  const now = new Date()
  const rid = reportId(now)
  const recipeId = meta.id || ''
  const recipeCode = meta.code || ''
  const kitchenRef = meta.kitchen_id || ''
  const qrPayload = typeof window !== 'undefined' && recipeId
    ? `${window.location.origin}/#/recipe?id=${encodeURIComponent(recipeId)}`
    : `Recipe: ${name}`

  const ingredientCost = lines.filter(l => l.type === 'ingredient').reduce((a, l) => a + safeNum(l.line_cost), 0)
  const subRecipeCost = lines.filter(l => l.type === 'subrecipe').reduce((a, l) => a + safeNum(l.line_cost), 0)
  const warningCount = countWarnings(lines)
  const recipePhotoIncluded = meta.photo_url ? 'Included when image is reachable' : 'Not provided'
  const stepPhotoCount = stepPhotos.filter(Boolean).length

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GastroChef'
  workbook.created = now
  workbook.modified = now
  workbook.company = 'GastroChef'
  workbook.title = `${name} — Ultra Export`

  // ===== 1. SUMMARY SHEET (close to Biryani layout) =====
  const summary = workbook.addWorksheet('Summary', {
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6 } },
  })
  summary.columns = [
    { width: 20 }, // A
    { width: 28 }, // B
    { width: 20 }, // C
    { width: 28 }, // D
  ]

  await addLogo(workbook, summary)
  await addQRCode(workbook, summary, qrPayload)

  summary.mergeCells('A1:D1')
  const top = summary.getCell('A1')
  fill(top, COLORS.white)
  summary.getRow(1).height = 54

  summary.mergeCells('B2:C2')
  summary.getCell('B2').value = 'GastroChef'
  summary.getCell('B2').font = { name: 'Calibri', size: 20, bold: true, color: { argb: COLORS.text } }
  summary.getCell('B2').alignment = { vertical: 'middle', horizontal: 'center' }
  summary.getRow(2).height = 54

  summary.mergeCells('A5:D5')
  summary.getCell('A5').value = 'Kitchen Intelligence — Costing, Nutrition, Method & Images'
  summary.getCell('A5').font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textMuted } }
  summary.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' }

  summary.mergeCells('A6:D6')
  summary.getCell('A6').value = `Report ID: ${rid}   |   Recipe ID: ${recipeId || ''}`
  summary.getCell('A6').font = { name: 'Calibri', size: 9, color: { argb: COLORS.textMuted } }
  summary.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' }

  summary.mergeCells('A7:D7')
  summary.getCell('A7').value = name
  summary.getCell('A7').font = { name: 'Calibri', size: 22, bold: true, color: { argb: COLORS.text } }
  summary.getCell('A7').alignment = { horizontal: 'left', vertical: 'middle' }
  summary.getRow(7).height = 30

  const kvRows: Array<[string, any, string]> = [
    ['Code', recipeCode, 'B9:D9'],
    ['Kitchen Ref', kitchenRef, 'B10:D10'],
    ['Audit Stamp', auditStamp(now, recipeId), 'B11:D11'],
    ['Category', meta.category || '', 'B12:D12'],
    ['Portions', portions, 'B13:D13'],
    ['Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '', 'B14:D14'],
    ['Currency', currency, 'B15:D15'],
    ['Selling Price', sellingPrice > 0 ? sellingPrice : '', 'B16:D16'],
    ['Target FC%', targetFc != null ? fmtPercent(targetFc) : '', 'B17:D17'],
    ['Description', meta.description || '', 'B18:D18'],
  ]
  kvRows.forEach(([label, value, merged], index) => {
    const row = 9 + index
    styleLabel(summary.getCell(`A${row}`))
    summary.getCell(`A${row}`).value = label
    summary.mergeCells(merged)
    const valueCell = summary.getCell(`B${row}`)
    styleValue(valueCell)
    valueCell.value = value ?? ''
    if (label === 'Selling Price' && typeof value === 'number') valueCell.numFmt = moneyFmt(currency, 2)
  })

  // KPI cards like Biryani
  summary.mergeCells('A20:B22')
  const card1 = summary.getCell('A20')
  fill(card1, COLORS.primary)
  thinBorder(card1)
  card1.value = 'Recipe total'
  card1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.white } }
  card1.alignment = { horizontal: 'center', vertical: 'top' }
  const card1Value = summary.getCell('A21')
  card1Value.value = totals.totalCost
  card1Value.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.white } }
  card1Value.numFmt = moneyFmt(currency, 2)
  card1Value.alignment = { horizontal: 'center', vertical: 'middle' }
  fill(card1Value, COLORS.primary)
  thinBorder(card1Value)
  const card1Empty = summary.getCell('A22')
  fill(card1Empty, COLORS.primary)
  thinBorder(card1Empty)

  summary.mergeCells('C20:D22')
  const card2 = summary.getCell('C20')
  fill(card2, COLORS.bgSoft)
  thinBorder(card2)
  card2.value = 'Per serving'
  card2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.text } }
  card2.alignment = { horizontal: 'center', vertical: 'top' }
  const card2Value = summary.getCell('C21')
  card2Value.value = totals.cpp
  card2Value.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.text } }
  card2Value.numFmt = moneyFmt(currency, 2)
  card2Value.alignment = { horizontal: 'center', vertical: 'middle' }
  fill(card2Value, COLORS.bgSoft)
  thinBorder(card2Value)
  const card2Empty = summary.getCell('C22')
  fill(card2Empty, COLORS.bgSoft)
  thinBorder(card2Empty)

  summary.mergeCells('A23:B25')
  const card3 = summary.getCell('A23')
  fill(card3, COLORS.bgSoft)
  thinBorder(card3)
  card3.value = `Target: ${targetFc != null ? fmtPercent(targetFc) : '—'}`
  card3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.text } }
  card3.alignment = { horizontal: 'center', vertical: 'top' }
  const card3Value = summary.getCell('A24')
  card3Value.value = totals.fcPct != null ? totals.fcPct / 100 : null
  card3Value.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.text } }
  card3Value.numFmt = '0.0%'
  card3Value.alignment = { horizontal: 'center', vertical: 'middle' }
  fill(card3Value, COLORS.bgSoft)
  thinBorder(card3Value)
  const card3Empty = summary.getCell('A25')
  fill(card3Empty, COLORS.bgSoft)
  thinBorder(card3Empty)

  summary.mergeCells('C23:D25')
  const card4 = summary.getCell('C23')
  fill(card4, COLORS.bgSoft)
  thinBorder(card4)
  card4.value = 'Margin'
  card4.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.text } }
  card4.alignment = { horizontal: 'center', vertical: 'top' }
  const card4Value = summary.getCell('C24')
  card4Value.value = totals.margin
  card4Value.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.text } }
  card4Value.numFmt = moneyFmt(currency, 2)
  card4Value.alignment = { horizontal: 'center', vertical: 'middle' }
  fill(card4Value, COLORS.bgSoft)
  thinBorder(card4Value)
  const card4Empty = summary.getCell('C25')
  fill(card4Empty, COLORS.bgSoft)
  thinBorder(card4Empty)

  summary.mergeCells('A27:D27')
  styleSectionTitle(summary.getCell('A27'))
  summary.getCell('A27').value = 'Financial Summary'

  const statRows: Array<[number, string, any, string, any]> = [
    [28, 'Ingredient Cost', ingredientCost, 'Lines', lines.length],
    [29, 'Sub-Recipe Cost', subRecipeCost, 'Warnings', warningCount],
    [30, 'Total Recipe Cost', totals.totalCost, 'Recipe Photo', recipePhotoIncluded],
    [31, 'Cost per Portion', totals.cpp, 'Step Photos', stepPhotoCount],
    [32, 'Selling Price', sellingPrice > 0 ? sellingPrice : '', 'Method Steps', cleanSteps.length],
    [33, 'Margin', totals.margin, 'Prepared', fmtDate(now)],
  ]
  statRows.forEach(([row, l1, v1, l2, v2]) => {
    styleLabel(summary.getCell(`A${row}`))
    summary.getCell(`A${row}`).value = l1
    styleValue(summary.getCell(`B${row}`))
    summary.getCell(`B${row}`).value = v1
    styleLabel(summary.getCell(`C${row}`))
    summary.getCell(`C${row}`).value = l2
    styleValue(summary.getCell(`D${row}`))
    summary.getCell(`D${row}`).value = v2

    if (typeof v1 === 'number' && ['Ingredient Cost', 'Sub-Recipe Cost', 'Total Recipe Cost', 'Cost per Portion', 'Selling Price', 'Margin'].includes(l1)) {
      summary.getCell(`B${row}`).numFmt = moneyFmt(currency, 2)
    }
  })

  styleLabel(summary.getCell('A36'))
  summary.getCell('A36').value = 'Prepared by:'
  summary.mergeCells('B36:C36')
  styleValue(summary.getCell('B36'))
  summary.getCell('B36').value = '__________________________'
  styleLabel(summary.getCell('D36'))
  summary.getCell('D36').value = `Date: ${fmtDate(now)}`

  await summary.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: false })

  // ===== 2. INGREDIENTS SHEET =====
  const ingredients = workbook.addWorksheet('Ingredients', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
  })
  ingredients.columns = [
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Code', key: 'code', width: 14 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Net', key: 'net', width: 10 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Yield%', key: 'yield', width: 9 },
    { header: 'Gross', key: 'gross', width: 10 },
    { header: 'Unit Cost', key: 'uCost', width: 12 },
    { header: 'Line Cost', key: 'lCost', width: 12 },
    { header: 'Notes', key: 'notes', width: 20 },
    { header: 'Warnings', key: 'warnings', width: 20 },
  ]

  ingredients.mergeCells('A1:K1')
  ingredients.getCell('A1').value = `${name} — Ingredients`
  ingredients.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.text } }

  const headerRow = ingredients.getRow(2)
  headerRow.values = ingredients.columns.map(c => c.header)
  headerRow.font = { name: 'Calibri', size: 10, bold: true }
  headerRow.eachCell(c => applyHeaderStyle(c))

  for (const line of lines) {
    const row = ingredients.addRow({
      type: line.type,
      code: line.code || '',
      name: line.name,
      net: safeNum(line.net_qty),
      unit: line.unit || '',
      yield: normalizeYieldPercent(line.yield_percent) / 100,
      gross: safeNum(line.gross_qty),
      uCost: safeNum(line.unit_cost),
      lCost: safeNum(line.line_cost),
      notes: line.notes || '',
      warnings: (line.warnings || []).join(', '),
    })
    row.eachCell(c => {
      thinBorder(c)
      c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    })
    row.getCell('yield').numFmt = '0.0%'
    row.getCell('net').numFmt = '#,##0.000'
    row.getCell('gross').numFmt = '#,##0.000'
    row.getCell('uCost').numFmt = moneyFmt(currency, 3)
    row.getCell('lCost').numFmt = moneyFmt(currency, 3)
    if (line.type === 'subrecipe') fill(row.getCell('A'), COLORS.primaryLight)
  }

  const footer = ingredients.addRow({ name: 'TOTAL', lCost: totals.totalCost })
  footer.font = { name: 'Calibri', size: 11, bold: true }
  footer.getCell('lCost').numFmt = moneyFmt(currency, 2)
  footer.eachCell(c => { thinBorder(c); fill(c, COLORS.bgSoft) })

  ingredients.autoFilter = 'A2:K2'
  autosizeColumns(ingredients)
  await ingredients.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: true, sort: true, autoFilter: true })

  // ===== 3. SCALE LAB SHEET =====
  const scaleLab = workbook.addWorksheet('Scale Lab', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
  })
  scaleLab.columns = [{ width: 28 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }]
  scaleLab.getCell('A1').value = `${name} — Scaling Lab`
  scaleLab.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  scaleLab.mergeCells('A1:F1')

  scaleLab.getCell('A2').value = 'Base Portions'
  scaleLab.getCell('B2').value = portions
  scaleLab.getCell('D2').value = 'Target Portions'
  scaleLab.getCell('E2').value = portions
  scaleLab.getCell('A3').value = 'Scale Factor'
  scaleLab.getCell('B3').value = { formula: 'IFERROR(E2/B2,1)' }
  scaleLab.getCell('B3').numFmt = '0.00x'
  ;['A2', 'B2', 'D2', 'E2', 'A3', 'B3'].forEach(ref => {
    thinBorder(scaleLab.getCell(ref))
    fill(scaleLab.getCell(ref), COLORS.bgSoft)
  })
  scaleLab.getCell('E2').protection = { locked: false }

  scaleLab.getRow(5).values = ['Item', 'Net', 'Unit', 'Scaled Net', 'Scaled Gross', 'Scaled Cost']
  scaleLab.getRow(5).font = { name: 'Calibri', size: 10, bold: true }
  scaleLab.getRow(5).eachCell(c => applyHeaderStyle(c))

  let sr = 6
  for (const line of lines) {
    scaleLab.getCell(`A${sr}`).value = line.name
    scaleLab.getCell(`B${sr}`).value = safeNum(line.net_qty)
    scaleLab.getCell(`C${sr}`).value = line.unit
    scaleLab.getCell(`D${sr}`).value = { formula: `B${sr}*$B$3` }
    scaleLab.getCell(`E${sr}`).value = { formula: `${safeNum(line.gross_qty)}*$B$3` }
    scaleLab.getCell(`F${sr}`).value = { formula: `${safeNum(line.line_cost)}*$B$3` }
    ;['B', 'D', 'E'].forEach(c => scaleLab.getCell(`${c}${sr}`).numFmt = '#,##0.000')
    scaleLab.getCell(`F${sr}`).numFmt = moneyFmt(currency, 2)
    ;['A', 'B', 'C', 'D', 'E', 'F'].forEach(c => thinBorder(scaleLab.getCell(`${c}${sr}`)))
    sr++
  }
  autosizeColumns(scaleLab)
  await scaleLab.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: true })

  // ===== 4. METHOD SHEET =====
  const method = workbook.addWorksheet('Method', {
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true },
  })
  method.columns = [{ width: 6 }, { width: 76 }]
  method.getCell('A1').value = name
  method.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  method.mergeCells('A1:B1')
  method.getCell('A3').value = 'Preparation Method'
  method.getCell('A3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textMuted } }
  method.mergeCells('A3:B3')

  let mr = 5
  if (cleanSteps.length) {
    for (let i = 0; i < cleanSteps.length; i++) {
      method.getCell(`A${mr}`).value = `${i + 1}.`
      method.getCell(`A${mr}`).alignment = { vertical: 'top', horizontal: 'right' }
      method.getCell(`A${mr}`).font = { name: 'Calibri', size: 10, bold: true }
      method.getCell(`B${mr}`).value = cleanSteps[i]
      method.getCell(`B${mr}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
      thinBorder(method.getCell(`A${mr}`))
      thinBorder(method.getCell(`B${mr}`))
      method.getRow(mr).height = Math.max(20, Math.ceil(cleanSteps[i].length / 80) * 15)
      mr++
    }
  } else {
    method.getCell('A5').value = '—'
    method.getCell('B5').value = 'No steps provided.'
  }
  await method.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: false })

  // ===== 5. PHOTOS SHEET (Biryani-style linear blocks) =====
  const photos = workbook.addWorksheet('Photos', {
    views: [{ showGridLines: false, zoom: 90 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5 } },
  })
  photos.columns = [
    { width: 5 },   // A spacer
    { width: 29.7 },// B
    { width: 29.7 },// C
    { width: 29.7 },// D
    { width: 29.7 },// E
    { width: 29.7 },// F
    { width: 29.7 },// G
    { width: 5 },   // H spacer
  ]

  photos.mergeCells('B1:C1')
  photos.getCell('B1').value = `${name} — Photo Gallery`
  photos.getCell('B1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.text } }
  photos.getCell('B1').alignment = { horizontal: 'left', vertical: 'middle' }
  photos.getRow(1).height = 23.25

  let currentRow = 3
  photos.mergeCells('B3:C3')
  photos.getCell('B3').value = 'Main Recipe Photo'
  photos.getCell('B3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textMuted } }

  if (meta.photo_url) {
    for (let r = 4; r <= 14; r++) {
      for (let c = 2; c <= 7; c++) thinBorder(photos.getCell(r, c))
    }
    fill(photos.getCell('B4'), COLORS.bgSoft)
    await addImageToSheet(workbook, photos, meta.photo_url, {
      col: 1.15,
      row: 3.3,
      width: 860,
      height: 250,
    })
    currentRow = 15
  } else {
    photos.mergeCells('B4:G14')
    const noPhoto = photos.getCell('B4')
    noPhoto.value = 'Main recipe photo not provided'
    noPhoto.alignment = { horizontal: 'center', vertical: 'middle' }
    noPhoto.font = { name: 'Calibri', size: 12, color: { argb: COLORS.textMuted } }
    fill(noPhoto, COLORS.bgSoft)
    thinBorder(noPhoto)
    currentRow = 15
  }

  const stepsPerBlock = 6
  const photoWidth = 150
  const photoHeight = 150
  const blockHeight = 13 // header + image area + desc + spacer

  for (let blockStart = 0; blockStart < cleanSteps.length; blockStart += stepsPerBlock) {
    const blockSteps = cleanSteps.slice(blockStart, blockStart + stepsPerBlock)
    const blockPhotos = stepPhotos.slice(blockStart, blockStart + stepsPerBlock)
    const headerRow = currentRow
    const imageTopRow = currentRow + 1
    const descRow = currentRow + 11

    // Step labels
    for (let i = 0; i < blockSteps.length; i++) {
      const col = 2 + i // B..G
      const cell = photos.getCell(headerRow, col)
      cell.value = `Step ${blockStart + i + 1}`
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.text } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      photos.getColumn(col).width = 29.7
    }

    // Image boxes
    for (let r = imageTopRow; r <= currentRow + 9; r++) {
      for (let i = 0; i < blockSteps.length; i++) {
        const col = 2 + i
        thinBorder(photos.getCell(r, col))
      }
    }

    // Images or placeholders
    for (let i = 0; i < blockSteps.length; i++) {
      const col = 2 + i
      const photoUrl = blockPhotos[i]
      const ok = await addImageToSheet(workbook, photos, photoUrl, {
        col: col - 1 + 0.12, // B=2 => 1.12
        row: imageTopRow - 1 + 0.12,
        width: photoWidth,
        height: photoHeight,
      })
      if (!ok) {
        const placeholder = photos.getCell(imageTopRow + 4, col)
        placeholder.value = 'No photo'
        placeholder.font = { name: 'Calibri', size: 10, color: { argb: COLORS.textMuted } }
        placeholder.alignment = { horizontal: 'center', vertical: 'middle' }
      }
    }

    // Descriptions
    photos.getRow(descRow).height = 45
    for (let i = 0; i < blockSteps.length; i++) {
      const col = 2 + i
      const cell = photos.getCell(descRow, col)
      cell.value = `${blockStart + i + 1}. ${blockSteps[i]}`
      cell.font = { name: 'Calibri', size: 9, color: { argb: COLORS.textMuted } }
      cell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
      thinBorder(cell)
      fill(cell, COLORS.bgSoft)
    }

    currentRow += blockHeight
  }

  await photos.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: false })

  // ===== SAVE FILE =====
  try {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    saveAs(blob, `${safeFileName(name)} - Ultra Export.xlsx`)
  } catch (error) {
    console.error('Excel export failed:', error)
    alert('Failed to export Excel file. Please try again.')
  }
}

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
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
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

// ================= Colors & Styling =================
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

// ================= Image Handling (ROBUST) =================
async function fetchImageForExcel(url: string | null | undefined): Promise<{ base64: string; extension: 'png' | 'jpeg' } | null> {
  try {
    if (!url || typeof url !== 'string') return null
    const cleanUrl = url.trim()
    if (!cleanUrl) return null

    // Handle data URLs
    if (cleanUrl.startsWith('data:image/')) {
      return parseDataUrl(cleanUrl)
    }

    // Handle relative URLs
    let fetchUrl = cleanUrl
    if (cleanUrl.startsWith('/')) {
      fetchUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${cleanUrl}`
    }

    // Fetch with CORS
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
        col: 0.2, row: 0.2, width: 60, height: 60,
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
    sheet.addImage(imageId, { tl: { col: 3.2, row: 0.3 }, ext: { width: 70, height: 70 } })
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

// ================= Photo Card Builder (PROFESSIONAL) =================
async function createPhotoCard(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  stepNumber: number,
  description: string,
  imageUrl: string | null
) {
  const colLetter = String.fromCharCode(65 + startCol)
  
  // Card container with border
  sheet.mergeCells(`${colLetter}${startRow}:${colLetter}${startRow + 14}`)
  const cardCell = sheet.getCell(`${colLetter}${startRow}`)
  fill(cardCell, COLORS.white)
  cardCell.border = {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
  }

  // Step badge (green circle with number)
  const badgeCell = sheet.getCell(`${colLetter}${startRow}`)
  badgeCell.value = `${stepNumber}`
  badgeCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.white } }
  badgeCell.alignment = { horizontal: 'center', vertical: 'middle' }
  fill(badgeCell, COLORS.primary)

  // Photo area
  const photoRow = startRow + 1
  if (imageUrl) {
    const added = await addImageToSheet(workbook, sheet, imageUrl, {
      col: startCol + 0.15,
      row: photoRow + 0.15,
      width: 270,
      height: 180,
    })
    if (!added) {
      const placeholderCell = sheet.getCell(`${colLetter}${photoRow + 3}`)
      placeholderCell.value = '📷'
      placeholderCell.alignment = { horizontal: 'center', vertical: 'middle' }
      placeholderCell.font = { size: 24, color: { argb: COLORS.textMuted } }
    }
  }

  // Description area
  const descRow = startRow + 12
  sheet.mergeCells(`${colLetter}${descRow}:${colLetter}${startRow + 14}`)
  const descCell = sheet.getCell(`${colLetter}${descRow}`)
  descCell.value = description || 'No description'
  descCell.font = { name: 'Calibri', size: 9, color: { argb: COLORS.textMuted } }
  descCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
  fill(descCell, COLORS.bgSoft)
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

  // ===== Workbook Setup =====
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GastroChef'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.company = 'GastroChef'
  workbook.title = `${name} — Professional Recipe Export`

  const now = new Date()
  const reportId = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`
  const recipeId = meta.id || ''
  const recipeCode = meta.code || ''
  const kitchenRef = meta.kitchen_id || ''

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const qrPayload = recipeId && baseUrl ? `${baseUrl}/#/recipe?id=${encodeURIComponent(recipeId)}` : `Recipe: ${name}`

  const ingredientCost = lines.filter(l => l.type === 'ingredient').reduce((a, l) => a + safeNum(l.line_cost), 0)
  const subrecipeCost = lines.filter(l => l.type === 'subrecipe').reduce((a, l) => a + safeNum(l.line_cost), 0)

  // ===== 1. SUMMARY SHEET =====
  const summary = workbook.addWorksheet('Summary', {
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true },
  })
  summary.columns = [{ width: 20 }, { width: 28 }, { width: 20 }, { width: 28 }]
  summary.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6 }

  // Header
  await addLogo(workbook, summary)
  await addQRCode(workbook, summary, qrPayload)

  summary.mergeCells('A3:D3')
  summary.getCell('A3').value = 'GastroChef'
  summary.getCell('A3').font = { name: 'Calibri', size: 20, bold: true }
  summary.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' }

  summary.mergeCells('A7:D7')
  summary.getCell('A7').value = name
  summary.getCell('A7').font = { name: 'Calibri', size: 22, bold: true }

  // Key-Value rows
  let r = 9
  const kv = (label: string, value: any) => {
    summary.getCell(`A${r}`).value = label
    summary.getCell(`A${r}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMuted } }
    summary.getCell(`B${r}`).value = value ?? ''
    summary.mergeCells(`B${r}:D${r}`)
    r++
  }
  kv('Code', recipeCode)
  kv('Category', meta.category)
  kv('Portions', portions)
  kv('Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '')
  kv('Currency', currency)
  kv('Selling Price', sellingPrice > 0 ? sellingPrice : '')
  kv('Target FC%', targetFc != null ? fmtPercent(targetFc) : '')

  // KPI Cards
  const kpiRow = r + 1
  const makeCard = (row: number, col: 'A' | 'C', title: string, value: any, accent = false) => {
    summary.mergeCells(`${col}${row}:${col === 'A' ? 'B' : 'D'}${row + 2}`)
    const cell = summary.getCell(`${col}${row}`)
    fill(cell, accent ? COLORS.primary : COLORS.bgSoft)
    thinBorder(cell)
    cell.value = title
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: accent ? COLORS.white : COLORS.text } }
    summary.getCell(`${col}${row + 1}`).value = value ?? ''
    summary.getCell(`${col}${row + 1}`).font = { name: 'Calibri', size: 15, bold: true, color: { argb: accent ? COLORS.white : COLORS.text } }
    summary.getCell(`${col}${row + 1}`).numFmt = typeof value === 'number' && title.includes('%') ? '0.0%' : moneyFmt(currency, 2)
  }
  makeCard(kpiRow, 'A', 'Total Cost', totals.totalCost, true)
  makeCard(kpiRow, 'C', 'Cost/Portion', totals.cpp)
  makeCard(kpiRow + 3, 'A', 'Food Cost %', totals.fcPct != null ? totals.fcPct / 100 : null)
  makeCard(kpiRow + 3, 'C', 'Margin', totals.margin)

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
  ]

  // Header
  ingredients.mergeCells('A1:J1')
  ingredients.getCell('A1').value = `${name} — Ingredients`
  ingredients.getCell('A1').font = { name: 'Calibri', size: 14, bold: true }

  const headerRow = ingredients.getRow(2)
  headerRow.values = ingredients.columns.map(c => c.header)
  headerRow.font = { name: 'Calibri', size: 10, bold: true }
  headerRow.eachCell(c => applyHeaderStyle(c))

  // Data rows
  for (const line of lines) {
    const row = ingredients.addRow({
      type: line.type,
      code: line.code || '',
      name: line.name,
      net: line.net_qty,
      unit: line.unit,
      yield: line.yield_percent / 100,
      gross: line.gross_qty,
      uCost: line.unit_cost,
      lCost: line.line_cost,
      notes: line.notes || '',
    })
    row.eachCell(c => { thinBorder(c); c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true } })
    row.getCell('yield').numFmt = '0.0%'
    row.getCell('net').numFmt = '#,##0.000'
    row.getCell('gross').numFmt = '#,##0.000'
    row.getCell('uCost').numFmt = moneyFmt(currency, 3)
    row.getCell('lCost').numFmt = moneyFmt(currency, 3)
    if (line.type === 'subrecipe') fill(row.getCell('A'), COLORS.primaryLight)
  }

  // Footer
  const footer = ingredients.addRow({ name: 'TOTAL', lCost: totals.totalCost })
  footer.font = { name: 'Calibri', size: 11, bold: true }
  footer.getCell('lCost').numFmt = moneyFmt(currency, 2)
  footer.eachCell(c => { thinBorder(c); fill(c, COLORS.bgSoft) })

  ingredients.autoFilter = 'A2:J2'
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

  // Inputs
  scaleLab.getCell('A2').value = 'Base Portions'; scaleLab.getCell('B2').value = portions
  scaleLab.getCell('D2').value = 'Target Portions'; scaleLab.getCell('E2').value = portions
  scaleLab.getCell('A3').value = 'Scale Factor'; scaleLab.getCell('B3').value = { formula: 'IFERROR(E2/B2,1)' }
  scaleLab.getCell('B3').numFmt = '0.00x'
  ;['A2','B2','D2','E2','A3','B3'].forEach(ref => { thinBorder(scaleLab.getCell(ref)); fill(scaleLab.getCell(ref), COLORS.bgSoft) })
  scaleLab.getCell('E2').protection = { locked: false }

  // Table header
  scaleLab.getRow(5).values = ['Item', 'Net', 'Unit', 'Scaled Net', 'Scaled Gross', 'Scaled Cost']
  scaleLab.getRow(5).font = { name: 'Calibri', size: 10, bold: true }
  scaleLab.getRow(5).eachCell(c => applyHeaderStyle(c))

  // Data
  let sr = 6
  for (const line of lines) {
    scaleLab.getCell(`A${sr}`).value = line.name
    scaleLab.getCell(`B${sr}`).value = line.net_qty
    scaleLab.getCell(`C${sr}`).value = line.unit
    scaleLab.getCell(`D${sr}`).value = { formula: `B${sr}*$B$3` }
    scaleLab.getCell(`E${sr}`).value = { formula: `${safeNum(line.gross_qty)}*$B$3` }
    scaleLab.getCell(`F${sr}`).value = { formula: `${safeNum(line.line_cost)}*$B$3` }
    ;['B','D','E'].forEach(c => scaleLab.getCell(`${c}${sr}`).numFmt = '#,##0.000')
    scaleLab.getCell(`F${sr}`).numFmt = moneyFmt(currency, 2)
    ;['A','B','C','D','E','F'].forEach(c => thinBorder(scaleLab.getCell(`${c}${sr}`)))
    sr++
  }
  autosizeColumns(scaleLab)
  await scaleLab.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: true })

  // ===== 4. METHOD SHEET =====
  const method = workbook.addWorksheet('Method', { pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true } })
  method.columns = [{ width: 6 }, { width: 76 }]
  method.getCell('A1').value = name; method.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  method.mergeCells('A1:B1')
  method.getCell('A3').value = 'Preparation Method'; method.getCell('A3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textMuted } }
  method.mergeCells('A3:B3')

  let mr = 5
  if (cleanSteps.length) {
    for (let i = 0; i < cleanSteps.length; i++) {
      method.getCell(`A${mr}`).value = `${i + 1}.`
      method.getCell(`A${mr}`).alignment = { vertical: 'top', horizontal: 'right' }
      method.getCell(`A${mr}`).font = { name: 'Calibri', size: 10, bold: true }
      method.getCell(`B${mr}`).value = cleanSteps[i]
      method.getCell(`B${mr}`).alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
      thinBorder(method.getCell(`A${mr}`)); thinBorder(method.getCell(`B${mr}`))
      method.getRow(mr).height = Math.max(20, Math.ceil(cleanSteps[i].length / 80) * 15)
      mr++
    }
  } else {
    method.getCell('A5').value = '—'; method.getCell('B5').value = 'No steps provided.'
  }
  await method.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: false })

  // ===== 5. NUTRITION SHEET =====
  const nutrition = workbook.addWorksheet('Nutrition', { pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true } })
  nutrition.columns = [{ width: 26 }, { width: 20 }]
  nutrition.getCell('A1').value = `${name} — Nutrition`; nutrition.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  nutrition.mergeCells('A1:B1')
  const nkv = (row: number, label: string, value: any) => {
    nutrition.getCell(`A${row}`).value = label
    nutrition.getCell(`A${row}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMuted } }
    nutrition.getCell(`B${row}`).value = value ?? ''
    thinBorder(nutrition.getCell(`A${row}`)); thinBorder(nutrition.getCell(`B${row}`))
  }
  nkv(3, 'Calories', meta.calories); nkv(4, 'Protein (g)', meta.protein_g)
  nkv(5, 'Carbs (g)', meta.carbs_g); nkv(6, 'Fat (g)', meta.fat_g)
  nkv(7, 'Portions', portions); nkv(8, 'Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '')
  await nutrition.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: false })

  // ===== 6. PHOTOS SHEET (PROFESSIONAL GALLERY - SINGLE PAGE) =====
  const gallery = workbook.addWorksheet('Photos', {
    views: [{ showGridLines: false, zoom: 85 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5 } },
  })
  gallery.columns = [{ width: 38 }, { width: 38 }, { width: 38 }]

  // Title
  gallery.mergeCells('A1:C1')
  gallery.getCell('A1').value = `${name} — Photo Gallery`
  gallery.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.text } }
  gallery.getCell('A1').alignment = { horizontal: 'center', vertical: 'bottom' }

  gallery.mergeCells('A2:C2')
  gallery.getCell('A2').value = 'Step-by-step visual preparation guide'
  gallery.getCell('A2').font = { name: 'Calibri', size: 10, color: { argb: COLORS.textMuted } }
  gallery.getCell('A2').alignment = { horizontal: 'center', vertical: 'top' }

  let currentRow = 4

  // Main Recipe Photo (Full Width)
  if (meta.photo_url) {
    gallery.mergeCells(`A${currentRow}:C${currentRow}`)
    gallery.getCell(`A${currentRow}`).value = 'RECIPE PHOTO'
    gallery.getCell(`A${currentRow}`).font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.primary } }
    currentRow++

    gallery.mergeCells(`A${currentRow}:C${currentRow + 11}`)
    const mainCell = gallery.getCell(`A${currentRow}`)
    mainCell.border = { top: { style: 'medium', color: { argb: COLORS.border } }, left: { style: 'medium', color: { argb: COLORS.border } }, bottom: { style: 'medium', color: { argb: COLORS.border } }, right: { style: 'medium', color: { argb: COLORS.border } } }
    fill(mainCell, COLORS.bgSoft)

    const added = await addImageToSheet(workbook, gallery, meta.photo_url, { col: 0.4, row: currentRow + 0.4, width: 460, height: 300 })
    if (!added) {
      gallery.getCell(`A${currentRow}`).value = 'Photo not available'
      gallery.getCell(`A${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' }
      gallery.getCell(`A${currentRow}`).font = { color: { argb: COLORS.textMuted } }
    }
    currentRow += 13
  }

  // Step Photos Grid (3 columns)
  const photosPerRow = 3
  const cardHeight = 16

  for (let i = 0; i < cleanSteps.length; i++) {
    const colIndex = i % photosPerRow
    const rowIndex = Math.floor(i / photosPerRow)
    const startCol = colIndex * 2 // 0, 2, 4 for columns A, C, E (but we use A, B, C with spacing)
    const startRow = currentRow + (rowIndex * cardHeight)

    await createPhotoCard(
      workbook,
      gallery,
      startRow,
      colIndex * 2, // A=0, C=2, E=4
      i + 1,
      cleanSteps[i],
      stepPhotos[i] || null
    )
  }

  // Set row heights for visual spacing
  const totalRows = currentRow + (Math.ceil(cleanSteps.length / photosPerRow) * cardHeight)
  for (let ri = currentRow; ri < totalRows; ri++) {
    gallery.getRow(ri).height = 12
  }

  await gallery.protect('GastroChef2024', { selectLockedCells: true, selectUnlockedCells: false })

  // ===== SAVE FILE =====
  try {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, `${safeFileName(name)} - Ultra Export.xlsx`)
  } catch (error) {
    console.error('Excel export failed:', error)
    alert('Failed to export Excel file. Please try again.')
  }
}

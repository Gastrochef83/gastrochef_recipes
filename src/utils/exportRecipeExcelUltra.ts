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

// ================= Enhanced Color Palette =================
const COLORS = {
  // الرئيسية
  primary: 'FF2E7D78',      // أخضر غامق أنيق
  primaryLight: 'FFE8F3F2',  // أخضر فاتح جداً
  secondary: 'FFC17B4A',     // برتقالي-بني دافئ (للتباين)
  accent: 'FFD94E4E',        // أحمر ناعم (للتحذيرات)
  
  // خلفيات
  header1: 'FF2C3E50',       // أزرق داكن للعناوين الرئيسية
  header2: 'FF34495E',       // أزرق داكن أقل
  header3: 'FF7F8C8D',       // رمادي للعناوين الفرعية
  
  // Borders
  border: 'FFBDC3C7',        // رمادي فاتح للحدود
  borderDark: 'FF7F8C8D',    // رمادي غامق للحدود البارزة
  
  // Text
  text: 'FF2C3E50',          // نص أساسي
  textLight: 'FF7F8C8D',     // نص ثانوي
  textWhite: 'FFFFFFFF',     // نص أبيض
  textWarning: 'FFC0392B',   // نص تحذير
  
  // Backgrounds
  bgWhite: 'FFFFFFFF',
  bgSoft: 'FFF9F9F9',        // خلفية ناعمة جداً
  bgAlternate: 'FFF2F4F6',   // خلفية متبادلة للصفوف
  bgSuccess: 'FF27AE60',     // أخضر للنجاح
  bgWarning: 'FFFCF3E2',     // أصفر فاتح للتحذيرات
  bgGold: 'FFF1C40F',        // ذهبي للتمييز
  
  // Gradients (للخلايا المهمة)
  gradientStart: 'FF3498DB',
  gradientEnd: 'FF2980B9',
}

// ================= Enhanced Styling Functions =================
function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function gradientFill(cell: ExcelJS.Cell, startArgb: string, endArgb: string, degree = 90) {
  cell.fill = {
    type: 'gradient',
    gradient: 'angle',
    degree,
    stops: [
      { position: 0, color: { argb: startArgb } },
      { position: 1, color: { argb: endArgb } }
    ]
  }
}

function thinBorder(cell: ExcelJS.Cell, color = COLORS.border, style: 'thin' | 'medium' | 'thick' = 'thin') {
  cell.border = {
    top: { style, color: { argb: color } },
    left: { style, color: { argb: color } },
    bottom: { style, color: { argb: color } },
    right: { style, color: { argb: color } },
  }
}

function noBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'none' },
    left: { style: 'none' },
    bottom: { style: 'none' },
    right: { style: 'none' },
  }
}

function applyTitleStyle(cell: ExcelJS.Cell, level: 1 | 2 | 3 = 1) {
  const styles = {
    1: { size: 24, bold: true, color: COLORS.textWhite, bg: COLORS.header1 },
    2: { size: 18, bold: true, color: COLORS.textWhite, bg: COLORS.header2 },
    3: { size: 14, bold: true, color: COLORS.text, bg: COLORS.header3 }
  }
  const style = styles[level]
  
  fill(cell, style.bg)
  cell.font = { name: 'Calibri', size: style.size, bold: style.bold, color: { argb: style.color } }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  thinBorder(cell, COLORS.borderDark, 'medium')
}

function applyHeaderStyle(cell: ExcelJS.Cell, variant: 'primary' | 'secondary' | 'tertiary' = 'primary') {
  const styles = {
    primary: { bg: COLORS.header2, color: COLORS.textWhite, size: 11 },
    secondary: { bg: COLORS.header3, color: COLORS.textWhite, size: 10 },
    tertiary: { bg: COLORS.bgSoft, color: COLORS.text, size: 10 }
  }
  const style = styles[variant]
  
  fill(cell, style.bg)
  thinBorder(cell, COLORS.border)
  cell.font = { name: 'Calibri', size: style.size, bold: true, color: { argb: style.color } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

function applyKPICardStyle(cell: ExcelJS.Cell, isPrimary = false) {
  if (isPrimary) {
    gradientFill(cell, COLORS.primary, COLORS.header1, 135)
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textWhite } }
  } else {
    fill(cell, COLORS.bgWhite)
    thinBorder(cell, COLORS.border, 'medium')
    cell.font = { name: 'Calibri', size: 11, color: { argb: COLORS.text } }
  }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

function applyCellStyle(cell: ExcelJS.Cell, options: {
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  bgColor?: string
  align?: 'left' | 'center' | 'right'
  border?: boolean
} = {}) {
  if (options.bgColor) fill(cell, options.bgColor)
  if (options.border !== false) thinBorder(cell, COLORS.border)
  
  cell.font = {
    name: 'Calibri',
    size: options.fontSize || 10,
    bold: options.bold || false,
    italic: options.italic || false,
    color: { argb: options.color || COLORS.text }
  }
  
  cell.alignment = {
    vertical: 'middle',
    horizontal: options.align || 'left',
    wrapText: true
  }
}

// ================= Rest of helpers (same as before) =================
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

// ================= Image Handling =================
async function fetchImageAsBase64(url: string | null | undefined): Promise<{ base64: string; extension: 'png' | 'jpeg' } | null> {
  try {
    if (!url || typeof url !== 'string') return null
    const cleanUrl = url.trim()
    if (!cleanUrl) return null

    if (cleanUrl.startsWith('data:image/')) {
      return parseDataUrl(cleanUrl)
    }

    let fetchUrl = cleanUrl
    if (cleanUrl.startsWith('/')) {
      fetchUrl = `${window.location.origin}${cleanUrl}`
    } else if (!cleanUrl.startsWith('http')) {
      fetchUrl = `https:${cleanUrl}`
    }

    const response = await fetch(fetchUrl, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit',
      headers: { 'Accept': 'image/*' }
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
  options: { col: number; row: number; width: number; height: number; colOffset?: number; rowOffset?: number }
): Promise<boolean> {
  try {
    if (!imageUrl) return false
    
    const imageData = await fetchImageAsBase64(imageUrl)
    if (!imageData) return false

    const imageId = workbook.addImage({
      base64: imageData.base64,
      extension: imageData.extension,
    })

    const colOffset = options.colOffset || 0
    const rowOffset = options.rowOffset || 0
    
    sheet.addImage(imageId, {
      tl: { col: options.col + colOffset, row: options.row + rowOffset },
      ext: { width: options.width, height: options.height },
      editAs: 'oneCell',
    })
    
    return true
  } catch {
    return false
  }
}

async function addQRCode(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, payload: string) {
  try {
    const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
    const parsed = parseDataUrl(dataUrl)
    if (!parsed) return
    const imageId = workbook.addImage({ base64: parsed.base64, extension: parsed.extension })
    sheet.addImage(imageId, { tl: { col: 3.2, row: 0.3 }, ext: { width: 80, height: 80 } })
  } catch {}
}

function autosizeColumns(sheet: ExcelJS.Worksheet, min = 12, max = 50) {
  sheet.columns?.forEach((col) => {
    let longest = min
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const val = cell.value
      const text = typeof val === 'object' && val && 'richText' in val
        ? (val as any).richText?.map((x: any) => x.text).join('') || ''
        : String(val ?? '')
      const len = text.split('\n').reduce((a, l) => Math.max(a, l.length), 0)
      longest = Math.max(longest, Math.min(max, len + 3))
    })
    col.width = longest
  })
}

// ================= Enhanced Main Export Function =================
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
    ? Math.min(100, Math.max(0, safeNum(meta.target_food_cost_pct, 0))) 
    : null
  const cleanSteps = (meta.steps || []).map((s) => (s || '').trim()).filter(Boolean)
  const stepPhotos = (meta.step_photos || []).map((p) => (p || '').trim())

  // ===== Workbook Setup =====
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GastroChef'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.company = 'GastroChef'
  workbook.title = `${name} — Professional Recipe Export`

  const now = new Date()
  const reportId = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`
  const recipeId = meta.id || '7dc0a2bd-b607-4c47-a301-734f2f9072df'
  const recipeCode = meta.code || 'PREP-001'

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const qrPayload = recipeId && baseUrl ? `${baseUrl}/#/recipe?id=${encodeURIComponent(recipeId)}` : `Recipe: ${name}`

  const ingredientCost = lines.filter(l => l.type === 'ingredient').reduce((a, l) => a + safeNum(l.line_cost), 0)
  const subrecipeCost = lines.filter(l => l.type === 'subrecipe').reduce((a, l) => a + safeNum(l.line_cost), 0)

  // ===== 1. SUMMARY SHEET (Enhanced) =====
  const summary = workbook.addWorksheet('Summary', {
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true },
    properties: { tabColor: { argb: COLORS.primary } }
  })
  summary.columns = [{ width: 22 }, { width: 30 }, { width: 22 }, { width: 30 }]

  await addQRCode(workbook, summary, qrPayload)

  // Enhanced Title Section with Gradient
  summary.mergeCells('A2:D2')
  const titleCell = summary.getCell('A2')
  gradientFill(titleCell, COLORS.primary, COLORS.header1, 135)
  titleCell.value = 'GastroChef'
  titleCell.font = { name: 'Calibri', size: 28, bold: true, color: { argb: COLORS.textWhite } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  thinBorder(titleCell, COLORS.borderDark, 'medium')

  // Decorative Line
  summary.mergeCells('A3:D3')
  const lineCell = summary.getCell('A3')
  lineCell.value = '✦  PROFESSIONAL KITCHEN INTELLIGENCE  ✦'
  lineCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: COLORS.textLight } }
  lineCell.alignment = { horizontal: 'center' }

  // Kitchen Intelligence Line
  summary.mergeCells('A5:D5')
  const intelligenceCell = summary.getCell('A5')
  intelligenceCell.value = 'Kitchen Intelligence — Costing, Nutrition, Method & Images'
  applyCellStyle(intelligenceCell, { align: 'center', italic: true, fontSize: 11, color: COLORS.textLight })

  // Report ID and Recipe ID with Background
  summary.mergeCells('A6:D6')
  const idCell = summary.getCell('A6')
  fill(idCell, COLORS.bgSoft)
  idCell.value = `📋 Report ID: ${reportId}   |   🔖 Recipe ID: ${recipeId}`
  applyCellStyle(idCell, { align: 'center', fontSize: 9, color: COLORS.textLight, bgColor: COLORS.bgSoft })

  // Recipe Name with Stylish Border
  summary.mergeCells('A8:D8')
  const nameCell = summary.getCell('A8')
  nameCell.value = name
  nameCell.font = { name: 'Calibri', size: 26, bold: true, color: { argb: COLORS.primary } }
  nameCell.alignment = { horizontal: 'center' }
  nameCell.border = {
    bottom: { style: 'double', color: { argb: COLORS.primary } },
    top: { style: 'thin', color: { argb: COLORS.border } }
  }

  // Metadata Section with alternating background
  let r = 10
  const addMetadataRow = (label: string, value: any, isAlternate = false) => {
    summary.getCell(`A${r}`).value = label
    applyCellStyle(summary.getCell(`A${r}`), { bold: true, color: COLORS.textLight, bgColor: isAlternate ? COLORS.bgAlternate : COLORS.bgWhite })
    
    summary.getCell(`B${r}`).value = value ?? ''
    applyCellStyle(summary.getCell(`B${r}`), { bgColor: isAlternate ? COLORS.bgAlternate : COLORS.bgWhite })
    summary.mergeCells(`B${r}:D${r}`)
    
    if (typeof value === 'number' && (label.includes('Price') || label.includes('Cost'))) {
      summary.getCell(`B${r}`).numFmt = moneyFmt(currency, 2)
    }
    r++
  }

  const metadata = [
    ['🔑 Code', recipeCode],
    ['🏷️ Category', meta.category || ''],
    ['🍽️ Portions', portions],
    ['⚖️ Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '3500 g'],
    ['💱 Currency', currency],
    ['💰 Selling Price', sellingPrice > 0 ? sellingPrice : ''],
    ['🎯 Target FC%', targetFc != null ? fmtPercent(targetFc) : '30.0%'],
    ['📝 Description', meta.description || '']
  ]

  metadata.forEach(([label, value], index) => addMetadataRow(label, value, index % 2 === 1))

  r += 2

  // Enhanced KPI Cards
  const addKPICard = (row: number, col: 'A' | 'C', title: string, value: any, format: 'number' | 'percent' | 'currency' = 'currency', isPrimary = false) => {
    const startCol = col
    const endCol = col === 'A' ? 'B' : 'D'
    
    summary.mergeCells(`${startCol}${row}:${endCol}${row + 2}`)
    const cell = summary.getCell(`${startCol}${row}`)
    
    // Card background
    if (isPrimary) {
      gradientFill(cell, COLORS.primary, COLORS.header1, 135)
    } else {
      fill(cell, COLORS.bgWhite)
    }
    
    // Border
    thinBorder(cell, isPrimary ? COLORS.primary : COLORS.border, 'medium')
    
    // Title
    cell.value = title
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: isPrimary ? COLORS.textWhite : COLORS.textLight }
    }
    cell.alignment = { vertical: 'top', horizontal: 'center' }
    
    // Value
    const valueCell = summary.getCell(`${startCol}${row + 1}`)
    valueCell.value = value ?? 0
    valueCell.font = {
      name: 'Calibri',
      size: 20,
      bold: true,
      color: { argb: isPrimary ? COLORS.textWhite : COLORS.primary }
    }
    valueCell.alignment = { vertical: 'center', horizontal: 'center' }
    
    // Format
    if (format === 'percent') {
      valueCell.numFmt = '0.0%'
    } else if (format === 'currency') {
      valueCell.numFmt = moneyFmt(currency, 2)
    }
  }

  addKPICard(r, 'A', 'TOTAL COST', totals.totalCost, 'currency', true)
  addKPICard(r, 'C', 'COST PER PORTION', totals.cpp, 'currency', false)
  
  addKPICard(r + 3, 'A', 'FOOD COST %', totals.fcPct != null ? totals.fcPct / 100 : null, 'percent', false)
  addKPICard(r + 3, 'C', 'MARGIN', totals.margin, 'currency', false)

  r += 7

  // Enhanced Financial Summary
  summary.getCell(`A${r}`).value = '📊 FINANCIAL SUMMARY'
  applyCellStyle(summary.getCell(`A${r}`), { bold: true, fontSize: 14, color: COLORS.primary, bgColor: COLORS.bgSoft })
  summary.mergeCells(`A${r}:D${r}`)
  r++

  const financialData = [
    ['Ingredient Cost', ingredientCost, '📦 Lines', lines.length],
    ['Sub-Recipe Cost', subrecipeCost, '⚠️ Warnings', lines.filter(l => l.warnings?.length).length],
    ['Total Recipe Cost', totals.totalCost, '📷 Recipe Photo', meta.photo_url ? '✓ Included' : '✗ Not included'],
    ['Cost per Portion', totals.cpp, '🖼️ Step Photos', `${stepPhotos.filter(p => p).length}/${cleanSteps.length}`],
    ['Selling Price', sellingPrice > 0 ? sellingPrice : '—', '📋 Method Steps', cleanSteps.length],
    ['Margin', totals.margin, '📅 Prepared', now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })]
  ]

  financialData.forEach(([label1, value1, label2, value2], index) => {
    const bgColor = index % 2 === 0 ? COLORS.bgWhite : COLORS.bgAlternate
    
    summary.getCell(`A${r}`).value = label1
    applyCellStyle(summary.getCell(`A${r}`), { color: COLORS.text, bgColor })
    
    summary.getCell(`B${r}`).value = value1
    applyCellStyle(summary.getCell(`B${r}`), { bgColor })
    if (typeof value1 === 'number') {
      summary.getCell(`B${r}`).numFmt = moneyFmt(currency, 2)
    }
    
    summary.getCell(`C${r}`).value = label2
    applyCellStyle(summary.getCell(`C${r}`), { color: COLORS.text, bgColor })
    
    summary.getCell(`D${r}`).value = value2
    applyCellStyle(summary.getCell(`D${r}`), { bgColor })
    
    r++
  })

  r += 2
  summary.getCell(`A${r}`).value = 'Prepared by:'
  applyCellStyle(summary.getCell(`A${r}`), { bold: true })
  
  summary.getCell(`B${r}`).value = '__________________________'
  summary.mergeCells(`B${r}:C${r}`)
  
  summary.getCell(`D${r}`).value = `📅 ${now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`
  applyCellStyle(summary.getCell(`D${r}`), { align: 'right' })

  // ===== 2. INGREDIENTS SHEET (Enhanced) =====
  const ingredients = workbook.addWorksheet('Ingredients', {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 0 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
    properties: { tabColor: { argb: COLORS.secondary } }
  })

  ingredients.columns = [
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Code', key: 'code', width: 14 },
    { header: 'Name', key: 'name', width: 35 },
    { header: 'Net Qty', key: 'net', width: 12 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Yield %', key: 'yield', width: 10 },
    { header: 'Gross Qty', key: 'gross', width: 12 },
    { header: 'Unit Cost', key: 'uCost', width: 14 },
    { header: 'Line Cost', key: 'lCost', width: 14 },
    { header: 'Notes', key: 'notes', width: 25 },
    { header: 'Warnings', key: 'warnings', width: 25 }
  ]

  // Enhanced Title
  ingredients.mergeCells('A1:K2')
  const ingTitleCell = ingredients.getCell('A1')
  gradientFill(ingTitleCell, COLORS.secondary, COLORS.header1, 135)
  ingTitleCell.value = `${name} — INGREDIENTS & COSTING`
  ingTitleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.textWhite } }
  ingTitleCell.alignment = { vertical: 'center', horizontal: 'center' }
  thinBorder(ingTitleCell, COLORS.borderDark, 'medium')

  // Subtitle with stats
  ingredients.mergeCells('A3:K3')
  const ingSubCell = ingredients.getCell('A3')
  fill(ingSubCell, COLORS.bgSoft)
  ingSubCell.value = `📋 Total Items: ${lines.length} | 💰 Total Cost: ${currency} ${totals.totalCost.toFixed(2)} | ⚖️ Yield: ${yieldQty || 3500} ${yieldUnit || 'g'}`
  ingSubCell.font = { name: 'Calibri', size: 10, color: { argb: COLORS.text } }
  ingSubCell.alignment = { horizontal: 'center' }

  // Enhanced Header
  const headerRow = ingredients.getRow(4)
  headerRow.values = ingredients.columns.map(c => c.header)
  headerRow.eachCell((cell, colNumber) => {
    if (colNumber <= 11) {
      applyHeaderStyle(cell, colNumber <= 3 ? 'primary' : colNumber <= 7 ? 'secondary' : 'tertiary')
    }
  })

  // Data rows with alternating colors
  lines.forEach((line, index) => {
    const warningsText = line.warnings?.join(', ') || (line.unit_cost === 0 ? '⚠️ Ingredient without price' : '')
    const bgColor = index % 2 === 0 ? COLORS.bgWhite : COLORS.bgAlternate
    
    const row = ingredients.addRow({
      type: line.type,
      code: line.code || `ING-${String(index + 1).padStart(4, '0')}`,
      name: line.name,
      net: line.net_qty,
      unit: line.unit,
      yield: line.yield_percent / 100,
      gross: line.gross_qty,
      uCost: line.unit_cost,
      lCost: line.line_cost,
      notes: line.notes || '',
      warnings: warningsText
    })
    
    row.eachCell((cell, colNumber) => {
      if (colNumber <= 11) {
        applyCellStyle(cell, { bgColor })
        
        // Special formatting for warnings
        if (colNumber === 11 && line.unit_cost === 0) {
          cell.font = { color: { argb: COLORS.textWarning }, bold: true }
        }
        
        // Special formatting for subrecipes
        if (colNumber === 1 && line.type === 'subrecipe') {
          cell.font = { bold: true, color: { argb: COLORS.secondary } }
        }
      }
    })
    
    row.getCell('yield').numFmt = '0.0%'
    row.getCell('net').numFmt = '#,##0.0'
    row.getCell('gross').numFmt = '#,##0.0'
    row.getCell('uCost').numFmt = moneyFmt(currency, 3)
    row.getCell('lCost').numFmt = moneyFmt(currency, 3)
  })

  // Enhanced Footer
  const footer = ingredients.addRow({ name: 'TOTAL', lCost: totals.totalCost })
  footer.eachCell((cell, colNumber) => {
    if (colNumber <= 11) {
      if (colNumber === 3) { // Name column
        cell.value = '🔰 GRAND TOTAL'
      }
      if (colNumber === 9) { // Line Cost column
        cell.numFmt = moneyFmt(currency, 2)
      }
      applyCellStyle(cell, { bold: true, bgColor: COLORS.bgSoft })
    }
  })

  ingredients.autoFilter = 'A4:K4'

  // ===== 3. SCALE LAB SHEET (Enhanced) =====
  const scaleLab = workbook.addWorksheet('Scale Lab', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
    properties: { tabColor: { argb: COLORS.accent } }
  })

  scaleLab.columns = [
    { width: 40 }, // Ingredient
    { width: 14 }, // Base Net Qty
    { width: 8 },  // Unit
    { width: 16 }, // Scaled Net
    { width: 16 }, // Scaled Gross
    { width: 18 }  // Scaled Cost
  ]

  // Title with gradient
  scaleLab.mergeCells('A1:F2')
  const scaleTitleCell = scaleLab.getCell('A1')
  gradientFill(scaleTitleCell, COLORS.accent, COLORS.header1, 135)
  scaleTitleCell.value = `${name} — KITCHEN SCALING LAB`
  scaleTitleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.textWhite } }
  scaleTitleCell.alignment = { vertical: 'center', horizontal: 'center' }
  thinBorder(scaleTitleCell, COLORS.borderDark, 'medium')

  // Control Panel
  scaleLab.getCell('A3').value = '🔧 Base Portions:'
  scaleLab.getCell('B3').value = portions
  scaleLab.getCell('D3').value = '🎯 Target Portions:'
  scaleLab.getCell('E3').value = portions
  
  scaleLab.getCell('A4').value = '📊 Scale Factor:'
  scaleLab.getCell('B4').value = { formula: 'IFERROR(E3/B3,1)' }
  scaleLab.getCell('B4').numFmt = '0.00x'
  
  ;['A3','B3','D3','E3','A4','B4'].forEach(ref => {
    const cell = scaleLab.getCell(ref)
    applyCellStyle(cell, { bold: true, bgColor: COLORS.bgSoft })
  })
  
  scaleLab.getCell('E3').protection = { locked: false }

  // Header
  scaleLab.getRow(6).values = ['🧪 Ingredient / Sub-Recipe', '📦 Base Net', '📏 Unit', '⚖️ Scaled Net', '📦 Scaled Gross', '💰 Scaled Cost']
  scaleLab.getRow(6).eachCell(c => applyHeaderStyle(c, 'primary'))

  // Data rows with alternating colors
  lines.forEach((line, index) => {
    const rowNum = 7 + index
    const bgColor = index % 2 === 0 ? COLORS.bgWhite : COLORS.bgAlternate
    
    scaleLab.getCell(`A${rowNum}`).value = line.name
    applyCellStyle(scaleLab.getCell(`A${rowNum}`), { bgColor })
    
    scaleLab.getCell(`B${rowNum}`).value = line.net_qty
    applyCellStyle(scaleLab.getCell(`B${rowNum}`), { bgColor })
    scaleLab.getCell(`B${rowNum}`).numFmt = '#,##0.0'
    
    scaleLab.getCell(`C${rowNum}`).value = line.unit
    applyCellStyle(scaleLab.getCell(`C${rowNum}`), { bgColor, align: 'center' })
    
    scaleLab.getCell(`D${rowNum}`).value = { formula: `B${rowNum}*$B$4` }
    applyCellStyle(scaleLab.getCell(`D${rowNum}`), { bgColor })
    scaleLab.getCell(`D${rowNum}`).numFmt = '#,##0.0'
    
    scaleLab.getCell(`E${rowNum}`).value = { formula: `${line.gross_qty}*$B$4` }
    applyCellStyle(scaleLab.getCell(`E${rowNum}`), { bgColor })
    scaleLab.getCell(`E${rowNum}`).numFmt = '#,##0.0'
    
    scaleLab.getCell(`F${rowNum}`).value = { formula: `${line.line_cost}*$B$4` }
    applyCellStyle(scaleLab.getCell(`F${rowNum}`), { bgColor })
    scaleLab.getCell(`F${rowNum}`).numFmt = moneyFmt(currency, 2)
  })

  autosizeColumns(scaleLab)

  // ===== 4. METHOD SHEET (Enhanced) =====
  const method = workbook.addWorksheet('Method', {
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true },
    properties: { tabColor: { argb: COLORS.primary } }
  })

  method.columns = [{ width: 8 }, { width: 92 }]

  // Title
  method.mergeCells('A1:B2')
  const methodTitleCell = method.getCell('A1')
  gradientFill(methodTitleCell, COLORS.primary, COLORS.header1, 135)
  methodTitleCell.value = `${name} — PREPARATION METHOD`
  methodTitleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.textWhite } }
  methodTitleCell.alignment = { vertical: 'center', horizontal: 'center' }
  thinBorder(methodTitleCell, COLORS.borderDark, 'medium')

  // Steps header
  method.getCell('A4').value = '🔪 STEP-BY-STEP GUIDE'
  applyCellStyle(method.getCell('A4'), { bold: true, fontSize: 12, color: COLORS.primary, bgColor: COLORS.bgSoft })
  method.mergeCells('A4:B4')

  // Steps with numbers
  let mr = 6
  if (cleanSteps.length) {
    for (let i = 0; i < cleanSteps.length; i++) {
      // Step number with circle background
      method.getCell(`A${mr}`).value = i + 1
      const numCell = method.getCell(`A${mr}`)
      fill(numCell, COLORS.primary)
      numCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.textWhite } }
      numCell.alignment = { vertical: 'top', horizontal: 'center' }
      thinBorder(numCell, COLORS.borderDark, 'thin')
      
      // Step description
      method.getCell(`B${mr}`).value = cleanSteps[i]
      const descCell = method.getCell(`B${mr}`)
      applyCellStyle(descCell, { bgColor: i % 2 === 0 ? COLORS.bgWhite : COLORS.bgAlternate })
      descCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
      thinBorder(descCell, COLORS.border, 'thin')
      
      method.getRow(mr).height = Math.max(25, Math.ceil(cleanSteps[i].length / 90) * 18)
      mr++
    }
  } else {
    method.getCell('A6').value = '—'
    method.getCell('B6').value = 'No steps provided.'
  }

  // ===== 5. PHOTOS SHEET (Enhanced Gallery Style) =====
  const photos = workbook.addWorksheet('Photos', {
    views: [{ showGridLines: false, zoom: 70 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
    properties: { tabColor: { argb: COLORS.secondary } }
  })

  // Set column widths for gallery layout
  photos.columns = [
    { width: 35 }, // Card 1
    { width: 2 },  // Spacer
    { width: 35 }, // Card 2
    { width: 2 },  // Spacer
    { width: 35 }, // Card 3
    { width: 2 },  // Spacer
    { width: 35 }  // Card 4 (if needed)
  ]

  // Gallery Title
  photos.mergeCells('A1:G2')
  const galleryTitleCell = photos.getCell('A1')
  gradientFill(galleryTitleCell, COLORS.secondary, COLORS.primary, 135)
  galleryTitleCell.value = `${name} — PHOTO GALLERY`
  galleryTitleCell.font = { name: 'Calibri', size: 24, bold: true, color: { argb: COLORS.textWhite } }
  galleryTitleCell.alignment = { horizontal: 'center', vertical: 'center' }
  thinBorder(galleryTitleCell, COLORS.borderDark, 'medium')

  // Subtitle
  photos.mergeCells('A3:G3')
  const gallerySubCell = photos.getCell('A3')
  gallerySubCell.value = '✨ Step-by-step visual preparation guide ✨'
  gallerySubCell.font = { name: 'Calibri', size: 12, italic: true, color: { argb: COLORS.textLight } }
  gallerySubCell.alignment = { horizontal: 'center' }

  let currentRow = 5

  // Main Recipe Photo Card
  if (meta.photo_url) {
    photos.mergeCells(`A${currentRow}:G${currentRow}`)
    const mainTitleCell = photos.getCell(`A${currentRow}`)
    mainTitleCell.value = '📌 MAIN RECIPE PHOTO'
    mainTitleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.primary } }
    mainTitleCell.alignment = { horizontal: 'center' }
    currentRow++

    photos.mergeCells(`A${currentRow}:G${currentRow + 10}`)
    const mainPhotoCell = photos.getCell(`A${currentRow}`)
    fill(mainPhotoCell, COLORS.bgWhite)
    thinBorder(mainPhotoCell, COLORS.primary, 'medium')

    const imageAdded = await addImageToSheet(workbook, photos, meta.photo_url, {
      col: 0,
      row: currentRow,
      width: 1000,
      height: 400,
      colOffset: 0.5,
      rowOffset: 0.5
    })

    if (!imageAdded) {
      photos.getCell(`A${currentRow + 5}`).value = '🖼️ Image Preview Not Available'
      photos.getCell(`A${currentRow + 5}`).font = { size: 14, color: { argb: COLORS.textLight } }
      photos.getCell(`A${currentRow + 5}`).alignment = { horizontal: 'center' }
    }
    
    currentRow += 12
  }

  // Helper function for step cards
  const addStepCard = async (startRow: number, stepNumber: number, description: string, photoUrl: string | null, colIndex: number) => {
    const col = colIndex * 3 // A=0, D=3, G=6
    const cardCol = col
    const cardWidth = 35
    
    // Card container
    photos.mergeCells(startRow, 1 + cardCol, startRow + 14, 1 + cardCol)
    const cardCell = photos.getCell(startRow, 1 + cardCol)
    fill(cardCell, COLORS.bgWhite)
    thinBorder(cardCell, COLORS.border, 'medium')
    
    // Step number badge
    const badgeCell = photos.getCell(startRow, 1 + cardCol)
    badgeCell.value = `STEP ${stepNumber}`
    badgeCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.textWhite } }
    badgeCell.alignment = { horizontal: 'center', vertical: 'top' }
    fill(badgeCell, COLORS.primary)
    
    // Photo area
    if (photoUrl) {
      const imageAdded = await addImageToSheet(workbook, photos, photoUrl, {
        col: cardCol,
        row: startRow + 1,
        width: 280,
        height: 180,
        colOffset: 0.3,
        rowOffset: 0.3
      })
      
      if (!imageAdded) {
        const noImageCell = photos.getCell(startRow + 6, 1 + cardCol)
        noImageCell.value = '📷 No Image'
        noImageCell.font = { color: { argb: COLORS.textLight }, size: 10 }
        noImageCell.alignment = { horizontal: 'center' }
      }
    } else {
      const noImageCell = photos.getCell(startRow + 6, 1 + cardCol)
      noImageCell.value = '📷 No Image Available'
      noImageCell.font = { color: { argb: COLORS.textLight }, size: 10 }
      noImageCell.alignment = { horizontal: 'center' }
    }
    
    // Description
    const descCell = photos.getCell(startRow + 11, 1 + cardCol)
    descCell.value = description
    descCell.font = { name: 'Calibri', size: 9 }
    descCell.alignment = { wrapText: true, vertical: 'top' }
    fill(descCell, COLORS.bgSoft)
  }

  // Create step cards in rows of 3
  for (let i = 0; i < cleanSteps.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const stepIndex = i + j
      if (stepIndex < cleanSteps.length) {
        await addStepCard(
          currentRow,
          stepIndex + 1,
          cleanSteps[stepIndex],
          stepPhotos[stepIndex] || null,
          j
        )
      }
    }
    currentRow += 16
  }

  // ===== SAVE FILE =====
  try {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, `${safeFileName(name)} - GastroChef Export.xlsx`)
    console.log('✅ Excel file exported successfully with enhanced styling')
  } catch (error) {
    console.error('❌ Excel export failed:', error)
    alert('Failed to export Excel file. Please try again.')
  }
}

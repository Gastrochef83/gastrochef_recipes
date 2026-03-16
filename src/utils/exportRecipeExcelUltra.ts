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
  step_photos?: string[] | null  // مصفوفة من روابط الصور لكل خطوة
  photo_url?: string | null      // الصورة الرئيسية للوصفة
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

// ================= Image Handling (محسّن) =================
async function fetchImageAsBase64(url: string | null | undefined): Promise<{ base64: string; extension: 'png' | 'jpeg' } | null> {
  try {
    if (!url || typeof url !== 'string') return null
    const cleanUrl = url.trim()
    if (!cleanUrl) return null

    // التعامل مع Data URLs
    if (cleanUrl.startsWith('data:image/')) {
      return parseDataUrl(cleanUrl)
    }

    // محاولة جلب الصورة من المسار المطلق
    let fetchUrl = cleanUrl
    
    // إذا كان المسار نسبي، نحول إلى مسار مطلق
    if (cleanUrl.startsWith('/')) {
      fetchUrl = `${window.location.origin}${cleanUrl}`
    } else if (!cleanUrl.startsWith('http')) {
      // إذا كان المسار بدون بروتوكول، نضيف http:
      fetchUrl = `https:${cleanUrl}`
    }

    console.log('Fetching image from:', fetchUrl)

    // جلب الصورة مع تجاوز CORS
    const response = await fetch(fetchUrl, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit',
      headers: {
        'Accept': 'image/*'
      }
    })

    if (!response.ok) {
      console.warn('Failed to fetch image:', response.status, response.statusText)
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('image/')) {
      console.warn('Not an image:', contentType)
      return null
    }

    const blob = await response.blob()
    const buffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
    const extension: 'png' | 'jpeg' = contentType.includes('png') ? 'png' : 'jpeg'

    return { base64, extension }
  } catch (error) {
    console.warn('Error fetching image:', error)
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
    if (!imageData) {
      console.warn('Could not load image:', imageUrl)
      
      // إضافة placeholder للنص في حالة فشل تحميل الصورة
      const cell = sheet.getCell(options.row + 2, options.col + 1)
      cell.value = '📷'
      cell.font = { size: 24 }
      cell.alignment = { horizontal: 'center', vertical: 'center' }
      return false
    }

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
  } catch (error) {
    console.warn('Error adding image to sheet:', error)
    return false
  }
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

  await addQRCode(workbook, summary, qrPayload)

  // Title
  summary.mergeCells('A2:D2')
  summary.getCell('A2').value = 'GastroChef'
  summary.getCell('A2').font = { name: 'Calibri', size: 20, bold: true }
  summary.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' }

  // Kitchen Intelligence Line
  summary.mergeCells('A5:D5')
  summary.getCell('A5').value = 'Kitchen Intelligence — Costing, Nutrition, Method & Images'
  summary.getCell('A5').font = { name: 'Calibri', size: 11, italic: true }
  summary.getCell('A5').alignment = { horizontal: 'center' }

  // Report ID and Recipe ID
  summary.mergeCells('A6:D6')
  summary.getCell('A6').value = `Report ID: ${reportId}   |   Recipe ID: ${recipeId}`
  summary.getCell('A6').font = { name: 'Calibri', size: 9, color: { argb: COLORS.textMuted } }
  summary.getCell('A6').alignment = { horizontal: 'center' }

  // Recipe Name
  summary.mergeCells('A8:D8')
  summary.getCell('A8').value = name
  summary.getCell('A8').font = { name: 'Calibri', size: 22, bold: true }
  summary.getCell('A8').alignment = { horizontal: 'center' }

  // Empty row
  summary.mergeCells('A9:D9')

  let r = 10
  const kv = (label: string, value: any) => {
    summary.getCell(`A${r}`).value = label
    summary.getCell(`A${r}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.textMuted } }
    summary.getCell(`B${r}`).value = value ?? ''
    summary.mergeCells(`B${r}:D${r}`)
    thinBorder(summary.getCell(`A${r}`))
    thinBorder(summary.getCell(`B${r}`))
    r++
  }

  kv('Code', recipeCode)
  kv('Kitchen Ref', kitchenRef)
  kv('Audit Stamp', `GC-${reportId}-${recipeId.substring(0,6).toUpperCase()}`)
  kv('Category', meta.category || '')
  kv('Portions', portions)
  kv('Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '3500 g')
  kv('Currency', currency)
  kv('Selling Price', sellingPrice > 0 ? sellingPrice : '')
  kv('Target FC%', targetFc != null ? fmtPercent(targetFc) : '30.0%')
  kv('Description', meta.description || '')

  // Empty row
  r += 1

  // Recipe total and Per serving headers
  summary.getCell(`A${r}`).value = 'Recipe total'
  summary.getCell(`A${r}`).font = { name: 'Calibri', size: 11, bold: true }
  summary.getCell(`C${r}`).value = 'Per serving'
  summary.getCell(`C${r}`).font = { name: 'Calibri', size: 11, bold: true }
  r += 1

  // Target line
  summary.getCell(`A${r}`).value = `Target: ${targetFc != null ? fmtPercent(targetFc) : '30.0%'}`
  summary.getCell(`C${r}`).value = '0'
  r += 3

  // Financial Summary
  summary.getCell(`A${r}`).value = 'Financial Summary'
  summary.getCell(`A${r}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.primary } }
  r += 1

  const financials = [
    ['Ingredient Cost', ingredientCost, 'Lines', lines.length],
    ['Sub-Recipe Cost', subrecipeCost, 'Warnings', lines.filter(l => l.warnings?.length).length],
    ['Total Recipe Cost', totals.totalCost, 'Recipe Photo', meta.photo_url ? 'Included' : 'Not included'],
    ['Cost per Portion', totals.cpp, 'Step Photos', stepPhotos.filter(p => p).length],
    ['Selling Price', sellingPrice > 0 ? sellingPrice : '', 'Method Steps', cleanSteps.length],
    ['Margin', totals.margin, 'Prepared', `${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()}`]
  ]

  financials.forEach(([label1, value1, label2, value2]) => {
    summary.getCell(`A${r}`).value = label1
    summary.getCell(`A${r}`).font = { name: 'Calibri', size: 10, color: { argb: COLORS.textMuted } }
    summary.getCell(`B${r}`).value = value1
    if (typeof value1 === 'number') {
      summary.getCell(`B${r}`).numFmt = label1.includes('%') ? '0.0%' : moneyFmt(currency, 2)
    }
    
    summary.getCell(`C${r}`).value = label2
    summary.getCell(`C${r}`).font = { name: 'Calibri', size: 10, color: { argb: COLORS.textMuted } }
    summary.getCell(`D${r}`).value = value2
    
    thinBorder(summary.getCell(`A${r}`))
    thinBorder(summary.getCell(`B${r}`))
    thinBorder(summary.getCell(`C${r}`))
    thinBorder(summary.getCell(`D${r}`))
    r++
  })

  r += 1
  summary.getCell(`A${r}`).value = 'Prepared by:'
  summary.getCell(`A${r}`).font = { name: 'Calibri', size: 10 }
  summary.getCell(`B${r}`).value = '__________________________'
  summary.getCell(`D${r}`).value = `Date: ${now.getMonth()+1}/${now.getDate()}/${now.getFullYear()}`

  // ===== 2. INGREDIENTS SHEET =====
  const ingredients = workbook.addWorksheet('Ingredients', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
  })

  ingredients.columns = [
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Code', key: 'code', width: 14 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Net Qty', key: 'net', width: 10 },
    { header: 'Unit', key: 'unit', width: 8 },
    { header: 'Yield %', key: 'yield', width: 9 },
    { header: 'Gross Qty', key: 'gross', width: 10 },
    { header: 'Unit Cost', key: 'uCost', width: 12 },
    { header: 'Line Cost', key: 'lCost', width: 12 },
    { header: 'Notes', key: 'notes', width: 20 },
    { header: 'Warnings', key: 'warnings', width: 20 }
  ]

  ingredients.mergeCells('A1:K1')
  ingredients.getCell('A1').value = `${name} — Ingredients & Costing`
  ingredients.getCell('A1').font = { name: 'Calibri', size: 14, bold: true }

  const headerRow = ingredients.getRow(3)
  headerRow.values = ingredients.columns.map(c => c.header)
  headerRow.font = { name: 'Calibri', size: 10, bold: true }
  headerRow.eachCell(c => applyHeaderStyle(c))

  for (const line of lines) {
    const warningsText = line.warnings?.join(', ') || (line.unit_cost === 0 ? 'Ingredient without price' : '')
    
    const row = ingredients.addRow({
      type: line.type,
      code: line.code || `ING-${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
      name: line.name,
      net: line.net_qty,
      unit: line.unit,
      yield: line.yield_percent,
      gross: line.gross_qty,
      uCost: line.unit_cost,
      lCost: line.line_cost,
      notes: line.notes || '',
      warnings: warningsText
    })
    
    row.eachCell(c => { 
      thinBorder(c); 
      c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true } 
    })
    
    row.getCell('yield').numFmt = '0.00%'
    row.getCell('net').numFmt = '#,##0'
    row.getCell('gross').numFmt = '#,##0'
    row.getCell('uCost').numFmt = moneyFmt(currency, 3)
    row.getCell('lCost').numFmt = moneyFmt(currency, 3)
    
    if (line.unit_cost === 0) {
      row.getCell('warnings').font = { color: { argb: 'FFFF0000' } }
    }
  }

  const footer = ingredients.addRow({ name: 'TOTAL', lCost: totals.totalCost })
  footer.font = { name: 'Calibri', size: 11, bold: true }
  footer.getCell('lCost').numFmt = moneyFmt(currency, 2)
  footer.eachCell(c => { thinBorder(c); fill(c, COLORS.bgSoft) })

  ingredients.autoFilter = 'A3:K3'
  autosizeColumns(ingredients)

  // ===== 3. SCALE LAB SHEET =====
  const scaleLab = workbook.addWorksheet('Scale Lab', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
  })
  
  scaleLab.columns = [
    { width: 35 }, // Ingredient / Sub-Recipe
    { width: 12 }, // Base Net Qty
    { width: 8 },  // Unit
    { width: 14 }, // Scaled Net Qty
    { width: 14 }, // Scaled Gross Qty
    { width: 14 }  // Scaled Line Cost
  ]

  scaleLab.getCell('A1').value = `${name} — Kitchen Scaling Lab`
  scaleLab.getCell('A1').font = { name: 'Calibri', size: 16, bold: true }
  scaleLab.mergeCells('A1:F1')

  scaleLab.getCell('A2').value = 'Base Portions'
  scaleLab.getCell('B2').value = portions
  scaleLab.getCell('D2').value = 'Target Portions'
  scaleLab.getCell('E2').value = portions
  
  scaleLab.getCell('A3').value = 'Scale Factor'
  scaleLab.getCell('B3').value = { formula: 'IFERROR(E2/B2,1)' }
  scaleLab.getCell('B3').numFmt = '0.00'
  
  ;['A2','B2','D2','E2','A3','B3'].forEach(ref => { 
    thinBorder(scaleLab.getCell(ref)); 
    fill(scaleLab.getCell(ref), COLORS.bgSoft) 
  })
  
  scaleLab.getCell('E2').protection = { locked: false }

  scaleLab.getRow(5).values = ['Ingredient / Sub-Recipe', 'Base Net Qty', 'Unit', 'Scaled Net Qty', 'Scaled Gross Qty', 'Scaled Line Cost']
  scaleLab.getRow(5).font = { name: 'Calibri', size: 10, bold: true }
  scaleLab.getRow(5).eachCell(c => applyHeaderStyle(c))

  let sr = 6
  for (const line of lines) {
    scaleLab.getCell(`A${sr}`).value = line.name
    scaleLab.getCell(`B${sr}`).value = line.net_qty
    scaleLab.getCell(`C${sr}`).value = line.unit
    scaleLab.getCell(`D${sr}`).value = { formula: `B${sr}*$B$3` }
    scaleLab.getCell(`E${sr}`).value = { formula: `${line.gross_qty}*$B$3` }
    scaleLab.getCell(`F${sr}`).value = { formula: `${line.line_cost}*$B$3` }
    
    ;['B','D','E'].forEach(c => scaleLab.getCell(`${c}${sr}`).numFmt = '#,##0')
    scaleLab.getCell(`F${sr}`).numFmt = moneyFmt(currency, 2)
    
    ;['A','B','C','D','E','F'].forEach(c => thinBorder(scaleLab.getCell(`${c}${sr}`)))
    sr++
  }
  
  autosizeColumns(scaleLab)

  // ===== 4. METHOD SHEET =====
  const method = workbook.addWorksheet('Method', { 
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true } 
  })
  
  method.columns = [{ width: 6 }, { width: 86 }]
  
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

  // ===== 5. PHOTOS SHEET (محسّن للصور) =====
  const photos = workbook.addWorksheet('Photos', {
    views: [{ showGridLines: false, zoom: 70 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true },
  })

  // تعيين عرض الأعمدة
  photos.columns = [
    { width: 30 }, // Column A
    { width: 30 }, // Column B
    { width: 30 }, // Column C
    { width: 30 }, // Column D
    { width: 30 }, // Column E
    { width: 30 }, // Column F
    { width: 30 }  // Column G
  ]

  // Title
  photos.mergeCells('A1:G1')
  photos.getCell('A1').value = `${name} — Photo Gallery`
  photos.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.text } }
  photos.getCell('A1').alignment = { horizontal: 'center', vertical: 'bottom' }

  // Main Recipe Photo
  photos.mergeCells('A3:G3')
  photos.getCell('A3').value = 'Main Recipe Photo'
  photos.getCell('A3').font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.primary } }
  
  if (meta.photo_url) {
    photos.mergeCells('A4:G12')
    const mainCell = photos.getCell('A4')
    mainCell.border = {
      top: { style: 'medium', color: { argb: COLORS.border } },
      left: { style: 'medium', color: { argb: COLORS.border } },
      bottom: { style: 'medium', color: { argb: COLORS.border } },
      right: { style: 'medium', color: { argb: COLORS.border } },
    }
    fill(mainCell, COLORS.bgSoft)

    // إضافة الصورة الرئيسية
    const imageAdded = await addImageToSheet(workbook, photos, meta.photo_url, {
      col: 0,
      row: 3,
      width: 800,
      height: 400,
      colOffset: 0.3,
      rowOffset: 0.3
    })
    
    if (!imageAdded) {
      photos.getCell('A6').value = '⚠️ Image not available'
      photos.getCell('A6').alignment = { horizontal: 'center', vertical: 'center' }
    }
  }

  // دوال مساعدة لإضافة صور الخطوات
  const addStepSection = async (startRow: number, stepNumbers: number[], title: string) => {
    const currentRow = startRow
    
    // عناوين الخطوات
    stepNumbers.forEach((stepNum, index) => {
      const col = index
      const cell = photos.getCell(1 + col, currentRow)
      cell.value = `Step ${stepNum}`
      cell.font = { name: 'Calibri', size: 11, bold: true }
      cell.alignment = { horizontal: 'center' }
    })

    // مساحة الصور
    const imageRow = currentRow + 2
    for (let i = 0; i < stepNumbers.length; i++) {
      const stepIndex = stepNumbers[i] - 1
      const col = i
      photos.mergeCells(imageRow, 1 + col, imageRow + 5, 1 + col)
      const cell = photos.getCell(imageRow, 1 + col)
      cell.border = { 
        top: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        left: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } }
      }
      
      if (stepPhotos[stepIndex]) {
        const imageAdded = await addImageToSheet(workbook, photos, stepPhotos[stepIndex], {
          col: col,
          row: imageRow - 1,
          width: 200,
          height: 150,
          colOffset: 0.2,
          rowOffset: 0.2
        })
        
        if (!imageAdded) {
          photos.getCell(imageRow + 2, 1 + col).value = '📷 No image'
          photos.getCell(imageRow + 2, 1 + col).alignment = { horizontal: 'center' }
        }
      } else {
        photos.getCell(imageRow + 2, 1 + col).value = '📷 No image'
        photos.getCell(imageRow + 2, 1 + col).alignment = { horizontal: 'center' }
      }
    }

    // وصف الخطوات
    const descRow = imageRow + 7
    for (let i = 0; i < stepNumbers.length; i++) {
      const stepIndex = stepNumbers[i] - 1
      const col = i
      if (stepIndex < cleanSteps.length) {
        photos.getCell(descRow, 1 + col).value = `${stepNumbers[i]}. ${cleanSteps[stepIndex]}`
        photos.getCell(descRow, 1 + col).font = { name: 'Calibri', size: 9 }
        photos.getCell(descRow, 1 + col).alignment = { wrapText: true, vertical: 'top' }
      }
    }

    return descRow + 2
  }

  let currentPhotoRow = 15

  // Steps 1-6
  currentPhotoRow = await addStepSection(currentPhotoRow, [1, 2, 3, 4, 5, 6], 'Steps 1-6')
  
  // Steps 7-12
  currentPhotoRow = await addStepSection(currentPhotoRow + 2, [7, 8, 9, 10, 11, 12], 'Steps 7-12')
  
  // Steps 13-18
  currentPhotoRow = await addStepSection(currentPhotoRow + 2, [13, 14, 15, 16, 17, 18], 'Steps 13-18')
  
  // Steps 19-22 (آخر 4 خطوات)
  if (cleanSteps.length >= 19) {
    await addStepSection(currentPhotoRow + 2, [19, 20, 21, 22], 'Steps 19-22')
  }

  // ===== SAVE FILE =====
  try {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, `${safeFileName(name)}.xlsx`)
    console.log('Excel file exported successfully with images')
  } catch (error) {
    console.error('Excel export failed:', error)
    alert('Failed to export Excel file. Please try again.')
  }
}

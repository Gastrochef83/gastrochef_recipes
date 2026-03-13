import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import QRCode from 'qrcode'

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

const COLORS = {
  olive: 'FF556B2F',
  oliveSoft: 'FFEAF0E2',
  teal: 'FF0F766E',
  tealSoft: 'FFE6F7F5',
  charcoal: 'FF1F2937',
  slate: 'FF64748B',
  border: 'FFD7E1D8',
  paper: 'FFFFFCF7',
  panel: 'FFF8FAFC',
  white: 'FFFFFFFF',
  goldSoft: 'FFFEF3C7',
  dangerSoft: 'FFFEE2E2',
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}

function safeNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeText(x: any, fallback = '') {
  const v = String(x ?? '').trim()
  return v || fallback
}

function toTitle(s: string) {
  const t = (s || '').trim()
  return t ? t : 'Recipe'
}

function fmtPercent(n: number | null | undefined, decimals = 1) {
  if (n == null || !Number.isFinite(n)) return ''
  return `${n.toFixed(decimals)}%`
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '_')
}

function moneyFmt(currency: string, decimals = 2) {
  const zeroes = '0'.repeat(Math.max(0, decimals))
  return `"${currency}" #,##0${decimals > 0 ? `.${zeroes}` : ''}`
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

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function font(cell: ExcelJS.Cell, opts: Partial<ExcelJS.Font>) {
  cell.font = {
    name: 'Calibri',
    size: 11,
    color: { argb: COLORS.charcoal },
    ...opts,
  }
}

function align(cell: ExcelJS.Cell, opts: Partial<ExcelJS.Alignment>) {
  cell.alignment = {
    vertical: 'middle',
    horizontal: 'left',
    wrapText: true,
    ...opts,
  }
}

function thinBorder(cell: ExcelJS.Cell, color = COLORS.border) {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  }
}

function styleTitle(cell: ExcelJS.Cell, text: string) {
  cell.value = text
  font(cell, { size: 18, bold: true, color: { argb: COLORS.charcoal } as any })
  align(cell, { horizontal: 'left', vertical: 'middle' })
}

function styleSectionLabel(cell: ExcelJS.Cell, text: string, bg = COLORS.tealSoft) {
  cell.value = text
  fill(cell, bg)
  thinBorder(cell)
  font(cell, { bold: true, size: 11, color: { argb: COLORS.charcoal } as any })
  align(cell, { horizontal: 'left' })
}

function styleValue(cell: ExcelJS.Cell, value: any, bg = COLORS.white) {
  cell.value = value ?? ''
  fill(cell, bg)
  thinBorder(cell)
  font(cell, { size: 11 })
  align(cell, { horizontal: 'left' })
}

function styleTableHeader(row: ExcelJS.Row, bg = COLORS.oliveSoft) {
  row.height = 22
  row.eachCell((cell) => {
    fill(cell, bg)
    thinBorder(cell)
    font(cell, { bold: true, size: 11, color: { argb: COLORS.charcoal } as any })
    align(cell, { horizontal: 'left' })
  })
}

function styleKpiBlock(sheet: ExcelJS.Worksheet, rangeStart: string, rangeEnd: string, title: string, value: any, opts?: {
  accent?: boolean
  note?: string
  isPercent?: boolean
  currency?: string
}) {
  sheet.mergeCells(`${rangeStart}:${rangeEnd}`)
  const tl = sheet.getCell(rangeStart)
  const startCol = rangeStart.replace(/[0-9]/g, '')
  const rowNum = Number(rangeStart.replace(/[^0-9]/g, ''))
  fill(tl, opts?.accent ? COLORS.teal : COLORS.panel)
  thinBorder(tl)
  align(tl, { vertical: 'top', horizontal: 'left' })

  const t = sheet.getCell(`${startCol}${rowNum}`)
  t.value = title
  font(t, { bold: true, size: 11, color: { argb: opts?.accent ? COLORS.white : COLORS.charcoal } as any })

  const v = sheet.getCell(`${startCol}${rowNum + 1}`)
  v.value = value == null ? '' : value
  font(v, { bold: true, size: 17, color: { argb: opts?.accent ? COLORS.white : COLORS.charcoal } as any })
  if (opts?.isPercent) v.numFmt = '0.0%'
  else if (opts?.currency) v.numFmt = moneyFmt(opts.currency, 2)
  align(v, { vertical: 'middle', horizontal: 'left' })

  if (opts?.note) {
    const n = sheet.getCell(`${startCol}${rowNum + 2}`)
    n.value = opts.note
    font(n, { size: 9, color: { argb: opts?.accent ? 'FFE2E8F0' : COLORS.slate } as any })
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

async function fetchImageForExcel(url: string): Promise<{ base64: string; extension: 'png' | 'jpeg' } | null> {
  try {
    const finalUrl = (url || '').trim()
    if (!finalUrl) return null

    if (finalUrl.startsWith('data:image/')) return dataUrlToBase64(finalUrl)

    const res = await fetch(finalUrl, { cache: 'no-store', mode: 'cors' })
    if (!res.ok) return null

    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('png') && !contentType.includes('jpeg') && !contentType.includes('jpg')) return null

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
  const candidates = ['/gastrochef-logo.png', '/logo.png', '/gastrochef-icon-512.png']
  for (const url of candidates) {
    const ok = await addImageFromUrl(workbook, sheet, url, {
      col: opts?.col ?? 0.2,
      row: opts?.row ?? 0.2,
      width: opts?.width ?? 72,
      height: opts?.height ?? 72,
    })
    if (ok) return true
  }
  return false
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
    if (!parsed) return false
    const imgId = workbook.addImage({ base64: parsed.base64, extension: parsed.extension })
    const col = opts?.col ?? 7.1
    const row = opts?.row ?? 0.8
    const size = opts?.size ?? 84
    sheet.addImage(imgId, { tl: { col, row }, ext: { width: size, height: size } })
    return true
  } catch {
    return false
  }
}

function addPlaceholderBox(sheet: ExcelJS.Worksheet, range: string, title: string, subtitle: string, bg = COLORS.panel) {
  sheet.mergeCells(range)
  const cell = sheet.getCell(range.split(':')[0])
  cell.value = `${title}\n\n${subtitle}`
  fill(cell, bg)
  thinBorder(cell)
  font(cell, { size: 11, bold: true, color: { argb: COLORS.slate } as any })
  align(cell, { horizontal: 'center', vertical: 'middle' })
}

function setSheetDefaults(sheet: ExcelJS.Worksheet, title: string, orientation: 'portrait' | 'landscape' = 'portrait') {
  sheet.pageSetup = {
    orientation,
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.45, header: 0.2, footer: 0.2 },
  }
  sheet.headerFooter.oddHeader = `&C&"Calibri,Bold"&12GastroChef — ${title}`
  sheet.headerFooter.oddFooter = '&L&8Confidential&R&8Page &P / &N'
}

export async function exportRecipeExcelUltra(args: {
  meta: ExcelRecipeMeta
  totals: { totalCost: number; cpp: number; fcPct: number | null; margin: number; marginPct: number | null }
  lines: ExcelLineRow[]
}) {
  const { meta, totals, lines } = args

  const name = toTitle(meta.name)
  const currency = safeText(meta.currency, 'USD').toUpperCase()
  const portions = Math.max(1, Math.floor(safeNum(meta.portions, 1)))
  const yieldQty = safeNum(meta.yield_qty, 0) || null
  const yieldUnit = safeText(meta.yield_unit)
  const sell = safeNum(meta.selling_price, 0)
  const targetFc = meta.target_food_cost_pct != null ? clamp(safeNum(meta.target_food_cost_pct, 0), 0, 100) : null
  const cleanSteps = (meta.steps || []).map((s) => (s || '').trim()).filter(Boolean)
  const stepPhotos = normalizeStepPhotos(cleanSteps, meta.step_photos)
  const description = safeText(meta.description)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GastroChef'
  workbook.company = 'GastroChef'
  workbook.title = `${name} — Ultimate Recipe Export`
  workbook.subject = `${name} recipe export`
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.calcProperties.fullCalcOnLoad = true

  const now = new Date()
  const reportId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const recipeId = safeText(meta.id)
  const recipeCode = safeText(meta.code)
  const kitchenRef = safeText(meta.kitchen_id)
  const auditStamp = `GC-${reportId}-${(recipeId.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'LOCAL').toUpperCase()}`
  const baseUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
  const qrPayload = recipeId && baseUrl
    ? `${baseUrl}/#/recipe?id=${encodeURIComponent(recipeId)}`
    : `GastroChef Recipe | ${name}${recipeId ? ` | ${recipeId}` : ''}`

  const totalWarnings = lines.reduce((acc, line) => acc + (line.warnings?.length || 0), 0)
  const ingredientLines = lines.filter((l) => l.type === 'ingredient')
  const subrecipeLines = lines.filter((l) => l.type === 'subrecipe')
  const ingredientCost = ingredientLines.reduce((acc, l) => acc + safeNum(l.line_cost), 0)
  const subrecipeCost = subrecipeLines.reduce((acc, l) => acc + safeNum(l.line_cost), 0)
  const topDrivers = lines.slice().sort((a, b) => safeNum(b.line_cost) - safeNum(a.line_cost)).slice(0, 10)

  const controls = workbook.addWorksheet('Controls', { views: [{ showGridLines: false }] })
  setSheetDefaults(controls, 'Controls')
  controls.columns = [{ width: 24 }, { width: 26 }, { width: 18 }, { width: 18 }]
  controls.mergeCells('A1:D1')
  styleTitle(controls.getCell('A1'), 'GastroChef Export Controls')
  controls.getRow(2).height = 12
  styleSectionLabel(controls.getCell('A3'), 'Field', COLORS.oliveSoft)
  styleSectionLabel(controls.getCell('B3'), 'Value', COLORS.oliveSoft)
  styleSectionLabel(controls.getCell('C3'), 'Editable', COLORS.oliveSoft)
  styleSectionLabel(controls.getCell('D3'), 'Notes', COLORS.oliveSoft)

  const controlRows: Array<[string, any, string, string]> = [
    ['Recipe Name', name, 'No', 'Pulled from current recipe'],
    ['Recipe Code', recipeCode, 'No', 'Shows blank if not set'],
    ['Currency', currency, 'No', 'Controls money formatting'],
    ['Base Portions', portions, 'No', 'Original recipe servings'],
    ['Target Portions', portions, 'Yes', 'Use in Scale Lab sheet'],
    ['Selling Price', sell || '', 'Yes', 'Optional commercial field'],
    ['Target Food Cost %', targetFc != null ? targetFc / 100 : '', 'Yes', 'Use decimal percent in Excel'],
    ['Report ID', reportId, 'No', 'Generated at export time'],
  ]
  let cr = 4
  for (const [field, value, editable, note] of controlRows) {
    styleSectionLabel(controls.getCell(`A${cr}`), field, COLORS.panel)
    styleValue(controls.getCell(`B${cr}`), value)
    styleValue(controls.getCell(`C${cr}`), editable, editable === 'Yes' ? COLORS.tealSoft : COLORS.panel)
    styleValue(controls.getCell(`D${cr}`), note)
    if (field === 'Target Food Cost %') controls.getCell(`B${cr}`).numFmt = '0.0%'
    if (field === 'Selling Price') controls.getCell(`B${cr}`).numFmt = moneyFmt(currency, 2)
    cr += 1
  }

  const recipeCard = workbook.addWorksheet('Recipe Card', { views: [{ showGridLines: false }] })
  setSheetDefaults(recipeCard, 'Recipe Card')
  recipeCard.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }]
  recipeCard.properties.defaultRowHeight = 18
  await tryAddLogo(workbook, recipeCard, { col: 0.2, row: 0.2, width: 68, height: 68 })
  await tryAddQr(workbook, recipeCard, qrPayload, { col: 6.6, row: 0.4, size: 84 })

  recipeCard.mergeCells('A2:H2')
  styleTitle(recipeCard.getCell('A2'), name)
  recipeCard.mergeCells('A3:H3')
  recipeCard.getCell('A3').value = 'Ultimate Excel Recipe Template — Professional Kitchen Export'
  font(recipeCard.getCell('A3'), { size: 10, color: { argb: COLORS.slate } as any })
  align(recipeCard.getCell('A3'), { horizontal: 'left' })

  styleSectionLabel(recipeCard.getCell('A5'), 'Recipe Overview', COLORS.oliveSoft)
  recipeCard.mergeCells('A5:D5')
  styleSectionLabel(recipeCard.getCell('E5'), 'Commercial Snapshot', COLORS.oliveSoft)
  recipeCard.mergeCells('E5:H5')

  const addKv = (row: number, leftLabel: string, leftValue: any, rightLabel: string, rightValue: any) => {
    styleSectionLabel(recipeCard.getCell(`A${row}`), leftLabel, COLORS.panel)
    recipeCard.mergeCells(`B${row}:D${row}`)
    styleValue(recipeCard.getCell(`B${row}`), leftValue)
    styleSectionLabel(recipeCard.getCell(`E${row}`), rightLabel, COLORS.panel)
    recipeCard.mergeCells(`F${row}:H${row}`)
    styleValue(recipeCard.getCell(`F${row}`), rightValue)
  }

  addKv(6, 'Code', recipeCode, 'Category', meta.category || '')
  addKv(7, 'Kitchen Ref', kitchenRef, 'Portions', portions)
  addKv(8, 'Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '', 'Currency', currency)
  addKv(9, 'Report ID', reportId, 'Audit Stamp', auditStamp)
  addKv(10, 'Selling Price', sell || '', 'Target Food Cost', targetFc != null ? fmtPercent(targetFc) : '')
  recipeCard.getCell('B10').numFmt = moneyFmt(currency, 2)

  styleSectionLabel(recipeCard.getCell('A12'), 'Description', COLORS.tealSoft)
  recipeCard.mergeCells('A12:H12')
  recipeCard.mergeCells('A13:H15')
  styleValue(recipeCard.getCell('A13'), description || 'No description provided.', COLORS.white)
  align(recipeCard.getCell('A13'), { vertical: 'top', horizontal: 'left', wrapText: true })

  for (let r = 17; r <= 22; r++) recipeCard.getRow(r).height = r === 18 || r === 21 ? 22 : 18
  styleKpiBlock(recipeCard, 'A17', 'B19', `Total Cost (${currency})`, totals.totalCost, {
    accent: true,
    note: 'Recipe total',
    currency,
  })
  styleKpiBlock(recipeCard, 'C17', 'D19', `Cost / Portion (${currency})`, totals.cpp, {
    note: 'Per serving',
    currency,
  })
  styleKpiBlock(recipeCard, 'E17', 'F19', 'Food Cost %', totals.fcPct != null ? totals.fcPct / 100 : null, {
    note: targetFc != null ? `Target: ${fmtPercent(targetFc)}` : 'Based on selling price',
    isPercent: true,
  })
  styleKpiBlock(recipeCard, 'G17', 'H19', `Margin (${currency})`, totals.margin, {
    note: totals.marginPct != null ? `${totals.marginPct.toFixed(1)}% margin` : 'Commercial margin',
    currency,
  })

  styleSectionLabel(recipeCard.getCell('A24'), 'Main Recipe Photo', COLORS.oliveSoft)
  recipeCard.mergeCells('A24:D24')
  styleSectionLabel(recipeCard.getCell('E24'), 'Export Status', COLORS.oliveSoft)
  recipeCard.mergeCells('E24:H24')

  const mainPhotoAdded = await addImageFromUrl(workbook, recipeCard, meta.photo_url, { col: 0.15, row: 24.2, width: 360, height: 220 })
  if (!mainPhotoAdded) {
    addPlaceholderBox(recipeCard, 'A25:D35', 'Recipe Photo', meta.photo_url ? 'Image not reachable. Use a public PNG/JPG URL or base64 data URL.' : 'No recipe photo provided.')
  }

  const statusRows: Array<[string, any]> = [
    ['Ingredients', lines.length],
    ['Warnings', totalWarnings],
    ['Method Steps', cleanSteps.length],
    ['Step Photos', stepPhotos.filter(Boolean).length],
    ['Recipe QR', 'Generated'],
    ['Prepared', now.toLocaleDateString()],
    ['Photo Status', mainPhotoAdded ? 'Embedded' : 'Placeholder'],
  ]
  let sr = 25
  for (const [label, value] of statusRows) {
    styleSectionLabel(recipeCard.getCell(`E${sr}`), label, COLORS.panel)
    recipeCard.mergeCells(`F${sr}:H${sr}`)
    styleValue(recipeCard.getCell(`F${sr}`), value)
    sr += 1
  }

  const ingredients = workbook.addWorksheet('Ingredients', { views: [{ state: 'frozen', ySplit: 2 }] })
  setSheetDefaults(ingredients, 'Ingredients', 'landscape')
  ingredients.columns = [
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Code', key: 'code', width: 16 },
    { header: 'Ingredient / Item', key: 'name', width: 34 },
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
  styleTitle(ingredients.getCell('A1'), `${name} — Ingredients & Costing`)
  ingredients.getRow(2).values = ingredients.columns.map((col) => col.header)
  styleTableHeader(ingredients.getRow(2))

  for (const row of lines) {
    const warnings = (row.warnings || []).join(', ')
    const added = ingredients.addRow({
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
    added.eachCell((cell) => {
      thinBorder(cell)
      align(cell, { vertical: 'middle', horizontal: 'left' })
    })
    added.getCell('yield').numFmt = '0.0%'
    added.getCell('net').numFmt = '#,##0.000'
    added.getCell('gross').numFmt = '#,##0.000'
    added.getCell('unitCost').numFmt = moneyFmt(currency, 3)
    added.getCell('lineCost').numFmt = moneyFmt(currency, 3)
    if (row.type === 'subrecipe') fill(added.getCell('A'), COLORS.tealSoft)
    if (warnings) fill(added.getCell('K'), COLORS.goldSoft)
  }
  const ingredientsFooter = ingredients.addRow({ name: 'TOTAL', lineCost: totals.totalCost } as any)
  ingredientsFooter.eachCell((cell) => {
    fill(cell, COLORS.panel)
    thinBorder(cell)
    font(cell, { bold: true })
  })
  ingredientsFooter.getCell('lineCost').numFmt = moneyFmt(currency, 2)
  ingredients.autoFilter = 'A2:K2'
  autosizeColumns(ingredients, 10, 36)

  const stepsSheet = workbook.addWorksheet('Preparation Steps', { views: [{ showGridLines: false }] })
  setSheetDefaults(stepsSheet, 'Preparation Steps')
  stepsSheet.columns = [{ width: 10 }, { width: 54 }, { width: 36 }]
  stepsSheet.mergeCells('A1:C1')
  styleTitle(stepsSheet.getCell('A1'), `${name} — Preparation Steps`)
  stepsSheet.getRow(3).values = ['Step', 'Method', 'Photo Status']
  styleTableHeader(stepsSheet.getRow(3), COLORS.tealSoft)
  if (cleanSteps.length) {
    let rowIndex = 4
    cleanSteps.forEach((step, idx) => {
      stepsSheet.getCell(`A${rowIndex}`).value = idx + 1
      stepsSheet.getCell(`B${rowIndex}`).value = step
      stepsSheet.getCell(`C${rowIndex}`).value = stepPhotos[idx] ? 'Photo linked' : 'No photo linked'
      ;['A', 'B', 'C'].forEach((col) => {
        thinBorder(stepsSheet.getCell(`${col}${rowIndex}`))
        align(stepsSheet.getCell(`${col}${rowIndex}`), { vertical: 'top' })
      })
      if (!stepPhotos[idx]) fill(stepsSheet.getCell(`C${rowIndex}`), COLORS.panel)
      stepsSheet.getRow(rowIndex).height = Math.max(26, Math.ceil(step.length / 5))
      rowIndex += 1
    })
  } else {
    addPlaceholderBox(stepsSheet, 'A4:C8', 'No preparation steps', 'Add steps in RecipeEditor to populate this sheet.')
  }

  const nutrition = workbook.addWorksheet('Nutrition', { views: [{ showGridLines: false }] })
  setSheetDefaults(nutrition, 'Nutrition')
  nutrition.columns = [{ width: 28 }, { width: 22 }, { width: 24 }]
  nutrition.mergeCells('A1:C1')
  styleTitle(nutrition.getCell('A1'), `${name} — Nutrition`)
  nutrition.getRow(3).values = ['Metric', 'Value', 'Notes']
  styleTableHeader(nutrition.getRow(3))
  const nutritionRows: Array<[string, any, string]> = [
    ['Calories', meta.calories ?? '', 'Per recipe or current recipe basis'],
    ['Protein (g)', meta.protein_g ?? '', 'Macronutrient'],
    ['Carbs (g)', meta.carbs_g ?? '', 'Macronutrient'],
    ['Fat (g)', meta.fat_g ?? '', 'Macronutrient'],
    ['Portions', portions, 'Current serving count'],
    ['Yield', yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '', 'Final output'],
  ]
  let nr = 4
  for (const [metric, value, note] of nutritionRows) {
    styleSectionLabel(nutrition.getCell(`A${nr}`), metric, COLORS.panel)
    styleValue(nutrition.getCell(`B${nr}`), value)
    styleValue(nutrition.getCell(`C${nr}`), note)
    nr += 1
  }

  const costAnalysis = workbook.addWorksheet('Cost Analysis', { views: [{ showGridLines: false }] })
  setSheetDefaults(costAnalysis, 'Cost Analysis')
  costAnalysis.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 28 }]
  costAnalysis.mergeCells('A1:D1')
  styleTitle(costAnalysis.getCell('A1'), `${name} — Cost Analysis`)
  costAnalysis.getRow(3).values = ['Bucket', 'Value', 'Share %', 'Notes']
  styleTableHeader(costAnalysis.getRow(3), COLORS.tealSoft)

  const buckets = [
    ['Ingredients', ingredientCost, totals.totalCost > 0 ? ingredientCost / totals.totalCost : 0, 'Direct ingredient items'],
    ['Sub-Recipes', subrecipeCost, totals.totalCost > 0 ? subrecipeCost / totals.totalCost : 0, 'Nested recipe cost'],
    ['Total Recipe Cost', totals.totalCost, 1, 'Recipe total cost'],
    ['Food Cost %', totals.fcPct != null ? totals.fcPct / 100 : 0, totals.fcPct != null ? totals.fcPct / 100 : 0, 'Relative to selling price'],
    ['Margin %', totals.marginPct != null ? totals.marginPct / 100 : 0, totals.marginPct != null ? totals.marginPct / 100 : 0, 'Commercial margin'],
  ] as const
  let car = 4
  for (const [label, value, share, note] of buckets) {
    styleSectionLabel(costAnalysis.getCell(`A${car}`), label, COLORS.panel)
    styleValue(costAnalysis.getCell(`B${car}`), value)
    styleValue(costAnalysis.getCell(`C${car}`), share)
    styleValue(costAnalysis.getCell(`D${car}`), note)
    costAnalysis.getCell(`B${car}`).numFmt = label.includes('%') ? '0.0%' : moneyFmt(currency, 2)
    costAnalysis.getCell(`C${car}`).numFmt = '0.0%'
    car += 1
  }
  car += 1
  costAnalysis.getRow(car).values = ['Top Cost Driver', 'Line Cost', 'Share %', 'Type']
  styleTableHeader(costAnalysis.getRow(car), COLORS.oliveSoft)
  car += 1
  topDrivers.forEach((line) => {
    costAnalysis.getCell(`A${car}`).value = line.name
    costAnalysis.getCell(`B${car}`).value = line.line_cost
    costAnalysis.getCell(`C${car}`).value = totals.totalCost > 0 ? line.line_cost / totals.totalCost : 0
    costAnalysis.getCell(`D${car}`).value = line.type
    ;['A', 'B', 'C', 'D'].forEach((col) => {
      thinBorder(costAnalysis.getCell(`${col}${car}`))
      align(costAnalysis.getCell(`${col}${car}`), {})
    })
    costAnalysis.getCell(`B${car}`).numFmt = moneyFmt(currency, 2)
    costAnalysis.getCell(`C${car}`).numFmt = '0.0%'
    car += 1
  })

  const scaleLab = workbook.addWorksheet('Scale Lab', { views: [{ showGridLines: false, ySplit: 5 }] })
  setSheetDefaults(scaleLab, 'Scale Lab', 'landscape')
  scaleLab.columns = [{ width: 30 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }]
  scaleLab.mergeCells('A1:F1')
  styleTitle(scaleLab.getCell('A1'), `${name} — Scaling Lab`)
  styleSectionLabel(scaleLab.getCell('A3'), 'Base Portions', COLORS.panel)
  styleValue(scaleLab.getCell('B3'), portions)
  styleSectionLabel(scaleLab.getCell('D3'), 'Target Portions', COLORS.panel)
  scaleLab.getCell('E3').value = portions
  thinBorder(scaleLab.getCell('E3'))
  fill(scaleLab.getCell('E3'), COLORS.tealSoft)
  font(scaleLab.getCell('E3'), { bold: true })
  align(scaleLab.getCell('E3'), { horizontal: 'center' })
  styleSectionLabel(scaleLab.getCell('A4'), 'Scale Factor', COLORS.panel)
  scaleLab.getCell('B4').value = { formula: 'IFERROR(E3/B3,1)' }
  scaleLab.getCell('B4').numFmt = '0.00x'
  thinBorder(scaleLab.getCell('B4'))
  fill(scaleLab.getCell('B4'), COLORS.white)
  scaleLab.getRow(6).values = ['Ingredient / Sub-Recipe', 'Base Net Qty', 'Unit', 'Scaled Net Qty', 'Scaled Gross Qty', 'Scaled Line Cost']
  styleTableHeader(scaleLab.getRow(6), COLORS.tealSoft)
  let slr = 7
  lines.forEach((line) => {
    scaleLab.getCell(`A${slr}`).value = line.name
    scaleLab.getCell(`B${slr}`).value = line.net_qty
    scaleLab.getCell(`C${slr}`).value = line.unit
    scaleLab.getCell(`D${slr}`).value = { formula: `B${slr}*$B$4` }
    scaleLab.getCell(`E${slr}`).value = { formula: `${safeNum(line.gross_qty)}*$B$4` }
    scaleLab.getCell(`F${slr}`).value = { formula: `${safeNum(line.line_cost)}*$B$4` }
    ;['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => thinBorder(scaleLab.getCell(`${col}${slr}`)))
    ;['B', 'D', 'E'].forEach((col) => (scaleLab.getCell(`${col}${slr}`).numFmt = '#,##0.000'))
    scaleLab.getCell(`F${slr}`).numFmt = moneyFmt(currency, 2)
    slr += 1
  })

  const photoGallery = workbook.addWorksheet('Photo Gallery', { views: [{ showGridLines: false }] })
  setSheetDefaults(photoGallery, 'Photo Gallery', 'landscape')
  photoGallery.columns = [{ width: 23 }, { width: 23 }, { width: 23 }, { width: 23 }, { width: 23 }, { width: 23 }]
  photoGallery.mergeCells('A1:F1')
  styleTitle(photoGallery.getCell('A1'), `${name} — Photo Gallery`)
  photoGallery.mergeCells('A2:F2')
  photoGallery.getCell('A2').value = 'Images appear when the URL is public and reachable by the browser, or when the photo is passed as a base64 data URL.'
  font(photoGallery.getCell('A2'), { size: 10, color: { argb: COLORS.slate } as any })

  styleSectionLabel(photoGallery.getCell('A4'), 'Main Recipe Photo', COLORS.oliveSoft)
  photoGallery.mergeCells('A4:C4')
  const galleryMainAdded = await addImageFromUrl(workbook, photoGallery, meta.photo_url, { col: 0.15, row: 4.25, width: 340, height: 210 })
  if (!galleryMainAdded) addPlaceholderBox(photoGallery, 'A5:C14', 'Recipe Photo', meta.photo_url ? 'Check CORS/public access or image format.' : 'No main image provided.')

  let currentRow = 4
  for (let i = 0; i < Math.max(cleanSteps.length, 1); i++) {
    const titleCol = i % 2 === 0 ? 'D' : 'A'
    if (i > 0 && i % 2 === 0) currentRow += 11
    const startColIndex = titleCol === 'D' ? 3.1 : 0.15
    const boxTop = currentRow
    photoGallery.getCell(`${titleCol}${boxTop}`).value = `Step ${i + 1}`
    font(photoGallery.getCell(`${titleCol}${boxTop}`), { bold: true, size: 11 })
    const photoOk = cleanSteps[i]
      ? await addImageFromUrl(workbook, photoGallery, stepPhotos[i], { col: startColIndex, row: boxTop + 0.25, width: 340, height: 180 })
      : false
    const placeRange = titleCol === 'D' ? `D${boxTop + 1}:F${boxTop + 9}` : `A${boxTop + 1}:C${boxTop + 9}`
    if (cleanSteps[i] && !photoOk) addPlaceholderBox(photoGallery, placeRange, `Step ${i + 1} Photo`, 'No step photo embedded.')
    const noteCell = photoGallery.getCell(titleCol === 'D' ? `D${boxTop + 10}` : `A${boxTop + 10}`)
    noteCell.value = cleanSteps[i] || 'No step content available.'
    font(noteCell, { size: 10, color: { argb: COLORS.charcoal } as any })
    align(noteCell, { vertical: 'top', wrapText: true })
  }

  const printCard = workbook.addWorksheet('Print Card', { views: [{ showGridLines: false }] })
  setSheetDefaults(printCard, 'Print Card')
  printCard.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }]
  printCard.properties.defaultRowHeight = 18
  printCard.mergeCells('A1:F1')
  styleTitle(printCard.getCell('A1'), name)
  printCard.mergeCells('A2:F2')
  printCard.getCell('A2').value = 'Kitchen-ready quick print card'
  font(printCard.getCell('A2'), { size: 10, color: { argb: COLORS.slate } as any })
  await tryAddLogo(workbook, printCard, { col: 4.8, row: 0.15, width: 56, height: 56 })

  styleSectionLabel(printCard.getCell('A4'), 'Quick Summary', COLORS.oliveSoft)
  printCard.mergeCells('A4:C4')
  styleSectionLabel(printCard.getCell('D4'), 'Photo', COLORS.oliveSoft)
  printCard.mergeCells('D4:F4')
  styleSectionLabel(printCard.getCell('A5'), 'Code', COLORS.panel)
  styleValue(printCard.getCell('B5'), recipeCode)
  styleSectionLabel(printCard.getCell('A6'), 'Category', COLORS.panel)
  styleValue(printCard.getCell('B6'), meta.category || '')
  styleSectionLabel(printCard.getCell('A7'), 'Portions', COLORS.panel)
  styleValue(printCard.getCell('B7'), portions)
  styleSectionLabel(printCard.getCell('A8'), 'Yield', COLORS.panel)
  styleValue(printCard.getCell('B8'), yieldQty && yieldUnit ? `${yieldQty} ${yieldUnit}` : '')
  styleSectionLabel(printCard.getCell('A9'), 'Cost / Portion', COLORS.panel)
  styleValue(printCard.getCell('B9'), totals.cpp)
  printCard.getCell('B9').numFmt = moneyFmt(currency, 2)

  const printMainAdded = await addImageFromUrl(workbook, printCard, meta.photo_url, { col: 3.15, row: 4.15, width: 255, height: 145 })
  if (!printMainAdded) addPlaceholderBox(printCard, 'D5:F10', 'Recipe Photo', 'Print-friendly placeholder')

  styleSectionLabel(printCard.getCell('A12'), 'Ingredients', COLORS.tealSoft)
  printCard.mergeCells('A12:C12')
  styleSectionLabel(printCard.getCell('D12'), 'Method', COLORS.tealSoft)
  printCard.mergeCells('D12:F12')
  let pir = 13
  lines.slice(0, 14).forEach((line) => {
    printCard.getCell(`A${pir}`).value = `${line.name}`
    printCard.getCell(`B${pir}`).value = line.net_qty
    printCard.getCell(`C${pir}`).value = line.unit
    ;['A', 'B', 'C'].forEach((col) => {
      thinBorder(printCard.getCell(`${col}${pir}`))
      align(printCard.getCell(`${col}${pir}`), { vertical: 'middle' })
    })
    printCard.getCell(`B${pir}`).numFmt = '#,##0.000'
    pir += 1
  })
  if (!lines.length) addPlaceholderBox(printCard, 'A13:C16', 'No ingredients', 'Add recipe lines to populate this section.')

  let pmr = 13
  cleanSteps.slice(0, 10).forEach((step, idx) => {
    printCard.mergeCells(`D${pmr}:F${pmr}`)
    const c = printCard.getCell(`D${pmr}`)
    c.value = `${idx + 1}. ${step}`
    thinBorder(c)
    font(c, { size: 10 })
    align(c, { vertical: 'top', horizontal: 'left', wrapText: true })
    pmr += 1
  })
  if (!cleanSteps.length) addPlaceholderBox(printCard, 'D13:F16', 'No method', 'Add preparation steps to populate this section.')

  const buf = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `${safeFileName(name)} - Ultimate Export.xlsx`)
}

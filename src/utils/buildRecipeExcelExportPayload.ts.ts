export type ExportRecipeMeta = {
  recipeId: string
  recipeCode?: string
  kitchenId?: string
  recipeName: string
  subtitle?: string
  category?: string
  subcategory?: string
  cuisine?: string
  tags?: string[]
  description?: string
  yieldValue?: number
  yieldUnit?: string
  portions?: number
  portionSize?: number
  portionUnit?: string
  prepTimeMinutes?: number
  cookTimeMinutes?: number
  totalTimeMinutes?: number
  difficulty?: string
  station?: string
  shelfLife?: string
  storageNotes?: string
  allergens?: string[]
  equipment?: string[]
  chefNotes?: string
  platingNotes?: string
  createdAt?: string
  updatedAt?: string
  exportedAt: string
  exportedBy?: string
  currency?: string
}

export type ExportRecipeLine = {
  lineNumber: number
  ingredientId?: string
  ingredientCode?: string
  ingredientName: string
  category?: string
  supplier?: string
  type: 'ingredient' | 'subrecipe'
  unit: string
  netQty: number
  yieldPercent?: number
  grossQty?: number
  unitCost?: number
  lineCost?: number
  costPercent?: number
  notes?: string
  allergens?: string[]
  optional?: boolean
  warnings?: string[]
}

export type ExportRecipeStep = {
  stepNumber: number
  title?: string
  instruction: string
  timeMinutes?: number
  temperature?: string
  station?: string
  criticalPoint?: string
  note?: string
}

export type ExportRecipeNutritionSlice = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sugar?: number
  sodium?: number
  cholesterol?: number
}

export type ExportRecipePayload = {
  meta: ExportRecipeMeta
  lines: ExportRecipeLine[]
  totals: {
    totalIngredientCost: number
    packagingCost?: number
    laborCost?: number
    overheadCost?: number
    totalProductionCost?: number
    totalWeight?: number
    totalGrossWeight?: number
    portions?: number
    costPerPortion?: number
    sellingPrice?: number
    grossProfit?: number
    grossMarginPercent?: number
    foodCostPercent?: number
  }
  steps: ExportRecipeStep[]
  photos: {
    mainPhotoUrl?: string
    heroPhotoAlt?: string
    stepPhotos?: Array<{
      stepNumber: number
      url: string
      caption?: string
    }>
    galleryPhotos?: Array<{
      url: string
      caption?: string
      type?: 'extra' | 'plating' | 'ingredient' | 'process'
    }>
  }
  nutrition?: {
    perRecipe?: ExportRecipeNutritionSlice
    perPortion?: ExportRecipeNutritionSlice
  }
  pricing?: {
    currency?: string
    actualSellingPrice?: number
    targetFoodCostPercent?: number
    suggestedSellingPrice?: number
    minimumViablePrice?: number
    premiumPrice?: number
  }
  scale?: {
    basePortions?: number
    targetPortions?: number
    scalingFactor?: number
    scaledLines?: Array<{
      ingredientName: string
      unit: string
      originalQty: number
      scaledQty: number
    }>
  }
  settings?: {
    workbookTitle?: string
    companyName?: string
    brandName?: string
    currency?: string
    includeCover?: boolean
    includeExecutiveSummary?: boolean
    includeRecipeCard?: boolean
    includeIngredients?: boolean
    includePreparationSteps?: boolean
    includePhotoGallery?: boolean
    includeNutrition?: boolean
    includeCostAnalysis?: boolean
    includeScaleLab?: boolean
    includeKitchenPrintCard?: boolean
    includeManagementReport?: boolean
    includeTechnicalMetadata?: boolean
    landscapeSheets?: string[]
    portraitSheets?: string[]
    theme?: 'gastrochef-executive'
  }
  diagnostics?: {
    warnings?: string[]
    missingFields?: string[]
    imageStatus?: {
      hasMainPhoto: boolean
      hasStepPhotos: boolean
      totalStepPhotos: number
    }
  }
}

type InputLineComputed = {
  net?: number
  gross?: number
  yieldPct?: number
  unitCost?: number
  lineCost?: number
  warnings?: string[]
}

type BuildPayloadInput = {
  recipe: {
    id?: string | null
    code?: string | null
    kitchen_id?: string | null
    name?: string | null
    category?: string | null
    cuisine?: string | null
    photo_url?: string | null
    description?: string | null
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fat_g?: number | null
    created_at?: string | null
    updated_at?: string | null
  }
  editor: {
    portions?: number | string | null
    yieldQty?: number | string | null
    yieldUnit?: string | null
    currency?: string | null
    sellingPrice?: number | string | null
    targetFoodCostPct?: number | string | null
    exportedBy?: string | null
    subtitle?: string | null
    chefNotes?: string | null
    platingNotes?: string | null
    allergens?: string[]
    equipment?: string[]
    steps?: string[]
    stepPhotos?: string[]
    galleryPhotos?: string[]
  }
  lines: Array<{
    id: string
    line_type: 'ingredient' | 'subrecipe' | 'group'
    ingredient_id?: string | null
    sub_recipe_id?: string | null
    unit?: string | null
    notes?: string | null
  }>
  lineComputed: Map<string, InputLineComputed>
  ingredientLookup: Map<string, { code?: string | null; name?: string | null; category?: string | null; supplier?: string | null }>
  subrecipeLookup?: Map<string, { code?: string | null; name?: string | null }>
  totals: {
    totalCost?: number | null
    cpp?: number | null
    fcPct?: number | null
    margin?: number | null
    marginPct?: number | null
    totalWeight?: number | null
    totalGrossWeight?: number | null
  }
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toOptionalNum(value: unknown): number | undefined {
  if (value === '' || value == null) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function cleanText(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text || undefined
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((x) => String(x ?? '').trim()).filter(Boolean)
}

function buildStepPhotoObjects(stepPhotos: string[]): ExportRecipePayload['photos']['stepPhotos'] {
  return stepPhotos
    .map((url, index) => ({
      stepNumber: index + 1,
      url: String(url || '').trim(),
      caption: `Step ${index + 1}`,
    }))
    .filter((x) => x.url)
}

export function buildRecipeExcelExportPayload(input: BuildPayloadInput): ExportRecipePayload {
  const recipe = input.recipe || {}
  const editor = input.editor || {}
  const lines = (input.lines || []).filter((line) => line.line_type !== 'group')
  const stepTexts = cleanStringArray(editor.steps)
  const stepPhotos = cleanStringArray(editor.stepPhotos)
  const galleryPhotos = cleanStringArray(editor.galleryPhotos)
  const currency = cleanText(editor.currency) || 'USD'
  const totalIngredientCost = toNum(input.totals?.totalCost, 0)
  const portions = Math.max(1, Math.floor(toNum(editor.portions, 1)))
  const costPerPortion = toOptionalNum(input.totals?.cpp)
  const sellingPrice = toOptionalNum(editor.sellingPrice)
  const grossProfit = sellingPrice != null ? sellingPrice - totalIngredientCost : toOptionalNum(input.totals?.margin)
  const grossMarginPercent =
    sellingPrice && sellingPrice > 0
      ? Number((((sellingPrice - totalIngredientCost) / sellingPrice) * 100).toFixed(2))
      : toOptionalNum(input.totals?.marginPct)
  const foodCostPercent =
    sellingPrice && sellingPrice > 0
      ? Number(((totalIngredientCost / sellingPrice) * 100).toFixed(2))
      : toOptionalNum(input.totals?.fcPct)

  const normalizedLines: ExportRecipeLine[] = lines.map((line, index) => {
    const computed = input.lineComputed?.get(line.id) || {}
    if (line.line_type === 'ingredient') {
      const ingredient = line.ingredient_id ? input.ingredientLookup.get(line.ingredient_id) : undefined
      return {
        lineNumber: index + 1,
        ingredientId: line.ingredient_id || undefined,
        ingredientCode: cleanText(ingredient?.code),
        ingredientName: cleanText(ingredient?.name) || 'Ingredient',
        category: cleanText(ingredient?.category),
        supplier: cleanText(ingredient?.supplier),
        type: 'ingredient',
        unit: cleanText(line.unit) || '',
        netQty: toNum(computed.net, 0),
        yieldPercent: toOptionalNum(computed.yieldPct) ?? 100,
        grossQty: toOptionalNum(computed.gross),
        unitCost: toOptionalNum(computed.unitCost),
        lineCost: toOptionalNum(computed.lineCost),
        costPercent: totalIngredientCost > 0 && toNum(computed.lineCost, 0) > 0 ? Number(((toNum(computed.lineCost, 0) / totalIngredientCost) * 100).toFixed(2)) : undefined,
        notes: cleanText(line.notes),
        warnings: Array.isArray(computed.warnings) ? computed.warnings.filter(Boolean) : [],
      }
    }

    const subrecipe = line.sub_recipe_id && input.subrecipeLookup ? input.subrecipeLookup.get(line.sub_recipe_id) : undefined
    return {
      lineNumber: index + 1,
      ingredientId: line.sub_recipe_id || undefined,
      ingredientCode: cleanText(subrecipe?.code),
      ingredientName: cleanText(subrecipe?.name) || 'Subrecipe',
      type: 'subrecipe',
      unit: cleanText(line.unit) || '',
      netQty: toNum(computed.net, 0),
      yieldPercent: toOptionalNum(computed.yieldPct) ?? 100,
      grossQty: toOptionalNum(computed.gross),
      unitCost: toOptionalNum(computed.unitCost),
      lineCost: toOptionalNum(computed.lineCost),
      costPercent: totalIngredientCost > 0 && toNum(computed.lineCost, 0) > 0 ? Number(((toNum(computed.lineCost, 0) / totalIngredientCost) * 100).toFixed(2)) : undefined,
      notes: cleanText(line.notes),
      warnings: Array.isArray(computed.warnings) ? computed.warnings.filter(Boolean) : [],
    }
  })

  const mainPhotoUrl = cleanText(recipe.photo_url)
  const payload: ExportRecipePayload = {
    meta: {
      recipeId: cleanText(recipe.id) || 'recipe',
      recipeCode: cleanText(recipe.code),
      kitchenId: cleanText(recipe.kitchen_id),
      recipeName: cleanText(recipe.name) || 'Recipe',
      subtitle: cleanText(editor.subtitle),
      category: cleanText(recipe.category),
      cuisine: cleanText(recipe.cuisine),
      description: cleanText(recipe.description) || cleanText(editor.subtitle),
      yieldValue: toOptionalNum(editor.yieldQty),
      yieldUnit: cleanText(editor.yieldUnit),
      portions,
      chefNotes: cleanText(editor.chefNotes),
      platingNotes: cleanText(editor.platingNotes),
      allergens: cleanStringArray(editor.allergens),
      equipment: cleanStringArray(editor.equipment),
      createdAt: cleanText(recipe.created_at),
      updatedAt: cleanText(recipe.updated_at),
      exportedAt: new Date().toISOString(),
      exportedBy: cleanText(editor.exportedBy),
      currency,
    },
    lines: normalizedLines,
    totals: {
      totalIngredientCost,
      totalProductionCost: totalIngredientCost,
      totalWeight: toOptionalNum(input.totals?.totalWeight),
      totalGrossWeight: toOptionalNum(input.totals?.totalGrossWeight),
      portions,
      costPerPortion,
      sellingPrice,
      grossProfit,
      grossMarginPercent,
      foodCostPercent,
    },
    steps: stepTexts.map((instruction, index) => ({
      stepNumber: index + 1,
      title: `Step ${index + 1}`,
      instruction,
    })),
    photos: {
      mainPhotoUrl,
      heroPhotoAlt: cleanText(recipe.name),
      stepPhotos: buildStepPhotoObjects(stepPhotos),
      galleryPhotos: galleryPhotos
        .map((url) => ({
          url: String(url || '').trim(),
          type: 'extra' as const,
        }))
        .filter((x) => x.url),
    },
    nutrition: {
      perRecipe: {
        calories: toOptionalNum(recipe.calories),
        protein: toOptionalNum(recipe.protein_g),
        carbs: toOptionalNum(recipe.carbs_g),
        fat: toOptionalNum(recipe.fat_g),
      },
    },
    pricing: {
      currency,
      actualSellingPrice: sellingPrice,
      targetFoodCostPercent: toOptionalNum(editor.targetFoodCostPct),
      suggestedSellingPrice:
        totalIngredientCost > 0 && toNum(editor.targetFoodCostPct, 0) > 0
          ? Number((totalIngredientCost / (toNum(editor.targetFoodCostPct, 0) / 100)).toFixed(2))
          : undefined,
      minimumViablePrice: totalIngredientCost > 0 ? Number((totalIngredientCost / 0.35).toFixed(2)) : undefined,
      premiumPrice: totalIngredientCost > 0 ? Number((totalIngredientCost / 0.25).toFixed(2)) : undefined,
    },
    scale: {
      basePortions: portions,
      targetPortions: portions,
      scalingFactor: 1,
      scaledLines: normalizedLines.map((line) => ({
        ingredientName: line.ingredientName,
        unit: line.unit,
        originalQty: line.netQty,
        scaledQty: line.netQty,
      })),
    },
    settings: {
      workbookTitle: `GastroChef - ${cleanText(recipe.name) || 'Recipe'} - Executive Workbook`,
      brandName: 'GastroChef',
      companyName: 'GastroChef',
      currency,
      includeCover: true,
      includeExecutiveSummary: true,
      includeRecipeCard: true,
      includeIngredients: true,
      includePreparationSteps: true,
      includePhotoGallery: true,
      includeNutrition: true,
      includeCostAnalysis: true,
      includeScaleLab: true,
      includeKitchenPrintCard: true,
      includeManagementReport: true,
      includeTechnicalMetadata: true,
      theme: 'gastrochef-executive',
    },
    diagnostics: {
      warnings: normalizedLines.flatMap((line) => line.warnings || []),
      missingFields: [
        ...(mainPhotoUrl ? [] : ['Main recipe photo missing']),
        ...(stepPhotos.length ? [] : ['Step photos missing']),
        ...(stepTexts.length ? [] : ['Preparation steps missing']),
      ],
      imageStatus: {
        hasMainPhoto: !!mainPhotoUrl,
        hasStepPhotos: stepPhotos.length > 0,
        totalStepPhotos: stepPhotos.length,
      },
    },
  }

  return payload
}

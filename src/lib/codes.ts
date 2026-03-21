// src/lib/codes.ts
// Human-friendly display codes (non-breaking).
// These are DISPLAY codes derived from UUIDs until you add real DB `code` columns.
// Safe: does not touch business logic or Supabase schema.

export type CodeKind = 'ING' | 'PREP' | 'MENU' | 'REC' | 'SUP' | 'PO' | 'WH' | 'PROD' | 'WASTE' | 'SALE'

export function shortId(id: string, len = 6) {
  const s = (id || '').replace(/[^a-f0-9]/gi, '')
  if (!s) return '000000'
  return s.slice(0, len).toUpperCase().padEnd(len, '0')
}

export function displayCode(kind: CodeKind, id: string) {
  return `${kind}-${shortId(id)}`
}

export function recipeKind(isSubrecipe: boolean | null | undefined): CodeKind {
  return isSubrecipe ? 'PREP' : 'REC'
}

// دالة لتوليد كود تسلسلي للوصفات الجديدة من قاعدة البيانات
export async function generateRecipeCode(kitchenId: string): Promise<string> {
  const { supabase } = await import('./supabase')
  
  try {
    const { data: recipes } = await supabase
      .from('recipes')
      .select('code')
      .eq('kitchen_id', kitchenId)
      .like('code', 'REC-%')
      .order('created_at', { ascending: false })
      .limit(1)
    
    let nextNumber = 1
    if (recipes && recipes.length > 0 && recipes[0].code) {
      const match = recipes[0].code.match(/REC-(\d+)/)
      if (match) nextNumber = parseInt(match[1]) + 1
    }
    
    return `REC-${String(nextNumber).padStart(4, '0')}`
  } catch (error) {
    console.error('Error generating recipe code:', error)
    return `REC-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
  }
}

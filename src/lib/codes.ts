// src/lib/codes.ts
// Human-friendly display codes (non-breaking).
// These are DISPLAY codes derived from UUIDs until you add real DB `code` columns.
// Safe: does not touch business logic or Supabase schema.

export type CodeKind = 'ING' | 'PREP' | 'MENU' | 'SUP' | 'PO' | 'WH' | 'PROD' | 'WASTE' | 'SALE'

export function shortId(id: string, len = 6) {
  const s = (id || '').replace(/[^a-f0-9]/gi, '')
  if (!s) return '000000'
  return s.slice(0, len).toUpperCase().padEnd(len, '0')
}

export function displayCode(kind: CodeKind, id: string) {
  return `${kind}-${shortId(id)}`
}

export function recipeKind(isSubrecipe: boolean | null | undefined): CodeKind {
  return isSubrecipe ? 'PREP' : 'MENU'
}

// src/lib/publicShare.ts
// Public, read-only sharing WITHOUT any Supabase/RLS changes.
// The share token contains a compact JSON payload (base64url).

export type ShareRecipe = {
  name: string
  category?: string | null
  portions?: number | null
  description?: string | null
  method?: string | null
  method_steps?: string[] | null
  yield_qty?: number | null
  yield_unit?: string | null
  currency?: string | null
  calories?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  selling_price?: number | null
  target_food_cost_pct?: number | null
  photo_url?: string | null
}

export type ShareLine = {
  line_type: 'ingredient' | 'subrecipe' | 'group'
  position: number
  qty: number
  unit: string
  yield_percent: number
  gross_qty_override?: number | null
  notes?: string | null
  ingredient_id?: string | null
  sub_recipe_id?: string | null
  group_title?: string | null
}

export type ShareIngredient = {
  id: string
  name?: string | null
  pack_unit?: string | null
  net_unit_cost?: number | null
}

export type ShareSubRecipe = { id: string; name?: string | null }

export type PublicSharePayload = {
  v: 1
  created_at: string
  app: 'GastroChef'
  recipe: ShareRecipe
  lines: ShareLine[]
  ingredients?: ShareIngredient[]
  subrecipes?: ShareSubRecipe[]
}

function b64UrlEncode(str: string) {
  // base64url (RFC 4648) without padding
  const b64 = btoa(unescape(encodeURIComponent(str)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64UrlDecode(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const s = atob(b64 + pad)
  return decodeURIComponent(escape(s))
}

export function buildPublicShareToken(payload: PublicSharePayload): string {
  return b64UrlEncode(JSON.stringify(payload))
}

export function parsePublicShareToken(token: string): PublicSharePayload {
  const raw = b64UrlDecode(token)
  const parsed = JSON.parse(raw)
  if (!parsed || parsed.v !== 1 || parsed.app !== 'GastroChef') {
    throw new Error('Invalid share token')
  }
  if (!parsed.recipe || !Array.isArray(parsed.lines)) {
    throw new Error('Invalid share token payload')
  }
  return parsed as PublicSharePayload
}

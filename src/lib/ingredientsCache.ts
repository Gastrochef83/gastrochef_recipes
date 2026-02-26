import { supabase } from './supabase'

export type CachedIngredient = {
  id: string
  name: string | null
  category?: string | null
  supplier?: string | null
  pack_size?: number | null
  pack_price?: number | null
  pack_unit: string | null
  net_unit_cost: number | null
  is_active: boolean | null
  kitchen_id?: string | null
}

type CachePayload = {
  ts: number
  data: CachedIngredient[]
}

let mem: CachePayload | null = null

// Keep small & safe: 60s is enough to prevent duplicate queries while keeping UI fresh.
const TTL_MS = 60_000

export function invalidateIngredientsCache() {
  mem = null
}

export async function getIngredientsCached(): Promise<CachedIngredient[]> {
  const now = Date.now()
  if (mem && now - mem.ts < TTL_MS) return mem.data

  const { data, error } = await supabase
    .from('ingredients')
    .select('id,name,category,supplier,pack_size,pack_price,pack_unit,net_unit_cost,is_active,kitchen_id')
    .order('name', { ascending: true })

  if (error) throw error

  const list = (data || []) as CachedIngredient[]
  mem = { ts: now, data: list }
  return list
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useMode } from '../lib/mode'
import { loadCookSession, saveCookSession, clearCookSession } from '../lib/cookSession'

type Recipe = {
  id: string
  kitchen_id: string
  name: string
  category: string | null
  portions: number
  photo_url: string | null
  description: string | null
  method_steps: string[] | null
  method_step_photos?: string[] | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  currency?: string | null
  selling_price?: number | null
}

type LineType = 'ingredient' | 'subrecipe' | 'group'

type Line = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  sub_recipe_id: string | null
  qty: number
  unit: string
  note: string | null
  sort_order: number
  line_type: LineType
  group_title: string | null
}

type Ingredient = {
  id: string
  name: string | null
  pack_unit: string | null
}

type PrepItem = {
  label: string
  qty: number
  unit: string
  note: string
}

const draftKey = (rid: string) => `gc_recipe_lines_draft__${rid}`

function readDraftLinesAny(rid: string): any[] {
  try {
    const raw = localStorage.getItem(draftKey(rid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function normalizeSteps(steps: string[] | null | undefined) {
  return (steps ?? []).map((s) => (s ?? '').trim()).filter(Boolean)
}

function alignPhotos(cleanSteps: string[], photos: string[] | null | undefined) {
  const p = (photos ?? []).map((x) => (x ?? '').trim())
  return cleanSteps.map((_, i) => p[i] ?? '')
}

function fmtQty(q: number) {
  const v = Number.isFinite(q) ? q : 0
  if (Math.abs(v) >= 100) return String(Math.round(v))
  if (Math.abs(v) >= 10) return String(Math.round(v * 10) / 10)
  return String(Math.round(v * 100) / 100)
}

function mergeCookLines(db: Line[], draftAny: any[]): Line[] {
  const byId = new Set((db || []).map((l) => l.id))

  const mapped: Line[] = (draftAny || [])
    .filter((l) => l && l.id && !byId.has(l.id))
    .map((l) => ({
      id: String(l.id),
      recipe_id: String(l.recipe_id || ''),
      ingredient_id: l.ingredient_id ?? null,
      sub_recipe_id: l.sub_recipe_id ?? null,
      qty: toNum(l.qty, 0),
      unit: String(l.unit || 'g'),
      note: (l.notes ?? l.note ?? null) as any,
      sort_order: toNum(l.position ?? l.sort_order, 0),
      line_type: (l.line_type || 'ingredient') as any,
      group_title: (l.group_title ?? null) as any,
    }))

  const merged = [...(db || []), ...mapped]
  merged.sort((a, b) => toNum(a.sort_order, 0) - toNum(b.sort_order, 0))
  return merged
}

function CookModeStyles() {
  return (
    <style>{`
      .cook-mode-page {
        display: grid;
        gap: 20px;
      }

      .cook-hero {
        position: relative;
        overflow: hidden;
        border-radius: 28px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background:
          radial-gradient(circle at top right, rgba(124, 148, 78, 0.10), transparent 28%),
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,248,245,0.95));
        box-shadow:
          0 16px 40px rgba(50, 59, 44, 0.06),
          inset 0 1px 0 rgba(255,255,255,0.85);
      }

      .cook-hero__body {
        padding: 24px;
      }

      .cook-hero__grid {
        display: grid;
        grid-template-columns: 140px minmax(0, 1fr);
        gap: 20px;
        align-items: start;
      }

      .cook-photo {
        width: 140px;
        height: 140px;
        overflow: hidden;
        border-radius: 24px;
        border: 1px solid rgba(118, 128, 108, 0.16);
        background:
          linear-gradient(180deg, rgba(248,248,245,1), rgba(241,242,237,1));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.9),
          0 10px 24px rgba(60, 70, 55, 0.06);
      }

      .cook-photo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .cook-photo__empty {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        color: #73806d;
        font-size: 12px;
        font-weight: 700;
      }

      .cook-label {
        font-size: 12px;
        letter-spacing: 0.18em;
        font-weight: 900;
        color: #7a857f;
      }

      .cook-title {
        margin-top: 8px;
        font-size: clamp(1.8rem, 2vw, 2.4rem);
        line-height: 1.04;
        font-weight: 950;
        letter-spacing: -0.03em;
        color: #18210f;
        text-transform: uppercase;
      }

      .cook-desc {
        margin-top: 10px;
        color: #5f6b66;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.6;
      }

      .cook-topmeta {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .cook-chip {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background: rgba(255,255,255,0.8);
        color: #42503b;
        font-size: 13px;
        font-weight: 800;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
      }

      .cook-chip--dark {
        background: #23301a;
        border-color: #23301a;
        color: #fff;
      }

      .cook-kpis {
        margin-top: 18px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .cook-kpi {
        border-radius: 20px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.96), rgba(244,245,240,0.93));
        padding: 16px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
      }

      .cook-kpi__label {
        font-size: 11px;
        line-height: 1;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-weight: 900;
        color: #73806d;
      }

      .cook-kpi__value {
        margin-top: 10px;
        font-size: 1.28rem;
        line-height: 1.05;
        font-weight: 950;
        letter-spacing: -0.02em;
        color: #16200f;
      }

      .cook-controls {
        margin-top: 18px;
        display: grid;
        gap: 10px;
      }

      .cook-controls__row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }

      .cook-controls__label {
        font-size: 12px;
        letter-spacing: 0.18em;
        font-weight: 900;
        color: #7a857f;
      }

      .cook-servings-box {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border-radius: 18px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background: rgba(255,255,255,0.78);
      }

      .cook-servings-value {
        min-width: 72px;
        text-align: center;
        font-size: 1.15rem;
        font-weight: 900;
        color: #18210f;
      }

      .cook-range {
        width: min(360px, 100%);
        accent-color: #748d3f;
      }

      .cook-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .cook-btn {
        appearance: none;
        min-height: 44px;
        padding: 0 16px;
        border-radius: 14px;
        border: 1px solid transparent;
        cursor: pointer;
        font-weight: 800;
        transition: all 160ms ease;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .cook-btn--primary {
        background: linear-gradient(180deg, #81984f, #6f8641);
        color: #fff;
        box-shadow: 0 10px 22px rgba(104, 124, 58, 0.22);
      }

      .cook-btn--primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 24px rgba(104, 124, 58, 0.26);
      }

      .cook-btn--ghost {
        background: rgba(255,255,255,0.82);
        color: #32402b;
        border-color: rgba(118, 128, 108, 0.16);
      }

      .cook-btn--ghost:hover {
        background: rgba(255,255,255,0.96);
        border-color: rgba(107, 128, 68, 0.24);
      }

      .cook-section {
        border-radius: 24px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.97), rgba(248,248,245,0.95));
        box-shadow:
          0 12px 32px rgba(50, 59, 44, 0.05),
          inset 0 1px 0 rgba(255,255,255,0.86);
        overflow: hidden;
      }

      .cook-section__body {
        padding: 22px;
      }

      .cook-section__top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .cook-section__title {
        font-size: 12px;
        letter-spacing: 0.18em;
        font-weight: 900;
        color: #7a857f;
      }

      .cook-section__sub {
        margin-top: 6px;
        color: #6b7566;
        font-size: 13px;
        font-weight: 600;
      }

      .cook-prep-grid {
        margin-top: 16px;
        display: grid;
        gap: 10px;
      }

      .cook-prep-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        border-radius: 18px;
        border: 1px solid rgba(118, 128, 108, 0.12);
        background: rgba(247,248,244,0.88);
        padding: 13px 14px;
      }

      .cook-prep-item__name {
        min-width: 0;
        font-weight: 800;
        color: #18210f;
      }

      .cook-prep-item__note {
        margin-top: 4px;
        font-size: 12px;
        color: #7a857f;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cook-prep-item__qty {
        flex: 0 0 auto;
        font-weight: 900;
        color: #16200f;
        font-variant-numeric: tabular-nums;
      }

      .cook-steps {
        margin-top: 18px;
        display: grid;
        gap: 14px;
      }

      .cook-step {
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr);
        gap: 14px;
        padding: 16px;
        border-radius: 22px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.94), rgba(246,247,242,0.92));
        transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
      }

      .cook-step:hover {
        transform: translateY(-1px);
        border-color: rgba(107, 128, 68, 0.22);
        box-shadow: 0 10px 22px rgba(50, 59, 44, 0.05);
      }

      .cook-step--done {
        background:
          linear-gradient(180deg, rgba(241,248,233,0.98), rgba(235,245,225,0.96));
        border-color: rgba(117, 141, 63, 0.22);
      }

      .cook-step__check {
        appearance: none;
        width: 52px;
        height: 52px;
        border-radius: 16px;
        border: 1px solid rgba(118, 128, 108, 0.18);
        background: rgba(255,255,255,0.92);
        display: grid;
        place-items: center;
        cursor: pointer;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.95);
      }

      .cook-step--done .cook-step__check {
        background: linear-gradient(180deg, #81984f, #6f8641);
        border-color: #6f8641;
      }

      .cook-step__dot {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 2px solid #7d8b73;
        background: transparent;
      }

      .cook-step--done .cook-step__dot {
        border-color: #fff;
        background: #fff;
      }

      .cook-step__top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .cook-step__title {
        font-size: 1rem;
        font-weight: 900;
        color: #16200f;
      }

      .cook-step__status {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }

      .cook-step__text {
        margin-top: 10px;
        color: #26301f;
        font-size: 15px;
        line-height: 1.75;
        font-weight: 600;
      }

      .cook-step__photo {
        margin-top: 14px;
        overflow: hidden;
        border-radius: 20px;
        border: 1px solid rgba(118, 128, 108, 0.14);
        background: #fff;
      }

      .cook-step__photo img {
        width: 100%;
        max-height: 340px;
        object-fit: cover;
        display: block;
      }

      @media (max-width: 980px) {
        .cook-hero__grid {
          grid-template-columns: 1fr;
        }

        .cook-photo {
          width: 120px;
          height: 120px;
        }

        .cook-kpis {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .cook-hero__body,
        .cook-section__body {
          padding: 16px;
        }

        .cook-step {
          grid-template-columns: 1fr;
        }

        .cook-step__check {
          width: 46px;
          height: 46px;
        }
      }

      @media print {
        .cook-btn,
        .cook-range,
        .toast-root {
          display: none !important;
        }

        .cook-hero,
        .cook-section,
        .cook-step {
          box-shadow: none !important;
        }

        .cook-mode-page {
          gap: 14px;
        }
      }
    `}</style>
  )
}

export default function RecipeCookMode() {
  const [sp] = useSearchParams()
  const id = sp.get('id')

  const { isKitchen, isMgmt } = useMode()

  const [loading, setLoading] = useState(true)
  const [recipe, setRecipe] = useState<Recipe | null>(null)

  const [lines, setLines] = useState<Line[]>([])
  const [ings, setIngs] = useState<Ingredient[]>([])

  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }

  const [servings, setServings] = useState(1)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [timers, setTimers] = useState<Record<number, number>>({})
  const [prepOpen, setPrepOpen] = useState(false)

  const tickRef = useRef<number | null>(null)

  const load = async (recipeId: string) => {
    setLoading(true)
    try {
      const selectWithPhotos =
        'id,kitchen_id,name,category,portions,photo_url,description,method_steps,method_step_photos,calories,protein_g,carbs_g,fat_g,currency,selling_price'
      const selectNoPhotos =
        'id,kitchen_id,name,category,portions,photo_url,description,method_steps,calories,protein_g,carbs_g,fat_g,currency,selling_price'

      let r: any = null
      let rErr: any = null

      const res = await supabase.from('recipes').select(selectWithPhotos).eq('id', recipeId).single()
      r = res.data
      rErr = res.error

      if (rErr && String(rErr.message || '').toLowerCase().includes('method_step_photos')) {
        const res2 = await supabase.from('recipes').select(selectNoPhotos).eq('id', recipeId).single()
        r = res2.data
        rErr = res2.error
      }
      if (rErr) throw rErr

      const rr = r as Recipe
      setRecipe(rr)

      let l: any[] = []
      {
        const primary = await supabase
          .from('recipe_lines')
          .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,notes,position,line_type,group_title')
          .eq('recipe_id', recipeId)
          .order('position', { ascending: true })

        if (!primary.error) {
          l = (primary.data ?? []) as any[]
        } else {
          const fallback = await supabase
            .from('recipe_lines')
            .select('id,recipe_id,ingredient_id,sub_recipe_id,qty,unit,note,sort_order,line_type,group_title')
            .eq('recipe_id', recipeId)
            .order('sort_order', { ascending: true })
            .order('id', { ascending: true })
          if (fallback.error) throw fallback.error
          l = (fallback.data ?? []) as any[]
        }
      }

      const normalized: Line[] = (l ?? []).map((row: any) => ({
        id: String(row.id),
        recipe_id: String(row.recipe_id || recipeId),
        ingredient_id: row.ingredient_id ?? null,
        sub_recipe_id: row.sub_recipe_id ?? null,
        qty: toNum(row.qty, 0),
        unit: String(row.unit || 'g'),
        note: (row.notes ?? row.note ?? null) as any,
        sort_order: toNum(row.position ?? row.sort_order, 0),
        line_type: (row.line_type || 'ingredient') as any,
        group_title: (row.group_title ?? null) as any,
      }))

      const draft = readDraftLinesAny(recipeId)
      const merged = draft?.length ? mergeCookLines(normalized, draft) : normalized
      setLines(merged as Line[])

      const { data: i, error: iErr } = await supabase
        .from('ingredients')
        .select('id,name,pack_unit')
        .order('name', { ascending: true })

      if (iErr) throw iErr
      setIngs((i ?? []) as Ingredient[])

      const sess = loadCookSession(recipeId)
      const base = Math.max(1, toNum(rr.portions, 1))
      setServings(sess?.servings && sess.servings > 0 ? sess.servings : base)
      setChecked(sess?.checkedSteps ?? {})
      setTimers(sess?.timers ?? {})
    } catch (e: any) {
      showToast(e?.message ?? 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!id) {
      setLoading(false)
      showToast('Missing recipe id (?id=...)')
      return
    }
    load(id).catch(() => {})
  }, [id])

  const basePortions = Math.max(1, toNum(recipe?.portions, 1))
  const scale = servings / basePortions

  const ingById = useMemo(() => {
    const m = new Map<string, Ingredient>()
    for (const i of ings) m.set(i.id, i)
    return m
  }, [ings])

  const cleanSteps = useMemo(() => normalizeSteps(recipe?.method_steps), [recipe?.method_steps])
  const stepPhotos = useMemo(
    () => alignPhotos(cleanSteps, recipe?.method_step_photos),
    [cleanSteps, recipe?.method_step_photos]
  )

  useEffect(() => {
    if (!id) return
    saveCookSession(id, { servings, checkedSteps: checked, timers })
  }, [id, servings, checked, timers])

  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => {
      setTimers((prev) => {
        let changed = false
        const next: Record<number, number> = { ...prev }
        for (const k of Object.keys(next)) {
          const idx = Number(k)
          const v = toNum(next[idx], 0)
          if (v > 0) {
            next[idx] = v - 1
            changed = true
          }
          if (next[idx] <= 0) next[idx] = 0
        }
        return changed ? next : prev
      })
    }, 1000)

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const toggleStep = (idx: number) => {
    setChecked((p) => ({ ...p, [idx]: !p[idx] }))
  }

  const setTimerPreset = (idx: number, minutes: number) => {
    setTimers((p) => ({ ...p, [idx]: Math.max(0, Math.floor(minutes * 60)) }))
  }

  const print = () => window.print()

  const resetSession = () => {
    if (!id) return
    clearCookSession(id)
    setChecked({})
    setTimers({})
    setPrepOpen(false)
    showToast('Cook session cleared ✅')
  }

  const prepList = useMemo(() => {
    const items: PrepItem[] = []

    for (const l of lines) {
      if (l.line_type !== 'ingredient') continue
      if (!l.ingredient_id) continue

      const ing = ingById.get(l.ingredient_id)
      const label = ing?.name ?? 'Ingredient'
      const qtyScaled = Math.max(0, toNum(l.qty, 0) * scale)

      items.push({
        label,
        qty: qtyScaled,
        unit: safeUnit(l.unit),
        note: (l.note ?? '').trim(),
      })
    }

    const m = new Map<string, PrepItem>()
    for (const it of items) {
      const key = `${it.label}__${it.unit}__${it.note}`
      const cur = m.get(key)
      if (!cur) m.set(key, { ...it })
      else m.set(key, { ...cur, qty: cur.qty + it.qty })
    }

    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [lines, ingById, scale])

  if (loading) return <div className="gc-card p-6">Loading cook mode…</div>

  if (!recipe) {
    return (
      <div className="gc-card p-6 space-y-3">
        <div className="gc-label">NOT FOUND</div>
        <div className="text-sm text-neutral-600">Recipe not found.</div>
        <NavLink className="gc-btn gc-btn-primary" to="/recipes">
          Back to Recipes
        </NavLink>
      </div>
    )
  }

  return (
    <>
      <CookModeStyles />

      <div className="cook-mode-page">
        <section className="cook-hero">
          <div className="cook-hero__body">
            <div className="cook-hero__grid">
              <div className="cook-photo">
                {recipe.photo_url ? (
                  <img src={recipe.photo_url} alt={recipe.name} />
                ) : (
                  <div className="cook-photo__empty">No Photo</div>
                )}
              </div>

              <div>
                <div className="cook-label">COOK MODE — PRO</div>
                <div className="cook-title">{recipe.name}</div>

                <div className="cook-desc">
                  {recipe.description?.trim()
                    ? recipe.description
                    : 'Add a premium description in the editor…'}
                </div>

                <div className="cook-topmeta">
                  {(recipe.calories != null ||
                    recipe.protein_g != null ||
                    recipe.carbs_g != null ||
                    recipe.fat_g != null) && (
                    <>
                      {recipe.calories != null ? (
                        <span className="cook-chip">{recipe.calories} kcal</span>
                      ) : null}
                      {recipe.protein_g != null ? (
                        <span className="cook-chip">P {toNum(recipe.protein_g, 0)}g</span>
                      ) : null}
                      {recipe.carbs_g != null ? (
                        <span className="cook-chip">C {toNum(recipe.carbs_g, 0)}g</span>
                      ) : null}
                      {recipe.fat_g != null ? (
                        <span className="cook-chip">F {toNum(recipe.fat_g, 0)}g</span>
                      ) : null}
                    </>
                  )}

                  {isMgmt && recipe.selling_price != null ? (
                    <span className="cook-chip cook-chip--dark">
                      Price {toNum(recipe.selling_price, 0)}{' '}
                      {(recipe.currency ?? 'USD').toUpperCase()}
                    </span>
                  ) : null}

                  {isKitchen ? (
                    <span className="cook-chip">Kitchen view</span>
                  ) : (
                    <span className="cook-chip">Mgmt view</span>
                  )}
                </div>

                <div className="cook-kpis">
                  <div className="cook-kpi">
                    <div className="cook-kpi__label">Base Portions</div>
                    <div className="cook-kpi__value">{basePortions}</div>
                  </div>

                  <div className="cook-kpi">
                    <div className="cook-kpi__label">Servings Now</div>
                    <div className="cook-kpi__value">{servings}</div>
                  </div>

                  <div className="cook-kpi">
                    <div className="cook-kpi__label">Scale</div>
                    <div className="cook-kpi__value">
                      x {Math.round(scale * 100) / 100}
                    </div>
                  </div>
                </div>

                <div className="cook-controls">
                  <div className="cook-controls__label">SERVINGS</div>

                  <div className="cook-controls__row">
                    <div className="cook-servings-box">
                      <button
                        className="cook-btn cook-btn--ghost"
                        type="button"
                        onClick={() => setServings((v) => Math.max(1, v - 1))}
                      >
                        −
                      </button>

                      <div className="cook-servings-value">{servings}</div>

                      <button
                        className="cook-btn cook-btn--ghost"
                        type="button"
                        onClick={() => setServings((v) => v + 1)}
                      >
                        +
                      </button>
                    </div>

                    <input
                      className="cook-range"
                      type="range"
                      min={1}
                      max={Math.max(10, basePortions * 6)}
                      value={servings}
                      onChange={(e) =>
                        setServings(Math.max(1, toNum(e.target.value, 1)))
                      }
                    />
                  </div>

                  <div className="cook-actions">
                    <NavLink
                      className="cook-btn cook-btn--primary"
                      to={`/recipe?id=${recipe.id}`}
                    >
                      Back to Editor
                    </NavLink>

                    <button
                      className="cook-btn cook-btn--ghost"
                      type="button"
                      onClick={() => setPrepOpen((v) => !v)}
                    >
                      {prepOpen ? 'Hide Prep List' : 'Prep List'}
                    </button>

                    <button
                      className="cook-btn cook-btn--ghost"
                      type="button"
                      onClick={print}
                    >
                      Print A4
                    </button>

                    <button
                      className="cook-btn cook-btn--ghost"
                      type="button"
                      onClick={resetSession}
                    >
                      Reset
                    </button>

                    <NavLink className="cook-btn cook-btn--ghost" to="/recipes">
                      Recipes
                    </NavLink>
                  </div>
                </div>
              </div>
            </div>

            {prepList.length > 0 && (
              <div className="cook-section" style={{ marginTop: 20 }}>
                <div className="cook-section__body">
                  <div className="cook-section__top">
                    <div>
                      <div className="cook-section__title">INGREDIENTS (SCALED)</div>
                      <div className="cook-section__sub">
                        Updates automatically when you change servings.
                      </div>
                    </div>

                    <button
                      className="cook-btn cook-btn--ghost"
                      type="button"
                      onClick={() => setPrepOpen(true)}
                    >
                      Open Full Prep List
                    </button>
                  </div>

                  <div className="cook-prep-grid">
                    {prepList.slice(0, 10).map((it, idx) => (
                      <div key={idx} className="cook-prep-item">
                        <div style={{ minWidth: 0 }}>
                          <div className="cook-prep-item__name">{it.label}</div>
                          {it.note ? (
                            <div className="cook-prep-item__note">{it.note}</div>
                          ) : null}
                        </div>

                        <div className="cook-prep-item__qty">
                          {fmtQty(it.qty)} {it.unit}
                        </div>
                      </div>
                    ))}
                  </div>

                  {prepList.length > 10 ? (
                    <div className="cook-section__sub" style={{ marginTop: 10 }}>
                      Showing 10 of {prepList.length} items.
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {prepOpen && (
              <div className="cook-section" style={{ marginTop: 20 }}>
                <div className="cook-section__body">
                  <div className="cook-section__top">
                    <div>
                      <div className="cook-section__title">PREP LIST (SCALED)</div>
                      <div className="cook-section__sub">
                        Ingredient-only list · scaled by servings.
                      </div>
                    </div>

                    <button
                      className="cook-btn cook-btn--ghost"
                      type="button"
                      onClick={() => setPrepOpen(false)}
                    >
                      Close
                    </button>
                  </div>

                  {prepList.length === 0 ? (
                    <div className="cook-section__sub" style={{ marginTop: 14 }}>
                      No ingredient lines yet.
                    </div>
                  ) : (
                    <div className="cook-prep-grid">
                      {prepList.map((it, i) => (
                        <div key={i} className="cook-prep-item">
                          <div style={{ minWidth: 0 }}>
                            <div className="cook-prep-item__name">{it.label}</div>
                            {it.note ? (
                              <div className="cook-prep-item__note">{it.note}</div>
                            ) : null}
                          </div>

                          <div className="cook-prep-item__qty">
                            {fmtQty(it.qty)} {it.unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="cook-section">
          <div className="cook-section__body">
            <div className="cook-section__title">STEPS</div>

            {cleanSteps.length === 0 ? (
              <div className="cook-section__sub" style={{ marginTop: 14 }}>
                No steps yet. Add steps in the editor.
              </div>
            ) : (
              <div className="cook-steps">
                {cleanSteps.map((s, idx) => {
                  const photo = (stepPhotos[idx] ?? '').trim()
                  const done = checked[idx] === true
                  const t = toNum(timers[idx], 0)

                  const mm = Math.floor(t / 60)
                  const ss = t % 60
                  const timerLabel = t > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : '—'

                  return (
                    <div
                      key={idx}
                      className={`cook-step ${done ? 'cook-step--done' : ''}`}
                    >
                      <button
                        type="button"
                        className="cook-step__check"
                        onClick={() => toggleStep(idx)}
                        aria-label={`Toggle step ${idx + 1}`}
                      >
                        <span className="cook-step__dot" />
                      </button>

                      <div>
                        <div className="cook-step__top">
                          <div className="cook-step__title">Step {idx + 1}</div>

                          <div className="cook-step__status">
                            {done ? (
                              <span className="cook-chip cook-chip--dark">Done</span>
                            ) : (
                              <span className="cook-chip">Todo</span>
                            )}

                            <span className="cook-chip">Timer {timerLabel}</span>

                            <button
                              className="cook-btn cook-btn--ghost"
                              type="button"
                              onClick={() => setTimerPreset(idx, 1)}
                            >
                              +1m
                            </button>

                            <button
                              className="cook-btn cook-btn--ghost"
                              type="button"
                              onClick={() => setTimerPreset(idx, 5)}
                            >
                              +5m
                            </button>

                            <button
                              className="cook-btn cook-btn--ghost"
                              type="button"
                              onClick={() => setTimerPreset(idx, 10)}
                            >
                              +10m
                            </button>

                            <button
                              className="cook-btn cook-btn--ghost"
                              type="button"
                              onClick={() =>
                                setTimers((p) => ({ ...p, [idx]: 0 }))
                              }
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="cook-step__text">{s}</div>

                        {photo ? (
                          <div className="cook-step__photo">
                            <img src={photo} alt={`Step ${idx + 1}`} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <Toast
          open={toastOpen}
          message={toastMsg}
          onClose={() => setToastOpen(false)}
        />
      </div>
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Toast } from '../components/Toast'
import { useKitchen } from '../lib/kitchen'
import { exportKitchenBackup, importKitchenBackup } from '../lib/backupJson'
import {
  getDemoMode,
  setDemoMode,
  getPlan,
  setPlan,
  getLicenseKey,
  setLicenseKey,
  validateLicenseKey,
  canUse,
  type GCPlan,
} from '../lib/license'
import { NavLink } from 'react-router-dom'

type Ingredient = {
  id: string
  name?: string | null
  pack_size?: number | null
  pack_price?: number | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
}

type Recipe = {
  id: string
  name: string
  portions: number
  is_archived: boolean
  is_subrecipe: boolean
  yield_qty: number | null
  yield_unit: string | null
}

function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}
function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}
function money(n: number, currency = 'USD') {
  const v = Number.isFinite(n) ? n : 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v)
  } catch {
    return `${v.toFixed(2)} ${currency}`
  }
}
function calcNet(packPrice: number, packSize: number) {
  const ps = Math.max(1e-9, packSize)
  const pp = Math.max(0, packPrice)
  return pp / ps
}
function sanityFlag(net: number, unit: string) {
  const u = safeUnit(unit)
  if (!Number.isFinite(net) || net <= 0) return { level: 'missing' as const, msg: 'Missing cost' }
  if (u === 'g' || u === 'ml') {
    if (net > 1) return { level: 'warn' as const, msg: 'High per g/ml (unit mismatch?)' }
  }
  if (u === 'kg' || u === 'l') {
    if (net > 200) return { level: 'warn' as const, msg: 'High per kg/L' }
  }
  if (u === 'pcs') {
    if (net > 500) return { level: 'warn' as const, msg: 'High per piece' }
  }
  return { level: 'ok' as const, msg: '' }
}

export default function Settings() {
  const k = useKitchen()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])

  // app prefs (local only)
  const [currency, setCurrency] = useState<string>(() => localStorage.getItem('gc_currency') || 'USD')

  // Sales / License (local only)
  const [demoMode, setDemoModeState] = useState<boolean>(() => getDemoMode())
  const [plan, setPlanState] = useState<GCPlan>(() => getPlan())
  const [licenseKey, setLicenseKeyState] = useState<string>(() => getLicenseKey())
  const [licenseHint, setLicenseHint] = useState<string>('')


  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg)
    setToastOpen(true)
  }


  const applySalesPrefs = (next: { demo?: boolean; plan?: GCPlan }) => {
    if (typeof next.demo === 'boolean') {
      setDemoMode(next.demo)
      setDemoModeState(next.demo)
    }
    if (next.plan) {
      setPlan(next.plan)
      setPlanState(next.plan)
    }
    // Let header badges refresh immediately
    window.dispatchEvent(new Event('gc:license'))
  }

  const applyLicense = (raw: string) => {
    const key = (raw || '').trim()
    setLicenseKeyState(key)
    setLicenseKey(key)

    if (!key) {
      setLicenseHint('')
      window.dispatchEvent(new Event('gc:license'))
      return
    }

    const res = validateLicenseKey(key)
    if (!res.ok) {
      setLicenseHint(res.reason || 'Invalid key')
      showToast('License key invalid (format)')
      window.dispatchEvent(new Event('gc:license'))
      return
    }

    if (res.plan) {
      applySalesPrefs({ plan: res.plan })
      setLicenseHint(`Activated: ${res.plan}`)
      showToast(`License activated: ${res.plan}`)
    }
  }

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const { data: ing, error: ie } = await supabase
        .from('ingredients')
        .select('id,name,pack_size,pack_price,pack_unit,net_unit_cost,is_active')
      if (ie) throw ie

      const { data: rec, error: re } = await supabase
        .from('recipes')
        .select('id,name,portions,is_archived,is_subrecipe,yield_qty,yield_unit')
      if (re) throw re

      setIngredients((ing ?? []) as Ingredient[])
      setRecipes((rec ?? []) as Recipe[])
      setLoading(false)
    } catch (e: any) {
      setErr(e?.message ?? 'Unknown error')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const activeIngredients = useMemo(() => ingredients.filter((i) => i.is_active !== false), [ingredients])

  const ingDiagnostics = useMemo(() => {
    const missingPack = activeIngredients.filter((i) => toNum(i.pack_size, 0) <= 0 || toNum(i.pack_price, 0) <= 0).length
    const missingCost = activeIngredients.filter((i) => toNum(i.net_unit_cost, 0) <= 0).length
    const unitWarnings = activeIngredients.filter((i) => sanityFlag(toNum(i.net_unit_cost, 0), i.pack_unit ?? 'g').level === 'warn').length
    return { missingPack, missingCost, unitWarnings, total: activeIngredients.length }
  }, [activeIngredients])

  const subrecipeDiagnostics = useMemo(() => {
    const subs = recipes.filter((r) => r.is_subrecipe && !r.is_archived)
    const missingYield = subs.filter((r) => toNum(r.yield_qty, 0) <= 0 || !safeUnit(r.yield_unit ?? '')).length
    return { subsCount: subs.length, missingYield }
  }, [recipes])

  const savePrefs = () => {
    localStorage.setItem('gc_currency', currency.toUpperCase() || 'USD')
    showToast('Preferences saved ✅')
  }

  // Backup / Transfer (JSON)
  const exportBackup = async () => {
    if (!k.kitchenId) return showToast('Kitchen not ready yet')
    try {
      const obj = await exportKitchenBackup(k.kitchenId, k.kitchenName)
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      const ts = new Date().toISOString().slice(0, 10)
      const nameSafe = (k.kitchenName || 'Kitchen').replace(/[^a-zA-Z0-9_-]+/g, '_')
      a.href = URL.createObjectURL(blob)
      a.download = `GastroChef_Backup_${nameSafe}_${ts}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      showToast('Backup exported ✅')
    } catch (e: any) {
      showToast(e?.message ?? 'Export failed')
    }
  }

  const importBackup = async (file: File) => {
    if (!k.kitchenId) return showToast('Kitchen not ready yet')
    const ok = confirm('Import will ADD recipes/lines into this kitchen. Continue?')
    if (!ok) return

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw)
      const r = await importKitchenBackup(k.kitchenId, parsed)
      showToast(`Import complete ✅ (+${r.createdIngredients} ingredients, +${r.createdRecipes} recipes, +${r.createdLines} lines)`)
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Import failed')
    }
  }

  const bulkRecalcNetCosts = async () => {
    const list = activeIngredients
    if (list.length === 0) return
    const ok = confirm(`Recalculate net_unit_cost from pack_price/pack_size for ${list.length} active ingredients?`)
    if (!ok) return

    try {
      for (const i of list) {
        const ps = Math.max(1, toNum(i.pack_size, 1))
        const pp = Math.max(0, toNum(i.pack_price, 0))
        const net = calcNet(pp, ps)
        const { error } = await supabase.from('ingredients').update({ net_unit_cost: net }).eq('id', i.id)
        if (error) throw error
      }
      showToast('Recalculation done ✅')
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Recalc failed')
    }
  }

  const bulkDeactivateUnitWarnings = async () => {
    const list = activeIngredients.filter((i) => sanityFlag(toNum(i.net_unit_cost, 0), i.pack_unit ?? 'g').level === 'warn')
    if (list.length === 0) return showToast('No unit warnings found ✅')
    const ok = confirm(`Deactivate ${list.length} ingredients with suspicious unit costs?`)
    if (!ok) return

    try {
      for (const i of list) {
        const { error } = await supabase.from('ingredients').update({ is_active: false }).eq('id', i.id)
        if (error) throw error
      }
      showToast('Deactivated suspicious items ✅')
      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Bulk deactivate failed')
    }
  }

  if (loading) return <div className="gc-card p-6">Loading settings…</div>
  if (err) {
    return (
      <div className="gc-card p-6 space-y-2">
        <div className="gc-label">ERROR</div>
        <div className="text-sm text-red-600">{err}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="gc-card p-6">
        <div className="gc-label">SETTINGS — CONTROL PANEL</div>
        <div className="mt-2 text-2xl font-extrabold">System</div>
        <div className="mt-2 text-sm text-neutral-600">Diagnostics, preferences, and safe bulk fixes.</div>
      </div>

      {/* Preferences */}
      <div className="gc-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="gc-label">PREFERENCES</div>
            <div className="mt-1 text-sm text-neutral-600">Saved locally on this browser (no DB change).</div>
          </div>
          <button className="gc-btn gc-btn-primary" type="button" onClick={savePrefs}>
            Save Preferences
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <div className="gc-label">DEFAULT CURRENCY</div>
            <input className="gc-input mt-2 w-full" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
            <div className="mt-1 text-xs text-neutral-500">Used by dashboards & formatting (where applicable).</div>
          </div>
        </div>
      </div>

      {/* Diagnostics */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="gc-card p-6">
          <div className="gc-label">INGREDIENTS DIAGNOSTICS</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="gc-kpi">
              <div className="gc-kpi-label">Active ingredients</div>
              <div className="gc-kpi-value">{ingDiagnostics.total}</div>
            </div>
            <div className="gc-kpi">
              <div className="gc-kpi-label">Missing pack (size/price)</div>
              <div className="gc-kpi-value">{ingDiagnostics.missingPack}</div>
            </div>
            <div className="gc-kpi">
              <div className="gc-kpi-label">Missing net cost</div>
              <div className="gc-kpi-value">{ingDiagnostics.missingCost}</div>
            </div>
            <div className="gc-kpi">
              <div className="gc-kpi-label">Unit warnings</div>
              <div className="gc-kpi-value">{ingDiagnostics.unitWarnings}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="gc-btn gc-btn-primary" type="button" onClick={bulkRecalcNetCosts}>
              Recalculate net costs
            </button>
            <button className="gc-btn gc-btn-ghost" type="button" onClick={bulkDeactivateUnitWarnings}>
              Deactivate suspicious items
            </button>
          </div>

          <div className="mt-3 text-xs text-neutral-500">
            Tip: if your Dashboard shows insane costs, run “Recalculate net costs” first.
          </div>
        </div>

        <div className="gc-card p-6">
          <div className="gc-label">SUB-RECIPES DIAGNOSTICS</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="gc-kpi">
              <div className="gc-kpi-label">Sub-recipes</div>
              <div className="gc-kpi-value">{subrecipeDiagnostics.subsCount}</div>
            </div>
            <div className="gc-kpi">
              <div className="gc-kpi-label">Missing yield</div>
              <div className="gc-kpi-value">{subrecipeDiagnostics.missingYield}</div>
            </div>
          </div>

          <div className="mt-3 text-xs text-neutral-500">
            Your costing becomes “enterprise-grade” when every sub-recipe has Yield Qty + Unit.
          </div>
        </div>
      </div>

      {/* Backup & Transfer */}
      <div className="gc-card p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="gc-label">BACKUP & TRANSFER (JSON)</div>
            <div className="mt-2 text-sm text-neutral-600">
              Export your kitchen data or import it into another kitchen. This does not change schema.
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Import behavior: creates new recipes (unique names) and adds lines. Ingredient matching is by name.
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="gc-btn gc-btn-primary"
              type="button"
              onClick={() => {
                if (!canUse('BACKUP_EXPORT')) return showToast('Upgrade to Pro to export backups')
                exportBackup()
              }}
              disabled={!k.kitchenId || k.loading || !canUse('BACKUP_EXPORT')}
              title={!canUse('BACKUP_EXPORT') ? 'Upgrade required' : undefined}
            >
              Export Backup
            </button>

            <label
              className={canUse('BACKUP_IMPORT') ? 'gc-btn gc-btn-ghost' : 'gc-btn gc-btn-ghost opacity-50'}
              style={{ cursor: canUse('BACKUP_IMPORT') ? 'pointer' : 'not-allowed' }}
              title={!canUse('BACKUP_IMPORT') ? 'Upgrade required' : undefined}
              onClick={(e) => {
                if (!canUse('BACKUP_IMPORT')) {
                  e.preventDefault()
                  showToast('Upgrade to Pro to import backups')
                }
              }}
            >
              Import Backup
              <input
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) {
                    if (!canUse('BACKUP_IMPORT')) return showToast('Upgrade to Pro to import backups')
                    importBackup(f)
                  }
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Quick status */}
      <div className="gc-card p-6">
        <div className="gc-label">QUICK STATUS</div>
        <div className="mt-2 text-sm text-neutral-700">
          Ingredients avg net cost (active):{' '}
          <span className="font-semibold">
            {money(
              activeIngredients.length ? activeIngredients.reduce((a, i) => a + toNum(i.net_unit_cost, 0), 0) / activeIngredients.length : 0,
              currency
            )}
          </span>
        </div>
        <div className="mt-1 text-xs text-neutral-500">This is only a sanity check—not a financial report.</div>
      </div>

      
      {/* Sales Machine */}
      <div className="gc-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="gc-label">SALES MACHINE</div>
            <div className="mt-2 text-xl font-extrabold">License, Demo & Sharing</div>
            <div className="mt-2 text-sm text-neutral-600">
              These switches are local to your browser (safe). They do not touch Supabase or business logic.
            </div>
          </div>
          <NavLink to="/sales" className="gc-btn gc-btn-primary">
            Open Sales Machine
          </NavLink>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="gc-card-soft p-4">
            <div className="gc-label">DEMO MODE</div>
            <div className="mt-2 text-sm text-neutral-700">
              Shows a demo banner and makes the app presentation-ready for chefs/investors.
            </div>
            <label className="mt-3 flex items-center gap-3">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => applySalesPrefs({ demo: e.target.checked })}
              />
              <span className="text-sm font-semibold">Enable Demo Mode</span>
            </label>
          </div>

          <div className="gc-card-soft p-4">
            <div className="gc-label">PLAN BADGE (UI)</div>
            <div className="mt-2 text-sm text-neutral-700">Controls the plan badge shown in the header.</div>
            <div className="mt-3 flex items-center gap-3">
              <select
                className="gc-input"
                value={plan}
                onChange={(e) => applySalesPrefs({ plan: (e.target.value as GCPlan) })}
              >
                <option value="FREE">FREE</option>
                <option value="PRO">PRO</option>
                <option value="TEAM">TEAM</option>
              </select>
              <div className="text-xs text-neutral-500">UI only — payments can be connected later.</div>
            </div>
          </div>

          <div className="gc-card-soft p-4 md:col-span-2">
            <div className="gc-label">LICENSE KEY (PLACEHOLDER)</div>
            <div className="mt-2 text-sm text-neutral-700">
              Optional: enter a license key to auto-set your plan. This is local-only for now.
            </div>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <input
                className="gc-input min-w-[280px]"
                value={licenseKey}
                onChange={(e) => setLicenseKeyState(e.target.value)}
                placeholder="GC-PRO-ABCD-1234"
              />
              <button className="gc-btn gc-btn-primary" type="button" onClick={() => applyLicense(licenseKey)}>
                Apply
              </button>
              <button
                className="gc-btn gc-btn-ghost"
                type="button"
                onClick={() => {
                  setLicenseKeyState('')
                  setLicenseKey('')
                  setLicenseHint('')
                  showToast('License cleared')
                  window.dispatchEvent(new Event('gc:license'))
                }}
              >
                Clear
              </button>
              {licenseHint ? <div className="text-xs font-semibold text-neutral-600">{licenseHint}</div> : null}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Example keys: <span className="font-mono">GC-PRO-ABCD-1234</span> or <span className="font-mono">GC-TEAM-ABCD-1234</span>
            </div>
          </div>
        </div>
      </div>

<Toast open={toastOpen} message={toastMsg} onClose={() => setToastOpen(false)} />
    </div>
  )
}

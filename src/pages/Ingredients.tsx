import { memo, type ReactNode, useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { invalidateIngredientsCache, primeIngredientsCache } from '../lib/ingredientsCache'
import { Toast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { useKitchen } from '../lib/kitchen'

// ========== الأيقونات الموحدة ==========
const Icons = {
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  plus: "M12 4v16m8-8H4",
  edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  delete: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  close: "M6 18L18 6M6 6l12 12",
  refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  package: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  check: "M5 13l4 4L19 7"
}

// ========== الأنواع ==========
type IngredientRow = {
  id: string
  code?: string | null
  code_category?: string | null
  name?: string
  category?: string | null
  supplier?: string | null
  pack_size?: number | null
  pack_price?: number | null
  pack_unit?: string | null
  net_unit_cost?: number | null
  is_active?: boolean
  kitchen_id?: string
}

// ========== الدوال المساعدة ==========
function toNum(x: any, fallback = 0) {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v)
}

function cls(...xs: (string | false | undefined | null)[]) {
  return xs.filter(Boolean).join(' ')
}

function safeUnit(u: string) {
  return (u ?? '').trim().toLowerCase() || 'g'
}

function calcNetUnitCost(packPrice: number, packSize: number) {
  const ps = Math.max(1e-9, packSize)
  const pp = Math.max(0, packPrice)
  return pp / ps
}

// ========== بطاقة إحصائية ==========
const StatCard = ({ label, value, icon, color = 'blue' }: { label: string; value: string | number; icon: string; color?: string }) => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 hover:border-gray-200 transition-colors">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-lg bg-${color}-50 flex items-center justify-center`}>
        <svg className={`w-5 h-5 text-${color}-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
        </svg>
      </div>
    </div>
  </div>
)

// ========== صف الجدول ==========
const IngredientRow = memo(function IngredientRow({
  item,
  onEdit,
  onDelete,
  isDebug
}: {
  item: IngredientRow
  onEdit: (item: IngredientRow) => void
  onDelete: (id: string) => void
  isDebug: boolean
}) {
  const netCost = toNum(item.net_unit_cost, 0)
  const packPrice = toNum(item.pack_price, 0)
  const packSize = toNum(item.pack_size, 1)
  const isActive = item.is_active !== false

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <div>
            <div className="font-medium text-gray-900">{item.name || '—'}</div>
            {isDebug && <div className="text-xs text-gray-400">{item.id}</div>}
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-sm text-gray-600">{item.category || '—'}</td>
      <td className="py-3 px-4 text-sm text-gray-600">{item.supplier || '—'}</td>
      <td className="py-3 px-4 text-sm text-gray-900 font-mono">{packSize} {item.pack_unit || 'g'}</td>
      <td className="py-3 px-4 text-sm text-gray-900 font-mono">{money(packPrice)}</td>
      <td className="py-3 px-4 text-sm font-mono">
        <span className={cls(
          netCost <= 0 ? 'text-gray-400' : 'text-gray-900'
        )}>
          {money(netCost)}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(item)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={Icons.edit} />
            </svg>
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={Icons.delete} />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
})

// ========== نافذة منبثقة بسيطة ==========
const SimpleModal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div className="fixed inset-0 bg-gray-500/25 backdrop-blur-sm transition-opacity" onClick={onClose} />
        <div className="relative transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <div className="bg-white px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={Icons.close} />
                </svg>
              </button>
            </div>
          </div>
          <div className="px-6 py-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== المكون الرئيسي ==========
export default function Ingredients() {
  const k = useKitchen()
  const canEditCodes = k.isOwner
  const isDebug = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')
  
  // ========== State ==========
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<IngredientRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [kitchenId, setKitchenId] = useState<string | null>(null)
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<IngredientRow | null>(null)
  
  // Form state
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formSupplier, setFormSupplier] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formPackSize, setFormPackSize] = useState('1')
  const [formPackUnit, setFormPackUnit] = useState('g')
  const [formPackPrice, setFormPackPrice] = useState('0')
  const [formNetCost, setFormNetCost] = useState('0')
  const [saving, setSaving] = useState(false)
  
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ========== دوال تحميل البيانات ==========
  const loadKitchen = async () => {
    const { data } = await supabase.rpc('current_kitchen_id')
    setKitchenId(data as string)
    return data as string
  }

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      await loadKitchen()
      
      const { data, error } = await supabase
        .from('ingredients')
        .select('id,code,name,category,supplier,pack_size,pack_price,pack_unit,net_unit_cost,is_active')
        .order('name')
      
      if (error) throw error
      setItems(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [])

  // ========== فلترة وتصفية ==========
  const filteredItems = useMemo(() => {
    let filtered = items.filter(item => showInactive ? true : item.is_active !== false)
    
    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter(item => 
        item.name?.toLowerCase().includes(s) ||
        item.category?.toLowerCase().includes(s) ||
        item.supplier?.toLowerCase().includes(s)
      )
    }
    
    if (categoryFilter) {
      filtered = filtered.filter(item => item.category === categoryFilter)
    }
    
    return filtered
  }, [items, search, categoryFilter, showInactive])

  // ========== الفئات المتاحة ==========
  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [items])

  // ========== إحصائيات ==========
  const stats = useMemo(() => {
    const total = filteredItems.length
    const avgCost = filteredItems.reduce((sum, i) => sum + toNum(i.net_unit_cost, 0), 0) / (total || 1)
    const missingCost = filteredItems.filter(i => toNum(i.net_unit_cost, 0) <= 0).length
    return { total, avgCost, missingCost }
  }, [filteredItems])

  // ========== دوال الفتح والإغلاق ==========
  const openCreateModal = () => {
    setEditingItem(null)
    setFormName('')
    setFormCategory('')
    setFormSupplier('')
    setFormCode('')
    setFormPackSize('1')
    setFormPackUnit('g')
    setFormPackPrice('0')
    setFormNetCost('0')
    setModalOpen(true)
  }

  const openEditModal = (item: IngredientRow) => {
    setEditingItem(item)
    setFormName(item.name || '')
    setFormCategory(item.category || '')
    setFormSupplier(item.supplier || '')
    setFormCode(item.code || '')
    setFormPackSize(String(item.pack_size || 1))
    setFormPackUnit(item.pack_unit || 'g')
    setFormPackPrice(String(item.pack_price || 0))
    setFormNetCost(String(item.net_unit_cost || 0))
    setModalOpen(true)
  }

  // ========== دوال الحفظ والحذف ==========
  const handleSave = async () => {
    if (!formName.trim()) {
      setToast({ message: 'Name is required', type: 'error' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: formName.trim(),
        category: formCategory.trim() || null,
        supplier: formSupplier.trim() || null,
        code: formCode.trim() || null,
        pack_size: Number(formPackSize) || 1,
        pack_unit: formPackUnit,
        pack_price: Number(formPackPrice) || 0,
        net_unit_cost: Number(formNetCost) || calcNetUnitCost(Number(formPackPrice), Number(formPackSize)),
        is_active: true,
        kitchen_id: kitchenId
      }

      if (editingItem) {
        const { error } = await supabase.from('ingredients').update(payload).eq('id', editingItem.id)
        if (error) throw error
        setToast({ message: 'Ingredient updated', type: 'success' })
      } else {
        const { error } = await supabase.from('ingredients').insert(payload)
        if (error) throw error
        setToast({ message: 'Ingredient created', type: 'success' })
      }
      
      setModalOpen(false)
      loadItems()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this ingredient?')) return
    
    try {
      const { error } = await supabase.from('ingredients').delete().eq('id', id)
      if (error) throw error
      setToast({ message: 'Ingredient deleted', type: 'success' })
      loadItems()
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' })
    }
  }

  // ========== الواجهة ==========
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ===== Header ===== */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Ingredients</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your kitchen inventory</p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={Icons.plus} />
            </svg>
            New ingredient
          </button>
        </div>

        {/* ===== Search and Filters ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={Icons.search} />
              </svg>
              <input
                type="text"
                placeholder="Search ingredients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
              />
            </div>
            
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
            >
              <option value="">All categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              Show inactive
            </label>
          </div>
        </div>

        {/* ===== Stats Cards ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard 
            label="Total items" 
            value={stats.total} 
            icon={Icons.package}
            color="blue"
          />
          <StatCard 
            label="Average cost" 
            value={money(stats.avgCost)} 
            icon={Icons.package}
            color="emerald"
          />
          <StatCard 
            label="Missing cost" 
            value={stats.missingCost} 
            icon={Icons.alert}
            color="amber"
          />
        </div>

        {/* ===== Loading State ===== */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Skeleton className="h-8 w-full mb-4" />
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full mb-2" />
            ))}
          </div>
        )}

        {/* ===== Error State ===== */}
        {error && (
          <div className="bg-red-50 rounded-xl p-4 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* ===== Table ===== */}
        {!loading && !error && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Pack</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Pack price</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Net cost</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-500">
                        No ingredients found
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(item => (
                      <IngredientRow
                        key={item.id}
                        item={item}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                        isDebug={isDebug}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== Modal ===== */}
        <SimpleModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingItem ? 'Edit ingredient' : 'New ingredient'}
        >
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                placeholder="e.g., Organic Flour"
              />
            </div>
            
            {/* Category & Supplier */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  placeholder="e.g., Baking"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                <input
                  type="text"
                  value={formSupplier}
                  onChange={(e) => setFormSupplier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  placeholder="e.g., King Arthur"
                />
              </div>
            </div>

            {/* Code (اختياري) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code (optional)</label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                placeholder="e.g., ING-001"
                disabled={!canEditCodes}
              />
            </div>

            {/* Pack Size & Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pack size</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formPackSize}
                  onChange={(e) => setFormPackSize(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                <select
                  value={formPackUnit}
                  onChange={(e) => setFormPackUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                >
                  <option value="g">grams (g)</option>
                  <option value="kg">kilograms (kg)</option>
                  <option value="ml">milliliters (ml)</option>
                  <option value="l">liters (L)</option>
                  <option value="pcs">pieces (pcs)</option>
                </select>
              </div>
            </div>

            {/* Pack Price & Net Cost */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pack price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formPackPrice}
                  onChange={(e) => setFormPackPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Net cost ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={formNetCost}
                  onChange={(e) => setFormNetCost(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 transition-colors"
                />
                <p className="text-xs text-gray-400 mt-1">Auto-calculated if 0</p>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </SimpleModal>

        {/* ===== Toast Notification ===== */}
        {toast && (
          <div className={cls(
            "fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm text-white shadow-lg animate-slide-up",
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          )}>
            {toast.message}
            <button 
              onClick={() => setToast(null)}
              className="ml-3 hover:opacity-80"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={Icons.close} />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

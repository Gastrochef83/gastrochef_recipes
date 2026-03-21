// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import CommandPalette, { type CommandItem } from '../components/CommandPalette'
import { exportKitchenBackup } from '../lib/backupJson'
import { motion } from 'framer-motion'

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

function initialsFrom(emailOrName: string) {
  const s = (emailOrName || '').trim()
  if (!s) return 'GC'
  const parts = s
    .replace(/[@._-]+/g, ' ')
    .split(' ')
    .map((x) => x.trim())
    .filter(Boolean)
  const a = (parts[0] || 'G')[0]
  const b = (parts[1] || parts[0] || 'C')[0]
  return (a + b).toUpperCase()
}

function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

function clearAppCaches() {
  try {
    localStorage.removeItem('gc-mode')
    localStorage.removeItem('gc_v5_cost_cache_v1')
    clearKitchenCache()
    sessionStorage.clear()
  } catch {}
}

function applyGlobalDensity(density: 'comfort' | 'cozy' | 'compact') {
  try {
    document.documentElement.setAttribute('data-density', density)
  } catch {}
}

function loadGlobalDensity(): 'comfort' | 'cozy' | 'compact' {
  try {
    const v = localStorage.getItem('gc_density')
    if (v === 'compact' || v === 'cozy' || v === 'comfort') return v
    const v2 = localStorage.getItem('gc_v5_density')
    if (v2 === 'dense') return 'compact'
    if (v2 === 'comfortable') return 'comfort'
  } catch {}
  return 'comfort'
}

const getTimeBasedColor = () => {
  const hour = new Date().getHours()
  if (hour < 12) return { 
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', 
    icon: '🌅',
    label: 'Morning'
  }
  if (hour < 18) return { 
    gradient: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)', 
    icon: '☀️',
    label: 'Afternoon'
  }
  return { 
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', 
    icon: '🌙',
    label: 'Evening'
  }
}

type Notification = {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  path?: string
  read: boolean
  timestamp: Date
}

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()
  const k = useKitchen()
  const a = useAutosave()

  const navigate = useNavigate()
  const loc = useLocation()

  // Stats for quick display
  const [recipesCount, setRecipesCount] = useState(0)
  const [ingredientsCount, setIngredientsCount] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [focusMode, setFocusMode] = useState(() => {
    try {
      return localStorage.getItem('gc_focus_mode') === 'true'
    } catch { return false }
  })

  // Save focus mode preference
  useEffect(() => {
    try {
      localStorage.setItem('gc_focus_mode', String(focusMode))
      if (focusMode) {
        document.body.classList.add('focus-mode')
      } else {
        document.body.classList.remove('focus-mode')
      }
    } catch {}
  }, [focusMode])

  // Network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Fetch quick stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!k.kitchenId) return
      try {
        const [{ count: recipes }, { count: ingredients }] = await Promise.all([
          supabase.from('recipes').select('*', { count: 'exact', head: true }).eq('kitchen_id', k.kitchenId).eq('is_archived', false),
          supabase.from('ingredients').select('*', { count: 'exact', head: true }).eq('kitchen_id', k.kitchenId).eq('is_active', true)
        ])
        setRecipesCount(recipes || 0)
        setIngredientsCount(ingredients || 0)
      } catch { /* ignore */ }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [k.kitchenId])

  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', type: 'info', message: 'Welcome to GastroChef!', read: false, path: '/dashboard', timestamp: new Date() }
  ])

  const [recentItems, setRecentItems] = useState<Array<{ 
    id: string; 
    name: string; 
    type: 'recipe' | 'ingredient'; 
    path: string;
    updated_at: string;
  }>>([])

  const [loadingRecent, setLoadingRecent] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const [showKitchenMenu, setShowKitchenMenu] = useState(false)
  const [kitchens, setKitchens] = useState<Array<{ id: string; name: string }>>([])
  const [quickSearchQuery, setQuickSearchQuery] = useState('')
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [quickSearchResults, setQuickSearchResults] = useState<Array<{ id: string; name: string; type: string; path: string }>>([])
  
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLDivElement>(null)
  const kitchenMenuRef = useRef<HTMLDivElement>(null)
  const userButtonRef = useRef<HTMLButtonElement>(null)
  const notificationsButtonRef = useRef<HTMLButtonElement>(null)
  const recentButtonRef = useRef<HTMLButtonElement>(null)
  const kitchenButtonRef = useRef<HTMLButtonElement>(null)
  const quickSearchRef = useRef<HTMLDivElement>(null)

  // Fetch available kitchens
  useEffect(() => {
    const fetchKitchens = async () => {
      try {
        const { data: user } = await supabase.auth.getUser()
        if (!user.user) return
        const { data } = await supabase
          .from('user_profiles')
          .select('kitchen_id, kitchens(name)')
          .eq('user_id', user.user.id)
        if (data) {
          setKitchens(data.map(p => ({ id: p.kitchen_id, name: (p as any).kitchens?.name || 'Unnamed Kitchen' })))
        }
      } catch { /* ignore */ }
    }
    fetchKitchens()
  }, [])

  // Fetch recent items
  const fetchRecentItems = useCallback(async () => {
    if (!k.kitchenId) return
    try {
      setLoadingRecent(true)
      const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name, updated_at')
        .eq('kitchen_id', k.kitchenId)
        .order('updated_at', { ascending: false })
        .limit(5)
      
      const { data: ingredients } = await supabase
        .from('ingredients')
        .select('id, name, updated_at')
        .eq('kitchen_id', k.kitchenId)
        .order('updated_at', { ascending: false })
        .limit(5)
      
      const all: any[] = [
        ...(recipes?.map(r => ({ ...r, type: 'recipe', path: `/recipe?id=${r.id}` })) || []),
        ...(ingredients?.map(i => ({ ...i, type: 'ingredient', path: `/ingredients` })) || [])
      ]
      all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setRecentItems(all.slice(0, 10))
    } catch { /* ignore */ }
    finally { setLoadingRecent(false) }
  }, [k.kitchenId])

  useEffect(() => {
    fetchRecentItems()
    const interval = setInterval(fetchRecentItems, 60000)
    return () => clearInterval(interval)
  }, [fetchRecentItems])

  // Quick search handler
  useEffect(() => {
    if (!quickSearchQuery.trim()) {
      setQuickSearchResults([])
      return
    }
    const search = async () => {
      const query = quickSearchQuery.toLowerCase()
      const [recipes, ingredients] = await Promise.all([
        supabase.from('recipes').select('id, name').eq('kitchen_id', k.kitchenId).ilike('name', `%${query}%`).limit(5),
        supabase.from('ingredients').select('id, name').eq('kitchen_id', k.kitchenId).ilike('name', `%${query}%`).limit(5)
      ])
      const results = [
        ...(recipes.data?.map(r => ({ ...r, type: 'recipe', path: `/recipe?id=${r.id}` })) || []),
        ...(ingredients.data?.map(i => ({ ...i, type: 'ingredient', path: `/ingredients` })) || [])
      ]
      setQuickSearchResults(results)
    }
    const timeout = setTimeout(search, 300)
    return () => clearTimeout(timeout)
  }, [quickSearchQuery, k.kitchenId])

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node) &&
          userButtonRef.current && !userButtonRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node) &&
          notificationsButtonRef.current && !notificationsButtonRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
      if (recentRef.current && !recentRef.current.contains(event.target as Node) &&
          recentButtonRef.current && !recentButtonRef.current.contains(event.target as Node)) {
        setShowRecent(false)
      }
      if (kitchenMenuRef.current && !kitchenMenuRef.current.contains(event.target as Node) &&
          kitchenButtonRef.current && !kitchenButtonRef.current.contains(event.target as Node)) {
        setShowKitchenMenu(false)
      }
      if (quickSearchRef.current && !quickSearchRef.current.contains(event.target as Node)) {
        setShowQuickSearch(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isPrintRoute = useMemo(() => {
    const path = (loc.pathname || '').toLowerCase()
    const hash = (loc.hash || '').toLowerCase()
    return path.includes('/print') || hash.includes('#/print') || hash.includes('/print')
  }, [loc.pathname, loc.hash])

  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme') === 'dark' } catch { return false }
  })
  const [loggingOut, setLoggingOut] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const d = loadGlobalDensity()
    applyGlobalDensity(d)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch {}
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ingredientIndex, setIngredientIndex] = useState<Array<{ id: string; name: string; code?: string | null }>>([])
  const [recipeIndex, setRecipeIndex] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    let cancelled = false
    async function loadIndexes() {
      try {
        const { data } = await supabase.from('ingredients').select('id,name,code').order('name', { ascending: true }).limit(300)
        if (!cancelled && Array.isArray(data)) {
          setIngredientIndex(data.filter((x: any) => x && typeof x.name === 'string').map((x: any) => ({ id: String(x.id), name: String(x.name), code: x.code ?? null })))
        }
      } catch { /* ignore */ }
      try {
        const { data } = await supabase.from('recipes').select('id,name').order('name', { ascending: true }).limit(300)
        if (!cancelled && Array.isArray(data)) {
          setRecipeIndex(data.filter((x: any) => x && typeof x.name === 'string').map((x: any) => ({ id: String(x.id), name: String(x.name) })))
        }
      } catch { /* ignore */ }
    }
    loadIndexes()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const fn = () => setPaletteOpen(true)
    window.addEventListener('gc:open-command-palette', fn as any)
    return () => window.removeEventListener('gc:open-command-palette', fn as any)
  }, [])

  const base = (import.meta as any).env?.BASE_URL || '/'
  const brandLogo = `${base}gastrochef-logo.png`
  const brandFallback = `${base}gastrochef-icon-512.png`

  useEffect(() => {
    let alive = true
    async function loadUser() {
      try {
        const { data } = await supabase.auth.getUser()
        if (alive) setUserEmail(data?.user?.email || '')
      } catch { if (alive) setUserEmail('') }
    }
    loadUser()
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadUser())
    return () => { alive = false; sub?.subscription?.unsubscribe() }
  }, [])

  const handleLogout = useCallback(async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    try { clearAppCaches(); setMode('mgmt') } finally { window.location.assign(`${base}#/login`) }
  }, [base, loggingOut, setMode])

  const handleQuickExport = useCallback(async () => {
    if (!k.kitchenId) return
    try {
      const backup = await exportKitchenBackup(k.kitchenId, k.kitchenName || 'My Kitchen')
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gastrochef_backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
      // Add notification
      setNotifications(prev => [{ id: `${Date.now()}`, type: 'success', message: 'Backup exported successfully!', read: false, timestamp: new Date() }, ...prev].slice(0, 50))
    } catch (e: any) {
      setNotifications(prev => [{ id: `${Date.now()}`, type: 'error', message: `Export failed: ${e.message}`, read: false, timestamp: new Date() }, ...prev].slice(0, 50))
    }
  }, [k.kitchenId, k.kitchenName])

  const commands: CommandItem[] = useMemo(() => {
    const cmds: CommandItem[] = [
      { id: 'go-dashboard', label: 'Go to Dashboard', kbd: 'G D', run: () => navigate('/dashboard') },
      { id: 'go-recipes', label: 'Go to Recipes', kbd: 'G R', run: () => navigate('/recipes') },
      { id: 'go-ingredients', label: 'Go to Ingredients', kbd: 'G I', run: () => navigate('/ingredients') },
      { id: 'go-recipe', label: 'Open Recipe Editor', kbd: 'G E', run: () => navigate('/recipe') },
      { id: 'go-cook', label: 'Open Cook Mode', kbd: 'G C', run: () => navigate('/cook') },
      { id: 'go-print', label: 'Open Print', kbd: 'G P', run: () => navigate('/print') },
      { id: 'go-settings', label: 'Go to Settings', kbd: 'G S', run: () => navigate('/settings') },
      { id: 'toggle-theme', label: dark ? 'Switch to Light Mode' : 'Switch to Dark Mode', kbd: 'T', run: () => setDark(v => !v) },
      { id: 'toggle-focus', label: focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode', kbd: 'F', run: () => setFocusMode(v => !v) },
      { id: 'refresh-kitchen', label: 'Refresh kitchen', kbd: 'R', run: async () => { await k.refresh().catch(() => {}) } },
      { id: 'export-backup', label: 'Export Backup', kbd: 'E', run: () => handleQuickExport() },
      { id: 'logout', label: 'Log out', kbd: 'L', danger: true, run: async () => { await handleLogout() } },
    ]
    ingredientIndex.forEach((ing) => {
      cmds.push({ id: `ing-${ing.id}`, label: `Ingredient: ${ing.name}${ing.code ? ` (${ing.code})` : ''}`, kbd: '⏎', run: () => navigate('/ingredients') })
    })
    recipeIndex.forEach((r) => {
      cmds.push({ id: `rec-${r.id}`, label: `Recipe: ${r.name}`, kbd: '⏎', run: () => navigate('/recipes') })
    })
    return cmds
  }, [navigate, dark, focusMode, k, handleLogout, handleQuickExport, ingredientIndex, recipeIndex])

  const avatarText = initialsFrom(userEmail || 'GastroChef')
  const kitchenLabel = k.kitchenName || (k.kitchenId ? 'Kitchen' : 'Resolving kitchen…')
  const timeBased = getTimeBasedColor()
  const unreadCount = notifications.filter(n => !n.read).length

  if (isPrintRoute) {
    return (
      <div className={cx('gc-root', dark && 'gc-dark', 'gc-print-route')}>
        <main className="gc-main" style={{ padding: 0 }}><Outlet /></main>
      </div>
    )
  }

  return (
    <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt', focusMode && 'gc-focus-mode')}>
      <style>{`
        .gc-topbar-pill { height: 56px; background: rgba(255,255,255,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(107,127,59,0.15); box-shadow: 0 2px 8px rgba(0,0,0,0.02); padding: 0 16px; display: flex; align-items: center; justify-content: space-between; }
        .gc-dark .gc-topbar-pill { background: rgba(20,25,35,0.9); border-bottom: 1px solid rgba(107,127,59,0.2); }
        .gc-topbar-logo { height: 28px; width: auto; }
        .stat-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(107,127,59,0.1); border-radius: 20px; font-size: 11px; font-weight: 600; color: var(--gc-text); }
        .icon-btn, .action-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 12px; border-radius: 30px; border: 1px solid var(--gc-border); background: transparent; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.2s ease; }
        .icon-btn { width: 34px; height: 34px; padding: 0; }
        .icon-btn:hover, .action-btn:hover { background: rgba(107,127,59,0.1); border-color: rgba(107,127,59,0.4); transform: translateY(-1px); }
        .kitchen-btn { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 30px; border: 1px solid var(--gc-border); background: transparent; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s ease; }
        .kitchen-btn:hover { background: rgba(107,127,59,0.1); border-color: rgba(107,127,59,0.4); transform: translateY(-1px); }
        .autosave-indicator { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 30px; font-size: 12px; font-weight: 600; transition: all 0.2s ease; }
        .autosave-indicator.saving { background: rgba(245,158,11,0.1); color: #f59e0b; }
        .autosave-indicator.saved { background: rgba(16,185,129,0.1); color: #10b981; }
        .autosave-indicator.error { background: rgba(239,68,68,0.1); color: #ef4444; }
        .dropdown-menu { position: absolute; top: calc(100% + 8px); right: 0; width: 320px; background: white; border-radius: 16px; border: 1px solid rgba(107,127,59,0.2); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); overflow: hidden; z-index: 1000; animation: slideDown 0.2s ease-out; }
        .gc-dark .dropdown-menu { background: #1f2937; border-color: rgba(107,127,59,0.3); }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .dropdown-header { padding: 12px 16px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-bottom: 1px solid rgba(107,127,59,0.1); }
        .gc-dark .dropdown-header { background: #111827; }
        .dropdown-item { width: 100%; padding: 10px 12px; text-align: left; background: none; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 8px; }
        .dropdown-item:hover { background: rgba(107,127,59,0.1); }
        .dropdown-item.danger { color: #ef4444; }
        .dropdown-item.danger:hover { background: rgba(239,68,68,0.1); }
        .dropdown-divider { height: 1px; background: rgba(107,127,59,0.1); margin: 8px 0; }
        .badge-dot { position: absolute; top: 2px; right: 2px; width: 8px; height: 8px; border-radius: 4px; background: #ef4444; border: 2px solid white; }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; transition: all 0.2s ease; }
        .status-dot.saving { animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.2); } }
        .quick-search-input { position: absolute; right: 0; top: 100%; margin-top: 8px; width: 280px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--gc-border); background: var(--gc-bg-card); font-size: 14px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); z-index: 100; }
        .quick-search-results { position: absolute; right: 0; top: 100%; margin-top: 8px; width: 320px; background: var(--gc-bg-card); border-radius: 12px; border: 1px solid var(--gc-border); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); z-index: 100; max-height: 300px; overflow-y: auto; }
        .quick-search-result-item { padding: 10px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--gc-border); }
        .quick-search-result-item:hover { background: rgba(107,127,59,0.1); }
        .quick-search-result-item:last-child { border-bottom: none; }
        .gc-focus-mode .gc-side { display: none !important; }
        .gc-focus-mode .gc-main { margin-left: 0 !important; max-width: 1200px; margin: 0 auto; }
        @media (max-width: 768px) { .gc-topbar-pill { height: 52px; padding: 0 12px; } .kitchen-btn span:first-child { display: none; } .stat-badge { display: none; } .autosave-indicator span:last-child { display: none; } .action-btn span:last-child { display: none; } .dropdown-menu { width: 280px; } }
      `}</style>

      <div className="gc-shell">
        {/* Mobile Menu Toggle */}
        <button className="gc-mobile-menu-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 60, display: 'none', width: 44, height: 44, borderRadius: 22, background: 'linear-gradient(135deg, #6B7F3B 0%, #1F7A78 100%)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>

        <aside className={cx('gc-side', isSidebarOpen && 'is-open')}>
          <div className="gc-side-card">
            <div className="gc-brand">
              <div className="gc-brand-mark"><img src={brandLogo} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).src = brandFallback }} /></div>
              <div><div className="gc-brand-name">Gastro<span className="gc-brand-accent">Chef</span></div><div className="gc-brand-sub">{kitchenLabel}</div></div>
            </div>
            <div className="gc-side-block" style={{ marginTop: 14 }}>
              <div className="gc-label">MODE</div>
              <div className={cx('gc-mode-switch', isKitchen ? 'is-kitchen' : 'is-mgmt')}>
                <button className={cx('gc-mode-seg', isKitchen && 'is-active')} onClick={() => setMode('kitchen')}>Kitchen</button>
                <button className={cx('gc-mode-seg', isMgmt && 'is-active')} onClick={() => setMode('mgmt')}>Mgmt</button>
              </div>
              <div className="gc-hint">{isKitchen ? 'Kitchen mode is active.' : 'Mgmt mode is active.'}</div>
            </div>
            <div className="gc-side-block" style={{ marginTop: 14 }}>
              <div className="gc-label">NAVIGATION</div>
              <nav className="gc-nav">
                <NavLink to="/dashboard" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>Dashboard</NavLink>
                <NavLink to="/ingredients" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>Ingredients</NavLink>
                <NavLink to="/recipes" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>Recipes</NavLink>
                <NavLink to="/settings" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>Settings</NavLink>
              </nav>
              <div className="gc-tip">Tip: Kitchen for cooking · Mgmt for costing & pricing.</div>
            </div>
            <div className="gc-side-block" style={{ marginTop: 14 }}>
              <button className="gc-btn gc-btn-danger gc-btn--full" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</button>
            </div>
          </div>
        </aside>

        <main className="gc-main">
          {/* TOP BAR - ENHANCED */}
          <div className="gc-topbar">
            <div className="gc-topbar-pill">
              
              {/* LEFT SECTION */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img className="gc-topbar-logo" src={brandLogo} alt="GastroChef" onError={(e) => { (e.currentTarget as HTMLImageElement).src = brandFallback }} />
                
                {/* Kitchen Selector */}
                <div style={{ position: 'relative' }}>
                  <button ref={kitchenButtonRef} className="kitchen-btn" onClick={() => setShowKitchenMenu(!showKitchenMenu)}>
                    <span>🏠</span><span>{kitchenLabel}</span><span style={{ fontSize: 10 }}>▼</span>
                  </button>
                  {showKitchenMenu && kitchens.length > 0 && (
                    <div ref={kitchenMenuRef} className="dropdown-menu" style={{ width: 240 }}>
                      <div className="dropdown-header"><span>Switch Kitchen</span></div>
                      {kitchens.map(kit => (
                        <button key={kit.id} className="dropdown-item" onClick={() => { window.location.reload(); setShowKitchenMenu(false); }}><span>{kit.name}</span>{kit.id === k.kitchenId && <span>✓</span>}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Stats */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <div className="stat-badge" title="Active Recipes">📝 {recipesCount}</div>
                  <div className="stat-badge" title="Active Ingredients">🥗 {ingredientsCount}</div>
                </div>

                {/* Status Dot */}
                <motion.div className={cx('status-dot', a.status === 'saving' && 'saving')} animate={{ scale: a.status === 'saving' ? [1, 1.2, 1] : 1 }} style={{ background: a.status === 'error' ? '#ef4444' : a.status === 'saving' ? '#f59e0b' : !isOnline ? '#6b7280' : '#10b981' }} />
                {!isOnline && <span className="gc-hint" style={{ fontSize: 11 }}>Offline</span>}
              </div>

              {/* RIGHT SECTION */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                
                {/* Autosave Indicator */}
                <div className={cx('autosave-indicator', a.status === 'saving' ? 'saving' : a.status === 'saved' ? 'saved' : a.status === 'error' ? 'error' : '')}>
                  <span>{a.status === 'saving' ? '⏳' : a.status === 'error' ? '⚠️' : a.status === 'saved' ? '✓' : '💾'}</span>
                  <span>{a.status === 'saving' ? 'Saving' : a.status === 'error' ? 'Error' : a.status === 'saved' ? 'Saved' : 'Auto'}</span>
                </div>

                {/* Quick Export */}
                <button className="action-btn" onClick={handleQuickExport} title="Export Backup"><span>💾</span><span>Export</span></button>

                {/* Focus Mode Toggle */}
                <button className="action-btn" onClick={() => setFocusMode(!focusMode)} title={focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}><span>{focusMode ? '🎯' : '🔍'}</span><span>Focus</span></button>

                {/* Quick Search */}
                <div style={{ position: 'relative' }}>
                  <button className="icon-btn" onClick={() => setShowQuickSearch(!showQuickSearch)} title="Quick Search"><span>🔍</span></button>
                  {showQuickSearch && (
                    <div ref={quickSearchRef}>
                      <input autoFocus className="quick-search-input" placeholder="Search recipes or ingredients..." value={quickSearchQuery} onChange={(e) => setQuickSearchQuery(e.target.value)} onBlur={() => setTimeout(() => setShowQuickSearch(false), 200)} />
                      {quickSearchResults.length > 0 && (
                        <div className="quick-search-results">
                          {quickSearchResults.map(r => (
                            <div key={r.id} className="quick-search-result-item" onClick={() => { navigate(r.path); setShowQuickSearch(false); setQuickSearchQuery(''); }}>
                              <span>{r.type === 'recipe' ? '📝' : '🥗'}</span><span>{r.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Command Palette */}
                <button className="action-btn" onClick={() => setPaletteOpen(true)} title="Quick actions (⌘K)"><span style={{ background: 'rgba(107,127,59,0.2)', padding: '2px 6px', borderRadius: 6 }}>⌘</span><span>K</span></button>

                {/* Notifications */}
                <div style={{ position: 'relative' }}>
                  <button ref={notificationsButtonRef} className="icon-btn" onClick={() => setShowNotifications(!showNotifications)}><span>🔔</span>{unreadCount > 0 && <span className="badge-dot" />}</button>
                  {showNotifications && (
                    <div ref={notificationsRef} className="dropdown-menu">
                      <div className="dropdown-header"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>NOTIFICATIONS</span>{unreadCount > 0 && <button style={{ fontSize: 11, color: '#6B7F3B', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}>Mark all read</button>}</div></div>
                      <div style={{ padding: 8, maxHeight: 300, overflowY: 'auto' }}>
                        {notifications.length > 0 ? notifications.map(n => (
                          <button key={n.id} className="dropdown-item" style={{ background: n.read ? 'transparent' : 'rgba(107,127,59,0.05)' }} onClick={() => { setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif)); if (n.path) navigate(n.path); setShowNotifications(false); }}>
                            <span>{n.type === 'success' ? '✓' : n.type === 'error' ? '✗' : n.type === 'warning' ? '⚠' : 'ℹ'}</span><span style={{ flex: 1 }}>{n.message}</span>
                          </button>
                        )) : <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>No notifications</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Recent Items */}
                <div style={{ position: 'relative' }}>
                  <button ref={recentButtonRef} className="icon-btn" onClick={() => setShowRecent(!showRecent)} disabled={loadingRecent}><span>{loadingRecent ? '⏳' : '🕒'}</span></button>
                  {showRecent && (
                    <div ref={recentRef} className="dropdown-menu">
                      <div className="dropdown-header"><span>RECENTLY UPDATED</span></div>
                      <div style={{ padding: 8, maxHeight: 300, overflowY: 'auto' }}>
                        {recentItems.length > 0 ? recentItems.map((item, idx) => (
                          <button key={`${item.id}-${idx}`} className="dropdown-item" onClick={() => { navigate(item.path); setShowRecent(false); }}>
                            <span style={{ fontSize: 18 }}>{item.type === 'recipe' ? '📝' : '🥗'}</span>
                            <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{item.name}</div><div style={{ fontSize: 10, color: '#6b7280' }}>{item.type === 'recipe' ? 'Recipe' : 'Ingredient'} • {new Date(item.updated_at).toLocaleDateString()}</div></div>
                          </button>
                        )) : <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>No recent items</div>}
                      </div>
                    </div>
                  )}
                </div>

                {/* User Menu */}
                <div style={{ position: 'relative' }}>
                  <button ref={userButtonRef} className="kitchen-btn" onClick={() => setShowUserMenu(!showUserMenu)} style={{ padding: '4px 8px 4px 4px' }}>
                    <span className="gc-avatar" style={{ width: 32, height: 32, borderRadius: 16, background: timeBased.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 12 }}>{avatarText}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{userEmail ? userEmail.split('@')[0] : 'Account'}</span>
                    <span style={{ fontSize: 10 }}>▼</span>
                  </button>
                  {showUserMenu && (
                    <div ref={userMenuRef} className="dropdown-menu" style={{ width: 260 }}>
                      <div className="dropdown-header"><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ width: 40, height: 40, borderRadius: 20, background: timeBased.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>{avatarText}</span><div><div style={{ fontWeight: 700 }}>{userEmail ? userEmail.split('@')[0] : 'Account'}</div><div style={{ fontSize: 11, color: '#6b7280' }}>{k.profile?.role === 'owner' ? '👑 Owner' : k.profile?.role === 'staff' ? '👥 Staff' : '👀 Viewer'}</div><div style={{ fontSize: 10, color: '#6b7280' }}>{timeBased.label} {timeBased.icon}</div></div></div></div>
                      <div style={{ padding: 8 }}>
                        <button className="dropdown-item" onClick={() => { setDark(!dark); setShowUserMenu(false); }}><span>{dark ? '☀️' : '🌙'}</span><span>{dark ? 'Light Mode' : 'Dark Mode'}</span></button>
                        <button className="dropdown-item" onClick={() => { setFocusMode(!focusMode); setShowUserMenu(false); }}><span>{focusMode ? '🎯' : '🔍'}</span><span>{focusMode ? 'Exit Focus' : 'Focus Mode'}</span></button>
                        <div className="dropdown-divider" />
                        <button className="dropdown-item" onClick={async () => { await k.refresh(); setShowUserMenu(false); }}><span>🔄</span><span>Refresh kitchen</span></button>
                        <button className="dropdown-item" onClick={() => { navigate('/settings'); setShowUserMenu(false); }}><span>⚙️</span><span>Settings</span></button>
                        <button className="dropdown-item" onClick={handleQuickExport}><span>💾</span><span>Export Backup</span></button>
                        <div className="dropdown-divider" />
                        <button className="dropdown-item danger" onClick={handleLogout} disabled={loggingOut}><span>🚪</span><span>{loggingOut ? 'Logging out…' : 'Log out'}</span></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} />

          <div className="gc-content"><div className="gc-page"><Outlet /></div></div>
        </main>
      </div>

      <style>{`@media (max-width: 768px) { .gc-mobile-menu-toggle { display: flex !important; } .gc-side { transform: translateX(-100%); transition: transform 0.3s ease; position: fixed; z-index: 1000; } .gc-side.is-open { transform: translateX(0); } .gc-main { margin-left: 0 !important; } }`}</style>
    </div>
  )
}

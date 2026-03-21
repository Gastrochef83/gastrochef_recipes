// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import CommandPalette, { type CommandItem } from '../components/CommandPalette'

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

  const [recipesCount, setRecipesCount] = useState(0)
  const [ingredientsCount, setIngredientsCount] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showKitchenMenu, setShowKitchenMenu] = useState(false)
  const [kitchens, setKitchens] = useState<Array<{ id: string; name: string }>>([])
  const [quickSearchQuery, setQuickSearchQuery] = useState('')
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [quickSearchResults, setQuickSearchResults] = useState<Array<{ id: string; name: string; type: string; path: string }>>([])
  const [statsLoading, setStatsLoading] = useState(false)

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

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!k.kitchenId) {
      console.log('No kitchen ID yet')
      return
    }
    
    console.log('Fetching stats for kitchen:', k.kitchenId)
    setStatsLoading(true)
    
    try {
      // Get active recipes (not archived)
      const { count: activeRecipes, error: recipesError } = await supabase
        .from('recipes')
        .select('*', { count: 'exact', head: true })
        .eq('kitchen_id', k.kitchenId)
        .eq('is_archived', false)
      
      if (recipesError) {
        console.error('Error fetching recipes:', recipesError)
      } else {
        console.log('Active recipes count:', activeRecipes)
        setRecipesCount(activeRecipes || 0)
      }
      
      // Get active ingredients
      const { count: activeIngredients, error: ingredientsError } = await supabase
        .from('ingredients')
        .select('*', { count: 'exact', head: true })
        .eq('kitchen_id', k.kitchenId)
        .eq('is_active', true)
      
      if (ingredientsError) {
        console.error('Error fetching ingredients:', ingredientsError)
      } else {
        console.log('Active ingredients count:', activeIngredients)
        setIngredientsCount(activeIngredients || 0)
      }
      
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setStatsLoading(false)
    }
  }, [k.kitchenId])

  // Initial fetch and refresh on kitchen change
  useEffect(() => {
    if (k.kitchenId) {
      fetchStats()
    }
  }, [k.kitchenId, fetchStats])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!k.kitchenId) return
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [k.kitchenId, fetchStats])

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
  
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLDivElement>(null)
  const kitchenMenuRef = useRef<HTMLDivElement>(null)
  const userButtonRef = useRef<HTMLButtonElement>(null)
  const notificationsButtonRef = useRef<HTMLButtonElement>(null)
  const recentButtonRef = useRef<HTMLButtonElement>(null)
  const kitchenButtonRef = useRef<HTMLButtonElement>(null)
  const quickSearchRef = useRef<HTMLDivElement>(null)

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
      const { exportKitchenBackup } = await import('../lib/backupJson')
      const backup = await exportKitchenBackup(k.kitchenId, k.kitchenName || 'My Kitchen')
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gastrochef_backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
      setNotifications(prev => [{ id: `${Date.now()}`, type: 'success', message: 'Backup exported successfully!', read: false, timestamp: new Date(), path: '' }, ...prev].slice(0, 50))
    } catch (e: any) {
      setNotifications(prev => [{ id: `${Date.now()}`, type: 'error', message: `Export failed: ${e.message}`, read: false, timestamp: new Date(), path: '' }, ...prev].slice(0, 50))
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
      { id: 'refresh-kitchen', label: 'Refresh kitchen', kbd: 'R', run: async () => { await k.refresh().catch(() => {}); fetchStats(); } },
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
  }, [navigate, dark, k, handleLogout, handleQuickExport, ingredientIndex, recipeIndex, fetchStats])

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
    <>
      <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
        <div className="gc-shell">
          <button
            className="gc-mobile-menu-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              zIndex: 60,
              display: 'none',
              width: 48,
              height: 48,
              borderRadius: 24,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <aside className={cx('gc-side', isSidebarOpen && 'is-open')}>
            <div className="gc-side-card">
              <div className="gc-brand">
                <div className="gc-brand-mark">
                  <img src={brandLogo} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).src = brandFallback }} />
                </div>
                <div>
                  <div className="gc-brand-name">Gastro<span className="gc-brand-accent">Chef</span></div>
                  <div className="gc-brand-sub">{kitchenLabel}</div>
                </div>
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
                <button className="gc-btn gc-btn-danger gc-btn--full" onClick={handleLogout} disabled={loggingOut}>
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            </div>
          </aside>

          <main className="gc-main">
            <div className="gc-topbar">
              <div className="gc-topbar-pill" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: '60px',
                background: dark ? '#1f2937' : '#ffffff',
                borderBottom: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
                padding: '0 20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <img className="gc-topbar-logo" src={brandLogo} alt="GastroChef" style={{ height: '32px' }} onError={(e) => { (e.currentTarget as HTMLImageElement).src = brandFallback }} />
                  
                  <div className="gc-kitchen-selector">
                    <button ref={kitchenButtonRef} className="gc-kitchen-btn" onClick={() => setShowKitchenMenu(!showKitchenMenu)} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      background: dark ? '#374151' : '#f3f4f6',
                      border: `1px solid ${dark ? '#4b5563' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: dark ? '#f3f4f6' : '#1f2937'
                    }}>
                      <span>🏠</span>
                      <span>{kitchenLabel}</span>
                      <span>▼</span>
                    </button>
                    {showKitchenMenu && kitchens.length > 0 && (
                      <div ref={kitchenMenuRef} className="gc-dropdown" style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        minWidth: '240px',
                        background: dark ? '#1f2937' : '#ffffff',
                        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000
                      }}>
                        <div style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, borderBottom: `1px solid ${dark ? '#374151' : '#f3f4f6'}` }}>Switch Kitchen</div>
                        {kitchens.map(kit => (
                          <button key={kit.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '10px 16px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: dark ? '#e5e7eb' : '#1f2937'
                          }} onClick={() => { window.location.reload(); setShowKitchenMenu(false); }}>
                            <span>{kit.name}</span>
                            {kit.id === k.kitchenId && <span style={{ color: '#10b981' }}>✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stats Display - FIXED */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: dark ? '#374151' : '#f9fafb',
                    padding: '4px 16px',
                    borderRadius: '40px',
                    border: `1px solid ${dark ? '#4b5563' : '#e5e7eb'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500 }}>
                      <span style={{ fontSize: '14px' }}>📝</span>
                      <span style={{ fontWeight: 700, color: '#10b981', fontSize: '16px' }}>
                        {statsLoading ? '...' : recipesCount}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>recipes</span>
                    </div>
                    <div style={{ width: '1px', height: '20px', background: dark ? '#4b5563' : '#e5e7eb' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500 }}>
                      <span style={{ fontSize: '14px' }}>🥗</span>
                      <span style={{ fontWeight: 700, color: '#10b981', fontSize: '16px' }}>
                        {statsLoading ? '...' : ingredientsCount}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>ingredients</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: !isOnline ? '#6b7280' : a.status === 'saving' ? '#f59e0b' : a.status === 'error' ? '#ef4444' : '#10b981'
                    }} />
                    {!isOnline && <span style={{ fontSize: '11px', color: '#6b7280' }}>Offline</span>}
                  </div>
                </div>

                <div style={{ flex: 1 }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 500,
                    background: a.status === 'saving' ? '#fef3c7' : a.status === 'saved' ? '#d1fae5' : a.status === 'error' ? '#fee2e2' : '#f3f4f6',
                    color: a.status === 'saving' ? '#d97706' : a.status === 'saved' ? '#059669' : a.status === 'error' ? '#dc2626' : '#6b7280'
                  }}>
                    <span>
                      {a.status === 'saving' && '⏳'}
                      {a.status === 'saved' && '✓'}
                      {a.status === 'error' && '⚠️'}
                      {a.status === 'idle' && '💾'}
                    </span>
                    <span>
                      {a.status === 'saving' && 'Saving...'}
                      {a.status === 'saved' && 'Saved'}
                      {a.status === 'error' && 'Failed'}
                      {a.status === 'idle' && 'Auto-saved'}
                    </span>
                  </div>

                  <button className="gc-action-btn" onClick={handleQuickExport} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    background: dark ? '#374151' : '#f9fafb',
                    border: `1px solid ${dark ? '#4b5563' : '#e5e7eb'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: dark ? '#e5e7eb' : '#374151'
                  }}>
                    <span>📦</span>
                    <span>Export</span>
                  </button>

                  <div className="gc-quick-search">
                    <button className="gc-action-btn" onClick={() => setShowQuickSearch(!showQuickSearch)} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      background: dark ? '#374151' : '#f9fafb',
                      border: `1px solid ${dark ? '#4b5563' : '#e5e7eb'}`,
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}>
                      <span>🔍</span>
                    </button>
                    {showQuickSearch && (
                      <div ref={quickSearchRef} style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: '280px',
                        background: dark ? '#1f2937' : '#ffffff',
                        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000
                      }}>
                        <input 
                          autoFocus 
                          type="text" 
                          placeholder="Search recipes or ingredients..." 
                          value={quickSearchQuery} 
                          onChange={(e) => setQuickSearchQuery(e.target.value)} 
                          onBlur={() => setTimeout(() => setShowQuickSearch(false), 200)}
                          style={{
                            width: '100%',
                            padding: '12px 14px',
                            border: 'none',
                            borderBottom: `1px solid ${dark ? '#374151' : '#f3f4f6'}`,
                            background: 'transparent',
                            fontSize: '13px',
                            outline: 'none',
                            color: dark ? '#e5e7eb' : '#1f2937'
                          }}
                        />
                        {quickSearchResults.length > 0 && (
                          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                            {quickSearchResults.map(r => (
                              <div key={r.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                cursor: 'pointer'
                              }} onClick={() => { navigate(r.path); setShowQuickSearch(false); setQuickSearchQuery(''); }}>
                                <span>{r.type === 'recipe' ? '📝' : '🥗'}</span>
                                <span>{r.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button className="gc-action-btn gc-cmdk-btn" onClick={() => setPaletteOpen(true)} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    background: dark ? '#374151' : '#f9fafb',
                    border: `1px solid ${dark ? '#4b5563' : '#e5e7eb'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: 'monospace'
                  }}>
                    <span style={{ background: 'rgba(0,0,0,0.1)', padding: '2px 4px', borderRadius: '4px' }}>⌘</span>
                    <span style={{ background: 'rgba(0,0,0,0.1)', padding: '2px 4px', borderRadius: '4px' }}>K</span>
                  </button>

                  <div className="gc-notifications">
                    <button ref={notificationsButtonRef} className={`gc-action-btn ${unreadCount > 0 ? 'has-badge' : ''}`} onClick={() => setShowNotifications(!showNotifications)} style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      background: dark ? '#374151' : '#f9fafb',
                      border: `1px solid ${dark ? '#4b5563' : '#e5e7eb'}`,
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}>
                      <span>🔔</span>
                      {unreadCount > 0 && (
                        <span style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          minWidth: '16px',
                          height: '16px',
                          background: '#ef4444',
                          color: 'white',
                          fontSize: '9px',
                          fontWeight: 'bold',
                          borderRadius: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 4px'
                        }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                      )}
                    </button>
                    {showNotifications && (
                      <div ref={notificationsRef} style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        minWidth: '280px',
                        background: dark ? '#1f2937' : '#ffffff',
                        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 16px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderBottom: `1px solid ${dark ? '#374151' : '#f3f4f6'}`
                        }}>
                          <span>Notifications</span>
                          {unreadCount > 0 && (
                            <button style={{ fontSize: '10px', background: 'none', border: 'none', color: '#10b981', cursor: 'pointer' }} onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}>
                              Mark all read
                            </button>
                          )}
                        </div>
                        <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                          {notifications.length > 0 ? (
                            notifications.slice(0, 10).map(n => (
                              <button key={n.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                width: '100%',
                                padding: '12px 16px',
                                background: !n.read ? (dark ? '#1e3a8a' : '#eff6ff') : 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: dark ? '#e5e7eb' : '#1f2937'
                              }} onClick={() => { 
                                setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif)); 
                                if (n.path) navigate(n.path); 
                                setShowNotifications(false); 
                              }}>
                                <span>{n.type === 'success' ? '✓' : n.type === 'error' ? '✗' : n.type === 'warning' ? '⚠' : 'ℹ'}</span>
                                <span style={{ flex: 1 }}>{n.message}</span>
                              </button>
                            ))
                          ) : (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>No notifications</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="gc-recent">
                    <button ref={recentButtonRef} className="gc-action-btn" onClick={() => setShowRecent(!showRecent)} disabled={loadingRecent} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      background: dark ? '#374151' : '#f9fafb',
                      border: `1px solid ${dark ? '#4b5563' : '#e5e7eb'}`,
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}>
                      <span>{loadingRecent ? '⏳' : '🕒'}</span>
                    </button>
                    {showRecent && (
                      <div ref={recentRef} style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        minWidth: '280px',
                        background: dark ? '#1f2937' : '#ffffff',
                        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000
                      }}>
                        <div style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 600, borderBottom: `1px solid ${dark ? '#374151' : '#f3f4f6'}` }}>Recently Updated</div>
                        <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                          {recentItems.length > 0 ? (
                            recentItems.slice(0, 8).map((item, idx) => (
                              <button key={`${item.id}-${idx}`} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                width: '100%',
                                padding: '10px 16px',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: dark ? '#e5e7eb' : '#1f2937'
                              }} onClick={() => { navigate(item.path); setShowRecent(false); }}>
                                <span>{item.type === 'recipe' ? '📝' : '🥗'}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                                  <div style={{ fontSize: '10px', color: '#6b7280' }}>{item.type === 'recipe' ? 'Recipe' : 'Ingredient'} • {new Date(item.updated_at).toLocaleDateString()}</div>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>No recent items</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="gc-user-menu">
                    <button ref={userButtonRef} className="gc-user-btn" onClick={() => setShowUserMenu(!showUserMenu)} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 10px 4px 6px',
                      background: dark ? '#374151' : '#f3f4f6',
                      border: `1px solid ${dark ? '#4b5563' : '#e5e7eb'}`,
                      borderRadius: '40px',
                      cursor: 'pointer'
                    }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        color: 'white',
                        background: timeBased.gradient
                      }}>{avatarText}</div>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: dark ? '#e5e7eb' : '#1f2937' }}>{userEmail ? userEmail.split('@')[0] : 'Account'}</span>
                      <span style={{ fontSize: '10px', color: '#6b7280' }}>▼</span>
                    </button>
                    {showUserMenu && (
                      <div ref={userMenuRef} style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        right: 0,
                        width: '280px',
                        background: dark ? '#1f2937' : '#ffffff',
                        border: `1px solid ${dark ? '#374151' : '#e5e7eb'}`,
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: `1px solid ${dark ? '#374151' : '#f3f4f6'}` }}>
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            fontSize: '16px',
                            color: 'white',
                            background: timeBased.gradient
                          }}>{avatarText}</div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: dark ? '#e5e7eb' : '#1f2937' }}>{userEmail ? userEmail.split('@')[0] : 'Account'}</div>
                            <div style={{ fontSize: '10px', color: '#6b7280' }}>{k.profile?.role === 'owner' ? 'Owner' : k.profile?.role === 'staff' ? 'Staff' : 'Viewer'}</div>
                            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>{timeBased.label} {timeBased.icon}</div>
                          </div>
                        </div>
                        <div style={{ height: '1px', background: dark ? '#374151' : '#f3f4f6', margin: '6px 0' }} />
                        <button style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          width: '100%',
                          padding: '10px 16px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: dark ? '#e5e7eb' : '#1f2937'
                        }} onClick={() => { setDark(!dark); setShowUserMenu(false); }}>
                          <span>{dark ? '☀️' : '🌙'}</span>
                          <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
                        </button>
                        <div style={{ height: '1px', background: dark ? '#374151' : '#f3f4f6', margin: '6px 0' }} />
                        <button style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          width: '100%',
                          padding: '10px 16px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: dark ? '#e5e7eb' : '#1f2937'
                        }} onClick={async () => { await k.refresh(); fetchStats(); setShowUserMenu(false); }}>
                          <span>🔄</span>
                          <span>Refresh Kitchen</span>
                        </button>
                        <button style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          width: '100%',
                          padding: '10px 16px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: dark ? '#e5e7eb' : '#1f2937'
                        }} onClick={() => { navigate('/settings'); setShowUserMenu(false); }}>
                          <span>⚙️</span>
                          <span>Settings</span>
                        </button>
                        <button style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          width: '100%',
                          padding: '10px 16px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#ef4444'
                        }} onClick={handleLogout} disabled={loggingOut}>
                          <span>🚪</span>
                          <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} />

            <div className="gc-content">
              <div className="gc-page">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .gc-mobile-menu-toggle { display: flex !important; }
          .gc-side { 
            transform: translateX(-100%); 
            transition: transform 0.3s ease; 
            position: fixed; 
            z-index: 1000; 
            top: 0;
            left: 0;
            height: 100vh;
            background: ${dark ? '#1f2937' : '#ffffff'};
          }
          .gc-side.is-open { transform: translateX(0); }
          .gc-main { margin-left: 0 !important; }
        }
        
        .gc-root {
          min-height: 100vh;
        }
        
        .gc-shell {
          display: flex;
          min-height: 100vh;
        }
        
        .gc-side {
          width: 280px;
          flex-shrink: 0;
          background: ${dark ? '#111827' : '#f9fafb'};
          border-right: 1px solid ${dark ? '#374151' : '#e5e7eb'};
        }
        
        .gc-side-card {
          padding: 20px;
        }
        
        .gc-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }
        
        .gc-brand-mark img {
          width: 32px;
          height: 32px;
        }
        
        .gc-brand-name {
          font-size: 18px;
          font-weight: 700;
          color: ${dark ? '#f3f4f6' : '#1f2937'};
        }
        
        .gc-brand-accent {
          color: #10b981;
        }
        
        .gc-brand-sub {
          font-size: 11px;
          color: #6b7280;
        }
        
        .gc-side-block {
          margin-bottom: 24px;
        }
        
        .gc-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #6b7280;
          margin-bottom: 8px;
        }
        
        .gc-mode-switch {
          display: flex;
          gap: 4px;
          background: ${dark ? '#1f2937' : '#f3f4f6'};
          border-radius: 8px;
          padding: 2px;
        }
        
        .gc-mode-seg {
          flex: 1;
          padding: 6px 12px;
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          color: ${dark ? '#9ca3af' : '#6b7280'};
        }
        
        .gc-mode-seg.is-active {
          background: ${dark ? '#10b981' : '#ffffff'};
          color: ${dark ? '#ffffff' : '#10b981'};
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        
        .gc-hint {
          font-size: 10px;
          color: #6b7280;
          margin-top: 6px;
        }
        
        .gc-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .gc-nav-item {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: ${dark ? '#9ca3af' : '#6b7280'};
          text-decoration: none;
          transition: all 0.2s ease;
        }
        
        .gc-nav-item:hover {
          background: ${dark ? '#374151' : '#f3f4f6'};
          color: ${dark ? '#f3f4f6' : '#1f2937'};
        }
        
        .gc-nav-item.is-active {
          background: ${dark ? '#10b981' : '#10b981'};
          color: white;
        }
        
        .gc-tip {
          font-size: 10px;
          color: #6b7280;
          margin-top: 12px;
          padding: 8px;
          background: ${dark ? '#1f2937' : '#f3f4f6'};
          border-radius: 8px;
        }
        
        .gc-btn {
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        
        .gc-btn-danger {
          background: #ef4444;
          color: white;
        }
        
        .gc-btn-danger:hover {
          background: #dc2626;
        }
        
        .gc-btn--full {
          width: 100%;
        }
        
        .gc-main {
          flex: 1;
          background: ${dark ? '#1f2937' : '#ffffff'};
          min-height: 100vh;
        }
        
        .gc-topbar {
          position: sticky;
          top: 0;
          z-index: 50;
        }
        
        .gc-content {
          padding: 20px;
        }
        
        .gc-page {
          max-width: 1400px;
          margin: 0 auto;
        }
      `}</style>
    </>
  )
}

// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import CommandPalette, { type CommandItem } from '../components/CommandPalette'
import { motion, AnimatePresence } from 'framer-motion'

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

function saveGlobalDensity(density: 'comfort' | 'cozy' | 'compact') {
  try {
    localStorage.setItem('gc_density', density)
    localStorage.setItem('gc_v5_density', density === 'compact' ? 'dense' : 'comfortable')
  } catch {}
}

// دالة للحصول على الألوان حسب الوقت
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

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()
  const k = useKitchen()
  const a = useAutosave()

  const navigate = useNavigate()
  const loc = useLocation()

  const [online, setOnline] = useState(navigator.onLine)
  const [loading, setLoading] = useState(false)
  const [recentItems, setRecentItems] = useState<Array<{ id: string; name: string; type: string; path: string }>>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; read: boolean; path?: string }>>([
    { id: '1', message: 'Recipe "Pasta" was updated', read: false, path: '/recipes' },
    { id: '2', message: 'New ingredient added', read: true, path: '/ingredients' },
    { id: '3', message: 'Cost analysis completed', read: false, path: '/dashboard' }
  ])
  const [density, setDensityState] = useState<'comfort' | 'cozy' | 'compact'>(loadGlobalDensity)
  const [quickSearch, setQuickSearch] = useState('')
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; type: string; path: string }>>([])

  // وقت اليوم
  const timeBased = getTimeBasedColor()

  // مراقبة حالة الاتصال
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // تحميل العناصر الأخيرة من localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gc_recent_items')
      if (saved) {
        setRecentItems(JSON.parse(saved))
      } else {
        // بيانات افتراضية
        setRecentItems([
          { id: '1', name: 'Pasta Carbonara', type: 'recipe', path: '/recipe?id=1' },
          { id: '2', name: 'Tomato Sauce', type: 'ingredient', path: '/ingredients' }
        ])
      }
    } catch {}
  }, [])

  // تحديث البحث الفوري
  useEffect(() => {
    if (quickSearch.trim() === '') {
      setSearchResults([])
      return
    }

    const results = [
      ...ingredientIndex
        .filter(i => i.name.toLowerCase().includes(quickSearch.toLowerCase()))
        .map(i => ({ id: i.id, name: i.name, type: 'ingredient', path: '/ingredients' })),
      ...recipeIndex
        .filter(r => r.name.toLowerCase().includes(quickSearch.toLowerCase()))
        .map(r => ({ id: r.id, name: r.name, type: 'recipe', path: '/recipes' }))
    ].slice(0, 5)
    
    setSearchResults(results)
  }, [quickSearch, ingredientIndex, recipeIndex])

  const isPrintRoute = useMemo(() => {
    const path = (loc.pathname || '').toLowerCase()
    const hash = (loc.hash || '').toLowerCase()
    return path.includes('/print') || hash.includes('#/print') || hash.includes('/print')
  }, [loc.pathname, loc.hash])

  const [dark, setDark] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')

  useEffect(() => {
    const d = loadGlobalDensity()
    applyGlobalDensity(d)
    setDensityState(d)
  }, [])

  const menuRef = useRef<HTMLDetailsElement | null>(null)
  const recentMenuRef = useRef<HTMLDetailsElement | null>(null)
  const notificationsRef = useRef<HTMLDetailsElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ingredientIndex, setIngredientIndex] = useState<Array<{ id: string; name: string; code?: string | null }>>([])
  const [recipeIndex, setRecipeIndex] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    let cancelled = false

    async function loadIndexes() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('ingredients')
          .select('id,name,code')
          .order('name', { ascending: true })
          .limit(300)

        if (!cancelled && Array.isArray(data)) {
          setIngredientIndex(
            data
              .filter((x: any) => x && typeof x.name === 'string')
              .map((x: any) => ({ id: String(x.id), name: String(x.name), code: x.code ?? null }))
          )
        }
      } catch {
        // ignore
      }

      try {
        const { data } = await supabase
          .from('recipes')
          .select('id,name')
          .order('name', { ascending: true })
          .limit(300)

        if (!cancelled && Array.isArray(data)) {
          setRecipeIndex(
            data
              .filter((x: any) => x && typeof x.name === 'string')
              .map((x: any) => ({ id: String(x.id), name: String(x.name) }))
          )
        }
      } catch {
        // ignore
      }
      setLoading(false)
    }

    loadIndexes()
    return () => {
      cancelled = true
    }
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
        const email = data?.user?.email || ''
        if (alive) setUserEmail(email)
      } catch {
        if (alive) setUserEmail('')
      }
    }

    loadUser()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => {
      alive = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  const title = useMemo(() => {
    const p = ((loc.pathname || '') + ' ' + (loc.hash || '')).toLowerCase()
    if (p.includes('ingredients')) return 'Ingredients'
    if (p.includes('recipes')) return 'Recipes'
    if (p.includes('print')) return 'Print'
    if (p.includes('cook')) return 'Cook Mode'
    if (p.includes('recipe')) return 'Recipe Editor'
    if (p.includes('settings')) return 'Settings'
    if (p.includes('dashboard')) return 'Dashboard'
    if (p.includes('costhistory')) return 'Cost History'
    if (p.includes('salesmachine')) return 'Sales Machine'
    return 'GastroChef'
  }, [loc.pathname, loc.hash])

  const commands: CommandItem[] = useMemo(
    () => [
      { id: 'go-dashboard', label: 'Go to Dashboard', kbd: 'G D', run: () => navigate('/dashboard') },
      { id: 'go-recipes', label: 'Go to Recipes', kbd: 'G R', run: () => navigate('/recipes') },
      { id: 'go-ingredients', label: 'Go to Ingredients', kbd: 'G I', run: () => navigate('/ingredients') },
      { id: 'go-recipe', label: 'Open Recipe Editor', kbd: 'G E', run: () => navigate('/recipe') },
      { id: 'go-cook', label: 'Open Cook Mode', kbd: 'G C', run: () => navigate('/cook') },
      { id: 'go-print', label: 'Open Print', kbd: 'G P', run: () => navigate('/print') },
      { id: 'go-settings', label: 'Go to Settings', kbd: 'G S', run: () => navigate('/settings') },
      { id: 'go-costhistory', label: 'Go to Cost History', kbd: 'G H', run: () => navigate('/costhistory') },
      { id: 'go-salesmachine', label: 'Go to Sales Machine', kbd: 'G M', run: () => navigate('/salesmachine') },
      
      ...ingredientIndex.map((ing) => ({
        id: `ing-${ing.id}`,
        label: `Ingredient: ${ing.name}${ing.code ? ` (${ing.code})` : ''}`,
        kbd: '⏎',
        run: () => {
          navigate('/ingredients')
        },
      })),
      ...recipeIndex.map((r) => ({
        id: `rec-${r.id}`,
        label: `Recipe: ${r.name}`,
        kbd: '⏎',
        run: () => {
          navigate('/recipes')
        },
      })),
      {
        id: 'toggle-theme',
        label: dark ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        kbd: 'T',
        run: () => setDark((v) => !v),
      },
      {
        id: 'refresh-kitchen',
        label: 'Refresh kitchen',
        kbd: 'R',
        run: async () => {
          await k.refresh().catch(() => {})
        },
      },
      {
        id: 'logout',
        label: 'Log out',
        kbd: 'L',
        danger: true,
        run: async () => {
          await handleLogout()
        },
      },
    ],
    [navigate, dark, k, ingredientIndex, recipeIndex]
  )

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)

    try {
      await supabase.auth.signOut()
    } catch {
      // ignore
    }

    try {
      clearAppCaches()
      setMode('mgmt')
    } finally {
      window.location.assign(`${base}#/login`)
    }
  }

  function closeAllMenus() {
    if (menuRef.current) menuRef.current.open = false
    if (recentMenuRef.current) recentMenuRef.current.open = false
    if (notificationsRef.current) notificationsRef.current.open = false
  }

  const avatarText = initialsFrom(userEmail || 'GastroChef')
  const kitchenLabel = k.kitchenName || (k.kitchenId ? 'Kitchen' : 'Resolving kitchen…')

  const unreadCount = notifications.filter(n => !n.read).length

  if (isPrintRoute) {
    return (
      <div className={cx('gc-root', dark && 'gc-dark', 'gc-print-route')}>
        <main className="gc-main" style={{ padding: 0 }}>
          <Outlet />
        </main>
      </div>
    )
  }

  // ========== أنماط CSS المحسنة للهيدر فقط ==========
  const headerStyles = `
    .gc-topbar-pill {
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(107, 127, 59, 0.15);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
      transition: all 0.3s ease;
      height: 64px;
    }
    
    .gc-dark .gc-topbar-pill {
      background: rgba(20, 25, 35, 0.85);
      border-bottom: 1px solid rgba(107, 127, 59, 0.2);
    }
    
    .gc-autosave {
      transition: all 0.2s ease;
      border-radius: 20px;
    }
    
    .gc-autosave:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
    }
    
    .gc-autosave.is-saved {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
      border-color: rgba(16, 185, 129, 0.3);
    }
    
    .gc-autosave.is-saving {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
      border-color: rgba(245, 158, 11, 0.3);
    }
    
    .gc-autosave.is-error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.3);
    }
    
    .gc-kbd-btn, .gc-icon-btn {
      transition: all 0.2s ease;
      border-radius: 18px;
    }
    
    .gc-kbd-btn:hover, .gc-icon-btn:hover {
      background: rgba(107, 127, 59, 0.1);
      border-color: rgba(107, 127, 59, 0.3);
      transform: translateY(-1px);
    }
    
    .gc-user-trigger-btn {
      transition: all 0.2s ease;
      border-radius: 30px;
    }
    
    .gc-user-trigger-btn:hover {
      background: rgba(107, 127, 59, 0.1);
      border-color: rgba(107, 127, 59, 0.3);
      transform: translateY(-1px);
    }
    
    .gc-avatar {
      transition: all 0.2s ease;
    }
    
    .gc-user-trigger-btn:hover .gc-avatar {
      transform: scale(1.05);
    }
    
    .gc-actions-panel {
      animation: slideDown 0.2s ease-out;
      border-radius: 16px;
    }
    
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .gc-actions-item {
      transition: all 0.15s ease;
      border-radius: 10px;
    }
    
    .gc-actions-item:hover {
      background: rgba(107, 127, 59, 0.1);
      padding-left: 16px;
    }
    
    .gc-actions-danger:hover {
      background: rgba(239, 68, 68, 0.1) !important;
      color: #ef4444 !important;
    }
    
    .quick-search-input {
      transition: all 0.3s ease;
      border: 1px solid transparent;
      background: rgba(0, 0, 0, 0.02);
      border-radius: 20px;
      padding: 6px 12px;
      width: 120px;
      font-size: 12px;
      outline: none;
    }
    
    .quick-search-input:focus {
      width: 200px;
      background: white;
      border-color: rgba(107, 127, 59, 0.3);
      box-shadow: 0 2px 8px rgba(107, 127, 59, 0.1);
    }
    
    .gc-dark .quick-search-input {
      background: rgba(255, 255, 255, 0.05);
      color: white;
    }
    
    .gc-dark .quick-search-input:focus {
      background: rgba(30, 35, 45, 0.9);
    }
    
    .notification-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 8px;
      height: 8px;
      border-radius: 4px;
      background: #ef4444;
      border: 2px solid white;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      50% {
        transform: scale(1.2);
        opacity: 0.8;
      }
    }
    
    .online-indicator {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      display: inline-block;
      margin-left: 4px;
    }
    
    .progress-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, #6B7F3B, #1F7A78);
      transform-origin: left;
      z-index: 100;
    }
    
    /* أنماط القوائم المنسدلة */
    .gc-actions-menu summary::-webkit-details-marker {
      display: none;
    }
    
    .gc-actions-menu summary {
      list-style: none;
    }
    
    .gc-actions-menu[open] summary {
      background: rgba(107, 127, 59, 0.05);
    }
    
    /* تحسينات للشاشات الصغيرة */
    @media (max-width: 768px) {
      .gc-topbar-pill {
        height: 56px;
      }
      .quick-search-input {
        display: none;
      }
    }
    
    @media (max-width: 640px) {
      .gc-topbar-kitchen {
        display: none;
      }
      .gc-autosave span:not(.gc-autosave-icon) {
        display: none;
      }
      .gc-autosave {
        padding: 4px 8px;
      }
      .gc-kbd-btn span:last-child {
        display: none;
      }
    }
  `

  return (
    <>
      <style>{headerStyles}</style>
      
      <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
        <div className="gc-shell">
          <aside className="gc-side">
            <div className="gc-side-card">
              <div className="gc-brand">
                <div className="gc-brand-mark" aria-hidden="true">
                  <img
                    src={brandLogo}
                    alt=""
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = brandFallback
                    }}
                  />
                </div>
                <div>
                  <div className="gc-brand-name">
                    Gastro<span className="gc-brand-accent">Chef</span>
                  </div>
                  <div className="gc-brand-sub">{kitchenLabel}</div>
                </div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <div className="gc-label">MODE</div>
                <div className={cx('gc-mode-switch', isKitchen ? 'is-kitchen' : 'is-mgmt')} role="tablist" aria-label="Mode">
                  <button
                    className={cx('gc-mode-seg', isKitchen && 'is-active')}
                    type="button"
                    role="tab"
                    aria-selected={isKitchen}
                    onClick={() => setMode('kitchen')}
                  >
                    Kitchen
                  </button>
                  <button
                    className={cx('gc-mode-seg', isMgmt && 'is-active')}
                    type="button"
                    role="tab"
                    aria-selected={isMgmt}
                    onClick={() => setMode('mgmt')}
                  >
                    Mgmt
                  </button>
                </div>

                <div className="gc-hint">{isKitchen ? 'Kitchen mode is active.' : 'Mgmt mode is active.'}</div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <div className="gc-label">NAVIGATION</div>

                <nav className="gc-nav">
                  <NavLink to="/dashboard" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/ingredients" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    Ingredients
                  </NavLink>
                  <NavLink to="/recipes" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    Recipes
                  </NavLink>
                  <NavLink to="/settings" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    Settings
                  </NavLink>
                </nav>

                <div className="gc-tip">Tip: Kitchen for cooking · Mgmt for costing & pricing.</div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <button
                  className="gc-btn gc-btn-danger gc-btn--full"
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  aria-disabled={loggingOut}
                  title="Sign out"
                >
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            </div>
          </aside>

          <main className="gc-main">
            {/* الهيدر المحسن مع جميع الإضافات */}
            <div className="gc-topbar" aria-label="Top bar">
              <div className="gc-topbar-pill" role="banner" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", padding: "0 20px" }}>
                <div className="gc-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img
                    className="gc-topbar-logo gc-topbar-logo--mark"
                    src={brandLogo}
                    alt="GastroChef"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = brandFallback
                    }}
                    style={{ height: 32, width: 'auto' }}
                  />
                  <div 
                    className="gc-topbar-kitchen" 
                    title={k.error ? `Kitchen error: ${k.error}` : kitchenLabel}
                    style={{
                      padding: '4px 12px',
                      background: 'rgba(107, 127, 59, 0.1)',
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    onClick={() => navigate('/dashboard')}
                  >
                    {k.error ? 'Kitchen error' : kitchenLabel}
                  </div>
                  
                  {/* Breadcrumbs */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginLeft: 4,
                    fontSize: 12,
                    color: 'var(--gc-muted)'
                  }}>
                    <span style={{ fontSize: 14 }}>🏠</span>
                    <span style={{ margin: '0 4px', color: 'rgba(107, 127, 59, 0.5)' }}>/</span>
                    <span style={{ fontWeight: 600, color: 'var(--gc-brand-olive)' }}>{title}</span>
                  </div>

                  {/* مؤشرات الحالة */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <motion.span
                      className={cx('gc-live-dot', a.status === 'error' && 'is-error', a.status === 'saving' && 'is-saving')}
                      animate={{
                        scale: a.status === 'saving' ? [1, 1.2, 1] : 1,
                      }}
                      transition={{
                        duration: 1,
                        repeat: a.status === 'saving' ? Infinity : 0,
                      }}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: a.status === 'error' ? '#ef4444' : a.status === 'saving' ? '#f59e0b' : '#10b981'
                      }}
                      aria-hidden="true"
                    />
                    
                    {/* مؤشر الاتصال */}
                    <motion.span
                      className="online-indicator"
                      animate={{ 
                        backgroundColor: online ? '#10b981' : '#ef4444'
                      }}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        display: 'inline-block'
                      }}
                      title={online ? 'Online' : 'Offline'}
                    />
                    
                    {/* مؤشر التحميل */}
                    {loading && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        style={{
                          width: 14,
                          height: 14,
                          border: '2px solid rgba(107,127,59,0.2)',
                          borderTopColor: 'var(--gc-brand-olive)',
                          borderRadius: 7
                        }}
                      />
                    )}
                  </div>
                  
                  <span className="gc-sr-only">{title}</span>
                </div>

                <div className="gc-topbar-spacer" aria-hidden="true" />

                <div className="gc-topbar-right" style={{ display: "flex", flexDirection: "row", flexWrap: "nowrap", alignItems: "center", justifyContent: "flex-end", gap: 8, whiteSpace: "nowrap" }}>
                  
                  {/* Quick Search */}
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="quick-search-input"
                      placeholder="🔍 Quick search..."
                      value={quickSearch}
                      onChange={(e) => setQuickSearch(e.target.value)}
                      onFocus={() => setShowQuickSearch(true)}
                      onBlur={() => {
                        setTimeout(() => setShowQuickSearch(false), 200)
                      }}
                    />
                    {showQuickSearch && searchResults.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        width: 250,
                        background: 'white',
                        borderRadius: 12,
                        border: '1px solid rgba(107,127,59,0.2)',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                        marginTop: 4,
                        padding: 8,
                        zIndex: 1000
                      }}>
                        {searchResults.map(result => (
                          <button
                            key={`${result.type}-${result.id}`}
                            style={{ 
                              width: '100%', 
                              textAlign: 'left', 
                              padding: '8px 10px', 
                              borderRadius: 8, 
                              border: 'none', 
                              background: 'transparent', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8
                            }}
                            onClick={() => {
                              navigate(result.path)
                              setQuickSearch('')
                              setShowQuickSearch(false)
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(107,127,59,0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ fontSize: 16 }}>{result.type === 'ingredient' ? '🥗' : '📝'}</span>
                            <span style={{ fontSize: 12 }}>{result.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Actions - New Recipe */}
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <button
                      className="gc-icon-btn"
                      onClick={() => navigate('/recipe')}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        border: '1px solid transparent',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title="New Recipe"
                    >
                      <span style={{ fontSize: 18 }}>📝</span>
                    </button>
                  </motion.div>

                  {/* Quick Actions - New Ingredient */}
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <button
                      className="gc-icon-btn"
                      onClick={() => navigate('/ingredients')}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        border: '1px solid transparent',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title="New Ingredient"
                    >
                      <span style={{ fontSize: 18 }}>🥗</span>
                    </button>
                  </motion.div>

                  {/* Density Toggle */}
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <button
                      className="gc-icon-btn"
                      onClick={() => {
                        const newDensity = density === 'comfort' ? 'compact' : 'comfort'
                        setDensityState(newDensity)
                        applyGlobalDensity(newDensity)
                        saveGlobalDensity(newDensity)
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        border: '1px solid transparent',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title={density === 'comfort' ? 'Switch to Compact' : 'Switch to Comfort'}
                    >
                      <span style={{ fontSize: 18 }}>{density === 'comfort' ? '📏' : '📐'}</span>
                    </button>
                  </motion.div>

                  {/* Notifications Dropdown */}
                  <details 
                    ref={notificationsRef} 
                    className="gc-actions-menu" 
                    style={{ position: 'relative', display: 'inline-block' }}
                  >
                    <summary style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      border: '1px solid transparent',
                      background: 'transparent',
                      cursor: 'pointer',
                      listStyle: 'none',
                      position: 'relative'
                    }}>
                      <span style={{ fontSize: 18 }}>🔔</span>
                      {unreadCount > 0 && (
                        <span className="notification-badge" />
                      )}
                    </summary>
                    
                    {notificationsRef.current?.open && (
                      <div style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 8px)',
                        width: 280,
                        background: 'white',
                        borderRadius: 16,
                        border: '1px solid rgba(107,127,59,0.2)',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                        padding: 12,
                        zIndex: 1000,
                        animation: 'slideDown 0.2s ease-out'
                      }}
                      onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gc-muted)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                          <span>NOTIFICATIONS</span>
                          {unreadCount > 0 && (
                            <button 
                              style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--gc-brand-olive)', cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                setNotifications(notifications.map(n => ({ ...n, read: true })))
                              }}
                            >
                              Mark all read
                            </button>
                          )}
                        </div>
                        {notifications.map(n => (
                          <div
                            key={n.id}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 10,
                              background: n.read ? 'transparent' : 'rgba(107,127,59,0.05)',
                              marginBottom: 4,
                              cursor: 'pointer',
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setNotifications(notifications.map(notif => 
                                notif.id === n.id ? { ...notif, read: true } : notif
                              ))
                              if (n.path) {
                                navigate(n.path)
                                if (notificationsRef.current) notificationsRef.current.open = false
                              }
                            }}
                          >
                            <span style={{ fontSize: 14 }}>{n.read ? '📨' : '📬'}</span>
                            <span style={{ flex: 1 }}>{n.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>

                  {/* Recent Items Dropdown */}
                  <details 
                    ref={recentMenuRef} 
                    className="gc-actions-menu" 
                    style={{ position: 'relative', display: 'inline-block' }}
                  >
                    <summary style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 10px',
                      borderRadius: 20,
                      border: '1px solid transparent',
                      background: 'transparent',
                      cursor: 'pointer',
                      listStyle: 'none',
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      <span style={{ fontSize: 16 }}>🕒</span>
                      <span>Recent</span>
                      <span style={{ fontSize: 10 }}>▼</span>
                    </summary>
                    
                    {recentMenuRef.current?.open && (
                      <div style={{
                        position: 'absolute',
                        right: 0,
                        top: 'calc(100% + 8px)',
                        width: 240,
                        background: 'white',
                        borderRadius: 16,
                        border: '1px solid rgba(107,127,59,0.2)',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                        padding: 8,
                        zIndex: 1000,
                        animation: 'slideDown 0.2s ease-out'
                      }}
                      onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ fontSize: 11, color: 'var(--gc-muted)', marginBottom: 8, padding: '0 4px' }}>RECENT ITEMS</div>
                        {recentItems.map((item, index) => (
                          <button 
                            key={index}
                            style={{ 
                              width: '100%', 
                              textAlign: 'left', 
                              padding: '8px 10px', 
                              borderRadius: 10, 
                              border: 'none', 
                              background: 'transparent', 
                              cursor: 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 8,
                              marginTop: index > 0 ? 4 : 0
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(item.path)
                              if (recentMenuRef.current) recentMenuRef.current.open = false
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(107,127,59,0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ fontSize: 16 }}>{item.type === 'recipe' ? '📝' : '🥗'}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 12 }}>{item.name}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </details>

                  {/* Autosave */}
                  <motion.div
                    className={cx(
                      'gc-autosave',
                      a.status === 'saving' && 'is-saving',
                      a.status === 'saved' && 'is-saved',
                      a.status === 'error' && 'is-error'
                    )}
                    animate={a.status === 'saving' ? {
                      scale: [1, 1.05, 1],
                      transition: { duration: 1, repeat: Infinity }
                    } : {}}
                    aria-live="polite"
                    title={
                      a.status === 'saving'
                        ? 'Saving…'
                        : a.status === 'saved'
                          ? 'Saved'
                          : a.status === 'error'
                            ? (a.message || 'Save issue')
                            : 'All changes saved'
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 12px',
                      border: '1px solid transparent',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'default'
                    }}
                  >
                    <span className="gc-autosave-icon" aria-hidden="true" style={{ fontSize: 14 }}>
                      {a.status === 'saving' ? '⏳' : a.status === 'error' ? '⚠️' : '✓'}
                    </span>
                    <span>
                      {a.status === 'saving'
                        ? 'Saving'
                        : a.status === 'saved'
                          ? 'Saved'
                          : a.status === 'error'
                            ? (a.message || 'Error')
                            : 'Saved'}
                    </span>
                  </motion.div>

                  {/* Command Palette Button */}
                  <motion.button
                    type="button"
                    className="gc-kbd-btn"
                    aria-label="Command palette"
                    title="Quick actions (Ctrl/⌘ + K)"
                    onClick={() => setPaletteOpen(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: '1px solid transparent',
                      background: 'transparent',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ 
                      background: 'rgba(107, 127, 59, 0.2)', 
                      padding: '2px 6px', 
                      borderRadius: 6, 
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--gc-brand-olive)'
                    }}>⌘</span>
                    <span>K</span>
                  </motion.button>

                  {/* User Menu */}
                  <details ref={menuRef} className="gc-actions-menu gc-user-menu">
                    <motion.summary 
                      className="gc-actions-trigger gc-user-trigger gc-user-trigger-btn" 
                      aria-label="User menu"
                      whileHover={{ scale: 1.02 }}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        padding: '4px 4px 4px 8px',
                        borderRadius: 30,
                        border: '1px solid transparent',
                        background: 'transparent',
                        cursor: 'pointer',
                        listStyle: 'none'
                      }}
                    >
                      <span className="gc-avatar" aria-hidden="true" style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        background: timeBased.gradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 12
                      }}>
                        {avatarText}
                      </span>
                      <span className="gc-user-mini" aria-hidden="true" style={{ fontSize: 10, color: 'var(--gc-muted)' }}>
                        ▼
                      </span>
                    </motion.summary>

                    <AnimatePresence>
                      {menuRef.current?.open && (
                        <motion.div
                          className="gc-actions-panel gc-user-panel"
                          role="menu"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 'calc(100% + 8px)',
                            width: 260,
                            background: 'white',
                            border: '1px solid rgba(107, 127, 59, 0.2)',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                            overflow: 'hidden',
                            zIndex: 1000
                          }}
                        >
                          <div className="gc-user-header" style={{
                            padding: 16,
                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                            borderBottom: '1px solid rgba(107, 127, 59, 0.1)'
                          }}>
                            <div className="gc-user-header-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span className="gc-avatar gc-avatar--lg" aria-hidden="true" style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                background: timeBased.gradient,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: 14
                              }}>
                                {avatarText}
                              </span>
                              <div className="gc-user-meta">
                                <div className="gc-user-name" style={{ fontWeight: 700, fontSize: 14 }}>{userEmail ? userEmail.split('@')[0] : 'Account'}</div>
                                <div className="gc-user-sub" style={{ fontSize: 12, color: 'var(--gc-muted)' }}>{(k.profile?.role || 'Owner')} • {k.error ? 'Kitchen error' : kitchenLabel}</div>
                                <div style={{ fontSize: 10, color: 'var(--gc-muted)', marginTop: 2 }}>{timeBased.label} {timeBased.icon}</div>
                              </div>
                            </div>
                          </div>

                          <div style={{ padding: 8 }}>
                            <button
                              className="gc-actions-item"
                              type="button"
                              onClick={() => {
                                setDark((v) => !v)
                                if (menuRef.current) menuRef.current.open = false
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--gc-text)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                              }}
                            >
                              <span style={{ fontSize: 16 }}>{dark ? '☀️' : '🌙'}</span>
                              {dark ? 'Light Mode' : 'Dark Mode'}
                            </button>

                            <div className="gc-menu-divider" role="separator" aria-hidden="true" style={{ height: 1, background: 'rgba(107, 127, 59, 0.1)', margin: '4px 0' }} />
                            
                            <button
                              className="gc-actions-item"
                              type="button"
                              onClick={async () => {
                                await k.refresh().catch(() => {})
                                if (menuRef.current) menuRef.current.open = false
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--gc-text)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                              }}
                            >
                              <span style={{ fontSize: 16 }}>🔄</span>
                              Refresh kitchen
                            </button>

                            <div className="gc-menu-divider" role="separator" aria-hidden="true" style={{ height: 1, background: 'rgba(107, 127, 59, 0.1)', margin: '4px 0' }} />

                            <button
                              className="gc-actions-item gc-actions-danger"
                              type="button"
                              onClick={async () => {
                                await handleLogout()
                              }}
                              disabled={loggingOut}
                              aria-disabled={loggingOut}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: 600,
                                color: loggingOut ? 'var(--gc-muted)' : '#ef4444',
                                cursor: loggingOut ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                opacity: loggingOut ? 0.7 : 1
                              }}
                            >
                              <span style={{ fontSize: 16 }}>🚪</span>
                              {loggingOut ? 'Logging out…' : 'Log out'}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </details>
                </div>
              </div>
            </div>

            {/* Progress Bar للتحميل */}
            {loading && (
              <motion.div
                className="progress-bar"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} />

            <div className="gc-content">
              <div className="gc-page">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* CSS إضافي للـ mobile menu toggle */}
      <style>{`
        @media (max-width: 768px) {
          .gc-side {
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            position: fixed;
            z-index: 1000;
          }
          .gc-side.is-open {
            transform: translateX(0);
          }
          .gc-main {
            margin-left: 0 !important;
          }
          .gc-topbar-pill {
            padding: 0 12px !important;
          }
        }
      `}</style>
    </>
  )
}

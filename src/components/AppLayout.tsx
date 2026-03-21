// src/components/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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

// دالة للحصول على ألوان حسب الوقت
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

  // State للإشعارات
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; read: boolean; path: string }>>([
    { id: '1', message: 'Welcome to GastroChef!', read: false, path: '/dashboard' }
  ])

  // State للعناصر الأخيرة الحقيقية
  const [recentItems, setRecentItems] = useState<Array<{ 
    id: string; 
    name: string; 
    type: 'recipe' | 'ingredient'; 
    path: string;
    action: string;
    created_at: string;
  }>>([])

  const [loadingRecent, setLoadingRecent] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLDivElement>(null)
  const userButtonRef = useRef<HTMLButtonElement>(null)
  const notificationsButtonRef = useRef<HTMLButtonElement>(null)
  const recentButtonRef = useRef<HTMLButtonElement>(null)

  // ========== دالة لجلب العناصر الأخيرة من Supabase ==========
  const fetchRecentItems = useCallback(async () => {
    try {
      setLoadingRecent(true)
      
      // جلب آخر 5 نشاطات للمستخدم الحالي من قاعدة البيانات
      // ملاحظة: هذا يفترض وجود جدول recent_activities
      // إذا لم يكن موجوداً، سنستخدم بيانات من recipes و ingredients مباشرة
      
      // محاولة جلب من جدول recent_activities أولاً
      try {
        const { data, error } = await supabase
          .from('recent_activities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5)

        if (!error && data && data.length > 0) {
          setRecentItems(data.map(item => ({
            id: item.item_id,
            name: item.item_name,
            type: item.item_type,
            path: item.item_path,
            action: item.action,
            created_at: item.created_at
          })))
          return
        }
      } catch (e) {
        // تجاهل الخطأ إذا كان الجدول غير موجود
      }

      // إذا لم ينجح، نجلب آخر الوصفات المحدثة
      const { data: recipes, error: recipesError } = await supabase
        .from('recipes')
        .select('id, name, updated_at')
        .order('updated_at', { ascending: false })
        .limit(3)

      if (!recipesError && recipes) {
        const recipeItems = recipes.map(r => ({
          id: r.id,
          name: r.name,
          type: 'recipe' as const,
          path: `/recipe?id=${r.id}`,
          action: 'updated',
          created_at: r.updated_at || new Date().toISOString()
        }))
        setRecentItems(recipeItems)
      }

    } catch (error) {
      console.error('Error fetching recent items:', error)
    } finally {
      setLoadingRecent(false)
    }
  }, [])

  // ========== جلب العناصر الأخيرة عند تحميل الصفحة ==========
  useEffect(() => {
    fetchRecentItems()
  }, [fetchRecentItems])

  // ========== تحديث القائمة كل دقيقة ==========
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRecentItems()
    }, 60000) // كل 60 ثانية

    return () => clearInterval(interval)
  }, [fetchRecentItems])

  // ========== إغلاق القوائم عند النقر خارجها ==========
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
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isPrintRoute = useMemo(() => {
    const path = (loc.pathname || '').toLowerCase()
    const hash = (loc.hash || '').toLowerCase()
    return path.includes('/print') || hash.includes('#/print') || hash.includes('/print')
  }, [loc.pathname, loc.hash])

  const [dark, setDark] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const d = loadGlobalDensity()
    applyGlobalDensity(d)
  }, [])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ingredientIndex, setIngredientIndex] = useState<Array<{ id: string; name: string; code?: string | null }>>([])
  const [recipeIndex, setRecipeIndex] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    let cancelled = false

    async function loadIndexes() {
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
    return 'Dashboard'
  }, [loc.pathname, loc.hash])

  const handleLogout = useCallback(async () => {
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
  }, [base, loggingOut, setMode])

  const commands: CommandItem[] = useMemo(
    () => {
      const cmds: CommandItem[] = [
        { id: 'go-dashboard', label: 'Go to Dashboard', kbd: 'G D', run: () => navigate('/dashboard') },
        { id: 'go-recipes', label: 'Go to Recipes', kbd: 'G R', run: () => navigate('/recipes') },
        { id: 'go-ingredients', label: 'Go to Ingredients', kbd: 'G I', run: () => navigate('/ingredients') },
        { id: 'go-recipe', label: 'Open Recipe Editor', kbd: 'G E', run: () => navigate('/recipe') },
        { id: 'go-cook', label: 'Open Cook Mode', kbd: 'G C', run: () => navigate('/cook') },
        { id: 'go-print', label: 'Open Print', kbd: 'G P', run: () => navigate('/print') },
        { id: 'go-settings', label: 'Go to Settings', kbd: 'G S', run: () => navigate('/settings') },
        { id: 'toggle-theme', label: dark ? 'Switch to Light Mode' : 'Switch to Dark Mode', kbd: 'T', run: () => setDark((v) => !v) },
        { id: 'refresh-kitchen', label: 'Refresh kitchen', kbd: 'R', run: async () => { await k.refresh().catch(() => {}) } },
        { id: 'logout', label: 'Log out', kbd: 'L', danger: true, run: async () => { await handleLogout() } },
      ]

      ingredientIndex.forEach((ing) => {
        cmds.push({
          id: `ing-${ing.id}`,
          label: `Ingredient: ${ing.name}${ing.code ? ` (${ing.code})` : ''}`,
          kbd: '⏎',
          run: () => { navigate('/ingredients') },
        })
      })

      recipeIndex.forEach((r) => {
        cmds.push({
          id: `rec-${r.id}`,
          label: `Recipe: ${r.name}`,
          kbd: '⏎',
          run: () => { navigate('/recipes') },
        })
      })

      return cmds
    },
    [navigate, dark, k, handleLogout, ingredientIndex, recipeIndex]
  )

  const avatarText = initialsFrom(userEmail || 'GastroChef')
  const kitchenLabel = k.kitchenName || (k.kitchenId ? 'Kitchen' : 'Resolving kitchen…')
  const timeBased = getTimeBasedColor()
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

  // ========== أنماط CSS المحسنة ==========
  const styles = `
    .gc-topbar-pill {
      height: 56px;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(107, 127, 59, 0.15);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
      padding: 0 16px;
    }

    .gc-dark .gc-topbar-pill {
      background: rgba(20, 25, 35, 0.9);
      border-bottom: 1px solid rgba(107, 127, 59, 0.2);
    }

    .gc-topbar-logo {
      height: 28px;
      width: auto;
    }

    .gc-topbar-kitchen {
      font-size: 13px;
      font-weight: 600;
      padding: 4px 10px;
      background: rgba(107, 127, 59, 0.1);
      border-radius: 30px;
      color: var(--gc-text);
    }

    .header-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 30px;
      border: 1px solid rgba(107, 127, 59, 0.2);
      background: transparent;
      font-size: 12px;
      font-weight: 600;
      color: var(--gc-text);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .header-btn:hover {
      background: rgba(107, 127, 59, 0.1);
      border-color: rgba(107, 127, 59, 0.4);
      transform: translateY(-1px);
    }

    .header-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .header-btn-icon {
      width: 32px;
      height: 32px;
      padding: 0;
      justify-content: center;
    }

    .autosave-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 30px;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .autosave-indicator.saved {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }

    .autosave-indicator.saving {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
    }

    .autosave-indicator.error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }

    .dropdown-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 300px;
      background: white;
      border-radius: 16px;
      border: 1px solid rgba(107, 127, 59, 0.2);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      z-index: 1000;
      animation: slideDown 0.2s ease-out;
    }

    .gc-dark .dropdown-menu {
      background: #1f2937;
      border-color: rgba(107, 127, 59, 0.3);
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

    .dropdown-header {
      padding: 12px 16px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-bottom: 1px solid rgba(107, 127, 59, 0.1);
    }

    .gc-dark .dropdown-header {
      background: #111827;
    }

    .dropdown-item {
      width: 100%;
      padding: 10px 12px;
      text-align: left;
      background: none;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--gc-text);
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dropdown-item:hover {
      background: rgba(107, 127, 59, 0.1);
    }

    .dropdown-item.danger {
      color: #ef4444;
    }

    .dropdown-item.danger:hover {
      background: rgba(239, 68, 68, 0.1);
    }

    .dropdown-divider {
      height: 1px;
      background: rgba(107, 127, 59, 0.1);
      margin: 4px 0;
    }

    .badge {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 8px;
      height: 8px;
      border-radius: 4px;
      background: #ef4444;
      border: 2px solid white;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      transition: all 0.2s ease;
    }

    .status-dot.saving {
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.7;
        transform: scale(1.2);
      }
    }

    @media (max-width: 768px) {
      .gc-topbar-pill {
        height: 52px;
        padding: 0 12px;
      }
      
      .gc-topbar-kitchen {
        display: none;
      }
      
      .autosave-indicator span:last-child {
        display: none;
      }
      
      .autosave-indicator {
        padding: 4px 8px;
      }
      
      .header-btn span:last-child {
        display: none;
      }
      
      .header-btn {
        padding: 6px 8px;
      }

      .dropdown-menu {
        width: 280px;
      }
    }

    @media (max-width: 480px) {
      .gc-topbar-logo {
        display: none;
      }
    }
  `

  return (
    <>
      <style>{styles}</style>
      
      <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
        <div className="gc-shell">
          {/* Mobile Menu Toggle */}
          <button
            className="gc-mobile-menu-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              zIndex: 60,
              display: 'none',
              width: 44,
              height: 44,
              borderRadius: 22,
              background: 'linear-gradient(135deg, #6B7F3B 0%, #1F7A78 100%)',
              color: 'white',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
                    onClick={() => setMode('kitchen')}
                  >
                    Kitchen
                  </button>
                  <button
                    className={cx('gc-mode-seg', isMgmt && 'is-active')}
                    type="button"
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
                >
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            </div>
          </aside>

          <main className="gc-main">
            {/* الهيدر المحسن - جميع الأزرار تعمل والعناصر تظهر فقط عند النقر */}
            <div className="gc-topbar" aria-label="Top bar">
              <div className="gc-topbar-pill" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center" }}>
                <div className="gc-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img
                    className="gc-topbar-logo"
                    src={brandLogo}
                    alt="GastroChef"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = brandFallback
                    }}
                  />
                  <div className="gc-topbar-kitchen" title={k.error ? `Kitchen error: ${k.error}` : kitchenLabel}>
                    {k.error ? 'Kitchen error' : kitchenLabel}
                  </div>
                  <motion.div
                    className={cx('status-dot', a.status === 'saving' && 'saving')}
                    animate={{
                      scale: a.status === 'saving' ? [1, 1.2, 1] : 1,
                    }}
                    style={{
                      background: a.status === 'error' ? '#ef4444' : a.status === 'saving' ? '#f59e0b' : '#10b981'
                    }}
                  />
                </div>

                <div className="gc-topbar-spacer" />

                <div className="gc-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                  
                  {/* Autosave Indicator */}
                  <motion.div
                    className={cx(
                      'autosave-indicator',
                      a.status === 'saving' ? 'saving' : a.status === 'saved' ? 'saved' : a.status === 'error' ? 'error' : ''
                    )}
                    animate={a.status === 'saving' ? {
                      scale: [1, 1.05, 1],
                      transition: { duration: 1, repeat: Infinity }
                    } : {}}
                  >
                    <span>{a.status === 'saving' ? '⏳' : a.status === 'error' ? '⚠️' : '✓'}</span>
                    <span>
                      {a.status === 'saving' ? 'Saving' : a.status === 'saved' ? 'Saved' : a.status === 'error' ? 'Error' : 'Saved'}
                    </span>
                  </motion.div>

                  {/* Recent Items Button - يعرض بيانات حقيقية من قاعدة البيانات */}
                  <div style={{ position: 'relative' }}>
                    <button
                      ref={recentButtonRef}
                      className="header-btn header-btn-icon"
                      onClick={() => setShowRecent(!showRecent)}
                      title="Recent items"
                      disabled={loadingRecent}
                    >
                      <span>{loadingRecent ? '⏳' : '🕒'}</span>
                    </button>
                    
                    {showRecent && (
                      <div ref={recentRef} className="dropdown-menu">
                        <div className="dropdown-header">
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>RECENTLY UPDATED</span>
                        </div>
                        <div style={{ padding: 8, maxHeight: 300, overflowY: 'auto' }}>
                          {recentItems.length > 0 ? (
                            recentItems.map((item, index) => (
                              <button
                                key={`${item.id}-${index}`}
                                className="dropdown-item"
                                onClick={() => {
                                  navigate(item.path)
                                  setShowRecent(false)
                                }}
                              >
                                <span style={{ fontSize: 16 }}>
                                  {item.type === 'recipe' ? '📝' : '🥗'}
                                </span>
                                <div style={{ flex: 1, textAlign: 'left' }}>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                                    {item.type === 'recipe' ? 'Recipe' : 'Ingredient'}
                                    {' • '}
                                    {new Date(item.created_at).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric'
                                    })}
                                  </div>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div style={{ 
                              padding: '20px', 
                              textAlign: 'center', 
                              color: '#6b7280',
                              fontSize: 12 
                            }}>
                              No recent items
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notifications Button */}
                  <div style={{ position: 'relative' }}>
                    <button
                      ref={notificationsButtonRef}
                      className="header-btn header-btn-icon"
                      onClick={() => setShowNotifications(!showNotifications)}
                      title="Notifications"
                      style={{ position: 'relative' }}
                    >
                      <span>🔔</span>
                      {unreadCount > 0 && <span className="badge" />}
                    </button>
                    
                    {showNotifications && (
                      <div ref={notificationsRef} className="dropdown-menu">
                        <div className="dropdown-header">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>NOTIFICATIONS</span>
                            {unreadCount > 0 && (
                              <button
                                style={{ fontSize: 11, color: '#6B7F3B', background: 'none', border: 'none', cursor: 'pointer' }}
                                onClick={() => setNotifications(notifications.map(n => ({ ...n, read: true })))}
                              >
                                Mark all read
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ padding: 8, maxHeight: 300, overflowY: 'auto' }}>
                          {notifications.map(n => (
                            <button
                              key={n.id}
                              className="dropdown-item"
                              style={{ background: n.read ? 'transparent' : 'rgba(107, 127, 59, 0.05)' }}
                              onClick={() => {
                                setNotifications(notifications.map(notif => 
                                  notif.id === n.id ? { ...notif, read: true } : notif
                                ))
                                navigate(n.path)
                                setShowNotifications(false)
                              }}
                            >
                              <span>{n.read ? '📨' : '📬'}</span>
                              <span style={{ flex: 1, textAlign: 'left' }}>{n.message}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Command Palette Button */}
                  <button
                    className="header-btn"
                    onClick={() => setPaletteOpen(true)}
                    title="Quick actions (⌘K)"
                  >
                    <span style={{ background: 'rgba(107, 127, 59, 0.2)', padding: '2px 5px', borderRadius: 6 }}>⌘</span>
                    <span>K</span>
                  </button>

                  {/* User Menu Button */}
                  <div style={{ position: 'relative' }}>
                    <button
                      ref={userButtonRef}
                      className="header-btn"
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      style={{ padding: '4px 4px 4px 8px' }}
                    >
                      <span className="gc-avatar" style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        background: timeBased.gradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 11
                      }}>
                        {avatarText}
                      </span>
                      <span style={{ fontSize: 10 }}>▼</span>
                    </button>
                    
                    {showUserMenu && (
                      <div ref={userMenuRef} className="dropdown-menu" style={{ width: 260 }}>
                        <div className="dropdown-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              background: timeBased.gradient,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: 700,
                              fontSize: 13
                            }}>
                              {avatarText}
                            </span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{userEmail ? userEmail.split('@')[0] : 'Account'}</div>
                              <div style={{ fontSize: 11, color: '#6b7280' }}>{(k.profile?.role || 'Owner')}</div>
                              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{timeBased.label} {timeBased.icon}</div>
                            </div>
                          </div>
                        </div>

                        <div style={{ padding: 8 }}>
                          <button
                            className="dropdown-item"
                            onClick={() => {
                              setDark(!dark)
                              setShowUserMenu(false)
                            }}
                          >
                            <span>{dark ? '☀️' : '🌙'}</span>
                            {dark ? 'Light Mode' : 'Dark Mode'}
                          </button>

                          <div className="dropdown-divider" />

                          <button
                            className="dropdown-item"
                            onClick={async () => {
                              await k.refresh()
                              setShowUserMenu(false)
                            }}
                          >
                            <span>🔄</span>
                            Refresh kitchen
                          </button>

                          <div className="dropdown-divider" />

                          <button
                            className="dropdown-item danger"
                            onClick={async () => {
                              await handleLogout()
                            }}
                            disabled={loggingOut}
                          >
                            <span>🚪</span>
                            {loggingOut ? 'Logging out…' : 'Log out'}
                          </button>
                        </div>
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
          .gc-mobile-menu-toggle {
            display: flex !important;
          }
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
        }
      `}</style>
    </>
  )
}

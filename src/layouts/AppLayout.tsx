// src/layouts/AppLayout.tsx
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

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()
  const k = useKitchen()
  const a = useAutosave()

  const navigate = useNavigate()
  const loc = useLocation()

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

  const menuRef = useRef<HTMLDetailsElement | null>(null)
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

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false
  }

  const avatarText = initialsFrom(userEmail || 'GastroChef')
  const kitchenLabel = k.kitchenName || (k.kitchenId ? 'Kitchen' : 'Resolving kitchen…')

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
    /* تحسينات الهيدر */
    .gc-topbar-pill {
      height: 56px;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(107, 127, 59, 0.15);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
      transition: all 0.2s ease;
      padding: 0 16px;
    }

    .gc-dark .gc-topbar-pill {
      background: rgba(20, 25, 35, 0.9);
      border-bottom: 1px solid rgba(107, 127, 59, 0.2);
    }

    /* شعار أصغر */
    .gc-topbar-logo {
      height: 28px;
      width: auto;
    }

    /* اسم المطبخ */
    .gc-topbar-kitchen {
      font-size: 13px;
      font-weight: 600;
      padding: 4px 10px;
      background: rgba(107, 127, 59, 0.1);
      border-radius: 30px;
      color: var(--gc-text);
    }

    /* مؤشر الحفظ التلقائي */
    .gc-autosave {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 30px;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .gc-autosave:hover {
      transform: translateY(-1px);
    }

    .gc-autosave.is-saved {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }

    .gc-autosave.is-saving {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
    }

    .gc-autosave.is-error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }

    .gc-autosave-icon {
      font-size: 14px;
    }

    /* زر الأوامر */
    .gc-kbd-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 30px;
      border: 1px solid rgba(107, 127, 59, 0.2);
      background: transparent;
      font-size: 11px;
      font-weight: 600;
      color: var(--gc-text);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .gc-kbd-btn:hover {
      background: rgba(107, 127, 59, 0.1);
      border-color: rgba(107, 127, 59, 0.4);
      transform: translateY(-1px);
    }

    .gc-kbd-btn span:first-child {
      background: rgba(107, 127, 59, 0.2);
      padding: 2px 5px;
      border-radius: 6px;
      color: #6B7F3B;
      font-weight: 700;
    }

    /* قائمة المستخدم */
    .gc-user-trigger-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 3px 3px 8px;
      border-radius: 30px;
      border: 1px solid rgba(107, 127, 59, 0.2);
      background: transparent;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .gc-user-trigger-btn:hover {
      background: rgba(107, 127, 59, 0.1);
      border-color: rgba(107, 127, 59, 0.4);
      transform: translateY(-1px);
    }

    .gc-avatar {
      width: 30px;
      height: 30px;
      border-radius: 20px;
      background: linear-gradient(135deg, #6B7F3B 0%, #1F7A78 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 12px;
      transition: all 0.2s ease;
    }

    .gc-user-trigger-btn:hover .gc-avatar {
      transform: scale(1.05);
    }

    .gc-user-mini {
      font-size: 10px;
      color: var(--gc-muted);
    }

    /* القائمة المنسدلة */
    .gc-actions-panel {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      width: 240px;
      background: white;
      border-radius: 16px;
      border: 1px solid rgba(107, 127, 59, 0.2);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      z-index: 1000;
      animation: slideDown 0.2s ease-out;
    }

    .gc-dark .gc-actions-panel {
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

    .gc-user-header {
      padding: 16px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-bottom: 1px solid rgba(107, 127, 59, 0.1);
    }

    .gc-dark .gc-user-header {
      background: #111827;
    }

    .gc-user-header-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .gc-avatar--lg {
      width: 40px;
      height: 40px;
      border-radius: 24px;
      font-size: 14px;
    }

    .gc-user-name {
      font-weight: 700;
      font-size: 14px;
    }

    .gc-user-sub {
      font-size: 11px;
      color: var(--gc-muted);
      margin-top: 2px;
    }

    .gc-actions-item {
      width: 100%;
      padding: 10px 12px;
      text-align: left;
      background: none;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--gc-text);
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .gc-actions-item:hover {
      background: rgba(107, 127, 59, 0.1);
      padding-left: 16px;
    }

    .gc-actions-danger {
      color: #ef4444;
    }

    .gc-actions-danger:hover {
      background: rgba(239, 68, 68, 0.1) !important;
    }

    .gc-menu-divider {
      height: 1px;
      background: rgba(107, 127, 59, 0.1);
      margin: 4px 0;
    }

    /* مؤشر الحالة */
    .gc-live-dot {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      margin: 0 2px;
    }

    .gc-live-dot.is-saving {
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

    /* تحسينات للشاشات الصغيرة */
    @media (max-width: 768px) {
      .gc-topbar-pill {
        height: 52px;
        padding: 0 12px;
      }
      
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
      
      .gc-kbd-btn {
        padding: 4px 8px;
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
      <style>{headerStyles}</style>
      
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
            {/* الهيدر المحسن */}
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
                      background: a.status === 'error' ? '#ef4444' : a.status === 'saving' ? '#f59e0b' : '#10b981'
                    }}
                    aria-hidden="true"
                  />
                  <span className="gc-sr-only">{title}</span>
                </div>

                <div className="gc-topbar-spacer" aria-hidden="true" />

                <div className="gc-topbar-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                    title={
                      a.status === 'saving'
                        ? 'Saving…'
                        : a.status === 'saved'
                          ? 'Saved'
                          : a.status === 'error'
                            ? (a.message || 'Save issue')
                            : 'All changes saved'
                    }
                  >
                    <span className="gc-autosave-icon">
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
                  >
                    <span>⌘</span>
                    <span>K</span>
                  </motion.button>

                  {/* User Menu */}
                  <details ref={menuRef} className="gc-actions-menu gc-user-menu">
                    <motion.summary 
                      className="gc-actions-trigger gc-user-trigger gc-user-trigger-btn" 
                      aria-label="User menu"
                      whileHover={{ scale: 1.02 }}
                    >
                      <span className="gc-avatar">
                        {avatarText}
                      </span>
                      <span className="gc-user-mini">
                        ▼
                      </span>
                    </motion.summary>

                    <AnimatePresence>
                      {menuRef.current?.open && (
                        <motion.div
                          className="gc-actions-panel"
                          role="menu"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <div className="gc-user-header">
                            <div className="gc-user-header-row">
                              <span className="gc-avatar gc-avatar--lg">
                                {avatarText}
                              </span>
                              <div className="gc-user-meta">
                                <div className="gc-user-name">{userEmail ? userEmail.split('@')[0] : 'Account'}</div>
                                <div className="gc-user-sub">{(k.profile?.role || 'Owner')} • {k.error ? 'Kitchen error' : kitchenLabel}</div>
                              </div>
                            </div>
                          </div>

                          <div style={{ padding: 8 }}>
                            <button
                              className="gc-actions-item"
                              type="button"
                              onClick={() => {
                                setDark((v) => !v)
                                closeMenu()
                              }}
                            >
                              <span>{dark ? '☀️' : '🌙'}</span>
                              {dark ? 'Light Mode' : 'Dark Mode'}
                            </button>

                            <div className="gc-menu-divider" />

                            <button
                              className="gc-actions-item"
                              type="button"
                              onClick={async () => {
                                closeMenu()
                                await k.refresh().catch(() => {})
                              }}
                            >
                              <span>🔄</span>
                              Refresh kitchen
                            </button>

                            <div className="gc-menu-divider" />

                            <button
                              className="gc-actions-item gc-actions-danger"
                              type="button"
                              onClick={async () => {
                                closeMenu()
                                await handleLogout()
                              }}
                              disabled={loggingOut}
                            >
                              <span>🚪</span>
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

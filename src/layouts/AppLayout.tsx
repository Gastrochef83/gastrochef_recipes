// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import CommandPalette, { type CommandItem } from '../components/CommandPalette'
import { motion, AnimatePresence } from 'framer-motion'

// استيراد أنماط التصميم فقط (بدون إعادة تعريف)
import '../styles/tokens.css'
import '../styles/globals.css'

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

  return (
    <>
      <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
        <div className="gc-shell">
          {/* Mobile Menu Toggle - باستخدام الأنماط الموجودة فقط */}
          <button
            className="gc-mobile-menu-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Sidebar - باستخدام كلاسات globals.css فقط */}
          <aside className={cx('gc-side', isSidebarOpen && 'is-open')}>
            <div className="gc-side-card">
              {/* Brand */}
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

              {/* Mode Switch - باستخدام الأنماط الموجودة */}
              <div className="gc-side-block">
                <div className="gc-label">MODE</div>
                <div className={cx('gc-mode-switch', isKitchen ? 'is-kitchen' : 'is-mgmt')}>
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

              {/* Navigation - باستخدام كلاسات globals.css */}
              <div className="gc-side-block">
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

              {/* Logout Button - باستخدام الأنماط الموجودة */}
              <div className="gc-side-block">
                <button
                  className="gc-btn gc-btn-danger"
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="gc-main">
            {/* Topbar - باستخدام كلاسات globals.css فقط */}
            <div className="gc-topbar">
              <div className="gc-topbar-pill">
                <div className="gc-topbar-left">
                  <img
                    className="gc-topbar-logo gc-topbar-logo--mark"
                    src={brandLogo}
                    alt="GastroChef"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = brandFallback
                    }}
                  />
                  <div className="gc-topbar-kitchen" title={k.error ? `Kitchen error: ${k.error}` : kitchenLabel}>
                    {k.error ? 'Kitchen error' : kitchenLabel}
                  </div>
                  <span
                    className={cx('gc-live-dot', a.status === 'error' && 'is-error', a.status === 'saving' && 'is-saving')}
                    aria-hidden="true"
                  />
                  <span className="gc-sr-only">{title}</span>
                </div>

                <div className="gc-topbar-spacer" aria-hidden="true" />

                <div className="gc-topbar-right">
                  {/* Autosave - باستخدام الأنماط الموجودة */}
                  <div
                    className={cx(
                      'gc-autosave',
                      a.status === 'saving' && 'is-saving',
                      a.status === 'saved' && 'is-saved',
                      a.status === 'error' && 'is-error'
                    )}
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
                  >
                    <span className="gc-autosave-icon" aria-hidden="true">
                      {a.status === 'saving' ? '•' : a.status === 'error' ? '!' : '✓'}
                    </span>
                    <span className="gc-sr-only">
                      {a.status === 'saving'
                        ? 'Saving'
                        : a.status === 'saved'
                          ? 'Saved'
                          : a.status === 'error'
                            ? (a.message || 'Save issue')
                            : 'All changes saved'}
                    </span>
                  </div>

                  {/* Command Palette Button - باستخدام الأنماط الموجودة */}
                  <button
                    type="button"
                    className="gc-kbd-btn"
                    aria-label="Command palette"
                    title="Quick actions (Ctrl/⌘ + K)"
                    onClick={() => setPaletteOpen(true)}
                  >
                    <span aria-hidden="true">⌘K</span>
                  </button>

                  {/* User Menu - باستخدام الأنماط الموجودة */}
                  <details ref={menuRef} className="gc-actions-menu gc-user-menu">
                    <summary className="gc-actions-trigger gc-user-trigger gc-user-trigger-btn" aria-label="User menu">
                      <span className="gc-avatar" aria-hidden="true">
                        {avatarText}
                      </span>
                      <span className="gc-user-mini" aria-hidden="true">
                        ▾
                      </span>
                    </summary>

                    <AnimatePresence>
                      {menuRef.current?.open && (
                        <motion.div
                          className="gc-actions-panel gc-user-panel"
                          role="menu"
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <div className="gc-user-header">
                            <div className="gc-user-header-row">
                              <span className="gc-avatar gc-avatar--lg" aria-hidden="true">
                                {avatarText}
                              </span>
                              <div className="gc-user-meta">
                                <div className="gc-user-name">{userEmail ? userEmail.split('@')[0] : 'Account'}</div>
                                <div className="gc-user-sub">{(k.profile?.role || 'Owner')} • {k.error ? 'Kitchen error' : kitchenLabel}</div>
                              </div>
                            </div>
                          </div>

                          <button
                            className="gc-actions-item"
                            type="button"
                            onClick={() => {
                              setDark((v) => !v)
                              closeMenu()
                            }}
                          >
                            {dark ? 'Light Mode' : 'Dark Mode'}
                          </button>

                          <div className="gc-menu-divider" role="separator" aria-hidden="true" />
                          
                          <button
                            className="gc-actions-item"
                            type="button"
                            onClick={async () => {
                              closeMenu()
                              await k.refresh().catch(() => {})
                            }}
                          >
                            Refresh kitchen
                          </button>

                          <div className="gc-menu-divider" role="separator" aria-hidden="true" />

                          <button
                            className="gc-actions-item gc-actions-danger"
                            type="button"
                            onClick={async () => {
                              closeMenu()
                              await handleLogout()
                            }}
                            disabled={loggingOut}
                            aria-disabled={loggingOut}
                          >
                            {loggingOut ? 'Logging out…' : 'Log out'}
                          </button>
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

      {/* إضافة CSS صغير فقط للـ mobile menu toggle */}
      <style>{`
        @media (max-width: 768px) {
          .gc-mobile-menu-toggle {
            display: flex !important;
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 48px;
            height: 48px;
            border-radius: 24px;
            background: var(--gc-accent);
            color: white;
            border: none;
            box-shadow: var(--gc-shadow);
            cursor: pointer;
            align-items: center;
            justify-content: center;
            z-index: 60;
          }
          .gc-side {
            transform: translateX(-100%);
            transition: transform 0.3s ease;
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

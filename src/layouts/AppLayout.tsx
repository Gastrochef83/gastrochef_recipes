// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import CommandPalette, { type CommandItem } from '../components/CommandPalette'
import { motion, AnimatePresence } from 'framer-motion'

// استيراد أنماط التصميم
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

  const navItems = [
    { 
      to: '/dashboard', 
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', 
      label: 'Dashboard',
      emoji: '📊'
    },
    { 
      to: '/ingredients', 
      icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 7a4 4 0 100-8 4 4 0 000 8z', 
      label: 'Ingredients',
      emoji: '🥗'
    },
    { 
      to: '/recipes', 
      icon: 'M4 7h16M4 12h16M4 17h10', 
      label: 'Recipes',
      emoji: '📝'
    },
    { 
      to: '/settings', 
      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', 
      label: 'Settings',
      emoji: '⚙️'
    }
  ]

  return (
    <>
      <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
        <div className="gc-shell">
          {/* Mobile Menu Toggle */}
          <motion.button
            className="gc-mobile-menu-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              zIndex: 60,
              display: 'none',
              width: '48px',
              height: '48px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, var(--gc-brand-olive) 0%, var(--gc-brand-teal) 100%)',
              color: 'white',
              border: 'none',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </motion.button>

          {/* Sidebar */}
          <aside className={cx('gc-side', isSidebarOpen && 'is-open')} style={{
            width: '260px',
            background: 'white',
            borderRight: '1px solid var(--gc-border)',
            boxShadow: '4px 0 20px rgba(0,0,0,0.02)',
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            overflowY: 'auto',
            zIndex: 50,
            transition: 'transform 0.3s ease'
          }}>
            <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Brand */}
              <motion.div 
                className="gc-brand"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, var(--gc-brand-olive) 0%, var(--gc-brand-teal) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  boxShadow: '0 6px 12px rgba(107,127,59,0.2)'
                }}>
                  <img
                    src={brandLogo}
                    alt=""
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = brandFallback
                    }}
                    style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                  />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--gc-text)' }}>
                    Gastro<span style={{ color: 'var(--gc-brand-olive)' }}>Chef</span>
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--gc-muted)', marginTop: '2px' }}>{kitchenLabel}</p>
                </div>
              </motion.div>

              {/* Mode Switch */}
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                style={{ marginBottom: '24px' }}
              >
                <div className="gc-label" style={{ fontSize: '10px', marginBottom: '8px' }}>MODE</div>
                <div className={cx('gc-mode-switch', isKitchen ? 'is-kitchen' : 'is-mgmt')} style={{
                  display: 'flex',
                  gap: '4px',
                  padding: '4px',
                  background: 'var(--gc-bg)',
                  borderRadius: '30px',
                  border: '1px solid var(--gc-border)',
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '4px',
                    bottom: '4px',
                    left: isKitchen ? '4px' : 'calc(50% + 2px)',
                    width: 'calc(50% - 4px)',
                    background: 'white',
                    borderRadius: '26px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    transition: 'left 0.2s ease'
                  }} />
                  <button
                    className={cx('gc-mode-seg', isKitchen && 'is-active')}
                    type="button"
                    onClick={() => setMode('kitchen')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '26px',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isKitchen ? 'var(--gc-brand-olive)' : 'var(--gc-muted)',
                      cursor: 'pointer',
                      position: 'relative',
                      zIndex: 1,
                      transition: 'color 0.2s ease'
                    }}
                  >
                    Kitchen
                  </button>
                  <button
                    className={cx('gc-mode-seg', isMgmt && 'is-active')}
                    type="button"
                    onClick={() => setMode('mgmt')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '26px',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: isMgmt ? 'var(--gc-brand-olive)' : 'var(--gc-muted)',
                      cursor: 'pointer',
                      position: 'relative',
                      zIndex: 1,
                      transition: 'color 0.2s ease'
                    }}
                  >
                    Mgmt
                  </button>
                </div>
                <p className="gc-hint" style={{ fontSize: '11px', marginTop: '6px', color: 'var(--gc-muted)' }}>
                  {isKitchen ? 'Kitchen mode is active.' : 'Mgmt mode is active.'}
                </p>
              </motion.div>

              {/* Navigation */}
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                style={{ flex: 1 }}
              >
                <div className="gc-label" style={{ fontSize: '10px', marginBottom: '8px' }}>NAVIGATION</div>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {navItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        color: isActive ? 'var(--gc-brand-olive)' : 'var(--gc-text)',
                        background: isActive ? 'rgba(107,127,59,0.08)' : 'transparent',
                        transition: 'all 0.2s ease'
                      })}
                    >
                      <span style={{ fontSize: '18px' }}>{item.emoji}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </nav>

                <div className="gc-tip" style={{
                  fontSize: '11px',
                  padding: '12px',
                  background: 'var(--gc-bg)',
                  borderRadius: '12px',
                  color: 'var(--gc-muted)',
                  borderLeft: '3px solid var(--gc-brand-olive)',
                  marginTop: '24px'
                }}>
                  Tip: Kitchen for cooking · Mgmt for costing & pricing.
                </div>
              </motion.div>

              {/* Logout Button */}
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                style={{ marginTop: '20px' }}
              >
                <motion.button
                  className="gc-btn gc-btn-danger"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    border: 'none',
                    background: loggingOut ? 'var(--gc-muted)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: loggingOut ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: loggingOut ? 0.7 : 1
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
                </motion.button>
              </motion.div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="gc-main" style={{
            flex: 1,
            marginLeft: '260px',
            minHeight: '100vh',
            background: 'var(--gc-bg)'
          }}>
            {/* Topbar */}
            <div className="gc-topbar" style={{
              position: 'sticky',
              top: 0,
              zIndex: 40,
              background: 'rgba(255,255,255,0.8)',
              backdropFilter: 'blur(10px)',
              borderBottom: '1px solid var(--gc-border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
              <div className="gc-topbar-pill" style={{
                height: '64px',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div className="gc-topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <img
                    className="gc-topbar-logo"
                    src={brandLogo}
                    alt="GastroChef"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = brandFallback
                    }}
                    style={{ height: '32px', width: 'auto' }}
                  />
                  <div className="gc-topbar-kitchen" style={{
                    padding: '4px 12px',
                    background: 'var(--gc-bg)',
                    borderRadius: '30px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--gc-text)',
                    border: '1px solid var(--gc-border)'
                  }}>
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
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: a.status === 'error' ? '#ef4444' : a.status === 'saving' ? '#f59e0b' : '#10b981',
                      boxShadow: a.status === 'error' ? '0 0 0 3px rgba(239,68,68,0.1)' : 
                                 a.status === 'saving' ? '0 0 0 3px rgba(245,158,11,0.1)' : 
                                 '0 0 0 3px rgba(16,185,129,0.1)'
                    }}
                  />
                  <span className="gc-sr-only">{title}</span>
                </div>

                <div className="gc-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Autosave Indicator */}
                  <motion.div
                    className={cx(
                      'gc-autosave',
                      a.status === 'saving' && 'is-saving',
                      a.status === 'saved' && 'is-saved',
                      a.status === 'error' && 'is-error'
                    )}
                    animate={{
                      scale: a.status === 'saving' ? [1, 1.05, 1] : 1,
                    }}
                    transition={{
                      duration: 1,
                      repeat: a.status === 'saving' ? Infinity : 0,
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      borderRadius: '30px',
                      background: a.status === 'saved' ? 'rgba(16,185,129,0.1)' : 
                                  a.status === 'saving' ? 'rgba(245,158,11,0.1)' : 
                                  a.status === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--gc-bg)',
                      border: '1px solid',
                      borderColor: a.status === 'saved' ? 'rgba(16,185,129,0.3)' : 
                                   a.status === 'saving' ? 'rgba(245,158,11,0.3)' : 
                                   a.status === 'error' ? 'rgba(239,68,68,0.3)' : 'var(--gc-border)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: a.status === 'saved' ? '#10b981' : 
                             a.status === 'saving' ? '#f59e0b' : 
                             a.status === 'error' ? '#ef4444' : 'var(--gc-muted)',
                    }}
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
                    <span className="gc-autosave-icon" style={{ fontSize: '14px' }}>
                      {a.status === 'saving' ? '⏳' : a.status === 'error' ? '⚠️' : '✓'}
                    </span>
                    <span>
                      {a.status === 'saving'
                        ? 'Saving...'
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
                    whileHover={{ scale: 1.05, backgroundColor: 'rgba(107,127,59,0.1)' }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '30px',
                      border: '1px solid var(--gc-border)',
                      background: 'white',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--gc-text)',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                  >
                    <span style={{ 
                      background: 'linear-gradient(135deg, var(--gc-brand-olive) 0%, var(--gc-brand-teal) 100%)', 
                      color: 'white', 
                      padding: '2px 6px', 
                      borderRadius: '6px', 
                      fontSize: '10px',
                      fontWeight: 700
                    }}>⌘</span>
                    <span>K</span>
                  </motion.button>

                  {/* User Menu */}
                  <details ref={menuRef} className="gc-actions-menu gc-user-menu">
                    <summary className="gc-actions-trigger gc-user-trigger gc-user-trigger-btn" style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      padding: '4px 4px 4px 8px',
                      borderRadius: '30px',
                      border: '1px solid var(--gc-border)',
                      background: 'white',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      listStyle: 'none'
                    }}>
                      <span className="gc-avatar" style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, var(--gc-brand-olive) 0%, var(--gc-brand-teal) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '12px'
                      }}>
                        {avatarText}
                      </span>
                      <span className="gc-user-mini" style={{ fontSize: '10px', color: 'var(--gc-muted)' }}>▼</span>
                    </summary>

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
                            width: '260px',
                            background: 'white',
                            borderRadius: '16px',
                            border: '1px solid var(--gc-border)',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                            overflow: 'hidden',
                            zIndex: 1000
                          }}
                        >
                          {/* User Header */}
                          <div style={{
                            padding: '16px',
                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                            borderBottom: '1px solid var(--gc-border)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '20px',
                                background: 'linear-gradient(135deg, var(--gc-brand-olive) 0%, var(--gc-brand-teal) 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '14px'
                              }}>
                                {avatarText}
                              </span>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{userEmail ? userEmail.split('@')[0] : 'Account'}</div>
                                <div style={{ fontSize: '12px', color: 'var(--gc-muted)' }}>{k.profile?.role || 'Owner'}</div>
                              </div>
                            </div>
                          </div>

                          {/* Menu Items */}
                          <div style={{ padding: '8px' }}>
                            <motion.button
                              className="gc-actions-item"
                              type="button"
                              onClick={() => {
                                setDark((v) => !v)
                                closeMenu()
                              }}
                              whileHover={{ x: 4 }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--gc-text)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              <span style={{ fontSize: '16px' }}>{dark ? '☀️' : '🌙'}</span>
                              {dark ? 'Light Mode' : 'Dark Mode'}
                            </motion.button>

                            <div style={{ height: '1px', background: 'var(--gc-border)', margin: '4px 0' }} />

                            <motion.button
                              className="gc-actions-item"
                              type="button"
                              onClick={async () => {
                                closeMenu()
                                await k.refresh().catch(() => {})
                              }}
                              whileHover={{ x: 4 }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--gc-text)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}
                            >
                              <span style={{ fontSize: '16px' }}>🔄</span>
                              Refresh kitchen
                            </motion.button>

                            <div style={{ height: '1px', background: 'var(--gc-border)', margin: '4px 0' }} />

                            <motion.button
                              className="gc-actions-item gc-actions-danger"
                              type="button"
                              onClick={async () => {
                                closeMenu()
                                await handleLogout()
                              }}
                              disabled={loggingOut}
                              whileHover={{ x: 4 }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: loggingOut ? 'var(--gc-muted)' : '#ef4444',
                                cursor: loggingOut ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                opacity: loggingOut ? 0.7 : 1
                              }}
                            >
                              <span style={{ fontSize: '16px' }}>🚪</span>
                              {loggingOut ? 'Logging out...' : 'Log out'}
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </details>
                </div>
              </div>
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} />

            <div className="gc-content" style={{ padding: '24px' }}>
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
          }
          .gc-side.is-open {
            transform: translateX(0);
          }
          .gc-main {
            margin-left: 0 !important;
          }
        }
        
        @media (max-width: 640px) {
          .gc-topbar-pill {
            padding: 0 16px !important;
          }
          .gc-topbar-kitchen {
            display: none !important;
          }
          .gc-autosave span:not(.gc-autosave-icon) {
            display: none !important;
          }
          .gc-autosave {
            padding: 4px 8px !important;
          }
        }
      `}</style>
    </>
  )
}

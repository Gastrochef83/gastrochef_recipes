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

function AppLayoutStyles() {
  return (
    <style>{`
      /* ===== CSS Variables - باستخدام المتغيرات الأصلية ===== */
      .gc-root {
        --gc-soft: #7A857F;
        --gc-muted: #5F6B66;
        --gc-text: #1F2326;
        --gc-bg: #F5F7FA;
        --gc-card-bg: #FFFFFF;
        --gc-border: rgba(11,18,32,.08);
        --gc-shadow: 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      }

      @media (prefers-color-scheme: dark) {
        .gc-root {
          --gc-soft: #9AA8B9;
          --gc-muted: #7F8C8D;
          --gc-text: #F1F5F9;
          --gc-bg: #1E293B;
          --gc-card-bg: #334155;
          --gc-border: #475569;
        }
      }

      .gc-root {
        min-height: 100vh;
        background: var(--gc-bg);
        color: var(--gc-text);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .gc-shell {
        display: flex;
        min-height: 100vh;
      }

      /* ===== Sidebar ===== */
      .gc-side {
        width: 280px;
        background: var(--gc-card-bg);
        border-right: 1px solid var(--gc-border);
        box-shadow: var(--gc-shadow);
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        overflow-y: auto;
        z-index: 50;
        transition: transform 0.3s ease;
      }

      .gc-side-card {
        padding: 1.5rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .gc-brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0 0.5rem;
      }

      .gc-brand-mark {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 0.75rem;
        background: linear-gradient(135deg, #748d3f, #97ab62);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .gc-brand-mark img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .gc-brand-name {
        font-size: 1.25rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--gc-text);
      }

      .gc-brand-accent {
        color: #748d3f;
      }

      .gc-brand-sub {
        font-size: 0.75rem;
        color: var(--gc-soft);
        margin-top: 0.125rem;
      }

      .gc-side-block {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .gc-label {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--gc-soft);
        padding: 0 0.5rem;
      }

      .gc-mode-switch {
        display: flex;
        gap: 0.25rem;
        padding: 0.25rem;
        background: var(--gc-bg);
        border-radius: 9999px;
        border: 1px solid var(--gc-border);
      }

      .gc-mode-seg {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border-radius: 9999px;
        border: none;
        background: transparent;
        color: var(--gc-soft);
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      }

      .gc-mode-seg.is-active {
        background: white;
        color: #1F2326;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      .gc-hint {
        font-size: 0.75rem;
        color: var(--gc-soft);
        padding: 0 0.5rem;
        line-height: 1.5;
      }

      .gc-nav {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .gc-nav-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 1rem;
        border-radius: 0.75rem;
        color: var(--gc-soft);
        font-weight: 600;
        text-decoration: none;
        transition: all 0.2s ease;
      }

      .gc-nav-item:hover {
        background: var(--gc-bg);
        color: #748d3f;
        transform: translateX(4px);
      }

      .gc-nav-item.is-active {
        background: rgba(116, 141, 63, 0.1);
        color: #748d3f;
        font-weight: 700;
      }

      .gc-tip {
        font-size: 0.75rem;
        padding: 0.75rem 1rem;
        background: var(--gc-bg);
        border-radius: 0.75rem;
        color: var(--gc-soft);
        border-left: 3px solid #748d3f;
        line-height: 1.5;
      }

      .gc-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.625rem 1rem;
        border-radius: 0.75rem;
        font-weight: 600;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        width: 100%;
      }

      .gc-btn-danger {
        background: #dc2626;
        color: white;
      }

      .gc-btn-danger:hover:not(:disabled) {
        background: #b91c1c;
        transform: translateY(-1px);
        box-shadow: 0 4px 6px -2px rgba(220, 38, 38, 0.3);
      }

      .gc-main {
        flex: 1;
        margin-left: 280px;
        min-height: 100vh;
        background: var(--gc-bg);
      }

      .gc-topbar {
        position: sticky;
        top: 0;
        z-index: 40;
        background: var(--gc-card-bg);
        border-bottom: 1px solid var(--gc-border);
        box-shadow: var(--gc-shadow);
      }

      .gc-topbar-pill {
        height: 64px;
        padding: 0 1.5rem;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 1rem;
      }

      .gc-topbar-left {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .gc-topbar-logo {
        height: 2rem;
        width: auto;
      }

      .gc-topbar-kitchen {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--gc-soft);
        padding: 0.25rem 0.75rem;
        background: var(--gc-bg);
        border-radius: 9999px;
        border: 1px solid var(--gc-border);
      }

      .gc-live-dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 9999px;
        background: #22c55e;
        box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
        animation: pulse 2s infinite;
      }

      .gc-live-dot.is-error {
        background: #ef4444;
        box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
      }

      .gc-live-dot.is-saving {
        background: #f59e0b;
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

      .gc-topbar-right {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .gc-autosave {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        background: var(--gc-bg);
        border: 1px solid var(--gc-border);
        font-size: 0.75rem;
        color: var(--gc-soft);
      }

      .gc-autosave.is-saving {
        background: rgba(245, 158, 11, 0.1);
        color: #f59e0b;
        border-color: #f59e0b;
      }

      .gc-autosave.is-saved {
        background: rgba(34, 197, 94, 0.1);
        color: #22c55e;
        border-color: #22c55e;
      }

      .gc-autosave.is-error {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        border-color: #ef4444;
      }

      .gc-autosave-icon {
        font-weight: 700;
        font-size: 1rem;
      }

      .gc-kbd-btn {
        padding: 0.375rem 0.75rem;
        border-radius: 0.5rem;
        border: 1px solid var(--gc-border);
        background: var(--gc-bg);
        color: var(--gc-soft);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .gc-kbd-btn:hover {
        background: var(--gc-card-bg);
        color: var(--gc-text);
        border-color: #748d3f;
      }

      .gc-user-menu {
        position: relative;
      }

      .gc-user-trigger {
        list-style: none;
      }

      .gc-user-trigger::-webkit-details-marker {
        display: none;
      }

      .gc-user-trigger-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem 0.25rem 0.25rem;
        border-radius: 9999px;
        border: 1px solid var(--gc-border);
        background: var(--gc-bg);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .gc-user-trigger-btn:hover {
        background: var(--gc-card-bg);
        border-color: #748d3f;
      }

      .gc-avatar {
        width: 2rem;
        height: 2rem;
        border-radius: 9999px;
        background: linear-gradient(135deg, #748d3f, #97ab62);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.875rem;
      }

      .gc-avatar--lg {
        width: 2.5rem;
        height: 2.5rem;
        font-size: 1rem;
      }

      .gc-user-mini {
        color: var(--gc-soft);
        font-size: 0.75rem;
      }

      .gc-actions-panel {
        position: absolute;
        top: calc(100% + 0.5rem);
        right: 0;
        width: 280px;
        background: var(--gc-card-bg);
        border-radius: 1rem;
        border: 1px solid var(--gc-border);
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        z-index: 100;
        animation: slideDown 0.2s ease-out;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-0.5rem);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .gc-user-header {
        padding: 1rem;
        background: var(--gc-bg);
        border-bottom: 1px solid var(--gc-border);
      }

      .gc-user-header-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .gc-user-meta {
        flex: 1;
        min-width: 0;
      }

      .gc-user-name {
        font-weight: 700;
        color: var(--gc-text);
        margin-bottom: 0.125rem;
      }

      .gc-user-sub {
        font-size: 0.75rem;
        color: var(--gc-soft);
      }

      .gc-actions-item {
        width: 100%;
        padding: 0.75rem 1rem;
        text-align: left;
        background: none;
        border: none;
        color: var(--gc-text);
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .gc-actions-item:hover {
        background: var(--gc-bg);
        color: #748d3f;
        padding-left: 1.5rem;
      }

      .gc-actions-danger {
        color: #ef4444;
        font-weight: 600;
      }

      .gc-actions-danger:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #dc2626;
      }

      .gc-menu-divider {
        height: 1px;
        background: var(--gc-border);
        margin: 0.25rem 0;
      }

      .gc-content {
        padding: 1.5rem;
      }

      .gc-page {
        max-width: 1600px;
        margin: 0 auto;
      }

      @media (max-width: 1024px) {
        .gc-side {
          width: 80px;
        }

        .gc-main {
          margin-left: 80px;
        }

        .gc-brand-name,
        .gc-brand-sub,
        .gc-label,
        .gc-nav-item span,
        .gc-tip,
        .gc-btn span {
          display: none;
        }

        .gc-nav-item {
          justify-content: center;
          padding: 0.75rem;
        }

        .gc-mode-switch {
          flex-direction: column;
        }

        .gc-mode-seg {
          padding: 0.5rem;
        }
      }

      @media (max-width: 768px) {
        .gc-side {
          transform: translateX(-100%);
        }

        .gc-side.is-open {
          transform: translateX(0);
        }

        .gc-main {
          margin-left: 0;
        }

        .gc-topbar-pill {
          padding: 0 1rem;
        }

        .gc-topbar-kitchen {
          display: none;
        }

        .gc-content {
          padding: 1rem;
        }

        .gc-mobile-menu-toggle {
          display: flex !important;
        }
      }

      @media (max-width: 480px) {
        .gc-autosave span:not(.gc-autosave-icon) {
          display: none;
        }

        .gc-autosave {
          padding: 0.25rem;
        }

        .gc-kbd-btn span {
          display: none;
        }
      }

      @media print {
        .gc-side,
        .gc-topbar {
          display: none !important;
        }

        .gc-main {
          margin-left: 0;
        }

        .gc-content {
          padding: 0;
        }
      }

      .gc-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
    `}</style>
  )
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
      <AppLayoutStyles />

      <div className={cx('gc-root', dark && 'gc-dark')}>
        <div className="gc-shell">
          {/* Mobile Menu Toggle */}
          <button
            className="gc-mobile-menu-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{
              position: 'fixed',
              bottom: '1rem',
              right: '1rem',
              zIndex: 60,
              display: 'none',
              width: '3rem',
              height: '3rem',
              borderRadius: '9999px',
              background: '#748d3f',
              color: 'white',
              border: 'none',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
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
          </button>

          <aside className={cx('gc-side', isSidebarOpen && 'is-open')}>
            <div className="gc-side-card">
              <motion.div 
                className="gc-brand"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
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
              </motion.div>

              <motion.div 
                className="gc-side-block"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <div className="gc-label">MODE</div>
                <div className="gc-mode-switch" role="tablist" aria-label="Mode">
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
              </motion.div>

              <motion.div 
                className="gc-side-block"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <div className="gc-label">NAVIGATION</div>

                <nav className="gc-nav">
                  <NavLink to="/dashboard" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="9" />
                      <rect x="14" y="3" width="7" height="5" />
                      <rect x="14" y="12" width="7" height="9" />
                      <rect x="3" y="16" width="7" height="5" />
                    </svg>
                    <span>Dashboard</span>
                  </NavLink>
                  <NavLink to="/ingredients" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>Ingredients</span>
                  </NavLink>
                  <NavLink to="/recipes" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16M4 12h16M4 17h10" />
                    </svg>
                    <span>Recipes</span>
                  </NavLink>
                  <NavLink to="/settings" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H5.78a1.65 1.65 0 0 0-1.51 1 1.65 1.65 0 0 0 .33 1.82l.04.04A10 10 0 0 0 12 18a10 10 0 0 0 6.36-2.22l.04-.04z" />
                    </svg>
                    <span>Settings</span>
                  </NavLink>
                </nav>

                <div className="gc-tip">Tip: Kitchen for cooking · Mgmt for costing & pricing.</div>
              </motion.div>

              <motion.div 
                className="gc-side-block"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
              >
                <button
                  className="gc-btn gc-btn-danger"
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  aria-disabled={loggingOut}
                  title="Sign out"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
                </button>
              </motion.div>
            </div>
          </aside>

          <main className="gc-main">
            <div className="gc-topbar" aria-label="Top bar">
              <div className="gc-topbar-pill">
                <div className="gc-topbar-left">
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
                    aria-hidden="true"
                  />
                  <span className="gc-sr-only">{title}</span>
                </div>

                <div className="gc-topbar-spacer" aria-hidden="true" />

                <div className="gc-topbar-right">
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

                  <motion.button
                    type="button"
                    className="gc-kbd-btn"
                    aria-label="Command palette"
                    title="Quick actions (Ctrl/⌘ + K)"
                    onClick={() => setPaletteOpen(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span aria-hidden="true">⌘K</span>
                  </motion.button>

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
                            {dark ? '☀️ Light Mode' : '🌙 Dark Mode'}
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
                            🔄 Refresh kitchen
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
                            🚪 {loggingOut ? 'Logging out…' : 'Log out'}
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
    </>
  )
}

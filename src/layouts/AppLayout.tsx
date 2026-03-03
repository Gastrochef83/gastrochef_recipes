// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
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
    // mode UI
    localStorage.removeItem('gc-mode')
    // cost cache in Recipes page
    localStorage.removeItem('gc_v5_cost_cache_v1')
    // kitchen profile cache
    clearKitchenCache()
    // keep other app localStorage keys unless known safe
    sessionStorage.clear()
  } catch {
    // ignore
  }
}

export default function AppLayout() {
  const nav = useNavigate()
  const loc = useLocation()
  const mode = useMode()
  const k = useKitchen()
  const a = useAutosave()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const menuRef = useRef<HTMLDetailsElement | null>(null)

  const userEmail = supabase.auth.getUser ? undefined : undefined
  // NOTE: keep existing behavior - we read from supabase session below (no logic changes)

  const sessionEmail = useMemo(() => {
    try {
      // @ts-expect-error - supabase client shape
      const s = (supabase as any)?.auth?.getSession ? (supabase as any).auth.getSession() : null
      return s
    } catch {
      return null
    }
  }, [])

  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // @ts-expect-error - supabase client shape
        const { data } = await (supabase as any).auth.getUser()
        if (!alive) return
        setEmail(data?.user?.email || '')
      } catch {
        if (!alive) return
        setEmail('')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const d = menuRef.current
      if (!d || !d.open) return
      const t = e.target as HTMLElement | null
      if (!t) return
      if (d.contains(t)) return
      d.open = false
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    // close user menu on route change
    if (menuRef.current?.open) menuRef.current.open = false
  }, [loc.pathname])

  const brandLogo = '/brand/gastrochef-logo.svg'
  const brandFallback = '/brand/gastrochef-mark.svg'

  const kitchenLabel = k.profile?.name || 'Kitchen'
  const title = useMemo(() => {
    const p = loc.pathname || ''
    if (p.includes('/dashboard')) return 'Dashboard'
    if (p.includes('/recipes')) return 'Recipes'
    if (p.includes('/ingredients')) return 'Ingredients'
    if (p.includes('/vendors')) return 'Vendors'
    if (p.includes('/settings')) return 'Settings'
    if (p.includes('/print')) return 'Print'
    return 'GastroChef'
  }, [loc.pathname])

  const avatarText = initialsFrom(email || kitchenLabel || 'GC')

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: 'go-dashboard',
        title: 'Go to Dashboard',
        keywords: 'home overview',
        onRun: () => nav('/dashboard'),
      },
      {
        id: 'go-recipes',
        title: 'Go to Recipes',
        keywords: 'recipes list',
        onRun: () => nav('/recipes'),
      },
      {
        id: 'go-ingredients',
        title: 'Go to Ingredients',
        keywords: 'ingredients list',
        onRun: () => nav('/ingredients'),
      },
      {
        id: 'go-settings',
        title: 'Go to Settings',
        keywords: 'settings preferences',
        onRun: () => nav('/settings'),
      },
      {
        id: 'toggle-mode',
        title: mode.mode === 'kitchen' ? 'Switch to Management mode' : 'Switch to Kitchen mode',
        keywords: 'mode kitchen management',
        onRun: () => mode.setMode(mode.mode === 'kitchen' ? 'management' : 'kitchen'),
      },
      {
        id: 'clear-caches',
        title: 'Clear app cache',
        keywords: 'cache reset',
        onRun: () => {
          clearAppCaches()
          window.location.reload()
        },
      },
    ],
    [nav, mode]
  )

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      // @ts-expect-error - supabase client shape
      await (supabase as any).auth.signOut()
      nav('/login')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="gc-shell">
      <div className="gc-shell-grid">
        <aside className="gc-side" aria-label="Sidebar">
          <div className="gc-side-inner">
            <div className="gc-side-top">
              <div className="gc-brand-row">
                <img className="gc-brand-logo" src={brandLogo} alt="GastroChef" onError={(e) => ((e.currentTarget as HTMLImageElement).src = brandFallback)} />
                <div className="gc-brand-col">
                  <div className="gc-brand-name">GastroChef</div>
                  <div className="gc-brand-sub">Kitchen OS • Costing • Recipes</div>
                </div>
              </div>
            </div>

            <nav className="gc-nav" aria-label="Primary">
              <NavLink className="gc-nav-link" to="/dashboard">
                Dashboard
              </NavLink>
              <NavLink className="gc-nav-link" to="/recipes">
                Recipes
              </NavLink>
              <NavLink className="gc-nav-link" to="/ingredients">
                Ingredients
              </NavLink>
              <NavLink className="gc-nav-link" to="/vendors">
                Vendors
              </NavLink>
              <NavLink className="gc-nav-link" to="/settings">
                Settings
              </NavLink>
            </nav>

            <div className="gc-side-block">
              <div className="gc-side-card">
                <div className="gc-label">Mode</div>
                <div className="gc-mode-toggle" role="group" aria-label="Mode toggle">
                  <button
                    type="button"
                    className={cx('gc-mode-btn', mode.mode === 'kitchen' && 'is-active')}
                    onClick={() => mode.setMode('kitchen')}
                  >
                    Kitchen
                  </button>
                  <button
                    type="button"
                    className={cx('gc-mode-btn', mode.mode === 'management' && 'is-active')}
                    onClick={() => mode.setMode('management')}
                  >
                    Management
                  </button>
                </div>
                <div className="gc-hint">Switch views for costing & pricing.</div>
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
          </div>
        </aside>

        <main className="gc-main">
          <div className="gc-topbar" aria-label="Top bar">
            <div className="gc-topbar-pill" role="banner">
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
                {/* VISUAL DOMINANCE PASS — premium action cluster (UI only) */}
                <div className="gc-topbar-actions">
                  <div
                    className={cx('gc-autosave', a.status === 'saving' && 'is-saving', a.status === 'saved' && 'is-saved', a.status === 'error' && 'is-error')}
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
                    <span className="gc-autosave-text" aria-hidden="true">
                      {a.status === 'saving' ? 'Saving' : a.status === 'error' ? 'Issue' : 'Saved'}
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

                  <button
                    type="button"
                    className="gc-kbd-btn"
                    aria-label="Command palette"
                    title="Quick actions (Ctrl/⌘ + K)"
                    onClick={() => setPaletteOpen(true)}
                  >
                    <span aria-hidden="true">⌘K</span>
                  </button>

                  <details ref={menuRef} className="gc-actions-menu gc-user-menu">
                    <summary className="gc-actions-trigger gc-user-trigger gc-user-trigger-btn" aria-label="User menu">
                      <span className="gc-avatar" aria-hidden="true">
                        {avatarText}
                      </span>
                      <span className="gc-user-mini" aria-hidden="true">
                        ▾
                      </span>
                    </summary>

                    <div className="gc-actions-panel gc-user-panel" role="menu">
                      <div className="gc-user-header">
                        <div className="gc-user-header-row">
                          <span className="gc-avatar gc-avatar--lg" aria-hidden="true">
                            {avatarText}
                          </span>
                          <div className="gc-user-meta">
                            <div className="gc-user-name">{email ? email.split('@')[0] : 'Account'}</div>
                            <div className="gc-user-sub">
                              {(k.profile?.role || 'Owner')} • {k.error ? 'Kitchen error' : kitchenLabel}
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="gc-menu-item"
                        onClick={() => {
                          clearAppCaches()
                          window.location.reload()
                        }}
                      >
                        Clear cache
                      </button>

                      <button type="button" className="gc-menu-item gc-menu-item--danger" onClick={handleLogout} disabled={loggingOut}>
                        {loggingOut ? 'Logging out…' : 'Log out'}
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>

          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} />

          <div className="gc-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

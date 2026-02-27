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
  } catch {}
}

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()
  const k = useKitchen()
  const a = useAutosave()

  const navigate = useNavigate()

  const loc = useLocation()

  // HashRouter-safe print detection
  // - In HashRouter, loc.pathname is often '/', and the real route is in loc.hash.
  const isPrintRoute = useMemo(() => {
    const path = (loc.pathname || '').toLowerCase()
    const hash = (loc.hash || '').toLowerCase()
    return path.includes('/print') || hash.includes('#/print') || hash.includes('/print')
  }, [loc.pathname, loc.hash])

  const [dark, setDark] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')

  const menuRef = useRef<HTMLDetailsElement | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Command palette can be opened from anywhere via Ctrl/⌘+K (see CommandPalette)
  useEffect(() => {
    const fn = () => setPaletteOpen(true)
    window.addEventListener('gc:open-command-palette', fn as any)
    return () => window.removeEventListener('gc:open-command-palette', fn as any)
  }, [])

  const base = (import.meta as any).env?.BASE_URL || '/'
  // ✅ BRAND LOCK: use the SAME logo asset everywhere (login/sidebar/topbar)
  const brandLogo = `${base}gastrochef-logo.png`
  const brandFallback = `${base}gastrochef-icon-512.png`

  // Always keep user email in sync (login/logout/switch)
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

  const commands: CommandItem[] = useMemo(
    () => [
      { id: 'go-dashboard', label: 'Go to Dashboard', kbd: 'G D', run: () => navigate('/dashboard') },
      { id: 'go-recipes', label: 'Go to Recipes', kbd: 'G R', run: () => navigate('/recipes') },
      { id: 'go-ingredients', label: 'Go to Ingredients', kbd: 'G I', run: () => navigate('/ingredients') },
      { id: 'go-recipe', label: 'Open Recipe Editor', kbd: 'G E', run: () => navigate('/recipe') },
      { id: 'go-cook', label: 'Open Cook Mode', kbd: 'G C', run: () => navigate('/cook') },
      { id: 'go-print', label: 'Open Print', kbd: 'G P', run: () => navigate('/print') },
      { id: 'go-settings', label: 'Go to Settings', kbd: 'G S', run: () => navigate('/settings') },
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
    [navigate, dark, k, handleLogout]
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

  // Print route: minimal layout only
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
                          <div className="gc-user-name">{userEmail ? userEmail.split('@')[0] : 'Account'}</div>
                          <div className="gc-user-sub">{(k.profile?.role || 'Owner')} • {k.error ? 'Kitchen error' : kitchenLabel}</div>
                        </div>
                      </div>
                      {/* Billion UI: keep email out of the always-visible menu header (reduces clutter) */}
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
                  </div>
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
  )
}

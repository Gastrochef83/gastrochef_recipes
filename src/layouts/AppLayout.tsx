// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'

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
      <div className="gc-shell" style={{ gridTemplateColumns: 'clamp(220px, 16vw, 260px) minmax(0, 1fr)' }}>
        <aside className="gc-side">
          <div className="gc-side-card">
            <div className="gc-brand gc-brand--text">
<div>
                <div className="gc-brand-name">
                  Gastro<span className="gc-brand-accent">Chef</span>
                </div>
                <div className="gc-brand-sub">{kitchenLabel}</div>
              </div>
            </div>

            <div className="gc-side-block" style={{ marginTop: 14 }}>
              <div className="gc-label">MODE</div>
              <div className="gc-seg">
                <button className={cx('gc-seg-btn', isKitchen && 'is-active')} type="button" onClick={() => setMode('kitchen')}>
                  Kitchen
                </button>
                <button className={cx('gc-seg-btn', isMgmt && 'is-active')} type="button" onClick={() => setMode('mgmt')}>
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
                className="gc-btn gc-btn-danger w-full"
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
          <div className="gc-topbar gc-topbar-card">
            <div className="gc-topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img
                className="gc-topbar-logo"
                src={brandLogo}
                alt="GastroChef"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = brandFallback
                }}
              />
              <div>
                <div className="gc-title">{title}</div>
                <div className="gc-subtitle">{k.error ? `Kitchen error: ${k.error}` : kitchenLabel}</div>
              </div>
            </div>

            $1
              <button
                type="button"
                className="gc-icon-btn"
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={dark ? 'Light Mode' : 'Dark Mode'}
                onClick={() => setDark((v) => !v)}
              >
                {dark ? '☀' : '☾'}
              </button>
<details ref={menuRef} className="gc-actions-menu">
                <summary className="gc-actions-trigger gc-user-trigger gc-user-trigger-btn" aria-label="User menu">
                  <span className="gc-avatar" aria-hidden="true">
                    {avatarText}
                  </span>
                  <span className="gc-user-label">
                    <span className="gc-user-name">{k.profile?.role ? `Role: ${k.profile.role}` : 'Account'}</span>
                    <span className="gc-user-email">{userEmail || 'Signed in'}</span>
                  </span>
                </summary>

                <div className="gc-actions-panel gc-user-panel" role="menu">
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

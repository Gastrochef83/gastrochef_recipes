// src/layouts/AppLayout.tsx
// ✅ UI polish + logout hard-redirect (HashRouter-safe)
// ✅ No business-logic change to recipes/ingredients/costing

import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()

  const loc = useLocation()

  const [dark, setDark] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Use Vite BASE_URL so the brand icon works in all deployments (root, subpath, HashRouter)
  const base = (import.meta as any).env?.BASE_URL || '/'
  const brandIcon = `${base}gastrochef-icon-512.png`
  const brandLogoFallback = `${base}gastrochef-logo.png`

  const title = useMemo(() => {
    const p = (loc.pathname || '').toLowerCase()

    if (p.includes('ingredients')) return 'Ingredients'
    if (p.includes('recipes')) return 'Recipes'
    if (p.includes('recipe')) return 'Recipe Editor'
    if (p.includes('settings')) return 'Settings'
    if (p.includes('cook')) return 'Cook Mode'

    return 'Dashboard'
  }, [loc.pathname])

  /* ======================================================
     LOG OUT (REAL SIGN OUT) — robust + HashRouter safe
     - avoids "bounce back to dashboard" by forcing a reload
     ====================================================== */
  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)

    try {
      // ✅ end Supabase session (server + client)
      await supabase.auth.signOut()
    } catch {
      // ignore — we still want to move the user to login
    }

    try {
      // ✅ reset ONLY local UI state
      localStorage.removeItem('gc-mode')
      localStorage.removeItem('kitchen_id')
      sessionStorage.clear()

      // default mode (so UI doesn't keep kitchen state)
      setMode('mgmt')
    } finally {
      // ✅ Hard redirect (prevents router state glitches / cached outlet)
      // HashRouter friendly: BASE_URL + "#/login"
      window.location.assign(`${base}#/login`)
    }
  }

  return (
    <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
      <div className="gc-shell">
        {/* Sidebar */}
        <aside className="gc-side">
          <div className="gc-side-card">
            <div className="gc-brand">
              <div className="gc-brand-mark" aria-hidden="true">
                <img
                  src={brandIcon}
                  alt=""
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).src = brandLogoFallback
                  }}
                />
              </div>

              <div>
                <div className="gc-brand-name">
                  Gastro<span className="gc-brand-accent">Chef</span>
                </div>
                <div className="gc-brand-sub">v4 MVP</div>
              </div>
            </div>

            {/* MODE */}
            <div className="gc-side-block">
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

            {/* NAV */}
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
          </div>
        </aside>

        {/* Main */}
        <main className="gc-main">
          <div className="gc-topbar">
            <div className="gc-topbar-brand">
              <img
                className="gc-topbar-logo"
                src={brandIcon}
                alt="GastroChef"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = brandLogoFallback
                }}
              />
              <div>
                <div className="gc-title">{title}</div>
                {/* ✅ Removed "Premium UI …" marketing subtitle */}
                <div className="gc-subtitle">GastroChef</div>
              </div>
            </div>

            <div className="gc-topbar-actions">
              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setDark((v) => !v)}>
                {dark ? 'Light Mode' : 'Dark Mode'}
              </button>

              <button
                className="gc-btn gc-btn-ghost"
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                aria-disabled={loggingOut}
              >
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          </div>

          <div className="gc-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

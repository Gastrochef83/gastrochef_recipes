// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()
  const loc = useLocation()
  const nav = useNavigate()

  const [dark, setDark] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const title = useMemo(() => {
    const p = (loc.pathname || '').toLowerCase()
    if (p.includes('ingredients')) return 'Ingredients'
    if (p.includes('recipes')) return 'Recipes'
    if (p.includes('recipe')) return 'Recipe Editor'
    if (p.includes('settings')) return 'Settings'
    return 'Dashboard'
  }, [loc.pathname])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)

    try {
      // ✅ real logout (Supabase session cleared)
      await supabase.auth.signOut()

      // ✅ go to home (or your login page if you add it later)
      nav('/', { replace: true })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
      <div className="gc-shell">
        {/* Sidebar */}
        <aside className="gc-side">
          <div className="gc-side-card">
            <div className="gc-brand">
              <div className="gc-brand-name">GastroChef</div>
              <div className="gc-brand-sub">v4 MVP</div>
            </div>

            {/* Mode Toggle */}
            <div className="gc-side-block">
              <div className="gc-label">MODE</div>
              <div className="gc-seg mt-2">
                <button
                  type="button"
                  className={cx('gc-seg-btn', isKitchen && 'is-active')}
                  onClick={() => setMode('kitchen')}
                >
                  Kitchen
                </button>
                <button
                  type="button"
                  className={cx('gc-seg-btn', isMgmt && 'is-active')}
                  onClick={() => setMode('mgmt')}
                >
                  Mgmt
                </button>
              </div>
              <div className="gc-side-hint mt-2">
                {isKitchen ? 'Kitchen mode is active.' : 'Mgmt mode is active.'}
              </div>
            </div>

            {/* Nav */}
            <div className="gc-side-block">
              <div className="gc-label">NAVIGATION</div>

              <nav className="gc-nav mt-2">
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}
                >
                  Dashboard
                </NavLink>

                <NavLink
                  to="/ingredients"
                  className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}
                >
                  Ingredients
                </NavLink>

                <NavLink
                  to="/recipes"
                  className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}
                >
                  Recipes
                </NavLink>

                <NavLink
                  to="/settings"
                  className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}
                >
                  Settings
                </NavLink>
              </nav>

              <div className="gc-side-tip mt-3">
                Tip: Kitchen for cooking · Mgmt for costing & pricing.
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="gc-main">
          <div className="gc-topbar">
            <div>
              <div className="gc-top-title">{title}</div>
              <div className="gc-top-sub">Premium UI · GastroChef</div>
            </div>

            {/* Right actions */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setDark((v) => !v)}>
                {dark ? 'Light Mode' : 'Dark Mode'}
              </button>

              <button className="gc-btn" type="button" onClick={handleLogout} disabled={loggingOut}>
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

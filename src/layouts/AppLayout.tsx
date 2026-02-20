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
      try {
        await supabase.auth.signOut()
      } catch {
        // ignore
      }

      // keep existing behavior (local UI state reset only)
      localStorage.removeItem('gc-mode')
      localStorage.removeItem('kitchen_id')
      sessionStorage.clear()

      setMode('mgmt')
      nav('/login', { replace: true })
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
            {/* ✅ Wordmark Brand (UI only) */}
            <div
              className="gc-brand"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {/* small badge like Kitopi (no image) */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  border: '1px solid var(--gc-border)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.75))',
                  boxShadow: '0 10px 22px rgba(2,6,23,.08)',
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                }}
                aria-hidden="true"
              >
                {/* minimal mark: G */}
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 18,
                    letterSpacing: '-0.03em',
                    color: '#0f766e',
                    lineHeight: 1,
                    userSelect: 'none',
                  }}
                >
                  G
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                {/* Wordmark (prevents weird global CSS) */}
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.05,
                    color: 'var(--gc-text)',
                    display: 'inline-block',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Gastro<span style={{ color: '#0f766e' }}>Chef</span>
                </div>

                <div className="gc-brand-sub" style={{ opacity: 0.85 }}>
                  v4 MVP
                </div>
              </div>
            </div>

            {/* MODE */}
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

            {/* NAV */}
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

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setDark((v) => !v)}>
                {dark ? 'Light Mode' : 'Dark Mode'}
              </button>

              <button className="gc-btn" type="button" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? 'Signing out…' : 'Log out'}
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

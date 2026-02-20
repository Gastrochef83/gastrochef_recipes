// src/layouts/AppLayout.tsx

import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useMode } from '../lib/mode'

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

function getEffectivePathname(pathname: string, hash: string) {
  if (pathname && pathname !== '/') return pathname
  const h = (hash || '').trim()
  if (!h) return '/'
  const noHash = h.startsWith('#') ? h.slice(1) : h
  const withSlash = noHash.startsWith('/') ? noHash : `/${noHash}`
  return withSlash || '/'
}

function stripQuery(p: string) {
  return (p || '').split('?')[0] || ''
}

function routeTitle(pLower: string) {
  // ✅ order matters
  if (pLower.includes('/cook')) return 'Cook Mode'
  if (pLower.includes('/recipe')) return 'Recipe Editor'
  if (pLower.includes('/recipes')) return 'Recipes'
  if (pLower.includes('/ingredients')) return 'Ingredients'
  if (pLower.includes('/settings')) return 'Settings'
  if (pLower.includes('/dashboard')) return 'Dashboard'
  return 'Dashboard'
}

function breadcrumbItems(pathLower: string) {
  const items: Array<{ label: string; to: string }> = [{ label: 'Dashboard', to: '/dashboard' }]

  if (pathLower.includes('/ingredients')) items.push({ label: 'Ingredients', to: '/ingredients' })
  if (pathLower.includes('/recipes')) items.push({ label: 'Recipes', to: '/recipes' })
  if (pathLower.includes('/recipe')) items.push({ label: 'Recipe Editor', to: '/recipes' })
  if (pathLower.includes('/cook')) items.push({ label: 'Cook Mode', to: '/recipes' })
  if (pathLower.includes('/settings')) items.push({ label: 'Settings', to: '/settings' })

  const seen = new Set<string>()
  return items.filter((x) => {
    const k = `${x.label}:${x.to}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()

  const loc = useLocation()
  const nav = useNavigate()

  const [dark, setDark] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const effectivePath = useMemo(() => {
    const p = getEffectivePathname(loc.pathname || '/', loc.hash || '')
    return stripQuery(p)
  }, [loc.pathname, loc.hash])

  const title = useMemo(() => {
    const pLower = (effectivePath || '').toLowerCase()
    return routeTitle(pLower)
  }, [effectivePath])

  const crumbs = useMemo(() => {
    const pLower = (effectivePath || '').toLowerCase()
    return breadcrumbItems(pLower)
  }, [effectivePath])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      localStorage.removeItem('gc-mode')
      localStorage.removeItem('kitchen_id')
      sessionStorage.clear()
      setMode('mgmt')
      nav('/dashboard', { replace: true })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
      <div className="gc-shell">
        <aside className="gc-side">
          <div className="gc-side-card">
            <div className="gc-brand">
              <div className="gc-brand-name">GastroChef</div>
              <div className="gc-brand-sub">v4 MVP</div>
            </div>

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

            <div className="gc-side-block">
              <div className="gc-label">NAVIGATION</div>

              <nav className="gc-nav mt-2">
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

              <div className="gc-side-tip mt-3">
                Tip: Kitchen for cooking · Mgmt for costing & pricing.
              </div>
            </div>
          </div>
        </aside>

        <main className="gc-main">
          <div className="gc-topbar">
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                {crumbs.map((c, idx) => (
                  <div key={`${c.label}-${idx}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {idx === 0 ? null : <span style={{ opacity: 0.45, fontWeight: 900 }}>›</span>}
                    <NavLink
                      to={c.to}
                      style={{
                        textDecoration: 'none',
                        fontSize: 12,
                        fontWeight: 900,
                        color: 'rgba(100,116,139,.95)',
                      }}
                    >
                      {c.label}
                    </NavLink>
                  </div>
                ))}
              </div>

              <div className="gc-top-title">{title}</div>
              <div className="gc-top-sub">Premium UI · GastroChef</div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="gc-btn gc-btn-ghost" type="button" onClick={() => setDark((v) => !v)}>
                {dark ? 'Light Mode' : 'Dark Mode'}
              </button>

              <button className="gc-btn" type="button" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? 'Resetting...' : 'Log out'}
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

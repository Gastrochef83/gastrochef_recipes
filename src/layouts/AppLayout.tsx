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
    // ✅ keep consistent with ModeProvider
    localStorage.removeItem('gc-mode')
    // cost cache in Recipes page
    localStorage.removeItem('gc_v5_cost_cache_v1')
    // kitchen profile cache
    clearKitchenCache()
    sessionStorage.clear()
  } catch {}
}

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()
  const k = useKitchen()

  const loc = useLocation()
  const [dark, setDark] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const [userEmail, setUserEmail] = useState<string>('')

  const menuRef = useRef<HTMLDetailsElement | null>(null)

  const base = (import.meta as any).env?.BASE_URL || '/'
  const brandIcon = `${base}gastrochef-icon-512.png`
  const brandLogoFallback = `${base}gastrochef-logo.png`

  // ✅ keep user info always in sync (login/logout/account switch)
  useEffect(() => {
    let alive = true

    async function loadUser() {
      try {
        const { data } = await supabase.auth.getUser()
        const email = data?.user?.email || ''
        if (alive) setUserEmail(email)
      } catch {
        // ignore
      }
    }

    loadUser()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => {
      alive = false
      try {
        sub?.subscription?.unsubscribe()
      } catch {}
    }
  }, [])

  const title = useMemo(() => {
    const p = (loc.pathname || '').toLowerCase()
    if (p.includes('ingredients')) return 'Ingredients'
    if (p.includes('recipes')) return 'Recipes'
    if (p.includes('recipe')) return 'Recipe Editor'
    if (p.includes('settings')) return 'Settings'
    if (p.includes('cook')) return 'Cook Mode'
    return 'Dashboard'
  }, [loc.pathname])

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

  return (
    <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
      <div className="gc-shell">
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
                <div className="gc-brand-sub">{kitchenLabel}</div>
              </div>
            </div>

            <div className="gc-side-block" style={{ marginTop: 14 }}>
              <div className="gc-label">MODE</div>
              <div className="gc-seg">
                <button
                  className={cx('gc-seg-btn', isKitchen && 'is-active')}
                  type="button"
                  onClick={() => setMode('kitchen')}
                  aria-pressed={isKitchen}
                  title="Kitchen mode"
                >
                  Kitchen
                </button>
                <button
                  className={cx('gc-seg-btn', isMgmt && 'is-active')}
                  type="button"
                  onClick={() => setMode('mgmt')}
                  aria-pressed={isMgmt}
                  title="Management mode"
                >
                  Mgmt
                </button>
              </div>

              {/* ✅ Make mode change visibly obvious */}
              <div className="gc-hint">
                Active: <b>{isKitchen ? 'Kitchen' : 'Mgmt'}</b>
              </div>
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
                src={brandIcon}
                alt="GastroChef"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = brandLogoFallback
                }}
              />
              <div>
                <div className="gc-topbar-title">{title}</div>
                <div className="gc-topbar-sub">
                  {isKitchen ? 'Kitchen' : 'Mgmt'} · {kitchenLabel}
                </div>
              </div>
            </div>

            <div className="gc-actions">
              <button className="gc-btn gc-btn-soft" type="button" onClick={() => setDark((v) => !v)} title="Toggle theme">
                {dark ? 'Light' : 'Dark'}
              </button>

              <details ref={menuRef} className="gc-actions-menu" onToggle={() => void 0}>
                <summary className="gc-actions-trigger" onClick={(e) => e.preventDefault()}>
                  <button
                    type="button"
                    className="gc-user-trigger-btn"
                    onClick={() => {
                      // toggle details open manually for consistent behavior
                      if (!menuRef.current) return
                      menuRef.current.open = !menuRef.current.open
                    }}
                  >
                    <div className="gc-avatar" aria-hidden="true">
                      {avatarText}
                    </div>
                    <div className="gc-user-label">
                      <div className="gc-user-name">Role: owner</div>
                      <div className="gc-user-email" title={userEmail || ''}>
                        {userEmail || '—'}
                      </div>
                    </div>
                  </button>
                </summary>

                <div className="gc-menu">
                  <button
                    className="gc-menu-item"
                    type="button"
                    onClick={() => {
                      closeMenu()
                      clearAppCaches()
                      window.location.reload()
                    }}
                  >
                    Clear caches & reload
                  </button>

                  <button
                    className="gc-menu-item gc-menu-danger"
                    type="button"
                    onClick={() => {
                      closeMenu()
                      handleLogout()
                    }}
                  >
                    Log out
                  </button>
                </div>
              </details>
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

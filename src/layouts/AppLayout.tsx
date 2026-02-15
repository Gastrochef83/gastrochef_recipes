import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import Dashboard from '../pages/Dashboard'
import Ingredients from '../pages/Ingredients'
import Recipes from '../pages/Recipes'
import Settings from '../pages/Settings'
import RecipeEditor from '../pages/RecipeEditor'
import RecipeCookMode from '../pages/RecipeCookMode'

type ThemeMode = 'light' | 'dark'
type AppMode = 'kitchen' | 'management'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

/** Inline icons (no deps) */
function Icon({
  name,
  size = 18,
}: {
  name:
    | 'dashboard'
    | 'ingredients'
    | 'recipes'
    | 'settings'
    | 'chevron'
    | 'search'
    | 'plus'
    | 'sun'
    | 'moon'
    | 'sparkle'
    | 'bolt'
    | 'book'
  size?: number
}) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' }
  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <path d="M4 13h8V4H4v9Zm0 7h8v-5H4v5Zm10 0h6V11h-6v9Zm0-16v7h6V4h-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
    case 'ingredients':
      return (
        <svg {...common}>
          <path d="M12 21s7-4.5 7-11a4 4 0 0 0-7-2 4 4 0 0 0-7 2c0 6.5 7 11 7 11Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
    case 'recipes':
      return (
        <svg {...common}>
          <path d="M6 4h9a3 3 0 0 1 3 3v13H9a3 3 0 0 0-3 3V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M6 19h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M19.4 15a8 8 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 2l-2 1.5 2 3.5 2.4-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.5-2-1.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...common}>
          <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l-1.4-1.4M20.4 20.4 19 19M19 5l1.4-1.4M4.6 20.4 6 19"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'moon':
      return (
        <svg {...common}>
          <path d="M21 13.2A7.5 7.5 0 1 1 10.8 3 6.5 6.5 0 0 0 21 13.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 2l1.2 4.2L17 7.4l-3.8 1.2L12 13l-1.2-4.4L7 7.4l3.8-1.2L12 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M19 12l.7 2.3L22 15l-2.3.7L19 18l-.7-2.3L16 15l2.3-.7L19 12Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      )
    case 'bolt':
      return (
        <svg {...common}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )
    case 'book':
      return (
        <svg {...common}>
          <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M5 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )
  }
}

function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('gc_theme') as ThemeMode | null
    return saved ?? 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('gc_theme', theme)
  }, [theme])

  return { theme, setTheme }
}

function useAppMode() {
  const [mode, setMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem('gc_mode') as AppMode | null
    return saved ?? 'management'
  })

  useEffect(() => {
    localStorage.setItem('gc_mode', mode)
  }, [mode])

  return { mode, setMode }
}

function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'dark'
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold border',
        tone === 'dark'
          ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
          : 'bg-white text-neutral-700 border-neutral-200 dark:bg-neutral-950 dark:text-neutral-200 dark:border-neutral-800'
      )}
    >
      {children}
    </span>
  )
}

function NavItem({
  to,
  label,
  icon,
  collapsed,
}: {
  to: string
  label: string
  icon: React.ReactNode
  collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition border',
          isActive
            ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm dark:bg-white dark:text-neutral-900 dark:border-white'
            : 'bg-transparent text-neutral-700 border-transparent hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800/60'
        )
      }
      title={collapsed ? label : undefined}
    >
      <span className="opacity-90">{icon}</span>
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && (
        <span className="opacity-0 transition group-hover:opacity-70">
          <Icon name="chevron" size={16} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 rounded-2xl ring-0 group-[.active]:ring-2 group-[.active]:ring-neutral-900/15 dark:group-[.active]:ring-white/25" />
    </NavLink>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  const [userEmail, setUserEmail] = useState<string | null>(null)

  const { theme, setTheme } = useTheme()
  const { mode, setMode } = useAppMode()

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('gc_sidebar_collapsed')
    return saved === '1'
  })

  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    localStorage.setItem('gc_sidebar_collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    let mounted = true

    const boot = async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUserEmail(data.user?.email ?? null)
    }

    boot()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUserEmail(session?.user?.email ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const onSignOut = async () => {
    await supabase.auth.signOut()
  }

  const statusLine = useMemo(() => 'Yield checks • Unit logic • Cost/portion • Sub-recipes • Offline (next)', [])

  /** Ultimate++ keyboard shortcuts */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      const isTyping =
        tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable

      if (!isTyping && e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }

      if (e.key === 'Escape') {
        if (document.activeElement === searchRef.current) {
          searchRef.current?.blur()
          return
        }
      }

      if (!isTyping && e.key === '[') {
        e.preventDefault()
        setCollapsed(true)
        return
      }
      if (!isTyping && e.key === ']') {
        e.preventDefault()
        setCollapsed(false)
        return
      }

      if (isTyping) return
      const k = e.key.toLowerCase()

      if (k === 'g' || k === 'd') navigate('/dashboard')
      if (k === 'i') navigate('/ingredients')
      if (k === 'r') navigate('/recipes')
      if (k === 's') navigate('/settings')
      if (k === 'n') navigate('/recipe/new')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  // Collapsing only matters on lg+. On mobile it will always behave as normal.
  const gridCols = collapsed ? 'lg:grid-cols-[96px_1fr]' : 'lg:grid-cols-[340px_1fr]'

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950">
      <div className="container-app">
        <div className={cx('grid grid-cols-1 gap-4', gridCols)}>
          {/* Sidebar */}
          <aside className="gc-card p-4 dark:bg-neutral-900 dark:border dark:border-neutral-800">
            {/* Header FIXED (no overlap on mobile) */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className={cx('flex items-center gap-3 min-w-0', collapsed && 'justify-center w-full')}>
                  <div
                    className={cx(
                      'h-12 w-12 rounded-2xl flex items-center justify-center font-extrabold select-none',
                      'bg-neutral-900 text-white border border-neutral-900',
                      'dark:bg-white dark:text-neutral-900 dark:border-white'
                    )}
                    title="GastroChef"
                  >
                    GC
                  </div>

                  {!collapsed && (
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        GastroChef
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-lg font-extrabold text-neutral-900 dark:text-white">
                          v4 Global
                        </div>

                        <Pill>PRO</Pill>
                        <Pill tone="dark">
                          <Icon name="sparkle" size={12} />
                          Ultimate++
                        </Pill>
                      </div>
                    </div>
                  )}
                </div>

                {!collapsed && (
                  <button
                    onClick={onSignOut}
                    className="rounded-2xl px-4 py-2 text-sm font-extrabold border border-neutral-200 bg-white hover:bg-neutral-50
                               dark:bg-neutral-950 dark:text-white dark:border-neutral-800"
                  >
                    Sign out
                  </button>
                )}

                {collapsed && (
                  <button
                    onClick={() => setCollapsed(false)}
                    className="hidden lg:inline-flex rounded-2xl px-3 py-2 text-sm font-bold border border-neutral-200 bg-white hover:bg-neutral-50
                               dark:bg-neutral-950 dark:text-white dark:border-neutral-800"
                    title="Expand sidebar ]"
                    aria-label="Expand sidebar"
                  >
                    <Icon name="chevron" />
                  </button>
                )}
              </div>

              {!collapsed && (
                <div className="text-xs text-neutral-500 truncate dark:text-neutral-400">
                  {userEmail ? userEmail : '—'}
                </div>
              )}

              {/* Actions row (separate, prevents overlap) */}
              {!collapsed && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="rounded-2xl px-3 py-2 text-sm font-bold border border-neutral-200 bg-white hover:bg-neutral-50
                               dark:bg-neutral-950 dark:text-white dark:border-neutral-800"
                    title="Toggle theme"
                    aria-label="Toggle theme"
                  >
                    {theme === 'dark' ? <Icon name="sun" /> : <Icon name="moon" />}
                  </button>

                  {/* Collapse only on lg+ */}
                  <button
                    onClick={() => setCollapsed(true)}
                    className="hidden lg:inline-flex rounded-2xl px-3 py-2 text-sm font-bold border border-neutral-200 bg-white hover:bg-neutral-50
                               dark:bg-neutral-950 dark:text-white dark:border-neutral-800"
                    title="Collapse sidebar ["
                    aria-label="Collapse sidebar"
                  >
                    <Icon name="chevron" />
                  </button>
                </div>
              )}
            </div>

            {/* Sticky area: Search + New + Mode + Quick Actions */}
            {!collapsed && (
              <div className="mt-4 sticky top-3 z-10">
                <div className="rounded-3xl border border-neutral-200 bg-white/90 backdrop-blur px-3 py-3 dark:bg-neutral-950/80 dark:border-neutral-800">
                  {/* Search */}
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                      <Icon name="search" size={16} />
                    </div>
                    <input
                      ref={searchRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search (press /)"
                      className={cx(
                        'w-full rounded-2xl border border-neutral-200 bg-white',
                        'pl-10 pr-3 py-2 text-sm font-medium text-neutral-900 outline-none',
                        'focus:ring-2 focus:ring-neutral-900/10',
                        'dark:bg-neutral-950 dark:text-white dark:border-neutral-800 dark:focus:ring-white/15'
                      )}
                    />
                  </div>

                  {/* Primary action */}
                  <button
                    onClick={() => navigate('/recipe/new')}
                    className={cx(
                      'mt-3 w-full rounded-2xl px-4 py-3 text-sm font-extrabold flex items-center justify-center gap-2',
                      'bg-neutral-900 text-white hover:opacity-95',
                      'dark:bg-white dark:text-neutral-900'
                    )}
                    title="New Recipe (N)"
                  >
                    <Icon name="plus" />
                    New Recipe
                  </button>

                  {/* Mode */}
                  <div className="mt-3 flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                    <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                      Mode
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => setMode('kitchen')}
                        className={cx(
                          'rounded-full px-3 py-1 text-[11px] font-bold border',
                          mode === 'kitchen'
                            ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                            : 'bg-white text-neutral-700 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-800'
                        )}
                      >
                        Kitchen
                      </button>
                      <button
                        onClick={() => setMode('management')}
                        className={cx(
                          'rounded-full px-3 py-1 text-[11px] font-bold border',
                          mode === 'management'
                            ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                            : 'bg-white text-neutral-700 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-800'
                        )}
                      >
                        Mgmt
                      </button>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => navigate('/recipes')}
                      className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50
                                 dark:bg-neutral-950 dark:text-neutral-200 dark:border-neutral-800"
                      title="Go Recipes (R)"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon name="book" size={16} />
                        Recipes
                      </span>
                    </button>

                    <button
                      onClick={() => navigate('/ingredients')}
                      className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50
                                 dark:bg-neutral-950 dark:text-neutral-200 dark:border-neutral-800"
                      title="Go Ingredients (I)"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon name="bolt" size={16} />
                        Stock
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Nav */}
            <div className={cx('mt-5 space-y-2', collapsed && 'mt-4')}>
              {!collapsed && (
                <div className="text-[10px] font-bold tracking-widest text-neutral-400 px-2 dark:text-neutral-500">
                  MAIN
                </div>
              )}

              <NavItem to="/dashboard" label="Dashboard" icon={<Icon name="dashboard" />} collapsed={collapsed} />
              <NavItem to="/ingredients" label="Ingredients" icon={<Icon name="ingredients" />} collapsed={collapsed} />
              <NavItem to="/recipes" label="Recipes" icon={<Icon name="recipes" />} collapsed={collapsed} />

              {!collapsed && (
                <div className="pt-2">
                  <div className="text-[10px] font-bold tracking-widest text-neutral-400 px-2 dark:text-neutral-500">
                    SYSTEM
                  </div>
                </div>
              )}

              <NavItem to="/settings" label="Settings" icon={<Icon name="settings" />} collapsed={collapsed} />
            </div>

            {/* Status */}
            {!collapsed && (
              <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                    Status
                  </div>
                  <Pill>MVP → Ultimate++</Pill>
                </div>

                <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Current: <span className="font-mono">{location.pathname}</span>
                </div>

                <div className="mt-3 text-[11px] text-neutral-500 leading-relaxed dark:text-neutral-400">
                  {statusLine}
                </div>

                <div className="mt-3 text-[10px] text-neutral-400 dark:text-neutral-500">
                  Shortcuts: / search • N new • [ collapse • ] expand • G dashboard
                </div>
              </div>
            )}
          </aside>

          {/* Main */}
          <main className="space-y-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/ingredients" element={<Ingredients />} />
              <Route path="/recipes" element={<Recipes />} />
              <Route path="/settings" element={<Settings />} />

              <Route path="/recipe/*" element={<RecipeEditor />} />
              <Route path="/cook/*" element={<RecipeCookMode />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  )
}

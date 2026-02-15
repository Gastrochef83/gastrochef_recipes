import { useEffect, useMemo, useState } from 'react'
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import Dashboard from '../pages/Dashboard'
import Ingredients from '../pages/Ingredients'
import Recipes from '../pages/Recipes'
import Settings from '../pages/Settings'
import RecipeEditor from '../pages/RecipeEditor'
import RecipeCookMode from '../pages/RecipeCookMode'

import {
  LayoutDashboard,
  Leaf,
  BookOpen,
  Settings as SettingsIcon,
  ChevronRight,
  Moon,
  Sun,
  Sparkles,
} from 'lucide-react'

type ThemeMode = 'light' | 'dark'

function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('gc_theme') as ThemeMode | null
    return saved ?? 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (mode === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('gc_theme', mode)
  }, [mode])

  return { mode, setMode }
}

function NavItem({
  to,
  label,
  icon,
}: {
  to: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition',
          'border border-transparent',
          isActive
            ? 'bg-neutral-900 text-white shadow-sm'
            : 'text-neutral-700 hover:bg-neutral-100',
          'dark:text-neutral-200 dark:hover:bg-neutral-800/60',
          isActive ? 'dark:bg-white dark:text-neutral-900' : 'dark:bg-transparent',
        ].join(' ')
      }
    >
      <span className="opacity-90">{icon}</span>
      <span className="flex-1">{label}</span>

      <span className="opacity-0 transition group-hover:opacity-70">
        <ChevronRight size={16} />
      </span>

      {/* Active glow */}
      <span
        className={[
          'pointer-events-none absolute inset-0 rounded-2xl',
          'ring-0 ring-black/0',
          'group-[.active]:ring-2 group-[.active]:ring-neutral-900/20',
          'dark:group-[.active]:ring-white/30',
        ].join(' ')}
      />
    </NavLink>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const { mode, setMode } = useTheme()

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

  const statusLine = useMemo(() => {
    // You can later wire this to real diagnostics.
    return 'Yield checks • Unit logic • Cost/portion • Sub-recipes (next)'
  }, [])

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950">
      <div className="container-app">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Sidebar */}
          <aside className="gc-card p-4 dark:bg-neutral-900 dark:border dark:border-neutral-800">
            {/* Top row: brand + actions */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Logo */}
                <div className="h-12 w-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center overflow-hidden dark:border-neutral-800 dark:bg-neutral-950">
                  <img
                    src="/logo-gastrochef.png"
                    alt="GastroChef"
                    className="h-11 w-11 object-contain"
                  />
                </div>

                {/* Name + badges */}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    GastroChef
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-lg font-extrabold text-neutral-900 dark:text-white">
                      v4 Global
                    </div>

                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white border border-neutral-200 text-neutral-700 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200">
                      PRO
                    </span>

                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                      <Sparkles size={12} />
                      Ultimate
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* Theme toggle */}
                <button
                  className="gc-btn gc-btn-ghost dark:border dark:border-neutral-800"
                  onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
                  aria-label="Toggle theme"
                  title="Toggle theme"
                >
                  {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                {/* Sign out */}
                <button className="gc-btn gc-btn-ghost" onClick={onSignOut}>
                  Sign out
                </button>
              </div>
            </div>

            {/* Email */}
            <div className="mt-3 text-xs text-neutral-500 truncate dark:text-neutral-400">
              {userEmail ? userEmail : '—'}
            </div>

            {/* Navigation */}
            <div className="mt-5 space-y-2">
              <div className="text-[10px] font-bold tracking-widest text-neutral-400 px-2 dark:text-neutral-500">
                MAIN
              </div>

              <NavItem
                to="/dashboard"
                label="Dashboard"
                icon={<LayoutDashboard size={18} />}
              />
              <NavItem
                to="/ingredients"
                label="Ingredients"
                icon={<Leaf size={18} />}
              />
              <NavItem
                to="/recipes"
                label="Recipes"
                icon={<BookOpen size={18} />}
              />

              <div className="pt-2">
                <div className="text-[10px] font-bold tracking-widest text-neutral-400 px-2 dark:text-neutral-500">
                  SYSTEM
                </div>
              </div>

              <NavItem
                to="/settings"
                label="Settings"
                icon={<SettingsIcon size={18} />}
              />
            </div>

            {/* Quick / Status */}
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Status
                </div>

                <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-white border border-neutral-200 text-neutral-600 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-300">
                  MVP → Global
                </span>
              </div>

              <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Current: <span className="font-mono">{location.pathname}</span>
              </div>

              <div className="mt-3 text-[11px] text-neutral-500 leading-relaxed dark:text-neutral-400">
                {statusLine}
              </div>
            </div>
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

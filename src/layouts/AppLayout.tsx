import { useEffect, useState } from 'react'
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import Dashboard from '../pages/Dashboard'
import Ingredients from '../pages/Ingredients'
import Recipes from '../pages/Recipes'
import Settings from '../pages/Settings'
import RecipeEditor from '../pages/RecipeEditor'
import RecipeCookMode from '../pages/RecipeCookMode'

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-2xl px-4 py-3 text-sm font-extrabold ${
          isActive ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

type Mode = 'mgmt' | 'kitchen'

export default function AppLayout() {
  const location = useLocation()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // ✅ Mode Engine
  const [mode, setMode] = useState<Mode>(() => {
    const saved = (localStorage.getItem('gc_mode') || 'mgmt') as Mode
    return saved === 'kitchen' ? 'kitchen' : 'mgmt'
  })

  useEffect(() => {
    // apply class to <html>
    const root = document.documentElement
    root.classList.remove('gc-mode-mgmt', 'gc-mode-kitchen')
    root.classList.add(mode === 'kitchen' ? 'gc-mode-kitchen' : 'gc-mode-mgmt')
    localStorage.setItem('gc_mode', mode)
  }, [mode])

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

  return (
    <div className="min-h-screen">
      <div className="container-app">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="gc-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold text-neutral-500">GastroChef</div>
                <div className="text-lg font-extrabold text-neutral-900">v4 MVP</div>
              </div>
              <button className="gc-btn gc-btn-ghost" onClick={onSignOut}>
                Sign out
              </button>
            </div>

            <div className="mt-3 text-xs text-neutral-500 truncate">{userEmail ? userEmail : '—'}</div>

            {/* ✅ Mode toggle */}
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-xs font-extrabold text-neutral-600">Mode</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`gc-btn ${mode === 'kitchen' ? 'gc-btn-primary' : 'gc-btn-ghost'}`}
                  onClick={() => setMode('kitchen')}
                >
                  🍳 Kitchen
                </button>
                <button
                  type="button"
                  className={`gc-btn ${mode === 'mgmt' ? 'gc-btn-primary' : 'gc-btn-ghost'}`}
                  onClick={() => setMode('mgmt')}
                >
                  📊 Mgmt
                </button>
              </div>
              <div className="mt-2 text-[11px] text-neutral-500">
                Kitchen hides analytics. Mgmt shows pricing & KPIs.
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <NavItem to="/dashboard" label="Dashboard" />
              <NavItem to="/ingredients" label="Ingredients" />
              <NavItem to="/recipes" label="Recipes" />
              <NavItem to="/settings" label="Settings" />
            </div>

            {/* Quick links */}
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-xs font-extrabold text-neutral-600">Quick</div>
              <div className="mt-2 text-xs text-neutral-500">
                Current: <span className="font-mono">{location.pathname}</span>
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

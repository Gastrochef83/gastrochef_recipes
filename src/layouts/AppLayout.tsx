import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

import Dashboard from '../pages/Dashboard'
import Ingredients from '../pages/Ingredients'
import Recipes from '../pages/Recipes'
import Settings from '../pages/Settings'
import RecipeEditor from '../pages/RecipeEditor'

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-2xl px-4 py-3 text-sm font-semibold ${
          isActive ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export default function AppLayout() {
  const nav = useNavigate()
  const [userEmail, setUserEmail] = useState<string>('')

  useEffect(() => {
    let mounted = true

    const boot = async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUserEmail(data.user?.email ?? '')
    }
    boot()

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setUserEmail(data.user?.email ?? '')
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    nav('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      <div className="container-app">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <div className="gc-card p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-neutral-900" />
              <div>
                <div className="font-extrabold leading-tight">GastroChef</div>
                <div className="text-xs text-neutral-500">V4 MVP</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="gc-label">NAVIGATION</div>
              <div className="mt-3 space-y-2">
                <NavItem to="/dashboard" label="Dashboard" />
                <NavItem to="/ingredients" label="Ingredients" />
                <NavItem to="/recipes" label="Recipes" />
                <NavItem to="/settings" label="Settings" />
              </div>
            </div>

            <div className="mt-6 border-t border-neutral-200 pt-4">
              <div className="text-xs text-neutral-500">Signed in</div>
              <div className="mt-1 text-sm font-semibold">{userEmail || '—'}</div>

              <button className="gc-btn gc-btn-ghost mt-3 w-full" type="button" onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>

          {/* Main */}
          <div className="space-y-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/ingredients" element={<Ingredients />} />
              <Route path="/recipes" element={<Recipes />} />
              <Route path="/recipe-editor" element={<RecipeEditor />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  )
}

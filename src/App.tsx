import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import AppShell from './components/AppShell'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Ingredients from './pages/Ingredients'
import Recipes from './pages/Recipes'
import RecipeEditor from './pages/RecipeEditor'
import RecipeCard from './pages/RecipeCard'
import Settings from './pages/Settings'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="p-6">Loading…</div>

  return (
    <Routes>
      <Route path="/login" element={authed ? <Navigate to="/" /> : <Login />} />
      <Route path="/register" element={authed ? <Navigate to="/" /> : <Register />} />

      <Route
        path="/*"
        element={
          authed ? (
            <AppShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/ingredients" element={<Ingredients />} />
                <Route path="/recipes" element={<Recipes />} />
                <Route path="/recipes/:id" element={<RecipeEditor />} />
                <Route path="/recipes/:id/card" element={<RecipeCard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </AppShell>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
    </Routes>
  )
}

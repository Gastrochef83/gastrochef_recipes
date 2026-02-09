import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

import AppLayout from './layouts/AppLayout'

import Dashboard from './pages/Dashboard'
import Ingredients from './pages/Ingredients'
import Recipes from './pages/Recipes'
import RecipeEditor from './pages/RecipeEditor'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Register from './pages/Register'

function AuthedApp() {
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      setUserEmail(data.session?.user?.email ?? null)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  const onSignOut = async () => {
    await supabase.auth.signOut()
    // With HashRouter, send user to #/login
    window.location.hash = '#/login'
  }

  return (
    <AppLayout userEmail={userEmail} onSignOut={onSignOut}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="/recipes" element={<Recipes />} />

        {/* ✅ Works without Vercel rewrites */}
        <Route path="/recipe-editor" element={<RecipeEditor />} />

        <Route path="/settings" element={<Settings />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* App */}
        <Route path="/*" element={<AuthedApp />} />
      </Routes>
    </HashRouter>
  )
}

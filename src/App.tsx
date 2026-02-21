import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from './layouts/AppLayout'
import AuthGate from './components/AuthGate'

import Dashboard from './pages/Dashboard'
import Ingredients from './pages/Ingredients'
import Recipes from './pages/Recipes'
import RecipeEditor from './pages/RecipeEditor'
import CookMode from './pages/CookMode'
import Settings from './pages/Settings'

import Login from './pages/Login'
import Register from './pages/Register'

/**
 * ✅ ABSOLUTE FINAL CORE (routing + protection)
 * - HashRouter stable on Vercel refresh
 * - AuthGate protects app routes (prevents bounce-back after logout)
 * - No changes to your costing/recipes logic
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected App */}
        <Route
          path="/*"
          element={
            <AuthGate redirectTo="/login">
              <AppLayout />
            </AuthGate>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="ingredients" element={<Ingredients />} />
          <Route path="recipes" element={<Recipes />} />
          <Route path="recipe" element={<RecipeEditor />} />
          <Route path="cook" element={<CookMode />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
  )
}

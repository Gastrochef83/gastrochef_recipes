import { Routes, Route, Navigate } from 'react-router-dom'

import AppLayout from './layouts/AppLayout.tsx'
import AuthGate from './components/AuthGate'

import Dashboard from './pages/Dashboard'
import Ingredients from './pages/Ingredients'
import Recipes from './pages/Recipes'
import RecipeEditor from './pages/RecipeEditor'
import RecipeCookMode from './pages/RecipeCookMode'
import RecipePrintCard from './pages/RecipePrintCard'
import RecipePrintKitchenSheet from './pages/RecipePrintKitchenSheet'
import Settings from './pages/Settings'

import Login from './pages/Login'
import Register from './pages/Register'

/**
 * ✅ ABSOLUTE FINAL CORE — FIXED (Vercel build)
 * - DOES NOT import HashRouter here (HashRouter stays in main.tsx)
 * - Fixes Cook mode import: RecipeCookMode.tsx
 * - Protects app routes with AuthGate (no bounce-back after logout)
 * - No changes to your business logic
 */
export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected App */}
      <Route
        path="/"
        element={
          <AuthGate redirectTo="/login">
            <AppLayout />
          </AuthGate>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="ingredients" element={<Ingredients />} />
        <Route path="recipes" element={<Recipes />} />
        <Route path="recipe" element={<RecipeEditor />} />
        {/* Cook mode is opened from RecipeEditor via /cook?id=... */}
        <Route path="cook" element={<RecipeCookMode />} />
        <Route path="print" element={<RecipePrintCard />} />
        <Route path="print-kitchen" element={<RecipePrintKitchenSheet />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'

import Dashboard from './pages/Dashboard'
import Ingredients from './pages/Ingredients'
import Recipes from './pages/Recipes'
import Settings from './pages/Settings'
import RecipeEditor from './pages/RecipeEditor'

export default function App() {
  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          {/* default */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* pages */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/ingredients" element={<Ingredients />} />
          <Route path="/recipes" element={<Recipes />} />

          {/* ✅ IMPORTANT: editor route */}
          <Route path="/recipe-editor" element={<RecipeEditor />} />

          <Route path="/settings" element={<Settings />} />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  )
}

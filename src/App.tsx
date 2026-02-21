import { Routes, Route, Navigate } from 'react-router-dom'

import AppLayout from './layouts/AppLayout'

import Dashboard from './pages/Dashboard'
import Ingredients from './pages/Ingredients'
import Recipes from './pages/Recipes'
import RecipeEditor from './pages/RecipeEditor'
import RecipeCookMode from './pages/RecipeCookMode'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Register from './pages/Register'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/" element={<AppLayout />}>

        <Route index element={<Navigate to="dashboard" replace />} />

        <Route path="dashboard" element={<Dashboard />} />
        <Route path="ingredients" element={<Ingredients />} />
        <Route path="recipes" element={<Recipes />} />
        <Route path="recipe" element={<RecipeEditor />} />
        {/* Cook mode is opened from RecipeEditor via /cook?id=... */}
        <Route path="cook" element={<RecipeCookMode />} />
        <Route path="settings" element={<Settings />} />

      </Route>

      {/* fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />

    </Routes>
  )
}

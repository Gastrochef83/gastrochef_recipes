// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ModeProvider } from './lib/mode'
import { KitchenProvider } from './lib/kitchen'
import { AutosaveProvider } from './contexts/AutosaveContext'
import AppLayout from './layouts/AppLayout'
import DashboardLayout from './layouts/DashboardLayout'
import Login from './pages/Login'
import Recipes from './pages/Recipes'
import RecipeEditor from './pages/RecipeEditor'
import CookMode from './pages/CookMode'
import PrintRecipe from './pages/PrintRecipe'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ModeProvider>
          <KitchenProvider>
            <AutosaveProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<AppLayout />}>
                  <Route element={<DashboardLayout />}>
                    <Route index element={<Navigate to="/recipes" />} />
                    <Route path="recipes" element={<Recipes />} />
                    <Route path="recipe" element={<RecipeEditor />} />
                    <Route path="cook" element={<CookMode />} />
                    <Route path="print" element={<PrintRecipe />} />
                  </Route>
                </Route>
              </Routes>
            </AutosaveProvider>
          </KitchenProvider>
        </ModeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

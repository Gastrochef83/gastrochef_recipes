import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import Layout from './Layout';
import DashboardPage from '@/features/dashboard/DashboardPage';
import RecipesPage from '@/features/recipes/RecipesPage';
import RecipeDetailPage from '@/features/recipes/RecipeDetailPage';
import IngredientsPage from '@/features/ingredients/IngredientsPage';
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import ProtectedRoute from './ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="gastrochef-theme">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/recipes" element={
              <ProtectedRoute>
                <Layout>
                  <RecipesPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/recipes/:id" element={
              <ProtectedRoute>
                <Layout>
                  <RecipeDetailPage />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/ingredients" element={
              <ProtectedRoute>
                <Layout>
                  <IngredientsPage />
                </Layout>
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
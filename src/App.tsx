import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import RecipesPage from './pages/RecipesPage';
import IngredientsPage from './pages/IngredientsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';

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
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            } />
            <Route path="/recipes" element={
              <AppLayout>
                <RecipesPage />
              </AppLayout>
            } />
            <Route path="/ingredients" element={
              <AppLayout>
                <IngredientsPage />
              </AppLayout>
            } />
            <Route path="/settings" element={
              <AppLayout>
                <SettingsPage />
              </AppLayout>
            } />
          </Routes>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
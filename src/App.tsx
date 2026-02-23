// App.tsx - Root with optimized routing and auth
import React, { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { DatabaseProvider } from './contexts/DatabaseContext';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load for performance
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Recipes = lazy(() => import('./pages/Recipes'));
const RecipeEditor = lazy(() => import('./pages/RecipeEditor'));
const CostHistory = lazy(() => import('./pages/CostHistory'));
const Settings = lazy(() => import('./pages/Settings'));

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingSpinner />;
  return user ? <>{children}</> : <Navigate to="/login" />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={
        <Suspense fallback={<LoadingSpinner />}>
          <Login />
        </Suspense>
      } />
      <Route path="/" element={
        <PrivateRoute>
          <Layout />
        </PrivateRoute>
      }>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={
          <Suspense fallback={<LoadingSpinner />}>
            <Dashboard />
          </Suspense>
        } />
        <Route path="recipes" element={
          <Suspense fallback={<LoadingSpinner />}>
            <Recipes />
          </Suspense>
        } />
        <Route path="recipe/:id" element={
          <Suspense fallback={<LoadingSpinner />}>
            <RecipeEditor />
          </Suspense>
        } />
        <Route path="cost-history" element={
          <Suspense fallback={<LoadingSpinner />}>
            <CostHistory />
          </Suspense>
        } />
        <Route path="settings" element={
          <Suspense fallback={<LoadingSpinner />}>
            <Settings />
          </Suspense>
        } />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <DatabaseProvider>
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </DatabaseProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
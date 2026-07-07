/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { AppLayout } from './layouts/AppLayout';
import { ErrorBoundary } from './ui/ErrorBoundary';

// Lazy-loaded pages
const ModelsPage = lazy(() => import('./features/models/ModelsPage'));
const KeysPage = lazy(() => import('./features/keys/KeysPage'));
const UsagePage = lazy(() => import('./features/usage/UsagePage'));
const DocsPage = lazy(() => import('./features/docs/DocsPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const RegisterPage = lazy(() => import('./features/auth/RegisterPage'));
const LandingPage = lazy(() => import('./features/landing/LandingPage'));
const HomePage = lazy(() => import('./features/home/HomePage'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[var(--color-text-muted)]">Loading...</span>
      </div>
    </div>
  );
}

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
  area?: 'user' | 'admin';
}) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, hasHydrated, justRegistered } = useAuthStore();

  if (!hasHydrated) return <LoadingFallback />;

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Public landing page */}
        <Route path="/" element={isAuthenticated ? <Navigate to="/home" replace /> : <LandingPage />} />
        
        {/* Auth (public) */}
        <Route path="/login" element={isAuthenticated ? <Navigate to="/home" replace /> : <LoginPage />} />
        <Route path="/register" element={isAuthenticated && !justRegistered ? <Navigate to="/home" replace /> : <RegisterPage />} />

        {/* User routes — sidebar layout */}
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="home" element={<HomePage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="keys" element={<KeysPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="docs" element={<DocsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to={isAuthenticated ? '/home' : '/'} replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  const hydrate = useAuthStore(s => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

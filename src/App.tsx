import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';

const HomePage = lazy(() => import('./pages/HomePage'));
const GeneratorPage = lazy(() => import('./pages/GeneratorPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));

function RouteLoader() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-20 flex items-center justify-center">
      <div className="text-sm text-slate-400">Loading YTClip workspace...</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/generate" element={<GeneratorPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:projectId/:clipId" element={<EditorPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

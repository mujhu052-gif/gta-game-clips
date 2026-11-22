import React from 'react';
import { PageMeta } from '../components/PageMeta';

export default function PrivacyPage() {
  return (
    <>
      <PageMeta
        title="Privacy Policy"
        description="Read the YTClip Privacy Policy. No mandatory accounts, no cloud tracking of local video files, and browser-only metadata storage."
      />

      <article className="mx-auto max-w-[840px] px-4 sm:px-6 py-12 space-y-6">
        <header className="space-y-2 border-b border-white/[0.08] pb-6">
          <p className="text-xs font-medium text-violet-300">Legal</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-xs text-slate-400">Last updated: November 2026 · Applies to YTClip</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">1. No Account or Personal Data Collection</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            YTClip does not require account registration, email addresses, passwords, or payment
            details to use the application.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">2. Local Video Handling</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            When running in Demo Mode, video files you select remain inside your browser session in
            ephemeral memory and are never uploaded to external third-party servers. Large video
            files are never saved in browser localStorage.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">3. Browser LocalStorage</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            YTClip stores only lightweight project metadata (such as project titles, clip start and
            end timestamps, transcript edits, and caption preferences) in your browser’s localStorage
            so your workspace persists across refreshes. You can delete any project or reset local
            storage at any time from the My Projects page.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">4. Self-Hosted Local Backend Mode</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            If you configure <code className="text-violet-300">VITE_API_BASE_URL</code> to connect
            YTClip to your own local Node.js Express and Python processing engine, video uploads and
            rendered clips are transmitted solely between your browser and your configured server.
          </p>
        </section>
      </article>
    </>
  );
}

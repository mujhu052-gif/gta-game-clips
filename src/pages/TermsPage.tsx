import React from 'react';
import { PageMeta } from '../components/PageMeta';

export default function TermsPage() {
  return (
    <>
      <PageMeta
        title="Terms of Use"
        description="Read the YTClip Terms of Use regarding authorized video uploads, free MVP usage, and content ownership."
      />

      <article className="mx-auto max-w-[840px] px-4 sm:px-6 py-12 space-y-6">
        <header className="space-y-2 border-b border-white/[0.08] pb-6">
          <p className="text-xs font-medium text-violet-300">Legal</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Terms of Use
          </h1>
          <p className="text-xs text-slate-400">Last updated: November 2026 · Applies to YTClip</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">1. Authorized Content Only</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            You may only upload and edit video files in YTClip that you own, created yourself, or
            have explicit legal permission from the rights holder to process and clip. YTClip does
            not support unauthorized downloading of third-party videos from external streaming
            platforms.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">2. Free MVP & Demo Mode Transparency</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            YTClip is provided as a free tool with no subscription fees or watermarks. Simulated
            results shown in Demo Mode are sample outputs intended to demonstrate interface
            capabilities prior to connecting a local AI processing engine.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">3. No Performance Guarantees</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Suggested hooks, titles, hashtags, and highlight scores are editing aids only and do not
            guarantee views, engagement, or virality on any social platform.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-white">4. User Ownership</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            You retain full ownership and responsibility for all source videos, edited transcripts,
            and exported short clips produced with YTClip.
          </p>
        </section>
      </article>
    </>
  );
}

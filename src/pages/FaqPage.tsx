import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageMeta } from '../components/PageMeta';

const FAQS = [
  {
    q: 'Is YTClip completely free to use?',
    a: 'Yes. YTClip is built as a completely free initial version with no mandatory account registration, no subscriptions, no paid AI APIs, and no watermarks on exported clips.',
  },
  {
    q: 'Why does YTClip ask me to upload a video file instead of downloading from a YouTube URL?',
    a: 'YTClip validates YouTube links to catch typos, but it intentionally does not perform unauthorized YouTube downloading. Creators should upload MP4, MOV, or WebM files they own or have permission to edit.',
  },
  {
    q: 'What is the difference between Demo Mode and the local AI engine?',
    a: 'In the standalone frontend preview, processing stages and candidate highlights are simulated in Demo Mode with sample data so you can test the entire UI workflow immediately. Once exported to VS Code, setting VITE_API_BASE_URL connects YTClip to a local Node.js Express + Python backend using FFmpeg, faster-whisper, and OpenCV.',
  },
  {
    q: 'Does a high Highlight Score guarantee my clip will go viral?',
    a: 'No. Highlight scores in YTClip are heuristic indicators of spoken cadence and topic shifts—never a guarantee of audience reach or virality.',
  },
  {
    q: 'What video formats and durations are supported?',
    a: 'YTClip accepts MP4, MOV, and WebM video files up to 60 minutes in duration. You can also configure the file size threshold in the AI Clip Generator workspace.',
  },
  {
    q: 'Where are my projects stored?',
    a: 'Project metadata, clip trim settings, and caption styles are saved locally in browser localStorage. Large video files are never saved inside localStorage.',
  },
];

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <>
      <PageMeta
        title="Frequently Asked Questions"
        description="Answers to common questions about YTClip: free usage, supported video formats, Demo Mode transparency, and local VS Code backend integration."
      />

      <div className="mx-auto max-w-[900px] px-4 sm:px-6 py-12 space-y-8">
        <div className="space-y-2 border-b border-white/[0.08] pb-6">
          <p className="text-xs font-medium text-violet-300">Support & Transparency</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-sm text-slate-400">
            Everything you need to know about using YTClip for free short-form video creation.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={item.q}
                className="rounded-xl border border-white/[0.08] bg-[#13161F] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm sm:text-base font-semibold text-white">{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180 text-white' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 pt-3 text-sm text-slate-300 leading-relaxed border-t border-white/[0.05]">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-4">
          <Link
            to="/generate"
            className="inline-flex px-5 py-2.5 rounded-xl text-sm font-semibold text-white gradient-brand"
          >
            Open AI Clip Generator
          </Link>
        </div>
      </div>
    </>
  );
}

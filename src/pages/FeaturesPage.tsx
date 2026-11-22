import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Captions,
  Cpu,
  Crop,
  Download,
  FolderKanban,
  Scissors,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { PageMeta } from '../components/PageMeta';

const FEATURE_BLOCKS = [
  {
    icon: Scissors,
    title: '01. Smart Highlight Detection',
    desc: 'Inspect candidate clip timestamps with transcript excerpts, suggested hooks, and select/deselect controls before rendering.',
  },
  {
    icon: Captions,
    title: '02. Automatic & Editable Captions',
    desc: 'Choose Classic, Modern, Highlight, or Minimal presets, or edit individual subtitle lines, font size, colors, and safe-zone placement.',
  },
  {
    icon: Crop,
    title: '03. 9:16, 1:1 & 16:9 Reframing',
    desc: 'Switch between vertical Shorts/Reels/TikTok, square social feeds, and widescreen formats with instant preview feedback.',
  },
  {
    icon: Sliders,
    title: '04. Precision Trim & Video Editor',
    desc: 'Fine-tune clip start and end boundaries, scrub timestamps, toggle subtitles on or off, and export clean SRT caption files.',
  },
  {
    icon: FolderKanban,
    title: '05. Zero-Account Project Library',
    desc: 'Keep project metadata and caption preferences organized in browser localStorage with zero registration or login friction.',
  },
  {
    icon: Download,
    title: '06. Free Watermark-Free Exports',
    desc: 'Export 720p or 1080p clips with zero branding overlays, zero paywalls, and no hidden subscription upsells.',
  },
  {
    icon: ShieldCheck,
    title: '07. Authorized Source Validation',
    desc: 'Validates MP4, MOV, and WebM files up to 60 minutes locally and guides creators away from unauthorized URL scraping.',
  },
  {
    icon: Cpu,
    title: '08. Local AI Engine Ready',
    desc: 'Built with a clean API adapter ready to connect to a free local Python, FFmpeg, faster-whisper, OpenCV, and Node.js Express engine.',
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageMeta
        title="Features"
        description="Explore YTClip features: smart highlight selection, automatic captions, 9:16 vertical formatting, interactive video editor, and free watermark-free exports."
      />

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-12 space-y-12">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-medium text-violet-300">Free Initial MVP · Zero Watermarks</p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight [text-wrap:balance]">
            Built to Turn Long Videos Into Engaging Shorts
          </h1>
          <p className="text-base text-slate-300 leading-relaxed">
            YTClip combines a fast browser workspace with a modular processing architecture designed
            for completely free local AI video clipping.
          </p>
          <div className="pt-2">
            <Link
              to="/generate"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white gradient-brand hover:opacity-95 transition-opacity"
            >
              <span>Start Clipping Free</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURE_BLOCKS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3"
              >
                <Icon className="w-6 h-6 text-violet-400" />
                <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                <p className="text-sm text-slate-300 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

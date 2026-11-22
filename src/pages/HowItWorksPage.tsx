import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Cpu, FileVideo, Scissors, Upload } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';

const STEPS = [
  {
    icon: Upload,
    title: 'Step 1: Upload Your Authorized Video',
    body: 'Drag and drop an MP4, MOV, or WebM video up to 60 minutes. YTClip inspects duration and resolution locally in your browser before creating a project.',
  },
  {
    icon: Scissors,
    title: 'Step 2: Configure Clips & Review Highlights',
    body: 'Choose 30s, 45s, or 60s target length, 9:16 / 1:1 / 16:9 aspect ratio, and a caption preset. In Demo Mode, YTClip simulates the 7-stage pipeline and displays candidate highlight moments you can select or deselect.',
  },
  {
    icon: FileVideo,
    title: 'Step 3: Refine in the Video Editor & Export Free',
    body: 'Adjust start and end trim handles, customize subtitle font, size, colors, and position, and download your short clip or SRT subtitle track with zero watermarks.',
  },
];

const PIPELINE_COMPONENTS = [
  {
    name: 'Node.js Express Orchestrator',
    role: 'Receives video uploads via REST API, manages job queues, and exposes status endpoints consumed by YTClip via VITE_API_BASE_URL.',
  },
  {
    name: 'FFmpeg',
    role: 'Validates streams, extracts 16kHz mono audio, cuts exact highlight timestamps, crops to 9:16 / 1:1 / 16:9, and burns in ASS/SRT captions.',
  },
  {
    name: 'faster-whisper',
    role: 'Runs fast local speech-to-text transcription on CPU or GPU with word-level timestamps—zero paid transcription APIs required.',
  },
  {
    name: 'OpenCV',
    role: 'Detects active speaker framing and face-centered crop coordinates for crisp vertical video formatting.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageMeta
        title="How It Works"
        description="Learn how YTClip transforms long videos into short-form clips in three steps and connects to a free local Python, FFmpeg, faster-whisper, and OpenCV engine."
      />

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-12 space-y-14">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs font-medium text-blue-400">Workflow & Local Engine Architecture</p>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            How YTClip Works
          </h1>
          <p className="text-base text-slate-300 leading-relaxed">
            YTClip runs an interactive browser Demo Mode today and is cleanly architected to connect
            to a 100% free local processing engine in VS Code.
          </p>
        </div>

        {/* 3 Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3"
              >
                <div className="w-10 h-10 rounded-lg gradient-brand text-white inline-flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-semibold text-white">{step.title}</h2>
                <p className="text-sm text-slate-300 leading-relaxed">{step.body}</p>
              </div>
            );
          })}
        </div>

        {/* Local Backend Stack */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#13161F] p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-3">
            <Cpu className="w-6 h-6 text-violet-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-bold text-white">
                Future Local AI Engine (VS Code Integration)
              </h2>
              <p className="text-sm text-slate-400">
                Set <code className="text-violet-300">VITE_API_BASE_URL</code> in your{' '}
                <code className="text-violet-300">.env</code> file to switch YTClip from browser Demo
                Mode to your local processing server.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PIPELINE_COMPONENTS.map((comp) => (
              <div
                key={comp.name}
                className="rounded-xl border border-white/[0.06] bg-[#0B0D12] p-4 space-y-1.5"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>{comp.name}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{comp.role}</p>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Link
              to="/generate"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white gradient-brand"
            >
              <span>Try the Interactive Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Captions,
  Check,
  ChevronDown,
  Crop,
  Film,
  Scissors,
  SlidersHorizontal,
  Smartphone,
  Upload,
} from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { ClipPlayerModal } from '../components/ClipPlayerModal';
import { createDemoSeedData, DEMO_STUDIO_POSTER } from '../data/demoSamples';
import { videoProcessingService } from '../services/videoProcessingService';
import { GeneratedClip } from '../types/video';
import { formatTimestamp } from '../utils/formatters';

const FAQ_PREVIEW = [
  {
    q: 'Is YTClip really free with no watermarks?',
    a: 'Yes. YTClip is a free initial version with no mandatory registration, no subscription tiers, no paid AI APIs, and zero watermarks on your exported short-form clips.',
  },
  {
    q: 'Can I paste a YouTube link to download videos automatically?',
    a: 'No. YTClip validates YouTube URL formatting and clearly instructs you to upload an authorized local MP4, MOV, or WebM video file that you own or have rights to edit.',
  },
  {
    q: 'How does the current browser demo differ from the local AI engine?',
    a: 'In this frontend preview, processing stages and highlight candidates run in clearly labeled Demo Mode. When exported to VS Code, YTClip connects via VITE_API_BASE_URL to a local Node.js Express + Python engine powered by FFmpeg, faster-whisper, and OpenCV.',
  },
  {
    q: 'Are my video files uploaded to a third-party cloud?',
    a: 'No. Your video stays in browser memory during this local demo, and only lightweight project metadata is stored in browser localStorage.',
  },
];

export default function HomePage() {
  const [sampleClips, setSampleClips] = useState<GeneratedClip[]>(() => createDemoSeedData().clips);
  const [previewClip, setPreviewClip] = useState<GeneratedClip | null>(null);
  const [mockupAspect, setMockupAspect] = useState<'9:16' | '1:1'>('9:16');
  const [mockupCaptions, setMockupCaptions] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    videoProcessingService.getGeneratedClips('demo-project-podcast-42').then((clips) => {
      if (clips.length > 0) setSampleClips(clips);
    });
  }, []);

  const handleDownloadSample = async (clip: GeneratedClip) => {
    setStatusNotice(`Rendering "${clip.title}" for download...`);
    await videoProcessingService.downloadClip(clip.id);
    setStatusNotice(`Downloaded sample clip "${clip.title}".`);
    window.setTimeout(() => setStatusNotice(null), 3500);
  };

  return (
    <>
      <PageMeta
        title="YTClip – Turn Long Videos Into Viral-Ready Shorts"
        description="Transform long videos into engaging YouTube Shorts, Instagram Reels, and TikTok clips with automatic captions and smart video editing — 100% free."
      />

      {statusNotice && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border border-violet-500/30 bg-[#13161F]/95 text-sm text-white shadow-xl">
          {statusNotice}
        </div>
      )}

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #7C3AED 0%, #2563EB 55%, transparent 75%)' }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6 pt-14 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Left Copy Column */}
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <p className="text-xs font-medium text-violet-300 tracking-wide">
                Free Tool · No Registration · No Watermark
              </p>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight text-white leading-[1.08] [text-wrap:balance]">
                Turn Long Videos Into{' '}
                <span className="gradient-brand-text">Viral-Ready Shorts.</span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                Transform your long videos into engaging YouTube Shorts, Instagram Reels, and TikTok
                clips with automatic captions and smart video editing.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/generate"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white gradient-brand hover:opacity-95 transition-opacity whitespace-nowrap"
                >
                  <span>Start Clipping Free</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/features"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-slate-200 border border-white/15 bg-white/[0.03] hover:bg-white/[0.07] transition-colors whitespace-nowrap"
                >
                  <span>Explore Features</span>
                </Link>
              </div>

              <div className="pt-4 border-t border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="font-semibold text-white">No Sign-Up</div>
                  <div className="text-slate-400">Open workspace</div>
                </div>
                <div>
                  <div className="font-semibold text-white">Zero Watermark</div>
                  <div className="text-slate-400">Clean exports</div>
                </div>
                <div>
                  <div className="font-semibold text-white">Up to 60 Min</div>
                  <div className="text-slate-400">MP4, MOV, WebM</div>
                </div>
                <div>
                  <div className="font-semibold text-white">Free Forever MVP</div>
                  <div className="text-slate-400">No paid AI APIs</div>
                </div>
              </div>
            </div>

            {/* Right Interactive Video Editor Preview Mockup */}
            <div className="lg:col-span-6 flex items-stretch">
              <div className="w-full rounded-2xl border border-white/10 bg-[#13161F] p-4 sm:p-5 flex flex-col justify-between gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div>
                    <div className="text-xs text-slate-400">Interactive Editor Preview</div>
                    <div className="text-sm font-semibold text-white">
                      Creator Podcast Ep. 42 · 02:22 – 03:07
                    </div>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D12] border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setMockupAspect('9:16')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        mockupAspect === '9:16'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      9:16
                    </button>
                    <button
                      type="button"
                      onClick={() => setMockupAspect('1:1')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        mockupAspect === '1:1'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      1:1
                    </button>
                    <button
                      type="button"
                      onClick={() => setMockupCaptions((c) => !c)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        mockupCaptions
                          ? 'bg-blue-600/80 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Captions {mockupCaptions ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>

                {/* Split source + vertical frame preview */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  <div className="sm:col-span-7 space-y-2">
                    <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-[#0B0D12]">
                      {!heroImgFailed ? (
                        <img
                          src={DEMO_STUDIO_POSTER}
                          alt="Studio podcast recording setup in YTClip source monitor"
                          referrerPolicy="no-referrer"
                          onError={() => setHeroImgFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#181C28]">
                          <Film className="w-8 h-8 text-violet-400" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-200">
                        <span>Source 16:9 · 1080p</span>
                        <span>30:42 total</span>
                      </div>
                    </div>

                    {/* Timeline Strip */}
                    <div className="rounded-lg bg-[#0B0D12] border border-white/[0.07] p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
                        <span>Highlight Window</span>
                        <span>02:22 – 03:07 (45s)</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/[0.06] relative overflow-hidden">
                        <div className="absolute left-[18%] w-[26%] inset-y-0 rounded-full gradient-brand" />
                      </div>
                    </div>
                  </div>

                  <div className="sm:col-span-5 flex justify-center">
                    <div
                      className={`relative w-full max-w-[190px] rounded-xl overflow-hidden border border-violet-500/40 bg-[#0B0D12] transition-all ${
                        mockupAspect === '9:16' ? 'aspect-[9/16]' : 'aspect-square'
                      }`}
                    >
                      <img
                        src={sampleClips[0]?.previewImageUrl}
                        alt="Vertical 9:16 formatted short preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between text-[10px] font-mono text-slate-200">
                        <span>{mockupAspect}</span>
                        <span>1080p</span>
                      </div>
                      {mockupCaptions && (
                        <div className="absolute bottom-4 inset-x-2.5 flex justify-center">
                          <span className="px-2 py-1 rounded bg-[#0B0D12]/85 text-white text-[11px] font-bold text-center leading-tight">
                            Open with the real tension right away.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs text-slate-400">
                  <span>Demo sample workspace ready</span>
                  <Link
                    to="/editor"
                    className="text-violet-300 hover:text-white font-medium inline-flex items-center gap-1"
                  >
                    <span>Try Full Video Editor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sample Generated Vertical Video Cards */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-6 py-16 lg:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-medium text-violet-300">Sample Demo Output</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Generated Vertical Video Cards
            </h2>
            <p className="text-sm sm:text-base text-slate-400">
              Preview how YTClip formats horizontal recordings into vertical 9:16 clips with hooks,
              timestamps, and editable captions. Sample clips below are demo content.
            </p>
          </div>
          <Link
            to="/generate"
            className="text-sm font-semibold text-violet-300 hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Create Your Own Clips</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sampleClips.slice(0, 3).map((clip) => (
            <div
              key={clip.id}
              className="rounded-xl border border-white/[0.08] bg-[#13161F] overflow-hidden flex flex-col"
            >
              <button
                type="button"
                onClick={() => setPreviewClip(clip)}
                className="group relative aspect-[9/13] w-full bg-[#0B0D12] overflow-hidden text-left"
              >
                <img
                  src={clip.previewImageUrl}
                  alt={clip.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />
                <div className="absolute top-3 left-3 right-3 flex justify-between text-[11px] font-mono tabular-nums text-slate-200">
                  <span>Sample Demo Clip</span>
                  <span>{clip.durationSeconds}s · {clip.aspectRatio}</span>
                </div>
                <div className="absolute bottom-4 inset-x-4 space-y-2">
                  <div className="inline-block px-2.5 py-1 rounded bg-black/75 text-xs font-semibold text-white">
                    {clip.transcriptSegments[0]?.text}
                  </div>
                </div>
              </button>

              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono tabular-nums text-slate-400">
                    {formatTimestamp(clip.startTime)} – {formatTimestamp(clip.endTime)} · Auto-captions
                  </div>
                  <h3 className="text-base font-semibold text-white">{clip.title}</h3>
                  <p className="text-xs text-slate-400">Hook: {clip.suggestedHook}</p>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setPreviewClip(clip)}
                    className="flex-1 py-2 px-3 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors"
                  >
                    Preview
                  </button>
                  <Link
                    to={`/editor/${clip.projectId}/${clip.id}`}
                    className="flex-1 py-2 px-3 rounded-lg text-center gradient-brand text-xs font-semibold text-white hover:opacity-95 transition-opacity"
                  >
                    Edit Clip
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Highlights (Asymmetric Bento Grid) */}
      <section className="border-y border-white/[0.06] bg-[#0E1118]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-16 lg:py-20">
          <div className="max-w-2xl space-y-2 mb-10">
            <p className="text-xs font-medium text-blue-400">Built For Creators</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Everything You Need to Repurpose Long Videos
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3">
              <Scissors className="w-6 h-6 text-violet-400" />
              <h3 className="text-lg font-semibold text-white">
                01. Smart Highlight Detection & Segment Selection
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                Review candidate moments with start/end timestamps, transcript excerpts, and hook
                suggestions. Select or deselect any moment before rendering—never blindly locked into
                a black-box output.
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3">
              <Captions className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">02. Editable Auto-Captions</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Switch between Classic, Modern, Highlight, and Minimal caption templates, or fine-tune
                font, size, colors, and safe-zone positioning.
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3">
              <Crop className="w-6 h-6 text-violet-400" />
              <h3 className="text-lg font-semibold text-white">03. Multi-Aspect Framing</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Export vertical 9:16 for Shorts/Reels/TikTok, square 1:1 for feeds, or classic 16:9
                widescreen in 720p or 1080p MP4.
              </p>
            </div>

            <div className="md:col-span-2 rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3">
              <SlidersHorizontal className="w-6 h-6 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">
                04. Local-First Privacy & Zero Subscription Fees
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                No account creation, no credit cards, and no watermarks. Project metadata persists in
                browser localStorage while the service layer is structured to plug directly into your
                local Node.js, Python, FFmpeg, faster-whisper, and OpenCV backend.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Three-Step How It Works */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-6 py-16 lg:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div className="space-y-2 max-w-xl">
            <p className="text-xs font-medium text-violet-300">Simple Workflow</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Three Steps From Long Video to Short Clip
            </h2>
          </div>
          <Link
            to="/how-it-works"
            className="text-sm font-medium text-slate-300 hover:text-white inline-flex items-center gap-1"
          >
            <span>Read Full Technical Guide</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3">
            <div className="w-10 h-10 rounded-lg gradient-brand text-white inline-flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">1. Upload Authorized Video</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Drop an MP4, MOV, or WebM file up to 60 minutes. YTClip inspects duration and
              resolution locally and lets you choose clip length, aspect ratio, and caption style.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3">
            <div className="w-10 h-10 rounded-lg gradient-brand text-white inline-flex items-center justify-center">
              <Scissors className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">2. Review Highlights & Trim</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Inspect candidate clips, refine start and end timestamps, edit transcript lines, and
              customize caption appearance in the responsive Video Editor.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#13161F] p-6 space-y-3">
            <div className="w-10 h-10 rounded-lg gradient-brand text-white inline-flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">3. Export Free Without Watermarks</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Download clean 720p or 1080p clips formatted for YouTube Shorts, Instagram Reels, and
              TikTok with zero watermarks or paywalls.
            </p>
          </div>
        </div>
      </section>

      {/* Supported Platforms */}
      <section className="border-y border-white/[0.06] bg-[#0E1118]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-2">
              <h2 className="font-display text-2xl font-bold text-white tracking-tight">
                Formatted for Every Short-Form Feed
              </h2>
              <p className="text-sm text-slate-400">
                Clean vertical 9:16 framing, safe-zone caption placement, and 1:1 / 16:9 options so
                one long video powers all your channels.
              </p>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { name: 'YouTube Shorts', spec: '9:16 Vertical · Up to 60s · 1080p' },
                { name: 'Instagram Reels', spec: '9:16 or 1:1 · Safe-zone captions' },
                { name: 'TikTok', spec: '9:16 Vertical · Clean hook timing' },
              ].map((platform) => (
                <div
                  key={platform.name}
                  className="rounded-xl border border-white/[0.08] bg-[#13161F] p-4 space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    <span>{platform.name}</span>
                  </div>
                  <p className="text-xs text-slate-400">{platform.spec}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mx-auto max-w-[1200px] px-4 sm:px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4 space-y-3">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Clear answers about YTClip’s free MVP, demo mode transparency, and local backend
              roadmap.
            </p>
            <Link
              to="/faq"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 hover:text-white"
            >
              <span>View all FAQs</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="lg:col-span-8 space-y-3">
            {FAQ_PREVIEW.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-xl border border-white/[0.08] bg-[#13161F] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
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
                    <div className="px-5 pb-4 text-sm text-slate-300 leading-relaxed border-t border-white/[0.05] pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <ClipPlayerModal
        clip={previewClip}
        onClose={() => setPreviewClip(null)}
        onDownload={handleDownloadSample}
      />
    </>
  );
}

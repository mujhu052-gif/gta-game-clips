import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X, ArrowRight } from 'lucide-react';
import { YTClipLogo } from './YTClipLogo';

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features', end: false },
  { to: '/how-it-works', label: 'How It Works', end: false },
  { to: '/projects', label: 'My Projects', end: false },
];

export const Layout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D12] text-slate-100">
      {/* Three-zone top navigation bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] glass-surface">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand mark */}
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500 rounded-lg"
            aria-label="YTClip Home"
          >
            <YTClipLogo />
          </Link>

          {/* Zone 2: Concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Primary Navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `text-sm font-medium whitespace-nowrap shrink-0 transition-colors duration-150 py-1 border-b-2 ${
                    isActive
                      ? 'text-white border-violet-500'
                      : 'text-slate-400 border-transparent hover:text-white hover:border-white/25'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/generate"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white gradient-brand hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
            >
              <span>Start Clipping Free</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg border border-white/10 text-slate-200 hover:bg-white/5 transition-colors"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile navigation drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.08] bg-[#10131C] px-4 py-4 space-y-2">
            <nav className="flex flex-col space-y-1" aria-label="Mobile Navigation">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-violet-600/20 text-white'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <Link
                to="/editor"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
              >
                Video Editor
              </Link>
              <Link
                to="/faq"
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
              >
                FAQ
              </Link>
            </nav>
            <div className="pt-2 border-t border-white/[0.08]">
              <Link
                to="/generate"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white gradient-brand"
              >
                <span>Start Clipping Free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/[0.08] bg-[#090B10] mt-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="md:col-span-2 space-y-3">
              <YTClipLogo size="sm" />
              <p className="text-sm text-slate-400 max-w-md leading-relaxed">
                YTClip helps creators transform long videos into engaging short-form videos with
                automatic captions, smart clipping, and vertical video formatting. Free initial MVP
                with no registration, no subscriptions, and no watermarks.
              </p>
              <p className="text-xs text-slate-500">
                Free Tool · No Account Required · Zero Watermarks · Local-First Architecture
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Platform</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <Link to="/generate" className="hover:text-white transition-colors">
                    AI Clip Generator
                  </Link>
                </li>
                <li>
                  <Link to="/editor" className="hover:text-white transition-colors">
                    Video Editor
                  </Link>
                </li>
                <li>
                  <Link to="/projects" className="hover:text-white transition-colors">
                    My Projects
                  </Link>
                </li>
                <li>
                  <Link to="/features" className="hover:text-white transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link to="/how-it-works" className="hover:text-white transition-colors">
                    How It Works
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Resources & Legal</h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>
                  <Link to="/faq" className="hover:text-white transition-colors">
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition-colors">
                    Terms of Use
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} YTClip. Free open creator workflow.</span>
            <span>Ready for local Python, FFmpeg, faster-whisper, and OpenCV backend integration.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

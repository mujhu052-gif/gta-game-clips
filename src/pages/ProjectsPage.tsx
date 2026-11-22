import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, FolderOpen, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { consumeCorruptionFlag, resetAllLocalData } from '../services/storageService';
import { videoProcessingService } from '../services/videoProcessingService';
import { Project } from '../types/video';
import { formatDateShort, formatTimestamp } from '../utils/formatters';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [corruptedNotice, setCorruptedNotice] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const list = await videoProcessingService.getProjects();
      setProjects(list);
      if (consumeCorruptionFlag()) {
        setCorruptedNotice(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  const handleDelete = async (projectId: string) => {
    await videoProcessingService.deleteProject(projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const handleRestoreDemo = () => {
    resetAllLocalData();
    setCorruptedNotice(false);
    void loadList();
  };

  const filtered = projects.filter((p) =>
    p.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <>
      <PageMeta
        title="My Projects"
        description="Access your YTClip video clipping projects stored locally in your browser without registration or accounts."
      />

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-violet-300">
              No Account Required · Persistent Server Workspace + Local Demo Fallback
            </p>
            <h1 className="font-display text-3xl font-bold text-white tracking-tight">
              My Projects
            </h1>
            <p className="text-sm text-slate-400">
              Uploaded videos, background processing jobs, and rendered MP4 clips are persisted per
              workspace on the server so you can close the browser and resume anytime.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleRestoreDemo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-white/10 text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo Data</span>
            </button>
            <Link
              to="/generate"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white gradient-brand hover:opacity-95 transition-opacity whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </Link>
          </div>
        </div>

        {corruptedNotice && (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Some corrupted local project metadata was detected and safely skipped. You can
                restore the default sample project at any time.
              </span>
            </div>
            <button
              type="button"
              onClick={handleRestoreDemo}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-100 font-medium hover:bg-amber-500/30 shrink-0"
            >
              Restore Sample Project
            </button>
          </div>
        )}

        {/* Search Input */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects by title..."
            aria-label="Search projects"
            className="w-full rounded-xl bg-[#13161F] border border-white/10 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-44 rounded-xl border border-white/[0.06] bg-[#13161F] animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#13161F] p-10 text-center space-y-4">
            <p className="text-base font-semibold text-white">
              {projects.length === 0 ? 'No saved projects yet' : 'No projects match your search'}
            </p>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Upload a local video in the AI Clip Generator or restore the sample studio project to
              explore clipping and subtitle editing.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <Link
                to="/generate"
                className="px-5 py-2.5 rounded-lg text-xs font-semibold text-white gradient-brand"
              >
                Start Clipping Free
              </Link>
              <button
                type="button"
                onClick={handleRestoreDemo}
                className="px-4 py-2.5 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5"
              >
                Restore Sample Project
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((project) => (
              <article
                key={project.id}
                className="rounded-xl border border-white/[0.08] bg-[#13161F] p-5 flex flex-col justify-between gap-5"
              >
                <div className="space-y-2.5">
                  <div className="text-xs font-mono tabular-nums text-slate-400">
                    {formatDateShort(project.createdAt)} ·{' '}
                    <span className="capitalize">{project.status}</span>
                    {project.isDemoMode ? ' · Demo' : ''}
                  </div>
                  <h2 className="text-base font-semibold text-white leading-snug">
                    {project.title}
                  </h2>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06] text-xs">
                    <div>
                      <span className="text-slate-500 block">Source Duration</span>
                      <span className="font-mono tabular-nums text-slate-200 font-medium">
                        {formatTimestamp(project.sourceVideo.durationSeconds)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Generated Clips</span>
                      <span className="font-mono tabular-nums text-slate-200 font-medium">
                        {project.clipCount} clips
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/generate?project=${encodeURIComponent(project.id)}`)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white gradient-brand hover:opacity-95 transition-opacity"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open Project</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(project.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-xs font-medium text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors"
                    aria-label={`Delete ${project.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

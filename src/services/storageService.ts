import { createDemoSeedData, DEFAULT_CLIP_SETTINGS } from '../data/demoSamples';
import { GeneratedClip, Highlight, Project, UserPreferences } from '../types/video';

const KEYS = {
  INITIALIZED: 'ytclip_initialized_v1',
  PROJECTS: 'ytclip_projects_v1',
  CLIPS: 'ytclip_clips_v1',
  HIGHLIGHTS: 'ytclip_highlights_v1',
  PREFERENCES: 'ytclip_preferences_v1',
} as const;

let corruptionDetected = false;

function safeParse<T>(raw: string | null, fallback: T, validator: (val: unknown) => val is T): T {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validator(parsed)) {
      return parsed;
    }
    corruptionDetected = true;
    return fallback;
  } catch {
    corruptionDetected = true;
    return fallback;
  }
}

function isProjectArray(val: unknown): val is Project[] {
  return (
    Array.isArray(val) &&
    val.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Project).id === 'string' &&
        typeof (item as Project).title === 'string' &&
        typeof (item as Project).sourceVideo === 'object'
    )
  );
}

function isClipArray(val: unknown): val is GeneratedClip[] {
  return (
    Array.isArray(val) &&
    val.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as GeneratedClip).id === 'string' &&
        typeof (item as GeneratedClip).projectId === 'string'
    )
  );
}

function isHighlightArray(val: unknown): val is Highlight[] {
  return (
    Array.isArray(val) &&
    val.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Highlight).id === 'string' &&
        typeof (item as Highlight).projectId === 'string'
    )
  );
}

function isPreferences(val: unknown): val is UserPreferences {
  return (
    typeof val === 'object' &&
    val !== null &&
    typeof (val as UserPreferences).maxFileSizeMb === 'number' &&
    typeof (val as UserPreferences).defaultClipSettings === 'object'
  );
}

export function ensureSeededStorage(): void {
  try {
    const initialized = localStorage.getItem(KEYS.INITIALIZED);
    if (!initialized) {
      const seed = createDemoSeedData();
      localStorage.setItem(KEYS.PROJECTS, JSON.stringify([seed.project]));
      localStorage.setItem(KEYS.HIGHLIGHTS, JSON.stringify(seed.highlights));
      localStorage.setItem(KEYS.CLIPS, JSON.stringify(seed.clips));
      localStorage.setItem(KEYS.INITIALIZED, 'true');
    }
  } catch {
    // Ignore storage quota / restricted private mode errors gracefully
  }
}

export function consumeCorruptionFlag(): boolean {
  const flag = corruptionDetected;
  corruptionDetected = false;
  return flag;
}

export function loadProjects(): Project[] {
  ensureSeededStorage();
  try {
    const raw = localStorage.getItem(KEYS.PROJECTS);
    return safeParse(raw, [], isProjectArray);
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    // Explicitly strip any ephemeral objectUrl before persistence
    const sanitized = projects.map((p) => {
      const { objectUrl: _ignored, ...restSource } = p.sourceVideo as Project['sourceVideo'] & {
        objectUrl?: string;
      };
      return { ...p, sourceVideo: restSource };
    });
    localStorage.setItem(KEYS.PROJECTS, JSON.stringify(sanitized));
  } catch {
    // Ignore storage write failures gracefully
  }
}

export function loadClips(): GeneratedClip[] {
  ensureSeededStorage();
  try {
    const raw = localStorage.getItem(KEYS.CLIPS);
    return safeParse(raw, [], isClipArray);
  } catch {
    return [];
  }
}

export function saveClips(clips: GeneratedClip[]): void {
  try {
    const sanitized = clips.map((c) => {
      const { renderedUrl: _ignored, ...rest } = c;
      return rest;
    });
    localStorage.setItem(KEYS.CLIPS, JSON.stringify(sanitized));
  } catch {
    // Ignore storage write failures gracefully
  }
}

export function loadHighlights(): Highlight[] {
  ensureSeededStorage();
  try {
    const raw = localStorage.getItem(KEYS.HIGHLIGHTS);
    return safeParse(raw, [], isHighlightArray);
  } catch {
    return [];
  }
}

export function saveHighlights(highlights: Highlight[]): void {
  try {
    localStorage.setItem(KEYS.HIGHLIGHTS, JSON.stringify(highlights));
  } catch {
    // Ignore storage write failures gracefully
  }
}

export function loadPreferences(): UserPreferences {
  const fallback: UserPreferences = {
    maxFileSizeMb: Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 500,
    defaultClipSettings: { ...DEFAULT_CLIP_SETTINGS },
  };
  try {
    const raw = localStorage.getItem(KEYS.PREFERENCES);
    return safeParse(raw, fallback, isPreferences);
  } catch {
    return fallback;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(KEYS.PREFERENCES, JSON.stringify(prefs));
  } catch {
    // Ignore storage write failures
  }
}

export function resetAllLocalData(): void {
  try {
    localStorage.removeItem(KEYS.PROJECTS);
    localStorage.removeItem(KEYS.CLIPS);
    localStorage.removeItem(KEYS.HIGHLIGHTS);
    localStorage.removeItem(KEYS.INITIALIZED);
    corruptionDetected = false;
    ensureSeededStorage();
  } catch {
    // Ignore errors
  }
}

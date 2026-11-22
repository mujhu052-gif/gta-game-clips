import {
  ClipSettings,
  CropKeyframe,
  GeneratedClip,
  Highlight,
  Project,
  SourceVideo,
  TranscriptSegment,
} from '../types/video';
import { buildWordTimestampsForSegment, getDefaultSubtitleStyle } from '../utils/formatters';

export const DEMO_STUDIO_POSTER = '/src/assets/images/hero_creator_studio_1795306340009.jpg';

export const DEMO_CLIP_FRAMES = [
  '/src/assets/images/clip_sample_podcast_1795306340333.jpg',
  '/src/assets/images/clip_sample_tech_1795306339980.jpg',
  '/src/assets/images/clip_sample_keynote_1795306341115.jpg',
];

export const DEFAULT_CLIP_SETTINGS: ClipSettings = {
  targetDuration: 45,
  aspectRatio: '9:16',
  captionTemplate: 'Viral Pop',
  exportQuality: '1080p',
  includeEmojis: true,
};

export function buildDemoKeyframes(start: number, end: number): CropKeyframe[] {
  const span = Math.max(4, end - start);
  return [
    {
      id: 'kf-1',
      time: Number(start.toFixed(1)),
      centerX: 0.46,
      centerY: 0.42,
      faceBox: { x: 0.36, y: 0.18, w: 0.2, h: 0.32 },
      source: 'auto',
    },
    {
      id: 'kf-2',
      time: Number((start + span * 0.34).toFixed(1)),
      centerX: 0.52,
      centerY: 0.44,
      faceBox: { x: 0.42, y: 0.2, w: 0.2, h: 0.32 },
      source: 'auto',
    },
    {
      id: 'kf-3',
      time: Number((start + span * 0.68).toFixed(1)),
      centerX: 0.49,
      centerY: 0.43,
      faceBox: { x: 0.39, y: 0.19, w: 0.2, h: 0.32 },
      source: 'auto',
    },
    {
      id: 'kf-4',
      time: Number(end.toFixed(1)),
      centerX: 0.5,
      centerY: 0.43,
      faceBox: { x: 0.4, y: 0.19, w: 0.2, h: 0.32 },
      source: 'auto',
    },
  ];
}

export function buildTranscriptSegments(
  start: number,
  end: number,
  lines: string[]
): TranscriptSegment[] {
  const total = Math.max(4, end - start);
  const step = total / lines.length;
  return lines.map((text, idx) => {
    const segStart = Number((start + idx * step).toFixed(2));
    const segEnd = Number((start + (idx + 1) * step).toFixed(2));
    return {
      id: `seg-${start}-${idx}`,
      startTime: segStart,
      endTime: segEnd,
      text,
      words: buildWordTimestampsForSegment(text, segStart, segEnd),
    };
  });
}

export function createDemoSeedData(): {
  project: Project;
  highlights: Highlight[];
  clips: GeneratedClip[];
} {
  const projectId = 'demo-project-podcast-42';
  const now = new Date().toISOString();

  const sourceVideo: Omit<SourceVideo, 'objectUrl'> = {
    id: 'demo-src-42',
    filename: 'creator-podcast-ep42-master.mp4',
    fileSizeBytes: 384 * 1024 * 1024,
    mimeType: 'video/mp4',
    durationSeconds: 1842,
    width: 1920,
    height: 1080,
    isDemoSample: true,
    posterUrl: DEMO_STUDIO_POSTER,
    uploadedAt: now,
  };

  const project: Project = {
    id: projectId,
    title: 'Creator Podcast Ep. 42 — Audience Retention',
    sourceVideo,
    clipSettings: { ...DEFAULT_CLIP_SETTINGS },
    status: 'completed',
    clipCount: 3,
    isDemoMode: true,
    createdAt: now,
    updatedAt: now,
  };

  const highlights: Highlight[] = [
    {
      id: 'hl-demo-1',
      projectId,
      startTime: 142,
      endTime: 187,
      transcriptExcerpt:
        'Most creators spend eighty percent of their time on the thumbnail and two minutes on the first five seconds of audio. Fix the opening question and watch retention double.',
      suggestedHook: 'Why your first 5 seconds decide the whole video',
      selectionReason:
        'Strong opening curiosity hook · +4.1 dB vocal energy peak · Snapped to complete thought boundary',
      hookScore: 94,
      audioEnergyScore: 89,
      sceneChanges: 2,
      sentenceComplete: true,
      highlightScore: 92,
      selected: true,
    },
    {
      id: 'hl-demo-2',
      projectId,
      startTime: 518,
      endTime: 561,
      transcriptExcerpt:
        'When we switched from scripted monologues to live hardware teardowns on camera, average view duration jumped from three minutes to eleven.',
      suggestedHook: 'The single format shift that tripled watch time',
      selectionReason:
        'Complete storytelling turnaround · High speech density (96% active) · 3 visual transitions',
      hookScore: 88,
      audioEnergyScore: 86,
      sceneChanges: 3,
      sentenceComplete: true,
      highlightScore: 87,
      selected: true,
    },
    {
      id: 'hl-demo-3',
      projectId,
      startTime: 1094,
      endTime: 1138,
      transcriptExcerpt:
        'Repurposing long-form interviews into vertical clips only works if every short delivers one complete takeaway without needing context.',
      suggestedHook: 'Stop cutting random 30-second podcast quotes',
      selectionReason:
        'Contrarian hook phrase · Steady cadence with zero dead air · Complete sentence ending',
      hookScore: 86,
      audioEnergyScore: 82,
      sceneChanges: 1,
      sentenceComplete: true,
      highlightScore: 84,
      selected: true,
    },
    {
      id: 'hl-demo-4',
      projectId,
      startTime: 1460,
      endTime: 1502,
      transcriptExcerpt:
        'Consistent lighting and clean room acoustics beat an expensive cinema camera every single time for short-form feeds.',
      suggestedHook: 'Audio clarity beats 8K cameras on Shorts',
      selectionReason: 'Actionable creator insight · Clean pause boundaries',
      hookScore: 78,
      audioEnergyScore: 75,
      sceneChanges: 1,
      sentenceComplete: true,
      highlightScore: 76,
      selected: false,
    },
  ];

  const clips: GeneratedClip[] = [
    {
      id: 'clip-demo-1',
      projectId,
      highlightId: 'hl-demo-1',
      title: 'Fix Your Opening 5 Seconds',
      startTime: 142,
      endTime: 187,
      durationSeconds: 45,
      aspectRatio: '9:16',
      suggestedHook: 'Why your first 5 seconds decide the whole video',
      selectionReason: highlights[0].selectionReason,
      highlightScore: 92,
      suggestedTitle: 'The 5-Second Hook Rule Every Creator Misses',
      suggestedHashtags: ['#CreatorTips', '#YouTubeShorts', '#VideoEditing'],
      subtitleStatus: 'auto-generated',
      subtitleStyle: getDefaultSubtitleStyle('Viral Pop'),
      transcriptSegments: buildTranscriptSegments(142, 187, [
        'Most creators spend 80% on thumbnails',
        'and ignore the first five seconds.',
        'Open with the real tension immediately',
        'and watch viewer retention double.',
      ]),
      cropKeyframes: buildDemoKeyframes(142, 187),
      autoCropKeyframes: buildDemoKeyframes(142, 187),
      trackingEngine: 'demo',
      transcriptionEngine: 'demo',
      exportSettings: { format: 'mp4', quality: '1080p', aspectRatio: '9:16' },
      previewImageUrl: DEMO_CLIP_FRAMES[0],
      isDemoSample: true,
      updatedAt: now,
    },
    {
      id: 'clip-demo-2',
      projectId,
      highlightId: 'hl-demo-2',
      title: 'Live Hardware Demo Format Shift',
      startTime: 518,
      endTime: 561,
      durationSeconds: 43,
      aspectRatio: '9:16',
      suggestedHook: 'The single format shift that tripled watch time',
      selectionReason: highlights[1].selectionReason,
      highlightScore: 87,
      suggestedTitle: 'Why Unscripted Demos Beat Polished Monologues',
      suggestedHashtags: ['#ProductDesign', '#Reels', '#ContentStrategy'],
      subtitleStatus: 'auto-generated',
      subtitleStyle: getDefaultSubtitleStyle('Highlight'),
      transcriptSegments: buildTranscriptSegments(518, 561, [
        'When we dropped stiff scripted monologues',
        'for live hardware teardowns on camera',
        'viewers saw every real trade-off',
        'and watch time jumped to 11 minutes.',
      ]),
      cropKeyframes: buildDemoKeyframes(518, 561),
      autoCropKeyframes: buildDemoKeyframes(518, 561),
      trackingEngine: 'demo',
      transcriptionEngine: 'demo',
      exportSettings: { format: 'mp4', quality: '1080p', aspectRatio: '9:16' },
      previewImageUrl: DEMO_CLIP_FRAMES[1],
      isDemoSample: true,
      updatedAt: now,
    },
    {
      id: 'clip-demo-3',
      projectId,
      highlightId: 'hl-demo-3',
      title: 'Standalone Short-Form Storytelling',
      startTime: 1094,
      endTime: 1138,
      durationSeconds: 44,
      aspectRatio: '9:16',
      suggestedHook: 'Stop cutting random 30-second podcast quotes',
      selectionReason: highlights[2].selectionReason,
      highlightScore: 84,
      suggestedTitle: 'How to Cut Long Interviews Into Complete Shorts',
      suggestedHashtags: ['#PodcastClips', '#TikTokTips', '#YTClip'],
      subtitleStatus: 'auto-generated',
      subtitleStyle: getDefaultSubtitleStyle('Classic'),
      transcriptSegments: buildTranscriptSegments(1094, 1138, [
        'Repurposing interviews into vertical shorts',
        'only works when each clip stands alone.',
        'Give viewers one clear setup',
        'and a clean ending with zero missing context.',
      ]),
      cropKeyframes: buildDemoKeyframes(1094, 1138),
      autoCropKeyframes: buildDemoKeyframes(1094, 1138),
      trackingEngine: 'demo',
      transcriptionEngine: 'demo',
      exportSettings: { format: 'mp4', quality: '1080p', aspectRatio: '9:16' },
      previewImageUrl: DEMO_CLIP_FRAMES[2],
      isDemoSample: true,
      updatedAt: now,
    },
  ];

  return { project, highlights, clips };
}

export function generateDemoHighlightsForVideo(
  projectId: string,
  durationSeconds: number,
  targetDuration: number
): Highlight[] {
  const safeDuration = Math.max(45, durationSeconds);
  const clipLen = Math.min(targetDuration, Math.max(15, Math.floor(safeDuration * 0.45)));

  const ratios = [0.12, 0.36, 0.62, 0.82];
  const templates = [
    {
      excerpt:
        'Here is the clearest breakdown of the core problem and why traditional workflows slow creators down before editing even starts.',
      hook: 'The real bottleneck slowing down your video workflow',
      reason: 'Opening curiosity statement · Clean pause boundaries',
      score: 90,
      selected: true,
    },
    {
      excerpt:
        'Look closely at how pacing changes once you trim dead air and pair tight captions with a strong opening statement.',
      hook: 'How tight pacing keeps viewers watching to the end',
      reason: 'Actionable insight · High estimated speech cadence',
      score: 85,
      selected: true,
    },
    {
      excerpt:
        'This practical example shows how one vertical cut can reach new audiences across Shorts, Reels, and TikTok simultaneously.',
      hook: 'One vertical edit, three short-form platforms',
      reason: 'Clear takeaway · Complete thought arc',
      score: 81,
      selected: true,
    },
    {
      excerpt:
        'Always verify audio levels and caption safe-zones so key words never sit behind platform buttons or navigation overlays.',
      hook: 'Avoid the caption placement mistake most editors make',
      reason: 'Mistake-avoidance hook · Clean ending',
      score: 74,
      selected: false,
    },
  ];

  return templates.map((item, idx) => {
    const maxStart = Math.max(0, safeDuration - clipLen);
    const startTime = Math.min(maxStart, Math.floor(safeDuration * ratios[idx]));
    const endTime = Math.min(Math.floor(safeDuration), startTime + clipLen);
    return {
      id: `hl-${projectId}-${idx + 1}`,
      projectId,
      startTime,
      endTime: Math.max(startTime + 5, endTime),
      transcriptExcerpt: item.excerpt,
      suggestedHook: item.hook,
      selectionReason: item.reason,
      hookScore: item.score,
      audioEnergyScore: item.score - 3,
      sceneChanges: idx % 3 + 1,
      sentenceComplete: true,
      highlightScore: item.score,
      selected: item.selected,
    };
  });
}

export function generateClipsFromHighlightList(
  project: Project,
  highlights: Highlight[],
  isDemoSample: boolean
): GeneratedClip[] {
  const selected = highlights.filter((h) => h.selected);
  const pool = selected.length > 0 ? selected : highlights.slice(0, 2);
  const now = new Date().toISOString();

  return pool.map((hl, idx) => {
    const dur = Math.max(5, Math.round(hl.endTime - hl.startTime));
    const lines = [
      hl.suggestedHook,
      ...hl.transcriptExcerpt
        .split(/(?<=[.,])\s+/)
        .filter(Boolean)
        .slice(0, 3),
    ];
    const kfs = buildDemoKeyframes(hl.startTime, hl.endTime);

    return {
      id: `clip-${project.id}-${idx + 1}-${Date.now().toString().slice(-4)}`,
      projectId: project.id,
      highlightId: hl.id,
      title: `Clip ${idx + 1}: ${hl.suggestedHook.slice(0, 34)}`,
      startTime: hl.startTime,
      endTime: hl.endTime,
      durationSeconds: dur,
      aspectRatio: project.clipSettings.aspectRatio,
      suggestedHook: hl.suggestedHook,
      selectionReason: hl.selectionReason,
      highlightScore: hl.highlightScore,
      suggestedTitle: `${hl.suggestedHook} | Short Cut`,
      suggestedHashtags: ['#Shorts', '#Reels', '#YTClip'],
      subtitleStatus: 'auto-generated',
      subtitleStyle: getDefaultSubtitleStyle(project.clipSettings.captionTemplate),
      transcriptSegments: buildTranscriptSegments(hl.startTime, hl.endTime, lines),
      cropKeyframes: kfs,
      autoCropKeyframes: kfs,
      trackingEngine: 'demo',
      transcriptionEngine: 'demo',
      exportSettings: {
        format: 'mp4',
        quality: project.clipSettings.exportQuality,
        aspectRatio: project.clipSettings.aspectRatio,
      },
      previewImageUrl: DEMO_CLIP_FRAMES[idx % DEMO_CLIP_FRAMES.length],
      isDemoSample,
      updatedAt: now,
    };
  });
}

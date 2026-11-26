import { cleanTitle } from "./normalize.ts";
import type { ClipNotes, SlimTrack } from "./types.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL = "00000000-0000-0000-0000-000000000000";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function realId(value: unknown): string {
  const id = str(value);
  if (!id || id === NIL || !UUID_RE.test(id)) return "";
  return id;
}

function slidersFrom(value: unknown): Record<string, number> {
  const record = asRecord(value);
  const sliders: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "number" && Number.isFinite(entry)) sliders[key] = entry;
  }
  return sliders;
}

function badgesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const entry of value) {
    const name = str(asRecord(entry).display_name);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export function emptyNotes(id: string): ClipNotes {
  return {
    id,
    title: "Untitled",
    artist: "",
    handle: "",
    createdAt: "",
    updatedAt: "",
    duration: 0,
    explicit: false,
    model: "",
    modelName: "",
    displayTags: "",
    style: "",
    negativeStyle: "",
    lyrics: "",
    type: "",
    task: "",
    instrumental: false,
    hasVocal: false,
    remix: false,
    canRemix: false,
    hasStem: false,
    sliders: {},
    coverOf: "",
    persona: "",
    badges: [],
    plays: 0,
    likes: 0,
    comments: 0,
    image: "",
    videoUrl: "",
    songUrl: id ? `https://suno.com/song/${id}` : "",
  };
}

export function notesFromTrack(track: SlimTrack): ClipNotes {
  return {
    ...emptyNotes(track.id),
    title: track.title || "Untitled",
    artist: track.artist,
    handle: track.handle,
    createdAt: track.createdAt,
    duration: track.duration,
    explicit: track.explicit,
    model: track.model,
    displayTags: track.tags,
    lyrics: track.lyrics,
    plays: track.sunoPlays,
    likes: track.sunoLikes,
    image: track.image,
    videoUrl: track.videoUrl,
  };
}

export function notesFromRaw(raw: unknown): ClipNotes | null {
  const clip = asRecord(raw);
  const id = realId(clip.id);
  if (!id) return null;
  const metadata = asRecord(clip.metadata);
  const cover = realId(metadata.cover_clip_id);
  const persona = str(asRecord(clip.persona).name);
  return {
    id,
    title: cleanTitle(str(clip.title) || "Untitled"),
    artist: str(clip.display_name) || str(clip.handle) || "Suno",
    handle: str(clip.handle),
    createdAt: str(clip.created_at),
    updatedAt: str(clip.updated_at),
    duration: num(metadata.duration),
    explicit: Boolean(clip.explicit),
    model: str(clip.major_model_version),
    modelName: str(clip.model_name),
    displayTags: str(clip.display_tags),
    style: str(metadata.tags),
    negativeStyle: str(metadata.negative_tags),
    lyrics: str(metadata.prompt),
    type: str(metadata.type),
    task: str(metadata.task),
    instrumental: Boolean(metadata.make_instrumental),
    hasVocal: Boolean(metadata.has_vocal),
    remix: Boolean(metadata.is_remix),
    canRemix: Boolean(metadata.can_remix),
    hasStem: Boolean(metadata.has_stem),
    sliders: slidersFrom(metadata.control_sliders),
    coverOf: cover ? `https://suno.com/song/${cover}` : "",
    persona,
    badges: badgesFrom(metadata.secondary_badges),
    plays: num(clip.play_count),
    likes: num(clip.upvote_count),
    comments: num(clip.comment_count),
    image: str(clip.image_large_url) || str(clip.image_url),
    videoUrl: str(clip.video_url),
    songUrl: `https://suno.com/song/${id}`,
  };
}

export function mergeNotes(base: ClipNotes, extra: ClipNotes | null): ClipNotes {
  if (!extra) return base;
  return {
    ...base,
    ...extra,
    title: extra.title && extra.title !== "Untitled" ? extra.title : base.title,
    artist: extra.artist || base.artist,
    handle: extra.handle || base.handle,
    lyrics: extra.lyrics || base.lyrics,
    style: extra.style || base.style,
    negativeStyle: extra.negativeStyle || base.negativeStyle,
    displayTags: extra.displayTags || base.displayTags,
    model: extra.model || base.model,
    modelName: extra.modelName || base.modelName,
    image: extra.image || base.image,
    videoUrl: extra.videoUrl || base.videoUrl,
    persona: extra.persona || base.persona,
    coverOf: extra.coverOf || base.coverOf,
    createdAt: extra.createdAt || base.createdAt,
    sliders: Object.keys(extra.sliders).length ? extra.sliders : base.sliders,
    badges: extra.badges.length ? extra.badges : base.badges,
  };
}

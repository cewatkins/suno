import { createServerFn } from "@tanstack/react-start";
import { normalizeClip, parseHandle, parseUuid } from "@/lib/suno/normalize";
import { notesFromRaw } from "@/lib/suno/notes";
import type { ClipNotes, SlimTrack, StationPage, StationPlaylist } from "@/lib/suno/types";

const API = "https://studio-api.prod.suno.com";

async function sunoGet(path: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (compatible; Blackwire/1.0; +https://suno.com)",
      referer: "https://suno.com/",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) {
    throw new Error("Suno has no public page for that.");
  }
  if (!response.ok) {
    throw new Error(`Suno didn't answer (${response.status}).`);
  }
  return response.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function clipsFrom(value: unknown): SlimTrack[] {
  const record = asRecord(value);
  const list = Array.isArray(record.clips)
    ? record.clips
    : Array.isArray(record.playlist_clips)
      ? record.playlist_clips.map((entry) => asRecord(entry).clip)
      : [];
  const tracks: SlimTrack[] = [];
  for (const entry of list) {
    const track = normalizeClip(asRecord(entry) as never);
    if (track) tracks.push(track);
  }
  return tracks;
}

function playlistsFrom(value: unknown): StationPlaylist[] {
  const list = asRecord(value).playlists;
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      const row = asRecord(entry);
      const id = String(row.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      return {
        id,
        name: String(row.name || "Playlist"),
        songCount: Number(row.song_count ?? row.num_total_results ?? 0),
        image: String(row.image_url || ""),
      };
    })
    .filter((row): row is StationPlaylist => row !== null);
}

export const getStationPage = createServerFn({ method: "GET" })
  .validator((input: { handle?: string; page?: number }) => {
    const handle = parseHandle(input?.handle);
    const page = Math.max(1, Math.min(80, Math.floor(Number(input?.page) || 1)));
    return { handle, page };
  })
  .handler(async ({ data }): Promise<StationPage> => {
    const query = new URLSearchParams({
      page: String(data.page),
      playlists_sort_by: "upvote_count",
      clips_sort_by: "created_at",
    });
    const body = asRecord(
      await sunoGet(`/api/profiles/${data.handle}?${query.toString()}`),
    );
    const stats = asRecord(body.stats);
    return {
      handle: String(body.handle || data.handle),
      displayName: String(body.display_name || data.handle),
      description: String(body.profile_description || ""),
      avatar: String(body.avatar_image_url || ""),
      followers: Number(stats.followers_count || 0),
      totalClips: Number(body.num_total_clips || 0),
      sunoPlays: Number(stats.play_count__sum || 0),
      sunoLikes: Number(stats.upvote_count__sum || 0),
      page: Number(body.current_page || data.page),
      tracks: clipsFrom(body),
      playlists: data.page === 1 ? playlistsFrom(body) : [],
    };
  });

export const getPlaylistPage = createServerFn({ method: "GET" })
  .validator((input: { id?: string; page?: number }) => {
    const id = parseUuid(input?.id, "playlist");
    const page = Math.max(1, Math.min(40, Math.floor(Number(input?.page) || 1)));
    return { id, page };
  })
  .handler(async ({ data }) => {
    const body = asRecord(
      await sunoGet(`/api/playlist/${data.id}/?page=${data.page}`),
    );
    return {
      id: data.id,
      name: String(body.name || "Playlist"),
      songCount: Number(body.num_total_results ?? body.song_count ?? 0),
      page: Number(body.current_page || data.page),
      tracks: clipsFrom(body),
    };
  });

export const getClip = createServerFn({ method: "GET" })
  .validator((input: { id?: string }) => ({ id: parseUuid(input?.id, "song") }))
  .handler(async ({ data }) => {
    const body = asRecord(await sunoGet(`/api/clip/${data.id}`));
    const track = normalizeClip(body as never);
    if (!track) throw new Error("That song isn't public.");
    return track;
  });

export const getClipNotes = createServerFn({ method: "GET" })
  .validator((input: { id?: string }) => ({ id: parseUuid(input?.id, "song") }))
  .handler(async ({ data }): Promise<ClipNotes> => {
    const body = asRecord(await sunoGet(`/api/clip/${data.id}`));
    const notes = notesFromRaw(body);
    if (!notes) throw new Error("That song isn't public.");
    return notes;
  });

export const getRandomBatch = createServerFn({ method: "GET" })
  .validator((input: { handle?: string; count?: number; avoid?: string[]; totalHint?: number }) => {
    const handle = parseHandle(input?.handle);
    const count = Math.max(1, Math.min(12, Math.floor(Number(input?.count) || 1)));
    const avoid = Array.isArray(input?.avoid)
      ? input.avoid.filter((id) => typeof id === "string").slice(0, 40)
      : [];
    const totalHint = Math.max(0, Math.min(5000, Math.floor(Number(input?.totalHint) || 0)));
    return { handle, count, avoid, totalHint };
  })
  .handler(async ({ data }) => {
    const avoid = new Set(data.avoid);
    let total = data.totalHint;
    let seed: Record<string, unknown> | null = null;
    if (!total) {
      const query = new URLSearchParams({
        page: "1",
        playlists_sort_by: "upvote_count",
        clips_sort_by: "created_at",
      });
      seed = asRecord(await sunoGet(`/api/profiles/${data.handle}?${query.toString()}`));
      total = Number(seed.num_total_clips || 0);
    }
    const pageSize = 20;
    const pages = Math.max(1, Math.ceil((total || pageSize) / pageSize));
    const wantedPages = new Set<number>();
    while (wantedPages.size < Math.min(3, pages)) {
      wantedPages.add(1 + Math.floor(Math.random() * pages));
    }
    const pooled: SlimTrack[] = [];
    for (const page of wantedPages) {
      let body = seed && page === 1 ? seed : null;
      if (!body) {
        const query = new URLSearchParams({
          page: String(page),
          playlists_sort_by: "upvote_count",
          clips_sort_by: "created_at",
        });
        body = asRecord(await sunoGet(`/api/profiles/${data.handle}?${query.toString()}`));
      }
      pooled.push(...clipsFrom(body));
    }
    const fresh = pooled.filter((track) => !avoid.has(track.id));
    const source = fresh.length ? fresh : pooled;
    const bag = [...source];
    const tracks: SlimTrack[] = [];
    while (bag.length && tracks.length < data.count) {
      const index = Math.floor(Math.random() * bag.length);
      const [track] = bag.splice(index, 1);
      if (track && !tracks.some((item) => item.id === track.id)) tracks.push(track);
    }
    return { total, tracks };
  });

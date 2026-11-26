#!/usr/bin/env node
/**
 * Blackwire test client for a public Suno channel.
 *
 *   node cli/suno.mjs station drmad69
 *   node cli/suno.mjs page drmad69 1
 *   node cli/suno.mjs random drmad69 --mark
 *   node cli/suno.mjs plays
 *
 * Plays are counted in ~/.blackwire/plays.json when you pass --mark.
 * This does not download the catalog. `random` prints one public song.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const API = "https://studio-api.prod.suno.com";
const HOME = path.join(os.homedir(), ".blackwire", "plays.json");

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positionals = args.filter((arg) => !arg.startsWith("--"));
const command = positionals[0] || "help";

function help() {
  console.log(`Blackwire CLI — public Suno channel probe

  node cli/suno.mjs station [handle]
  node cli/suno.mjs page [handle] [page]
  node cli/suno.mjs random [handle] [--mark]
  node cli/suno.mjs playlist <id>
  node cli/suno.mjs plays

Default handle: drmad69
--mark    count that spin in ~/.blackwire/plays.json
`);
}

async function sunoGet(apiPath) {
  const response = await fetch(`${API}${apiPath}`, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; BlackwireCLI/1.0)",
      referer: "https://suno.com/",
    },
  });
  if (!response.ok) {
    throw new Error(`Suno ${response.status} for ${apiPath}`);
  }
  return response.json();
}

function profilePath(handle, page) {
  const query = new URLSearchParams({
    page: String(page),
    playlists_sort_by: "upvote_count",
    clips_sort_by: "created_at",
  });
  return `/api/profiles/${handle}?${query.toString()}`;
}

function brief(clip) {
  const duration = Math.round(clip?.metadata?.duration || 0);
  return {
    id: clip.id,
    title: clip.title,
    artist: clip.display_name,
    handle: clip.handle,
    tags: clip.display_tags || "",
    duration,
    sunoPlays: clip.play_count || 0,
    video: clip.video_url || "",
    createdAt: clip.created_at || "",
  };
}

async function loadPlays() {
  try {
    return JSON.parse(await readFile(HOME, "utf8"));
  } catch {
    return {};
  }
}

async function mark(clip) {
  await mkdir(path.dirname(HOME), { recursive: true });
  const plays = await loadPlays();
  const prev = plays[clip.id] || { title: clip.title, plays: 0, lastAt: null };
  plays[clip.id] = {
    title: clip.title,
    plays: prev.plays + 1,
    lastAt: new Date().toISOString(),
  };
  await writeFile(HOME, JSON.stringify(plays, null, 2));
  return plays[clip.id];
}

async function station(handle) {
  const body = await sunoGet(profilePath(handle, 1));
  const stats = body.stats || {};
  console.log(
    JSON.stringify(
      {
        handle: body.handle,
        displayName: body.display_name,
        description: body.profile_description || "",
        total: body.num_total_clips,
        followers: stats.followers_count || 0,
        sunoPlays: stats.play_count__sum || 0,
        playlists: (body.playlists || []).map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
          songs: playlist.song_count,
        })),
        page1: (body.clips || []).map(brief),
      },
      null,
      2,
    ),
  );
}

async function page(handle, pageNumber) {
  const body = await sunoGet(profilePath(handle, pageNumber));
  console.log(
    JSON.stringify(
      {
        handle,
        page: body.current_page,
        total: body.num_total_clips,
        tracks: (body.clips || []).map(brief),
      },
      null,
      2,
    ),
  );
}

async function random(handle) {
  const first = await sunoGet(profilePath(handle, 1));
  const total = first.num_total_clips || 1;
  const pages = Math.max(1, Math.ceil(total / 20));
  const pick = 1 + Math.floor(Math.random() * pages);
  const body = pick === 1 ? first : await sunoGet(profilePath(handle, pick));
  const clips = (body.clips || []).filter((clip) => clip.video_url && clip.status === "complete");
  if (!clips.length) throw new Error("No playable public songs on that page.");
  const clip = clips[Math.floor(Math.random() * clips.length)];
  const row = brief(clip);
  if (flags.has("--mark")) row.local = await mark(clip);
  console.log(JSON.stringify(row, null, 2));
}

async function playlist(id) {
  const body = await sunoGet(`/api/playlist/${id}/?page=1`);
  const tracks = (body.playlist_clips || []).map((entry) => brief(entry.clip || entry));
  console.log(JSON.stringify({ name: body.name, count: body.num_total_results, tracks }, null, 2));
}

async function plays() {
  const data = await loadPlays();
  const rows = Object.entries(data)
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.plays - a.plays);
  console.log(JSON.stringify(rows, null, 2));
}

const handle = (positionals[1] || "drmad69").replace(/^@/, "");

try {
  if (command === "help" || command === "--help") help();
  else if (command === "station") await station(handle);
  else if (command === "page") await page(handle, Number(positionals[2] || 1));
  else if (command === "random") await random(handle);
  else if (command === "playlist") {
    if (!positionals[1]) throw new Error("playlist needs an id");
    await playlist(positionals[1]);
  } else if (command === "plays") await plays();
  else {
    help();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

# Blackwire

A dark blue channel player for a public [Suno](https://suno.com) profile. It defaults to `@drmad69` and will tune any other public handle.

Suno's official API is partner-only and undocumented. Blackwire does not use a session cookie and does not generate songs. It reads the same public profile JSON the website already serves, then plays each song's public video file (that file is a normal MP4 with an AAC audio track). The separate `.m4a` link on the clip is not a standard audio file, so the deck does not use it.

## What you can do

- Play, pause, seek, previous, next, volume
- Shuffle, repeat off / all / one, and a radio mode that pulls another public song when the queue runs out
- Queue songs, reorder them, or queue a playlist
- Search and sort whatever pages you have indexed
- Log spins in this browser: play count, finishes, time, last played
- "Spread listens" avoids the songs you just heard and the ones you play most
- Record a song by playing it from the top. The browser saves an audio file when the song ends or you stop
- Save the original video file for the current song only
- Switch channel with the `@handle` field

Nothing here downloads the catalog. Indexing walks profile pages (titles, art, tags) and only when you ask. Playback streams one song at a time from Suno's CDN.

## Shape

```
browser
  deck UI  ── server functions ──  studio-api.prod.suno.com/api/profiles/{handle}
  audio element (crossOrigin) ──  cdn video mp4 for the current song only
  localStorage "blackwire" ── spins, queue prefs, favorites
  MediaRecorder tap of the Web Audio graph ── one recording, then a download
```

Listen history is per browser on purpose. It is not an account and it is not shared.

Server functions (`src/lib/suno/suno.functions.ts`) only accept a handle or a UUID and only call Suno's public profile, playlist, and clip reads. The player (`src/lib/player/engine.ts`) keeps a single audio element, routes it through Web Audio so the meters and the recorder hear the same signal, and never stores audio on the server.

## CLI

A small Node client for the same public reads. It does not play audio (no speakers assumed). `random --mark` counts a spin in `~/.blackwire/plays.json`.

```bash
node cli/suno.mjs station drmad69
node cli/suno.mjs page drmad69 2
node cli/suno.mjs random drmad69 --mark
node cli/suno.mjs playlist <playlist-id>
node cli/suno.mjs plays
```

## Limits

- Public songs only. Private or still-processing clips are skipped.
- Recording needs `MediaRecorder` (Chromium and current Firefox / Safari). If it isn't there, save the video instead.
- A recording is a new audio file of what just played, not a stem or a WAV master.
- Suno can change these unofficial read endpoints. If a channel comes back empty, the site profile is the source of truth.

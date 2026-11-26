import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Download,
  ExternalLink,
  Heart,
  History,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { engine } from "@/lib/player/engine";
import {
  bindTransport,
  settleEnded,
  useDeck,
  type DeckTab,
  type LibrarySort,
} from "@/lib/player/store";
import { downloadBlob, downloadRemote, formatTime, formatWhen, safeFile } from "@/lib/player/format";
import { tagAudioBlob } from "@/lib/player/webm-tags";
import { getClip, getClipNotes } from "@/lib/suno/suno.functions";
import { emptyNotes, mergeNotes, notesFromTrack } from "@/lib/suno/notes";
import type { ClipNotes, KnownTrack, SlimTrack } from "@/lib/suno/types";

const TABS: { id: DeckTab; label: string; icon: typeof ListMusic }[] = [
  { id: "next", label: "Up next", icon: ListMusic },
  { id: "station", label: "Station", icon: Radio },
  { id: "history", label: "Log", icon: History },
];

const SORTS: { id: LibrarySort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "title", label: "Title" },
  { id: "suno", label: "Suno plays" },
  { id: "mine", label: "Your plays" },
  { id: "short", label: "Shortest" },
];

function withLyrics(track: KnownTrack | SlimTrack): SlimTrack {
  return "lyrics" in track ? track : { ...track, lyrics: "" };
}

type HeldTake = {
  track: SlimTrack | null;
  notes: Promise<ClipNotes | null>;
};

const takes = new Map<string, HeldTake>();

function findTrack(id: string): SlimTrack | null {
  const state = useDeck.getState();
  if (state.current?.id === id) return state.current;
  const queued = state.queue.find((item) => item.track.id === id)?.track;
  if (queued) return queued;
  const past = state.past.find((track) => track.id === id);
  if (past) return past;
  const listed =
    state.tracks.find((track) => track.id === id) ??
    state.playlistTracks?.find((track) => track.id === id);
  if (listed) return listed;
  const known = state.known[id];
  if (!known) return null;
  return { ...known, lyrics: "" };
}

async function saveTake(blob: Blob, mime: string, takeId: string, trackId: string) {
  const held = takes.get(takeId) ?? null;
  takes.delete(takeId);
  const track = held?.track ?? findTrack(trackId);
  let notes = track ? notesFromTrack(track) : emptyNotes(trackId);
  try {
    const fetched = held
      ? await held.notes
      : await getClipNotes({ data: { id: trackId } }).catch(() => null);
    notes = mergeNotes(notes, fetched);
  } catch {
    /* keep whatever the station already had */
  }
  const ext = mime.includes("mp4") ? "m4a" : "webm";
  let file = blob;
  if (ext === "webm") {
    try {
      file = await tagAudioBlob(file, notes, new Date().toISOString());
    } catch {
      file = blob;
    }
  }
  const filename = `${safeFile(notes.title)}.${ext}`;
  useDeck.getState().markRecorded(trackId);
  downloadBlob(file, filename);
  const still = engine.getSnapshot().tape;
  useDeck.getState().setNotice(
    still
      ? `Saved ${filename}. The next song records too — just confirm the name.`
      : `Saved ${filename}.`,
  );
}

async function recordCurrent() {
  const snap = engine.getSnapshot();
  if (snap.recording || snap.tape) {
    engine.stopRecording();
    return;
  }
  if (!useDeck.getState().current) await useDeck.getState().queueRadio(1);
  await engine.startRecording();
}

export function Deck() {
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const notice = useDeck((state) => state.notice);
  const error = useDeck((state) => state.error);
  const current = useDeck((state) => state.current);
  const handle = useDeck((state) => state.handle);

  useEffect(() => {
    bindTransport({
      play: (track, opts) => engine.playTrack(track, opts),
      replay: () => engine.replay(),
    });
    engine.onEnded = (id) => {
      void settleEnded(id);
    };
    engine.onSpin = (id) => useDeck.getState().markSpin(id);
    engine.onHeard = (id, seconds, natural) => useDeck.getState().markHeard(id, seconds, natural);
    engine.onRecordBegin = (takeId, trackId) => {
      const track = findTrack(trackId);
      const notes = getClipNotes({ data: { id: trackId } }).catch(() => null);
      takes.set(takeId, { track, notes });
    };
    engine.onRecording = (blob, mime, takeId, trackId) => {
      void saveTake(blob, mime, takeId, trackId);
    };
    engine.onRecordDiscard = (takeId) => {
      takes.delete(takeId);
    };
    const unsub = useDeck.persist.onFinishHydration((state) => {
      engine.setVolume(state.volume);
      engine.setMuted(state.muted);
    });
    void Promise.resolve(useDeck.persist.rehydrate()).then(() => {
      const state = useDeck.getState();
      engine.setVolume(state.volume);
      engine.setMuted(state.muted);
      void state.loadStation(state.handle);
    });
    return () => {
      unsub();
      engine.onEnded = null;
      engine.onSpin = null;
      engine.onHeard = null;
      engine.onRecordBegin = null;
      engine.onRecording = null;
      engine.onRecordDiscard = null;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => useDeck.getState().setNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        void useDeck.getState().togglePlay();
      } else if (event.code === "ArrowRight") {
        engine.seek(engine.getSnapshot().currentTime + 5);
      } else if (event.code === "ArrowLeft") {
        engine.seek(Math.max(0, engine.getSnapshot().currentTime - 5));
      } else if (event.key === "n" || event.key === "N") {
        void useDeck.getState().next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: `@${handle}`,
        artwork: current.image ? [{ src: current.image }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => {
        void useDeck.getState().togglePlay();
      });
      navigator.mediaSession.setActionHandler("pause", () => engine.pause());
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        void useDeck.getState().next();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        void useDeck.getState().prev();
      });
    } catch {
      /* artwork or handlers unsupported */
    }
  }, [current, handle]);

  const playing = snap.status === "playing";
  const pct = snap.duration > 0 ? Math.min(100, (snap.currentTime / snap.duration) * 100) : 0;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="h-1 bg-blue" />
      <Header />
      {(notice || error || snap.error) && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <p role="status" className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-blue-2">
            {notice || error || snap.error}
          </p>
        </div>
      )}
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-5 pb-32 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:pb-10">
        <section className="md:sticky md:top-4 md:self-start">
          <NowPlaying pct={pct} playing={playing} recording={snap.recording} />
        </section>
        <section className="min-w-0 rounded-deck border border-line bg-bg-elev">
          <Library />
        </section>
      </main>
      <MobileBar playing={playing} recording={snap.recording} />
    </div>
  );
}

function Header() {
  const handle = useDeck((state) => state.handle);
  const station = useDeck((state) => state.station);
  const history = useDeck((state) => state.history);
  const stats = useDeck((state) => state.stats);
  const [draft, setDraft] = useState(handle);
  useEffect(() => setDraft(handle), [handle]);
  const spins = Object.values(stats).reduce((sum, stat) => sum + stat.plays, 0);
  const heard = Object.keys(stats).length;

  return (
    <header className="border-b border-line bg-bg-elev">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-widest text-blue-2">ON AIR</p>
          <h1 className="text-2xl font-semibold tracking-tight">Blackwire</h1>
        </div>
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 sm:max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim().replace(/^@/, "");
            if (!next || next === handle) return;
            void useDeck.getState().loadStation(next);
          }}
        >
          <label htmlFor="channel" className="font-mono text-sm text-faint">
            @
          </label>
          <input
            id="channel"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            className="w-full bg-transparent font-mono text-sm text-fg outline-none"
            aria-label="Suno channel handle"
          />
          <button type="submit" className="rounded-full bg-blue px-3 py-1.5 text-sm font-medium text-on-blue">
            Tune
          </button>
        </form>
        <div className="ml-auto flex flex-wrap gap-2 font-mono text-xs text-muted">
          <span className="rounded-full border border-line px-3 py-1">
            {station ? `${station.totalClips} public` : "…"}
          </span>
          <span className="rounded-full border border-line px-3 py-1">{spins} spins</span>
          <span className="rounded-full border border-line px-3 py-1">{heard || history.length} heard</span>
        </div>
      </div>
    </header>
  );
}

function NowPlaying({
  pct,
  playing,
  recording,
}: {
  pct: number;
  playing: boolean;
  recording: boolean;
}) {
  const current = useDeck((state) => state.current);
  const station = useDeck((state) => state.station);
  const stats = useDeck((state) => state.stats);
  const favorites = useDeck((state) => state.favorites);
  const shuffle = useDeck((state) => state.shuffle);
  const repeat = useDeck((state) => state.repeat);
  const radio = useDeck((state) => state.radio);
  const spread = useDeck((state) => state.spread);
  const volume = useDeck((state) => state.volume);
  const muted = useDeck((state) => state.muted);
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [saving, setSaving] = useState(false);
  const stat = current ? stats[current.id] : undefined;
  const loved = current ? favorites.includes(current.id) : false;

  useEffect(() => {
    setLyricsOpen(false);
    setLyrics(current?.lyrics ?? "");
  }, [current?.id, current?.lyrics]);

  async function toggleLyrics() {
    if (!current) return;
    const next = !lyricsOpen;
    setLyricsOpen(next);
    if (next && !lyrics) {
      try {
        const full = await getClip({ data: { id: current.id } });
        setLyrics(full.lyrics);
      } catch {
        setLyrics("");
      }
    }
  }

  async function saveVideo() {
    if (!current) return;
    setSaving(true);
    try {
      await downloadRemote(current.videoUrl, `${safeFile(current.title)}.mp4`);
      useDeck.getState().setNotice(`Saved video for ${current.title}.`);
    } catch (reason) {
      useDeck.getState().setNotice(reason instanceof Error ? reason.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-deck border border-line bg-bg-elev p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-mono text-xs tracking-widest text-faint">
          {playing ? "PLAYING" : recording ? "RECORDING" : "DECK"}
        </p>
        <Meter />
      </div>
      <Cover src={current?.image || station?.avatar || ""} alt={current ? current.title : "No song yet"} live={playing} />
      <div className="mt-4 min-w-0">
        <h2 className="truncate text-xl font-semibold">{current?.title ?? "Nothing queued"}</h2>
        <p className="mt-1 truncate text-sm text-muted">
          {current ? (
            <>
              {current.artist}
              {current.handle ? ` · @${current.handle}` : ""}
              {current.explicit ? " · explicit" : ""}
            </>
          ) : (
            station?.displayName || "Tune a channel, then hit play"
          )}
        </p>
        {current?.tags && <p className="mt-1 truncate text-sm text-blue-2">{current.tags}</p>}
        {stat && (
          <p className="mt-2 font-mono text-xs text-faint">
            {stat.plays} play{stat.plays === 1 ? "" : "s"}
            {stat.completes ? ` · ${stat.completes} finished` : ""}
            {stat.recorded ? ` · ${stat.recorded} recorded` : ""}
          </p>
        )}
      </div>
      <label className="mt-4 block">
        <span className="sr-only">Seek</span>
        <input
          className="seek"
          type="range"
          min={0}
          max={snap.duration || 0}
          step={0.1}
          value={Math.min(snap.currentTime, snap.duration || snap.currentTime)}
          onChange={(event) => engine.seek(Number(event.target.value))}
          style={{ ["--pct" as string]: `${pct}%` }}
          aria-valuetext={formatTime(snap.currentTime)}
        />
      </label>
      <div className="mt-1 flex justify-between font-mono text-xs text-faint">
        <span>{formatTime(snap.currentTime)}</span>
        <span>{formatTime(snap.duration || current?.duration || 0)}</span>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        <IconButton
          label={shuffle ? "Shuffle on" : "Shuffle off"}
          active={shuffle}
          onClick={() => useDeck.getState().toggleShuffle()}
        >
          <Shuffle className="size-4" />
        </IconButton>
        <IconButton label="Previous" onClick={() => void useDeck.getState().prev()}>
          <SkipBack className="size-5" />
        </IconButton>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => void useDeck.getState().togglePlay()}
          className="inline-flex size-16 items-center justify-center rounded-full bg-blue text-on-blue"
        >
          {snap.status === "loading" ? (
            <Loader2 className="size-6 animate-spin" />
          ) : playing ? (
            <Pause className="size-7" />
          ) : (
            <Play className="size-7" />
          )}
        </button>
        <IconButton label="Next" onClick={() => void useDeck.getState().next()}>
          <SkipForward className="size-5" />
        </IconButton>
        <IconButton
          label={repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat queue" : "Repeat off"}
          active={repeat !== "off"}
          onClick={() => useDeck.getState().cycleRepeat()}
        >
          {repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
        </IconButton>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <TextButton active={radio} onClick={() => useDeck.getState().toggleRadio()}>
          Radio {radio ? "on" : "off"}
        </TextButton>
        <TextButton active={spread} onClick={() => useDeck.getState().toggleSpread()}>
          Spread listens
        </TextButton>
        <TextButton
          active={loved}
          disabled={!current}
          onClick={() => current && useDeck.getState().toggleFavorite(current)}
        >
          <Heart className="size-4" fill={loved ? "currentColor" : "none"} />
          Keep
        </TextButton>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
          onClick={() => {
            const next = !useDeck.getState().muted;
            useDeck.getState().setMuted(next);
            engine.setMuted(next);
          }}
          className="text-muted"
        >
          {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          aria-label="Volume"
          style={{ ["--pct" as string]: `${(muted ? 0 : volume) * 100}%` }}
          onChange={(event) => {
            const value = Number(event.target.value);
            useDeck.getState().setVolume(value);
            useDeck.getState().setMuted(false);
            engine.setVolume(value);
            engine.setMuted(false);
          }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void recordCurrent()}
          className={
            "inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium " +
            (recording || snap.tape ? "bg-blue text-on-blue" : "border border-line bg-surface")
          }
        >
          {recording || snap.tape ? (
            <Square className="size-4" />
          ) : (
            <span className="size-2.5 rounded-full bg-blue-2" />
          )}
          {recording
            ? `Recording ${formatTime(snap.recordSeconds)}`
            : snap.tape
              ? "Will record next"
              : "Record song"}
        </button>
        <button
          type="button"
          disabled={!current || saving}
          onClick={() => void saveVideo()}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Save video
        </button>
        <button
          type="button"
          disabled={!current}
          onClick={() => void toggleLyrics()}
          className="rounded-full border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40"
        >
          {lyricsOpen ? "Hide lyrics" : "Lyrics"}
        </button>
        {current && (
          <a
            href={`https://suno.com/song/${current.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm"
          >
            <ExternalLink className="size-4" />
            On Suno
          </a>
        )}
      </div>
      {(recording || snap.tape) && current && (
        <p className="mt-3 font-mono text-xs text-faint">File name: {safeFile(current.title)}.webm</p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-faint">
        Record plays the whole song and saves a file named for that song — just confirm the download. It then
        records the next song in the list, or the next queued song, until you stop. The webm keeps the lyrics,
        style, model, and the other public Suno details. Save video grabs the original file without a full listen.
      </p>
      {lyricsOpen && (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-surface p-4 font-sans text-sm leading-relaxed text-muted">
          {lyrics || "No lyrics on this one."}
        </pre>
      )}
    </div>
  );
}

function Cover({ src, alt, live }: { src: string; alt: string; live: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div
      className={
        "mx-auto aspect-square w-48 overflow-hidden rounded-deck bg-surface md:w-full md:max-w-sm " +
        (live ? "ring-2 ring-blue" : "ring-1 ring-line")
      }
    >
      {src && !failed ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full items-center justify-center font-mono text-xs tracking-widest text-faint">
          BLACKWIRE
        </div>
      )}
    </div>
  );
}

function Meter() {
  const levels = useSyncExternalStore(engine.subscribeLevels, engine.getLevels, engine.getLevels);
  return (
    <div className="flex h-8 items-end gap-1" aria-hidden="true">
      {levels.map((level, index) => (
        <span
          key={index}
          className="meter-bar w-1 rounded-full bg-blue"
          style={{ height: `${Math.max(12, Math.round(level * 100))}%` }}
        />
      ))}
    </div>
  );
}

function Library() {
  const tab = useDeck((state) => state.tab);
  return (
    <div>
      <div className="flex border-b border-line" role="tablist">
        {TABS.map((item) => {
          const Icon = item.icon;
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => useDeck.getState().setTab(item.id)}
              className={
                "inline-flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm " +
                (selected ? "border-b-2 border-blue text-fg" : "text-muted")
              }
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="p-3 sm:p-4">
        {tab === "next" && <QueuePanel />}
        {tab === "station" && <StationPanel />}
        {tab === "history" && <HistoryPanel />}
      </div>
    </div>
  );
}

function QueuePanel() {
  const queue = useDeck((state) => state.queue);
  const current = useDeck((state) => state.current);
  const radio = useDeck((state) => state.radio);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void useDeck.getState().queueRadio(8)}
          className="rounded-full bg-blue px-4 py-2 text-sm font-medium text-on-blue"
        >
          Queue 8 random
        </button>
        <button
          type="button"
          onClick={() => useDeck.getState().clearQueue()}
          disabled={!queue.length}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      {current && (
        <p className="text-sm text-muted">
          Now: <span className="text-fg">{current.title}</span>
        </p>
      )}
      {!queue.length && (
        <p className="text-sm leading-relaxed text-muted">
          {radio
            ? "Radio is on. When the queue is empty, the next song is pulled from the channel — not downloaded ahead of time."
            : "Radio is off. Queue songs from the station list, or turn radio back on."}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {queue.map((item, index) => (
          <li key={item.qid} className="flex items-center gap-2 rounded-2xl bg-surface px-2 py-2">
            <span className="w-6 text-center font-mono text-xs text-faint">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.track.title}</p>
              <p className="truncate text-xs text-faint">{formatTime(item.track.duration)}</p>
            </div>
            <button
              type="button"
              className="px-2 text-xs text-blue-2"
              onClick={() => void useDeck.getState().playFromQueue(item.qid)}
            >
              Play
            </button>
            <button
              type="button"
              aria-label="Move up"
              className="px-1 text-xs text-muted"
              onClick={() => useDeck.getState().moveQueued(item.qid, -1)}
            >
              Up
            </button>
            <button
              type="button"
              aria-label="Move down"
              className="px-1 text-xs text-muted"
              onClick={() => useDeck.getState().moveQueued(item.qid, 1)}
            >
              Down
            </button>
            <button type="button" aria-label="Remove" onClick={() => useDeck.getState().removeQueued(item.qid)}>
              <X className="size-4 text-faint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StationPanel() {
  const station = useDeck((state) => state.station);
  const tracks = useDeck((state) => state.tracks);
  const playlistTracks = useDeck((state) => state.playlistTracks);
  const playlistName = useDeck((state) => state.playlistName);
  const playlistId = useDeck((state) => state.playlistId);
  const loading = useDeck((state) => state.loading);
  const indexing = useDeck((state) => state.indexing);
  const exhausted = useDeck((state) => state.exhausted);
  const query = useDeck((state) => state.query);
  const sort = useDeck((state) => state.sort);
  const stats = useDeck((state) => state.stats);
  const source = playlistTracks ?? tracks;
  const visible = useMemo(() => filterTracks(source, query, sort, stats), [source, query, sort, stats]);

  return (
    <div className="flex flex-col gap-4">
      {station && (
        <div className="flex items-center gap-3">
          {station.avatar ? (
            <img src={station.avatar} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
          ) : (
            <div className="size-16 shrink-0 rounded-2xl bg-surface" />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{station.displayName}</h3>
            <p className="font-mono text-xs text-faint">@{station.handle}</p>
            <p className="mt-1 text-sm text-muted">
              {station.followers} followers · {station.sunoPlays.toLocaleString()} Suno plays
            </p>
            {station.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{station.description}</p>}
          </div>
        </div>
      )}
      {station && station.playlists.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => useDeck.getState().clearPlaylist()}
            className={
              "shrink-0 rounded-full border px-3 py-1.5 text-sm " +
              (!playlistId ? "border-blue bg-blue text-on-blue" : "border-line")
            }
          >
            All public
          </button>
          {station.playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              onClick={() => void useDeck.getState().openPlaylist(playlist.id, playlist.name)}
              className={
                "shrink-0 rounded-full border px-3 py-1.5 text-sm " +
                (playlistId === playlist.id ? "border-blue bg-blue text-on-blue" : "border-line")
              }
            >
              {playlist.name}
              {playlist.songCount ? ` · ${playlist.songCount}` : ""}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2">
          <Search className="size-4 text-faint" />
          <span className="sr-only">Search songs</span>
          <input
            value={query}
            onChange={(event) => useDeck.getState().setQuery(event.target.value)}
            placeholder={playlistName ? `Search ${playlistName}` : "Search indexed songs"}
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </label>
        <label className="sr-only" htmlFor="sort">
          Sort
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(event) => useDeck.getState().setSort(event.target.value as LibrarySort)}
          className="rounded-full border border-line bg-surface px-3 py-2 text-sm"
        >
          {SORTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      {!playlistId && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs text-faint">
            Indexed {tracks.length}
            {station ? ` / ${station.totalClips}` : ""} — metadata only
          </span>
          <button
            type="button"
            disabled={loading || exhausted}
            onClick={() => void useDeck.getState().loadMore()}
            className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
          >
            {loading && !indexing ? "Loading…" : "Next page"}
          </button>
          {indexing ? (
            <button type="button" onClick={() => useDeck.getState().stopIndex()} className="rounded-full border border-line px-3 py-1.5">
              Stop indexing
            </button>
          ) : (
            <button
              type="button"
              disabled={exhausted}
              onClick={() => void useDeck.getState().indexRest()}
              className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
            >
              Index the rest
            </button>
          )}
        </div>
      )}
      {playlistId && playlistTracks && (
        <button
          type="button"
          onClick={() => {
            for (const track of playlistTracks) useDeck.getState().enqueue(track);
          }}
          className="self-start rounded-full bg-blue px-4 py-2 text-sm font-medium text-on-blue"
        >
          Queue {playlistName || "playlist"}
        </button>
      )}
      {!visible.length && (
        <p className="text-sm text-muted">
          {loading ? "Pulling the channel…" : "Nothing matches. Index another page, or clear the search."}
        </p>
      )}
      <ul className="flex flex-col">
        {visible.map((track) => (
          <SongRow key={track.id} track={track} />
        ))}
      </ul>
    </div>
  );
}

function SongRow({ track }: { track: SlimTrack }) {
  const stats = useDeck((state) => state.stats);
  const currentId = useDeck((state) => state.current?.id);
  const plays = stats[track.id]?.plays ?? 0;
  const active = currentId === track.id;
  return (
    <li className={"flex items-center gap-3 border-b border-line py-2 " + (active ? "text-blue-2" : "")}>
      {track.image ? (
        <img src={track.image} alt="" className="size-12 rounded-xl object-cover" />
      ) : (
        <div className="size-12 rounded-xl bg-surface-2" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{track.title}</p>
        <p className="truncate text-xs text-faint">
          {formatTime(track.duration)}
          {track.tags ? ` · ${track.tags}` : ""}
          {track.createdAt ? ` · ${formatWhen(track.createdAt)}` : ""}
        </p>
      </div>
      <span className="hidden font-mono text-xs text-faint sm:inline">{plays ? `${plays}×` : "new"}</span>
      <button type="button" className="px-2 text-xs text-blue-2" onClick={() => useDeck.getState().enqueueNext(track)}>
        Next
      </button>
      <button type="button" className="px-2 text-xs text-muted" onClick={() => useDeck.getState().enqueue(track)}>
        Queue
      </button>
      <button
        type="button"
        aria-label={`Play ${track.title}`}
        onClick={() => void useDeck.getState().playNow(track)}
        className="inline-flex size-11 items-center justify-center rounded-full bg-surface-2"
      >
        <Play className="size-4" />
      </button>
    </li>
  );
}

function HistoryPanel() {
  const history = useDeck((state) => state.history);
  const stats = useDeck((state) => state.stats);
  const favorites = useDeck((state) => state.favorites);
  const known = useDeck((state) => state.known);
  const ranked = Object.values(stats)
    .slice()
    .sort((a, b) => b.plays - a.plays || b.lastAt - a.lastAt)
    .slice(0, 5);
  const kept = favorites.map((id) => known[id]).filter((track): track is KnownTrack => Boolean(track));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Spins stay in this browser. A spin counts when playback actually starts. Finished means the song
        reached the end.
      </p>
      {ranked.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Most played here</h3>
          <ul className="flex flex-col gap-1">
            {ranked.map((stat) => (
              <li key={stat.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{stat.title}</span>
                <span className="shrink-0 font-mono text-xs text-faint">
                  {stat.plays}× · {formatTime(stat.seconds)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {kept.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Kept</h3>
          <ul>
            {kept.map((track) => (
              <SongRow key={track.id} track={withLyrics(track)} />
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-medium">Recent</h3>
        {!history.length && <p className="text-sm text-muted">Nothing played yet.</p>}
        <ul className="flex flex-col gap-2">
          {history.map((entry) => {
            const track = known[entry.id];
            return (
              <li key={`${entry.id}-${entry.at}`} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.title}</p>
                  <p className="font-mono text-xs text-faint">
                    {new Date(entry.at).toLocaleString()} · {stats[entry.id]?.plays ?? 1}×
                  </p>
                </div>
                {track && (
                  <button
                    type="button"
                    className="rounded-full border border-line px-3 py-1.5 text-xs"
                    onClick={() => void useDeck.getState().playNow(withLyrics(track))}
                  >
                    Play
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function MobileBar({ playing, recording }: { playing: boolean; recording: boolean }) {
  const current = useDeck((state) => state.current);
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const armed = recording || snap.tape;
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg-elev px-3 py-2 md:hidden">
      <p className="truncate text-center text-xs text-muted">
        {recording ? `Recording ${formatTime(snap.recordSeconds)} · ` : snap.tape ? "Next song records · " : ""}
        {current?.title ?? "Blackwire"}
      </p>
      <div className="mt-1 flex items-center justify-center gap-2">
        <IconButton label="Previous" onClick={() => void useDeck.getState().prev()}>
          <SkipBack className="size-5" />
        </IconButton>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => void useDeck.getState().togglePlay()}
          className="inline-flex size-12 items-center justify-center rounded-full bg-blue text-on-blue"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <IconButton label="Next" onClick={() => void useDeck.getState().next()}>
          <SkipForward className="size-5" />
        </IconButton>
        <button
          type="button"
          onClick={() => void recordCurrent()}
          className={
            "inline-flex h-11 items-center rounded-full px-4 text-sm " +
            (armed ? "bg-blue text-on-blue" : "border border-line")
          }
        >
          {armed ? "Stop" : "Record"}
        </button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={
        "inline-flex size-11 items-center justify-center rounded-full border " +
        (active ? "border-blue bg-blue text-on-blue" : "border-line bg-surface text-fg") +
        " disabled:opacity-40"
      }
    >
      {children}
    </button>
  );
}

function TextButton({
  children,
  active,
  disabled,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs " +
        (active ? "border-blue bg-surface-2 text-blue-2" : "border-line text-muted") +
        " disabled:opacity-40"
      }
    >
      {children}
    </button>
  );
}

function filterTracks(
  tracks: SlimTrack[],
  query: string,
  sort: LibrarySort,
  stats: Record<string, { plays: number }>,
) {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? tracks.filter((track) => `${track.title} ${track.tags} ${track.artist}`.toLowerCase().includes(needle))
    : tracks;
  return matched.slice().sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "suno") return b.sunoPlays - a.sunoPlays;
    if (sort === "mine") return (stats[b.id]?.plays ?? 0) - (stats[a.id]?.plays ?? 0);
    if (sort === "short") return (a.duration || 0) - (b.duration || 0);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

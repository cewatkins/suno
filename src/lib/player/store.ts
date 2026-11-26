import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getPlaylistPage, getRandomBatch, getStationPage } from "@/lib/suno/suno.functions";
import { forgetLyrics } from "@/lib/suno/normalize";
import type {
  HistoryEntry,
  KnownTrack,
  PlayStat,
  SlimTrack,
  StationPlaylist,
} from "@/lib/suno/types";
import { engine, type Playable } from "@/lib/player/engine";

export type RepeatMode = "off" | "all" | "one";
export type LibrarySort = "newest" | "title" | "suno" | "mine" | "short";
export type DeckTab = "next" | "station" | "history";

type QueueItem = { qid: string; track: SlimTrack };

type StationInfo = {
  handle: string;
  displayName: string;
  description: string;
  avatar: string;
  followers: number;
  totalClips: number;
  sunoPlays: number;
  sunoLikes: number;
  playlists: StationPlaylist[];
};

type Decision =
  | { type: "replay" }
  | { type: "track"; track: SlimTrack }
  | { type: "radio" }
  | { type: "stop" };

type Transport = {
  play: (track: Playable, opts?: { record?: boolean }) => Promise<void>;
  replay: () => Promise<void>;
};

let transport: Transport | null = null;
let generation = 0;

export function bindTransport(next: Transport) {
  transport = next;
}

export function bumpGeneration() {
  generation += 1;
  return generation;
}

export function currentGeneration() {
  return generation;
}

function qid() {
  return crypto.randomUUID();
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

type DeckState = {
  handle: string;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  radio: boolean;
  spread: boolean;
  stats: Record<string, PlayStat>;
  history: HistoryEntry[];
  favorites: string[];
  known: Record<string, KnownTrack>;
  knownOrder: string[];
  station: StationInfo | null;
  tracks: SlimTrack[];
  indexedPages: number[];
  exhausted: boolean;
  loading: boolean;
  indexing: boolean;
  error: string | null;
  notice: string | null;
  query: string;
  sort: LibrarySort;
  tab: DeckTab;
  playlistId: string | null;
  playlistName: string;
  playlistTracks: SlimTrack[] | null;
  queue: QueueItem[];
  past: SlimTrack[];
  current: SlimTrack | null;
  seq: number;
  setNotice: (notice: string | null) => void;
  setQuery: (query: string) => void;
  setSort: (sort: LibrarySort) => void;
  setTab: (tab: DeckTab) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleRadio: () => void;
  toggleSpread: () => void;
  remember: (track: SlimTrack) => void;
  avoidIds: () => string[];
  loadStation: (handle: string) => Promise<void>;
  loadMore: () => Promise<void>;
  indexRest: () => Promise<void>;
  stopIndex: () => void;
  openPlaylist: (id: string, name: string) => Promise<void>;
  clearPlaylist: () => void;
  markSpin: (id: string) => void;
  markHeard: (id: string, seconds: number, natural: boolean) => void;
  markRecorded: (id: string) => void;
  toggleFavorite: (track: SlimTrack) => void;
  enqueue: (track: SlimTrack) => void;
  enqueueNext: (track: SlimTrack) => void;
  removeQueued: (qid: string) => void;
  moveQueued: (qid: string, direction: -1 | 1) => void;
  clearQueue: () => void;
  playNow: (track: SlimTrack, opts?: { record?: boolean }) => Promise<void>;
  playFromQueue: (qid: string) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  decideNext: (endedId: string, fromUserNext?: boolean) => Decision;
  pullRadio: (count?: number) => Promise<SlimTrack[]>;
  queueRadio: (count: number) => Promise<void>;
};

function rememberInto(
  state: Pick<DeckState, "known" | "knownOrder" | "favorites">,
  track: SlimTrack,
) {
  const known = { ...state.known, [track.id]: forgetLyrics(track) };
  const order = [...state.knownOrder.filter((id) => id !== track.id), track.id];
  const pinned = new Set(state.favorites);
  while (order.length > 500) {
    const victim = order.findIndex((id) => !pinned.has(id));
    if (victim === -1) break;
    const [id] = order.splice(victim, 1);
    if (id) delete known[id];
  }
  return { known, knownOrder: order };
}

export const useDeck = create<DeckState>()(
  persist(
    (set, get) => ({
      handle: "drmad69",
      volume: 0.9,
      muted: false,
      shuffle: false,
      repeat: "off",
      radio: true,
      spread: true,
      stats: {},
      history: [],
      favorites: [],
      known: {},
      knownOrder: [],
      station: null,
      tracks: [],
      indexedPages: [],
      exhausted: false,
      loading: false,
      indexing: false,
      error: null,
      notice: null,
      query: "",
      sort: "newest",
      tab: "station",
      playlistId: null,
      playlistName: "",
      playlistTracks: null,
      queue: [],
      past: [],
      current: null,
      seq: 0,
      setNotice: (notice) => set({ notice }),
      setQuery: (query) => set({ query }),
      setSort: (sort) => set({ sort }),
      setTab: (tab) => set({ tab }),
      setVolume: (volume) => set({ volume, muted: volume <= 0 ? get().muted : false }),
      setMuted: (muted) => set({ muted }),
      toggleShuffle: () => set({ shuffle: !get().shuffle }),
      cycleRepeat: () => {
        const order: RepeatMode[] = ["off", "all", "one"];
        const next = order[(order.indexOf(get().repeat) + 1) % order.length] ?? "off";
        set({ repeat: next });
      },
      toggleRadio: () => set({ radio: !get().radio }),
      toggleSpread: () => set({ spread: !get().spread }),
      remember: (track) => set(rememberInto(get(), track)),
      avoidIds: () => {
        const { history, stats, spread } = get();
        const recent = history.slice(0, 12).map((entry) => entry.id);
        if (!spread) return [...new Set(recent)];
        const heavy = Object.values(stats)
          .sort((a, b) => b.plays - a.plays)
          .slice(0, 8)
          .map((stat) => stat.id);
        return [...new Set([...recent, ...heavy])].slice(0, 24);
      },
      loadStation: async (handle) => {
        const seq = get().seq + 1;
        set({
          seq,
          handle,
          loading: true,
          error: null,
          exhausted: false,
          indexing: false,
          playlistId: null,
          playlistName: "",
          playlistTracks: null,
        });
        try {
          const page = await getStationPage({ data: { handle, page: 1 } });
          if (get().seq !== seq) return;
          let knownState = get();
          for (const track of page.tracks) knownState = { ...knownState, ...rememberInto(knownState, track) };
          set({
            loading: false,
            station: {
              handle: page.handle,
              displayName: page.displayName,
              description: page.description,
              avatar: page.avatar,
              followers: page.followers,
              totalClips: page.totalClips,
              sunoPlays: page.sunoPlays,
              sunoLikes: page.sunoLikes,
              playlists: page.playlists,
            },
            tracks: page.tracks,
            indexedPages: [page.page],
            known: knownState.known,
            knownOrder: knownState.knownOrder,
          });
        } catch (error) {
          if (get().seq !== seq) return;
          set({ loading: false, error: messageOf(error) });
        }
      },
      loadMore: async () => {
        const { handle, indexedPages, tracks, station, loading, exhausted } = get();
        if (loading || exhausted) return;
        const nextPage = (indexedPages.length ? Math.max(...indexedPages) : 0) + 1;
        if (station && tracks.length >= station.totalClips && station.totalClips > 0) {
          set({ exhausted: true });
          return;
        }
        set({ loading: true, error: null });
        try {
          const page = await getStationPage({ data: { handle, page: nextPage } });
          if (!page.tracks.length) {
            set({ loading: false, exhausted: true });
            return;
          }
          const seen = new Set(get().tracks.map((track) => track.id));
          const added = page.tracks.filter((track) => !seen.has(track.id));
          let knownState = get();
          for (const track of added) knownState = { ...knownState, ...rememberInto(knownState, track) };
          const merged = [...get().tracks, ...added];
          const total = page.totalClips || station?.totalClips || 0;
          set({
            loading: false,
            tracks: merged,
            indexedPages: [...new Set([...get().indexedPages, page.page])],
            exhausted: merged.length >= total && total > 0,
            known: knownState.known,
            knownOrder: knownState.knownOrder,
            station: get().station
              ? { ...get().station!, totalClips: total || get().station!.totalClips }
              : get().station,
          });
        } catch (error) {
          set({ loading: false, error: messageOf(error) });
        }
      },
      indexRest: async () => {
        if (get().indexing) return;
        set({ indexing: true });
        while (get().indexing && !get().exhausted) {
          const before = get().tracks.length;
          await get().loadMore();
          if (!get().indexing || get().exhausted || get().tracks.length === before) break;
          await new Promise((resolve) => setTimeout(resolve, 280));
        }
        set({ indexing: false });
      },
      stopIndex: () => set({ indexing: false }),
      openPlaylist: async (id, name) => {
        set({ playlistId: id, playlistName: name, loading: true, error: null, tab: "station" });
        try {
          const page = await getPlaylistPage({ data: { id, page: 1 } });
          let knownState = get();
          for (const track of page.tracks) knownState = { ...knownState, ...rememberInto(knownState, track) };
          set({
            loading: false,
            playlistTracks: page.tracks,
            playlistName: page.name || name,
            known: knownState.known,
            knownOrder: knownState.knownOrder,
          });
        } catch (error) {
          set({ loading: false, error: messageOf(error), playlistTracks: [] });
        }
      },
      clearPlaylist: () => set({ playlistId: null, playlistName: "", playlistTracks: null }),
      markSpin: (id) => {
        const track = get().current?.id === id ? get().current : get().known[id];
        const title = track && "title" in track ? track.title : get().stats[id]?.title || "Untitled";
        const artist = track && "artist" in track ? track.artist : get().stats[id]?.artist || "";
        const prev = get().stats[id];
        const stat: PlayStat = {
          id,
          title,
          artist,
          plays: (prev?.plays ?? 0) + 1,
          completes: prev?.completes ?? 0,
          seconds: prev?.seconds ?? 0,
          lastAt: Date.now(),
          recorded: prev?.recorded ?? 0,
        };
        const history: HistoryEntry[] = [
          { id, title, artist, at: Date.now() },
          ...get().history.filter((entry) => entry.id !== id),
        ].slice(0, 300);
        set({ stats: { ...get().stats, [id]: stat }, history });
      },
      markHeard: (id, seconds, natural) => {
        const prev = get().stats[id];
        if (!prev) return;
        const heard = Math.max(0, seconds);
        const completes =
          natural && prev.completes < prev.plays ? prev.completes + 1 : prev.completes;
        set({
          stats: {
            ...get().stats,
            [id]: {
              ...prev,
              seconds: prev.seconds + heard,
              completes,
            },
          },
        });
      },
      markRecorded: (id) => {
        const prev = get().stats[id];
        if (!prev) return;
        set({ stats: { ...get().stats, [id]: { ...prev, recorded: prev.recorded + 1 } } });
      },
      toggleFavorite: (track) => {
        get().remember(track);
        const has = get().favorites.includes(track.id);
        set({
          favorites: has
            ? get().favorites.filter((id) => id !== track.id)
            : [track.id, ...get().favorites],
        });
      },
      enqueue: (track) => {
        get().remember(track);
        set({ queue: [...get().queue, { qid: qid(), track }], tab: "next" });
      },
      enqueueNext: (track) => {
        get().remember(track);
        set({ queue: [{ qid: qid(), track }, ...get().queue], tab: "next" });
      },
      removeQueued: (id) => set({ queue: get().queue.filter((item) => item.qid !== id) }),
      moveQueued: (id, direction) => {
        const queue = [...get().queue];
        const index = queue.findIndex((item) => item.qid === id);
        const swap = index + direction;
        if (index < 0 || swap < 0 || swap >= queue.length) return;
        const current = queue[index];
        const other = queue[swap];
        if (!current || !other) return;
        queue[index] = other;
        queue[swap] = current;
        set({ queue });
      },
      clearQueue: () => set({ queue: [] }),
      playNow: async (track, opts) => {
        bumpGeneration();
        const current = get().current;
        set({
          current: track,
          past:
            current && current.id !== track.id
              ? [...get().past, current].slice(-40)
              : get().past,
        });
        get().remember(track);
        await transport?.play(track, opts);
      },
      playFromQueue: async (id) => {
        const item = get().queue.find((entry) => entry.qid === id);
        if (!item) return;
        set({ queue: get().queue.filter((entry) => entry.qid !== id) });
        await get().playNow(item.track);
      },
      togglePlay: async () => {
        if (!get().current) {
          await get().queueRadio(1);
          return;
        }
        const started = await engine.toggle();
        if (!started) await get().queueRadio(1);
      },
      next: async () => {
        const token = bumpGeneration();
        const decision = get().decideNext(get().current?.id || "", true);
        if (token !== currentGeneration()) return;
        if (decision.type === "replay") {
          await transport?.replay();
          return;
        }
        if (decision.type === "track") {
          await transport?.play(decision.track);
          return;
        }
        if (decision.type === "radio") {
          const [track] = await get().pullRadio(1);
          if (!track || token !== currentGeneration()) return;
          set({ current: track });
          get().remember(track);
          await transport?.play(track);
        }
      },
      prev: async () => {
        const time = engine.getSnapshot().currentTime;
        if (time > 3) {
          engine.seek(0);
          return;
        }
        const past = [...get().past];
        const previous = past.pop();
        if (!previous) {
          engine.seek(0);
          return;
        }
        bumpGeneration();
        const current = get().current;
        set({
          past,
          current: previous,
          queue: current ? [{ qid: qid(), track: current }, ...get().queue] : get().queue,
        });
        await transport?.play(previous);
      },
      decideNext: (endedId, fromUserNext = false) => {
        const state = get();
        if (!fromUserNext && state.repeat === "one" && state.current && state.current.id === endedId) {
          return { type: "replay" };
        }
        let queue = [...state.queue];
        const past = state.current ? [...state.past, state.current].slice(-40) : state.past;
        if (!queue.length && state.repeat === "all" && past.length) {
          queue = past.map((track) => ({ qid: qid(), track }));
        }
        if (!queue.length && state.radio) {
          set({ past, queue: [] });
          return { type: "radio" };
        }
        if (!queue.length) {
          set({ past });
          return { type: "stop" };
        }
        let index = 0;
        if (state.shuffle && queue.length > 1) index = Math.floor(Math.random() * queue.length);
        const [item] = queue.splice(index, 1);
        if (!item) return { type: "stop" };
        set({ queue, past, current: item.track });
        get().remember(item.track);
        return { type: "track", track: item.track };
      },
      pullRadio: async (count = 1) => {
        const { handle, station } = get();
        const batch = await getRandomBatch({
          data: {
            handle,
            count,
            avoid: get().avoidIds(),
            totalHint: station?.totalClips || 0,
          },
        });
        for (const track of batch.tracks) get().remember(track);
        if (batch.total && get().station) {
          set({ station: { ...get().station!, totalClips: batch.total } });
        }
        return batch.tracks;
      },
      queueRadio: async (count) => {
        const token = bumpGeneration();
        set({ error: null });
        try {
          const tracks = await get().pullRadio(count);
          if (!tracks.length) {
            set({ notice: "No public songs came back." });
            return;
          }
          if (!get().current || count === 1) {
            const [first, ...rest] = tracks;
            if (!first || token !== currentGeneration()) return;
            const current = get().current;
            set({
              current: first,
              past:
                current && current.id !== first.id
                  ? [...get().past, current].slice(-40)
                  : get().past,
              queue: [...get().queue, ...rest.map((track) => ({ qid: qid(), track }))],
            });
            await transport?.play(first);
            return;
          }
          set({
            queue: [...get().queue, ...tracks.map((track) => ({ qid: qid(), track }))],
            tab: "next",
          });
        } catch (error) {
          set({ error: messageOf(error) });
        }
      },
    }),
    {
      name: "blackwire",
      skipHydration: true,
      partialize: (state) => ({
        handle: state.handle,
        volume: state.volume,
        muted: state.muted,
        shuffle: state.shuffle,
        repeat: state.repeat,
        radio: state.radio,
        spread: state.spread,
        stats: state.stats,
        history: state.history,
        favorites: state.favorites,
        known: state.known,
        knownOrder: state.knownOrder,
      }),
    },
  ),
);

export async function settleEnded(endedId: string) {
  const token = currentGeneration();
  const decision = useDeck.getState().decideNext(endedId);
  if (token !== currentGeneration()) return;
  if (decision.type === "replay") {
    await transport?.replay();
    return;
  }
  if (decision.type === "track") {
    await transport?.play(decision.track);
    return;
  }
  if (decision.type === "radio") {
    try {
      const [track] = await useDeck.getState().pullRadio(1);
      if (!track || token !== currentGeneration()) return;
      useDeck.setState({ current: track });
      await transport?.play(track);
    } catch (error) {
      useDeck.getState().setNotice(messageOf(error));
    }
  }
}

import { i as __toESM } from "../_runtime.mjs";
import { b as require_jsx_runtime, q as require_react } from "../_libs/@tanstack/react-router+[...].mjs";
import { _ as History, a as Square, b as Download, c as Shuffle, d as Repeat1, f as Radio, g as ListMusic, h as LoaderCircle, l as Search, m as Pause, n as VolumeX, o as SkipForward, p as Play, r as Volume2, s as SkipBack, t as X, u as Repeat, v as Heart, y as ExternalLink } from "../_libs/lucide-react.mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { i as parseUuid, r as parseHandle, t as forgetLyrics } from "./normalize-CsOb271U.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CPBoAPxt.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var IDLE = {
	status: "idle",
	currentId: null,
	currentTime: 0,
	duration: 0,
	error: null,
	recording: false,
	recordSeconds: 0,
	canRecord: false
};
var LEVELS = () => Array.from({ length: 12 }, () => 0);
function mimeChoice() {
	if (typeof MediaRecorder === "undefined") return "";
	return [
		"audio/webm;codecs=opus",
		"audio/webm",
		"audio/mp4"
	].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}
var PlayerEngine = class {
	audio = null;
	ctx = null;
	gain = null;
	analyser = null;
	tap = null;
	recorder = null;
	listeners = /* @__PURE__ */ new Set();
	levelListeners = /* @__PURE__ */ new Set();
	snap = IDLE;
	levels = LEVELS();
	volume = .9;
	muted = false;
	pendingRecord = false;
	maxHeard = 0;
	reported = false;
	natural = false;
	spinId = null;
	recordStarted = 0;
	lastRecordEmit = 0;
	raf = 0;
	recordMime = "audio/webm";
	onEnded = null;
	onSpin = null;
	onHeard = null;
	onRecording = null;
	subscribe = (fn) => {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	};
	subscribeLevels = (fn) => {
		this.levelListeners.add(fn);
		return () => this.levelListeners.delete(fn);
	};
	getSnapshot = () => this.snap;
	getLevels = () => this.levels;
	emit() {
		const audio = this.audio;
		this.snap = {
			status: this.snap.status,
			currentId: this.snap.currentId,
			currentTime: audio?.currentTime || 0,
			duration: audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : this.snap.duration,
			error: this.snap.error,
			recording: this.recorder?.state === "recording",
			recordSeconds: this.recorder?.state === "recording" ? (performance.now() - this.recordStarted) / 1e3 : 0,
			canRecord: typeof MediaRecorder !== "undefined"
		};
		for (const fn of this.listeners) fn();
	}
	setStatus(status, error = null) {
		this.snap = {
			...this.snap,
			status,
			error
		};
		this.emit();
	}
	reportHeard() {
		const id = this.snap.currentId;
		if (this.reported || !id) return;
		this.reported = true;
		this.onHeard?.(id, this.maxHeard, this.natural);
	}
	ensureAudio() {
		if (this.audio) return this.audio;
		if (typeof window === "undefined") throw new Error("Player is browser-only.");
		const audio = new Audio();
		audio.crossOrigin = "anonymous";
		audio.preload = "auto";
		audio.addEventListener("timeupdate", () => {
			this.maxHeard = Math.max(this.maxHeard, audio.currentTime || 0);
			this.emit();
		});
		audio.addEventListener("durationchange", () => this.emit());
		audio.addEventListener("playing", () => {
			this.snap = {
				...this.snap,
				status: "playing",
				error: null
			};
			const id = this.snap.currentId;
			if (id && this.spinId !== id) {
				this.spinId = id;
				this.onSpin?.(id);
			}
			this.emit();
			if (this.pendingRecord) {
				this.pendingRecord = false;
				this.beginRecorder();
			}
		});
		audio.addEventListener("pause", () => {
			if (!audio.ended && this.snap.status !== "idle" && this.snap.status !== "error") {
				this.snap = {
					...this.snap,
					status: "paused"
				};
				this.emit();
			}
		});
		audio.addEventListener("waiting", () => {
			if (this.snap.status === "playing") {
				this.snap = {
					...this.snap,
					status: "loading"
				};
				this.emit();
			}
		});
		audio.addEventListener("error", () => {
			this.pendingRecord = false;
			this.finishRecorder();
			this.setStatus("error", "This track didn't load. The video file may be missing or blocked.");
		});
		audio.addEventListener("ended", () => {
			const id = this.snap.currentId;
			this.natural = true;
			if (this.recorder?.state === "recording") this.finishRecorder();
			this.reportHeard();
			this.snap = {
				...this.snap,
				status: "paused",
				currentTime: audio.duration || this.snap.currentTime
			};
			this.emit();
			if (id) this.onEnded?.(id);
		});
		this.audio = audio;
		this.snap = {
			...this.snap,
			canRecord: typeof MediaRecorder !== "undefined"
		};
		return audio;
	}
	ensureGraph() {
		const audio = this.ensureAudio();
		if (this.ctx) return;
		const ctx = new AudioContext();
		const source = ctx.createMediaElementSource(audio);
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 64;
		analyser.smoothingTimeConstant = .75;
		const gain = ctx.createGain();
		gain.gain.value = this.muted ? 0 : this.volume;
		const tap = ctx.createMediaStreamDestination();
		source.connect(analyser);
		analyser.connect(gain);
		gain.connect(ctx.destination);
		gain.connect(tap);
		this.ctx = ctx;
		this.gain = gain;
		this.analyser = analyser;
		this.tap = tap;
		const tick = () => {
			this.raf = window.requestAnimationFrame(tick);
			if (!this.analyser) return;
			const playing = this.snap.status === "playing";
			const bins = new Uint8Array(this.analyser.frequencyBinCount);
			if (playing) this.analyser.getByteFrequencyData(bins);
			const next = [];
			const step = Math.max(1, Math.floor(bins.length / 12));
			for (let index = 0; index < 12; index += 1) {
				let sum = 0;
				for (let offset = 0; offset < step; offset += 1) sum += bins[index * step + offset] ?? 0;
				const value = playing ? sum / step / 255 : 0;
				const prev = this.levels[index] ?? 0;
				next.push(playing ? prev * .35 + value * .65 : prev * .72);
			}
			this.levels = next;
			for (const fn of this.levelListeners) fn();
			if (this.recorder?.state === "recording" && performance.now() - this.lastRecordEmit > 400) {
				this.lastRecordEmit = performance.now();
				this.emit();
			}
		};
		this.raf = window.requestAnimationFrame(tick);
	}
	async resume() {
		this.ensureGraph();
		if (this.ctx?.state === "suspended") await this.ctx.resume();
	}
	setVolume(volume) {
		this.volume = Math.min(1, Math.max(0, volume));
		if (this.gain && !this.muted) this.gain.gain.value = this.volume;
	}
	setMuted(muted) {
		this.muted = muted;
		if (this.gain) this.gain.gain.value = muted ? 0 : this.volume;
	}
	async playTrack(track, opts) {
		this.ensureGraph();
		await this.resume();
		const audio = this.ensureAudio();
		this.natural = false;
		this.reportHeard();
		this.finishRecorder();
		this.pendingRecord = Boolean(opts?.record);
		this.reported = false;
		this.maxHeard = 0;
		this.natural = false;
		this.spinId = null;
		this.snap = {
			...this.snap,
			status: "loading",
			error: null,
			currentId: track.id,
			currentTime: 0,
			duration: track.duration || 0,
			recording: false,
			recordSeconds: 0
		};
		this.emit();
		audio.src = track.videoUrl;
		try {
			audio.currentTime = 0;
		} catch {}
		try {
			await audio.play();
		} catch {
			this.pendingRecord = false;
			this.setStatus("paused", "Playback was blocked. Hit play once more.");
		}
	}
	async replay() {
		const audio = this.ensureAudio();
		await this.resume();
		this.natural = false;
		this.reported = false;
		this.maxHeard = 0;
		audio.currentTime = 0;
		try {
			await audio.play();
		} catch {
			this.setStatus("paused", "Playback was blocked. Hit play once more.");
		}
	}
	async toggle() {
		this.ensureGraph();
		await this.resume();
		const audio = this.ensureAudio();
		if (!audio.src) return false;
		if (audio.paused) try {
			await audio.play();
		} catch {
			this.setStatus("paused", "Playback was blocked. Hit play once more.");
		}
		else audio.pause();
		return true;
	}
	pause() {
		this.audio?.pause();
	}
	seek(seconds) {
		if (!this.audio) return;
		const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : this.snap.duration;
		const next = Math.min(Math.max(0, seconds), duration || seconds);
		this.audio.currentTime = next;
		this.maxHeard = Math.max(this.maxHeard, next);
		this.emit();
	}
	async startRecording() {
		if (!this.snap.currentId || !this.audio?.src) return;
		this.ensureGraph();
		await this.resume();
		this.finishRecorder();
		this.pendingRecord = true;
		this.audio.currentTime = 0;
		try {
			await this.audio.play();
		} catch {
			this.pendingRecord = false;
			this.setStatus("paused", "Playback was blocked. Hit play once more.");
		}
	}
	stopRecording() {
		this.pendingRecord = false;
		this.finishRecorder();
		this.emit();
	}
	beginRecorder() {
		if (!this.tap || typeof MediaRecorder === "undefined") {
			this.pendingRecord = false;
			this.snap = {
				...this.snap,
				error: "This browser can't record audio. You can still save the video file."
			};
			this.emit();
			return;
		}
		const mime = mimeChoice();
		const chunks = [];
		const recorder = new MediaRecorder(this.tap.stream, mime ? { mimeType: mime } : void 0);
		const type = recorder.mimeType || mime || "audio/webm";
		this.recordMime = type;
		recorder.ondataavailable = (event) => {
			if (event.data.size) chunks.push(event.data);
		};
		recorder.onstop = () => {
			const blob = new Blob(chunks, { type });
			if (this.recorder === recorder) {
				this.recorder = null;
				this.snap = {
					...this.snap,
					recording: false,
					recordSeconds: 0
				};
				this.emit();
			}
			if (blob.size > 800) this.onRecording?.(blob, type);
		};
		recorder.start();
		this.recorder = recorder;
		this.recordStarted = performance.now();
		this.lastRecordEmit = this.recordStarted;
		this.emit();
	}
	finishRecorder() {
		const recorder = this.recorder;
		this.pendingRecord = false;
		if (!recorder || recorder.state === "inactive") {
			this.recorder = null;
			return;
		}
		try {
			recorder.requestData();
		} catch {}
		recorder.stop();
	}
};
var engine = new PlayerEngine();
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var getStationPage = createServerFn({ method: "GET" }).validator((input) => {
	return {
		handle: parseHandle(input?.handle),
		page: Math.max(1, Math.min(80, Math.floor(Number(input?.page) || 1)))
	};
}).handler(createSsrRpc("ba34551ad3b821e6cd100c136e863e8b809bf5a537cf4333baedf113fc195633"));
var getPlaylistPage = createServerFn({ method: "GET" }).validator((input) => {
	return {
		id: parseUuid(input?.id, "playlist"),
		page: Math.max(1, Math.min(40, Math.floor(Number(input?.page) || 1)))
	};
}).handler(createSsrRpc("8315d2c615b5f2e80830764a0664a4a4b701b2ed53b187b8849c82e87c4400f5"));
var getClip = createServerFn({ method: "GET" }).validator((input) => ({ id: parseUuid(input?.id, "song") })).handler(createSsrRpc("d81f37f96da7d9ba30c0aed4e887a3f1754b8e7fd6b48430d766582a2680589d"));
var getRandomBatch = createServerFn({ method: "GET" }).validator((input) => {
	return {
		handle: parseHandle(input?.handle),
		count: Math.max(1, Math.min(12, Math.floor(Number(input?.count) || 1))),
		avoid: Array.isArray(input?.avoid) ? input.avoid.filter((id) => typeof id === "string").slice(0, 40) : [],
		totalHint: Math.max(0, Math.min(5e3, Math.floor(Number(input?.totalHint) || 0)))
	};
}).handler(createSsrRpc("ed0f028dd1c8288ce26c80bba2ffa1765de6a626545519c75e6c2d65b3b72a35"));
var transport = null;
var generation = 0;
function bindTransport(next) {
	transport = next;
}
function bumpGeneration() {
	generation += 1;
	return generation;
}
function currentGeneration() {
	return generation;
}
function qid() {
	return crypto.randomUUID();
}
function messageOf(error) {
	return error instanceof Error ? error.message : "Something went wrong.";
}
function rememberInto(state, track) {
	const known = {
		...state.known,
		[track.id]: forgetLyrics(track)
	};
	const order = [...state.knownOrder.filter((id) => id !== track.id), track.id];
	const pinned = new Set(state.favorites);
	while (order.length > 500) {
		const victim = order.findIndex((id) => !pinned.has(id));
		if (victim === -1) break;
		const [id] = order.splice(victim, 1);
		if (id) delete known[id];
	}
	return {
		known,
		knownOrder: order
	};
}
var useDeck = create()(persist((set, get) => ({
	handle: "drmad69",
	volume: .9,
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
	setVolume: (volume) => set({
		volume,
		muted: volume <= 0 ? get().muted : false
	}),
	setMuted: (muted) => set({ muted }),
	toggleShuffle: () => set({ shuffle: !get().shuffle }),
	cycleRepeat: () => {
		const order = [
			"off",
			"all",
			"one"
		];
		set({ repeat: order[(order.indexOf(get().repeat) + 1) % order.length] ?? "off" });
	},
	toggleRadio: () => set({ radio: !get().radio }),
	toggleSpread: () => set({ spread: !get().spread }),
	remember: (track) => set(rememberInto(get(), track)),
	avoidIds: () => {
		const { history, stats, spread } = get();
		const recent = history.slice(0, 12).map((entry) => entry.id);
		if (!spread) return [...new Set(recent)];
		const heavy = Object.values(stats).sort((a, b) => b.plays - a.plays).slice(0, 8).map((stat) => stat.id);
		return [.../* @__PURE__ */ new Set([...recent, ...heavy])].slice(0, 24);
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
			playlistTracks: null
		});
		try {
			const page = await getStationPage({ data: {
				handle,
				page: 1
			} });
			if (get().seq !== seq) return;
			let knownState = get();
			for (const track of page.tracks) knownState = {
				...knownState,
				...rememberInto(knownState, track)
			};
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
					playlists: page.playlists
				},
				tracks: page.tracks,
				indexedPages: [page.page],
				known: knownState.known,
				knownOrder: knownState.knownOrder
			});
		} catch (error) {
			if (get().seq !== seq) return;
			set({
				loading: false,
				error: messageOf(error)
			});
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
		set({
			loading: true,
			error: null
		});
		try {
			const page = await getStationPage({ data: {
				handle,
				page: nextPage
			} });
			if (!page.tracks.length) {
				set({
					loading: false,
					exhausted: true
				});
				return;
			}
			const seen = new Set(get().tracks.map((track) => track.id));
			const added = page.tracks.filter((track) => !seen.has(track.id));
			let knownState = get();
			for (const track of added) knownState = {
				...knownState,
				...rememberInto(knownState, track)
			};
			const merged = [...get().tracks, ...added];
			const total = page.totalClips || station?.totalClips || 0;
			set({
				loading: false,
				tracks: merged,
				indexedPages: [.../* @__PURE__ */ new Set([...get().indexedPages, page.page])],
				exhausted: merged.length >= total && total > 0,
				known: knownState.known,
				knownOrder: knownState.knownOrder,
				station: get().station ? {
					...get().station,
					totalClips: total || get().station.totalClips
				} : get().station
			});
		} catch (error) {
			set({
				loading: false,
				error: messageOf(error)
			});
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
		set({
			playlistId: id,
			playlistName: name,
			loading: true,
			error: null,
			tab: "station"
		});
		try {
			const page = await getPlaylistPage({ data: {
				id,
				page: 1
			} });
			let knownState = get();
			for (const track of page.tracks) knownState = {
				...knownState,
				...rememberInto(knownState, track)
			};
			set({
				loading: false,
				playlistTracks: page.tracks,
				playlistName: page.name || name,
				known: knownState.known,
				knownOrder: knownState.knownOrder
			});
		} catch (error) {
			set({
				loading: false,
				error: messageOf(error),
				playlistTracks: []
			});
		}
	},
	clearPlaylist: () => set({
		playlistId: null,
		playlistName: "",
		playlistTracks: null
	}),
	markSpin: (id) => {
		const track = get().current?.id === id ? get().current : get().known[id];
		const title = track && "title" in track ? track.title : get().stats[id]?.title || "Untitled";
		const artist = track && "artist" in track ? track.artist : get().stats[id]?.artist || "";
		const prev = get().stats[id];
		const stat = {
			id,
			title,
			artist,
			plays: (prev?.plays ?? 0) + 1,
			completes: prev?.completes ?? 0,
			seconds: prev?.seconds ?? 0,
			lastAt: Date.now(),
			recorded: prev?.recorded ?? 0
		};
		const history = [{
			id,
			title,
			artist,
			at: Date.now()
		}, ...get().history.filter((entry) => entry.id !== id)].slice(0, 300);
		set({
			stats: {
				...get().stats,
				[id]: stat
			},
			history
		});
	},
	markHeard: (id, seconds, natural) => {
		const prev = get().stats[id];
		if (!prev) return;
		const heard = Math.max(0, seconds);
		const completes = natural && prev.completes < prev.plays ? prev.completes + 1 : prev.completes;
		set({ stats: {
			...get().stats,
			[id]: {
				...prev,
				seconds: prev.seconds + heard,
				completes
			}
		} });
	},
	markRecorded: (id) => {
		const prev = get().stats[id];
		if (!prev) return;
		set({ stats: {
			...get().stats,
			[id]: {
				...prev,
				recorded: prev.recorded + 1
			}
		} });
	},
	toggleFavorite: (track) => {
		get().remember(track);
		set({ favorites: get().favorites.includes(track.id) ? get().favorites.filter((id) => id !== track.id) : [track.id, ...get().favorites] });
	},
	enqueue: (track) => {
		get().remember(track);
		set({
			queue: [...get().queue, {
				qid: qid(),
				track
			}],
			tab: "next"
		});
	},
	enqueueNext: (track) => {
		get().remember(track);
		set({
			queue: [{
				qid: qid(),
				track
			}, ...get().queue],
			tab: "next"
		});
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
			past: current && current.id !== track.id ? [...get().past, current].slice(-40) : get().past
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
		if (!await engine.toggle()) await get().queueRadio(1);
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
		if (engine.getSnapshot().currentTime > 3) {
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
			queue: current ? [{
				qid: qid(),
				track: current
			}, ...get().queue] : get().queue
		});
		await transport?.play(previous);
	},
	decideNext: (endedId, fromUserNext = false) => {
		const state = get();
		if (!fromUserNext && state.repeat === "one" && state.current && state.current.id === endedId) return { type: "replay" };
		let queue = [...state.queue];
		const past = state.current ? [...state.past, state.current].slice(-40) : state.past;
		if (!queue.length && state.repeat === "all" && past.length) queue = past.map((track) => ({
			qid: qid(),
			track
		}));
		if (!queue.length && state.radio) {
			set({
				past,
				queue: []
			});
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
		set({
			queue,
			past,
			current: item.track
		});
		get().remember(item.track);
		return {
			type: "track",
			track: item.track
		};
	},
	pullRadio: async (count = 1) => {
		const { handle, station } = get();
		const batch = await getRandomBatch({ data: {
			handle,
			count,
			avoid: get().avoidIds(),
			totalHint: station?.totalClips || 0
		} });
		for (const track of batch.tracks) get().remember(track);
		if (batch.total && get().station) set({ station: {
			...get().station,
			totalClips: batch.total
		} });
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
					past: current && current.id !== first.id ? [...get().past, current].slice(-40) : get().past,
					queue: [...get().queue, ...rest.map((track) => ({
						qid: qid(),
						track
					}))]
				});
				await transport?.play(first);
				return;
			}
			set({
				queue: [...get().queue, ...tracks.map((track) => ({
					qid: qid(),
					track
				}))],
				tab: "next"
			});
		} catch (error) {
			set({ error: messageOf(error) });
		}
	}
}), {
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
		knownOrder: state.knownOrder
	})
}));
async function settleEnded(endedId) {
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
	if (decision.type === "radio") try {
		const [track] = await useDeck.getState().pullRadio(1);
		if (!track || token !== currentGeneration()) return;
		useDeck.setState({ current: track });
		await transport?.play(track);
	} catch (error) {
		useDeck.getState().setNotice(messageOf(error));
	}
}
function formatTime(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const whole = Math.floor(seconds);
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor(whole % 3600 / 60);
	const remain = whole % 60;
	const clock = `${minutes}:${remain.toString().padStart(2, "0")}`;
	return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${remain.toString().padStart(2, "0")}` : clock;
}
function safeFile(title) {
	return title.replace(/[^\w\s.-]+/g, "").trim().slice(0, 80).replace(/\s+/g, " ") || "blackwire";
}
function formatWhen(iso) {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString(void 0, {
		month: "short",
		day: "numeric",
		year: "numeric"
	});
}
function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 4e3);
}
async function downloadRemote(url, filename) {
	const response = await fetch(url);
	if (!response.ok) throw new Error("The file didn't download.");
	downloadBlob(await response.blob(), filename);
}
var TABS = [
	{
		id: "next",
		label: "Up next",
		icon: ListMusic
	},
	{
		id: "station",
		label: "Station",
		icon: Radio
	},
	{
		id: "history",
		label: "Log",
		icon: History
	}
];
var SORTS = [
	{
		id: "newest",
		label: "Newest"
	},
	{
		id: "title",
		label: "Title"
	},
	{
		id: "suno",
		label: "Suno plays"
	},
	{
		id: "mine",
		label: "Your plays"
	},
	{
		id: "short",
		label: "Shortest"
	}
];
function withLyrics(track) {
	return "lyrics" in track ? track : {
		...track,
		lyrics: ""
	};
}
async function recordCurrent() {
	if (engine.getSnapshot().recording) {
		engine.stopRecording();
		return;
	}
	if (!useDeck.getState().current) await useDeck.getState().queueRadio(1);
	await engine.startRecording();
}
function Deck() {
	const snap = (0, import_react.useSyncExternalStore)(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
	const notice = useDeck((state) => state.notice);
	const error = useDeck((state) => state.error);
	const current = useDeck((state) => state.current);
	const handle = useDeck((state) => state.handle);
	(0, import_react.useEffect)(() => {
		bindTransport({
			play: (track, opts) => engine.playTrack(track, opts),
			replay: () => engine.replay()
		});
		engine.onEnded = (id) => {
			settleEnded(id);
		};
		engine.onSpin = (id) => useDeck.getState().markSpin(id);
		engine.onHeard = (id, seconds, natural) => useDeck.getState().markHeard(id, seconds, natural);
		engine.onRecording = (blob, mime) => {
			const playing = useDeck.getState().current;
			const ext = mime.includes("mp4") ? "m4a" : "webm";
			if (playing) useDeck.getState().markRecorded(playing.id);
			downloadBlob(blob, `${safeFile(playing?.title || "blackwire")}.${ext}`);
			useDeck.getState().setNotice(`Saved a recording of ${playing?.title ?? "that song"}.`);
		};
		const unsub = useDeck.persist.onFinishHydration((state) => {
			engine.setVolume(state.volume);
			engine.setMuted(state.muted);
		});
		Promise.resolve(useDeck.persist.rehydrate()).then(() => {
			const state = useDeck.getState();
			engine.setVolume(state.volume);
			engine.setMuted(state.muted);
			state.loadStation(state.handle);
		});
		return () => {
			unsub();
			engine.onEnded = null;
			engine.onSpin = null;
			engine.onHeard = null;
			engine.onRecording = null;
		};
	}, []);
	(0, import_react.useEffect)(() => {
		if (!notice) return;
		const timer = window.setTimeout(() => useDeck.getState().setNotice(null), 4200);
		return () => window.clearTimeout(timer);
	}, [notice]);
	(0, import_react.useEffect)(() => {
		const onKey = (event) => {
			const target = event.target;
			if (target instanceof HTMLElement) {
				const tag = target.tagName;
				if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			}
			if (event.code === "Space") {
				event.preventDefault();
				useDeck.getState().togglePlay();
			} else if (event.code === "ArrowRight") engine.seek(engine.getSnapshot().currentTime + 5);
			else if (event.code === "ArrowLeft") engine.seek(Math.max(0, engine.getSnapshot().currentTime - 5));
			else if (event.key === "n" || event.key === "N") useDeck.getState().next();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!current || !("mediaSession" in navigator)) return;
		try {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: current.title,
				artist: current.artist,
				album: `@${handle}`,
				artwork: current.image ? [{ src: current.image }] : []
			});
			navigator.mediaSession.setActionHandler("play", () => {
				useDeck.getState().togglePlay();
			});
			navigator.mediaSession.setActionHandler("pause", () => engine.pause());
			navigator.mediaSession.setActionHandler("nexttrack", () => {
				useDeck.getState().next();
			});
			navigator.mediaSession.setActionHandler("previoustrack", () => {
				useDeck.getState().prev();
			});
		} catch {}
	}, [current, handle]);
	const playing = snap.status === "playing";
	const pct = snap.duration > 0 ? Math.min(100, snap.currentTime / snap.duration * 100) : 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-screen bg-bg text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-1 bg-blue" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Header, {}),
			(notice || error || snap.error) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto max-w-6xl px-4 pt-4",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					role: "status",
					className: "rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-blue-2",
					children: notice || error || snap.error
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "mx-auto grid max-w-6xl gap-6 px-4 py-5 pb-32 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:pb-10",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "md:sticky md:top-4 md:self-start",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NowPlaying, {
						pct,
						playing,
						recording: snap.recording
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "min-w-0 rounded-deck border border-line bg-bg-elev",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Library, {})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MobileBar, {
				playing,
				recording: snap.recording
			})
		]
	});
}
function Header() {
	const handle = useDeck((state) => state.handle);
	const station = useDeck((state) => state.station);
	const history = useDeck((state) => state.history);
	const stats = useDeck((state) => state.stats);
	const [draft, setDraft] = (0, import_react.useState)(handle);
	(0, import_react.useEffect)(() => setDraft(handle), [handle]);
	const spins = Object.values(stats).reduce((sum, stat) => sum + stat.plays, 0);
	const heard = Object.keys(stats).length;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
		className: "border-b border-line bg-bg-elev",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-xs tracking-widest text-blue-2",
						children: "ON AIR"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "text-2xl font-semibold tracking-tight",
						children: "Blackwire"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					className: "flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 sm:max-w-xs",
					onSubmit: (event) => {
						event.preventDefault();
						const next = draft.trim().replace(/^@/, "");
						if (!next || next === handle) return;
						useDeck.getState().loadStation(next);
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							htmlFor: "channel",
							className: "font-mono text-sm text-faint",
							children: "@"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							id: "channel",
							value: draft,
							onChange: (event) => setDraft(event.target.value),
							spellCheck: false,
							autoCapitalize: "off",
							className: "w-full bg-transparent font-mono text-sm text-fg outline-none",
							"aria-label": "Suno channel handle"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "submit",
							className: "rounded-full bg-blue px-3 py-1.5 text-sm font-medium text-on-blue",
							children: "Tune"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "ml-auto flex flex-wrap gap-2 font-mono text-xs text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "rounded-full border border-line px-3 py-1",
							children: station ? `${station.totalClips} public` : "…"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "rounded-full border border-line px-3 py-1",
							children: [spins, " spins"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "rounded-full border border-line px-3 py-1",
							children: [heard || history.length, " heard"]
						})
					]
				})
			]
		})
	});
}
function NowPlaying({ pct, playing, recording }) {
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
	const snap = (0, import_react.useSyncExternalStore)(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
	const [lyricsOpen, setLyricsOpen] = (0, import_react.useState)(false);
	const [lyrics, setLyrics] = (0, import_react.useState)("");
	const [saving, setSaving] = (0, import_react.useState)(false);
	const stat = current ? stats[current.id] : void 0;
	const loved = current ? favorites.includes(current.id) : false;
	(0, import_react.useEffect)(() => {
		setLyricsOpen(false);
		setLyrics(current?.lyrics ?? "");
	}, [current?.id, current?.lyrics]);
	async function toggleLyrics() {
		if (!current) return;
		const next = !lyricsOpen;
		setLyricsOpen(next);
		if (next && !lyrics) try {
			const full = await getClip({ data: { id: current.id } });
			setLyrics(full.lyrics);
		} catch {
			setLyrics("");
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-deck border border-line bg-bg-elev p-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-mono text-xs tracking-widest text-faint",
					children: playing ? "PLAYING" : recording ? "RECORDING" : "DECK"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meter, {})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cover, {
				src: current?.image || station?.avatar || "",
				alt: current ? current.title : "No song yet",
				live: playing
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 min-w-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "truncate text-xl font-semibold",
						children: current?.title ?? "Nothing queued"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 truncate text-sm text-muted",
						children: current ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
							current.artist,
							current.handle ? ` · @${current.handle}` : "",
							current.explicit ? " · explicit" : ""
						] }) : station?.displayName || "Tune a channel, then hit play"
					}),
					current?.tags && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 truncate text-sm text-blue-2",
						children: current.tags
					}),
					stat && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 font-mono text-xs text-faint",
						children: [
							stat.plays,
							" play",
							stat.plays === 1 ? "" : "s",
							stat.completes ? ` · ${stat.completes} finished` : "",
							stat.recorded ? ` · ${stat.recorded} recorded` : ""
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "mt-4 block",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "sr-only",
					children: "Seek"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: "seek",
					type: "range",
					min: 0,
					max: snap.duration || 0,
					step: .1,
					value: Math.min(snap.currentTime, snap.duration || snap.currentTime),
					onChange: (event) => engine.seek(Number(event.target.value)),
					style: { ["--pct"]: `${pct}%` },
					"aria-valuetext": formatTime(snap.currentTime)
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-1 flex justify-between font-mono text-xs text-faint",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: formatTime(snap.currentTime) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: formatTime(snap.duration || current?.duration || 0) })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex items-center justify-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						label: shuffle ? "Shuffle on" : "Shuffle off",
						active: shuffle,
						onClick: () => useDeck.getState().toggleShuffle(),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shuffle, { className: "size-4" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						label: "Previous",
						onClick: () => void useDeck.getState().prev(),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkipBack, { className: "size-5" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-label": playing ? "Pause" : "Play",
						onClick: () => void useDeck.getState().togglePlay(),
						className: "inline-flex size-16 items-center justify-center rounded-full bg-blue text-on-blue",
						children: snap.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-6 animate-spin" }) : playing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-7" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-7" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						label: "Next",
						onClick: () => void useDeck.getState().next(),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkipForward, { className: "size-5" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						label: repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat queue" : "Repeat off",
						active: repeat !== "off",
						onClick: () => useDeck.getState().cycleRepeat(),
						children: repeat === "one" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Repeat1, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Repeat, { className: "size-4" })
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TextButton, {
						active: radio,
						onClick: () => useDeck.getState().toggleRadio(),
						children: ["Radio ", radio ? "on" : "off"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextButton, {
						active: spread,
						onClick: () => useDeck.getState().toggleSpread(),
						children: "Spread listens"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TextButton, {
						active: loved,
						disabled: !current,
						onClick: () => current && useDeck.getState().toggleFavorite(current),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heart, {
							className: "size-4",
							fill: loved ? "currentColor" : "none"
						}), "Keep"]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex items-center gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": muted || volume === 0 ? "Unmute" : "Mute",
					onClick: () => {
						const next = !useDeck.getState().muted;
						useDeck.getState().setMuted(next);
						engine.setMuted(next);
					},
					className: "text-muted",
					children: muted || volume === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { className: "size-5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-5" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "range",
					min: 0,
					max: 1,
					step: .01,
					value: muted ? 0 : volume,
					"aria-label": "Volume",
					style: { ["--pct"]: `${(muted ? 0 : volume) * 100}%` },
					onChange: (event) => {
						const value = Number(event.target.value);
						useDeck.getState().setVolume(value);
						useDeck.getState().setMuted(false);
						engine.setVolume(value);
						engine.setMuted(false);
					}
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 grid grid-cols-2 gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void recordCurrent(),
						className: "inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium " + (recording ? "bg-blue text-on-blue" : "border border-line bg-surface"),
						children: [recording ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-blue-2" }), recording ? `Recording ${formatTime(snap.recordSeconds)}` : "Record song"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						disabled: !current || saving,
						onClick: () => void saveVideo(),
						className: "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40",
						children: [saving ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "size-4 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }), "Save video"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: !current,
						onClick: () => void toggleLyrics(),
						className: "rounded-full border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40",
						children: lyricsOpen ? "Hide lyrics" : "Lyrics"
					}),
					current && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
						href: `https://suno.com/song/${current.id}`,
						target: "_blank",
						rel: "noreferrer",
						className: "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, { className: "size-4" }), "On Suno"]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 text-xs leading-relaxed text-faint",
				children: "Record plays the song from the top and saves an audio file when it ends, or when you stop. Save video grabs the original file without a full listen. Audio stays on Suno — this deck does not mirror the catalog."
			}),
			lyricsOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
				className: "mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-surface p-4 font-sans text-sm leading-relaxed text-muted",
				children: lyrics || "No lyrics on this one."
			})
		]
	});
}
function Cover({ src, alt, live }) {
	const [failed, setFailed] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => setFailed(false), [src]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "mx-auto aspect-square w-48 overflow-hidden rounded-deck bg-surface md:w-full md:max-w-sm " + (live ? "ring-2 ring-blue" : "ring-1 ring-line"),
		children: src && !failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			src,
			alt,
			className: "h-full w-full object-cover",
			onError: () => setFailed(true)
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex h-full items-center justify-center font-mono text-xs tracking-widest text-faint",
			children: "BLACKWIRE"
		})
	});
}
function Meter() {
	const levels = (0, import_react.useSyncExternalStore)(engine.subscribeLevels, engine.getLevels, engine.getLevels);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-8 items-end gap-1",
		"aria-hidden": "true",
		children: levels.map((level, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "meter-bar w-1 rounded-full bg-blue",
			style: { height: `${Math.max(12, Math.round(level * 100))}%` }
		}, index))
	});
}
function Library() {
	const tab = useDeck((state) => state.tab);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex border-b border-line",
		role: "tablist",
		children: TABS.map((item) => {
			const Icon = item.icon;
			const selected = tab === item.id;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "tab",
				"aria-selected": selected,
				onClick: () => useDeck.getState().setTab(item.id),
				className: "inline-flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm " + (selected ? "border-b-2 border-blue text-fg" : "text-muted"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-4" }), item.label]
			}, item.id);
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "p-3 sm:p-4",
		children: [
			tab === "next" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueuePanel, {}),
			tab === "station" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StationPanel, {}),
			tab === "history" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HistoryPanel, {})
		]
	})] });
}
function QueuePanel() {
	const queue = useDeck((state) => state.queue);
	const current = useDeck((state) => state.current);
	const radio = useDeck((state) => state.radio);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => void useDeck.getState().queueRadio(8),
					className: "rounded-full bg-blue px-4 py-2 text-sm font-medium text-on-blue",
					children: "Queue 8 random"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => useDeck.getState().clearQueue(),
					disabled: !queue.length,
					className: "rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40",
					children: "Clear"
				})]
			}),
			current && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-sm text-muted",
				children: ["Now: ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-fg",
					children: current.title
				})]
			}),
			!queue.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm leading-relaxed text-muted",
				children: radio ? "Radio is on. When the queue is empty, the next song is pulled from the channel — not downloaded ahead of time." : "Radio is off. Queue songs from the station list, or turn radio back on."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col gap-2",
				children: queue.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-center gap-2 rounded-2xl bg-surface px-2 py-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "w-6 text-center font-mono text-xs text-faint",
							children: index + 1
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "truncate text-sm",
								children: item.track.title
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "truncate text-xs text-faint",
								children: formatTime(item.track.duration)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "px-2 text-xs text-blue-2",
							onClick: () => void useDeck.getState().playFromQueue(item.qid),
							children: "Play"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": "Move up",
							className: "px-1 text-xs text-muted",
							onClick: () => useDeck.getState().moveQueued(item.qid, -1),
							children: "Up"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": "Move down",
							className: "px-1 text-xs text-muted",
							onClick: () => useDeck.getState().moveQueued(item.qid, 1),
							children: "Down"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": "Remove",
							onClick: () => useDeck.getState().removeQueued(item.qid),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4 text-faint" })
						})
					]
				}, item.qid))
			})
		]
	});
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
	const visible = (0, import_react.useMemo)(() => filterTracks(source, query, sort, stats), [
		source,
		query,
		sort,
		stats
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4",
		children: [
			station && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-3",
				children: [station.avatar ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: station.avatar,
					alt: "",
					className: "size-16 shrink-0 rounded-2xl object-cover"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "size-16 shrink-0 rounded-2xl bg-surface" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "truncate text-lg font-semibold",
							children: station.displayName
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "font-mono text-xs text-faint",
							children: ["@", station.handle]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-sm text-muted",
							children: [
								station.followers,
								" followers · ",
								station.sunoPlays.toLocaleString(),
								" Suno plays"
							]
						}),
						station.description && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 line-clamp-2 text-sm text-muted",
							children: station.description
						})
					]
				})]
			}),
			station && station.playlists.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2 overflow-x-auto pb-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => useDeck.getState().clearPlaylist(),
					className: "shrink-0 rounded-full border px-3 py-1.5 text-sm " + (!playlistId ? "border-blue bg-blue text-on-blue" : "border-line"),
					children: "All public"
				}), station.playlists.map((playlist) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => void useDeck.getState().openPlaylist(playlist.id, playlist.name),
					className: "shrink-0 rounded-full border px-3 py-1.5 text-sm " + (playlistId === playlist.id ? "border-blue bg-blue text-on-blue" : "border-line"),
					children: [playlist.name, playlist.songCount ? ` · ${playlist.songCount}` : ""]
				}, playlist.id))]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "size-4 text-faint" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "sr-only",
								children: "Search songs"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: query,
								onChange: (event) => useDeck.getState().setQuery(event.target.value),
								placeholder: playlistName ? `Search ${playlistName}` : "Search indexed songs",
								className: "w-full bg-transparent text-sm outline-none placeholder:text-faint"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						className: "sr-only",
						htmlFor: "sort",
						children: "Sort"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						id: "sort",
						value: sort,
						onChange: (event) => useDeck.getState().setSort(event.target.value),
						className: "rounded-full border border-line bg-surface px-3 py-2 text-sm",
						children: SORTS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: item.id,
							children: item.label
						}, item.id))
					})
				]
			}),
			!playlistId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-2 text-sm",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "font-mono text-xs text-faint",
						children: [
							"Indexed ",
							tracks.length,
							station ? ` / ${station.totalClips}` : "",
							" — metadata only"
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: loading || exhausted,
						onClick: () => void useDeck.getState().loadMore(),
						className: "rounded-full border border-line px-3 py-1.5 disabled:opacity-40",
						children: loading && !indexing ? "Loading…" : "Next page"
					}),
					indexing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => useDeck.getState().stopIndex(),
						className: "rounded-full border border-line px-3 py-1.5",
						children: "Stop indexing"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: exhausted,
						onClick: () => void useDeck.getState().indexRest(),
						className: "rounded-full border border-line px-3 py-1.5 disabled:opacity-40",
						children: "Index the rest"
					})
				]
			}),
			playlistId && playlistTracks && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => {
					for (const track of playlistTracks) useDeck.getState().enqueue(track);
				},
				className: "self-start rounded-full bg-blue px-4 py-2 text-sm font-medium text-on-blue",
				children: ["Queue ", playlistName || "playlist"]
			}),
			!visible.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: loading ? "Pulling the channel…" : "Nothing matches. Index another page, or clear the search."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col",
				children: visible.map((track) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SongRow, { track }, track.id))
			})
		]
	});
}
function SongRow({ track }) {
	const stats = useDeck((state) => state.stats);
	const currentId = useDeck((state) => state.current?.id);
	const plays = stats[track.id]?.plays ?? 0;
	const active = currentId === track.id;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: "flex items-center gap-3 border-b border-line py-2 " + (active ? "text-blue-2" : ""),
		children: [
			track.image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: track.image,
				alt: "",
				className: "size-12 rounded-xl object-cover"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "size-12 rounded-xl bg-surface-2" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "truncate text-sm font-medium",
					children: track.title
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "truncate text-xs text-faint",
					children: [
						formatTime(track.duration),
						track.tags ? ` · ${track.tags}` : "",
						track.createdAt ? ` · ${formatWhen(track.createdAt)}` : ""
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "hidden font-mono text-xs text-faint sm:inline",
				children: plays ? `${plays}×` : "new"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "px-2 text-xs text-blue-2",
				onClick: () => useDeck.getState().enqueueNext(track),
				children: "Next"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "px-2 text-xs text-muted",
				onClick: () => useDeck.getState().enqueue(track),
				children: "Queue"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": `Play ${track.title}`,
				onClick: () => void useDeck.getState().playNow(track),
				className: "inline-flex size-11 items-center justify-center rounded-full bg-surface-2",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4" })
			})
		]
	});
}
function HistoryPanel() {
	const history = useDeck((state) => state.history);
	const stats = useDeck((state) => state.stats);
	const favorites = useDeck((state) => state.favorites);
	const known = useDeck((state) => state.known);
	const ranked = Object.values(stats).slice().sort((a, b) => b.plays - a.plays || b.lastAt - a.lastAt).slice(0, 5);
	const kept = favorites.map((id) => known[id]).filter((track) => Boolean(track));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted",
				children: "Spins stay in this browser. A spin counts when playback actually starts. Finished means the song reached the end."
			}),
			ranked.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "mb-2 text-sm font-medium",
				children: "Most played here"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "flex flex-col gap-1",
				children: ranked.map((stat) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "flex items-baseline justify-between gap-3 text-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "truncate",
						children: stat.title
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "shrink-0 font-mono text-xs text-faint",
						children: [
							stat.plays,
							"× · ",
							formatTime(stat.seconds)
						]
					})]
				}, stat.id))
			})] }),
			kept.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "mb-2 text-sm font-medium",
				children: "Kept"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: kept.map((track) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SongRow, { track: withLyrics(track) }, track.id)) })] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "mb-2 text-sm font-medium",
					children: "Recent"
				}),
				!history.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "Nothing played yet."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "flex flex-col gap-2",
					children: history.map((entry) => {
						const track = known[entry.id];
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex items-center gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "truncate text-sm",
									children: entry.title
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "font-mono text-xs text-faint",
									children: [
										new Date(entry.at).toLocaleString(),
										" · ",
										stats[entry.id]?.plays ?? 1,
										"×"
									]
								})]
							}), track && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "rounded-full border border-line px-3 py-1.5 text-xs",
								onClick: () => void useDeck.getState().playNow(withLyrics(track)),
								children: "Play"
							})]
						}, `${entry.id}-${entry.at}`);
					})
				})
			] })
		]
	});
}
function MobileBar({ playing, recording }) {
	const current = useDeck((state) => state.current);
	const snap = (0, import_react.useSyncExternalStore)(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg-elev px-3 py-2 md:hidden",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "truncate text-center text-xs text-muted",
			children: [recording ? `Recording ${formatTime(snap.recordSeconds)} · ` : "", current?.title ?? "Blackwire"]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-1 flex items-center justify-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
					label: "Previous",
					onClick: () => void useDeck.getState().prev(),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkipBack, { className: "size-5" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": playing ? "Pause" : "Play",
					onClick: () => void useDeck.getState().togglePlay(),
					className: "inline-flex size-12 items-center justify-center rounded-full bg-blue text-on-blue",
					children: playing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-5" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
					label: "Next",
					onClick: () => void useDeck.getState().next(),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkipForward, { className: "size-5" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => void recordCurrent(),
					className: "inline-flex h-11 items-center rounded-full px-4 text-sm " + (recording ? "bg-blue text-on-blue" : "border border-line"),
					children: recording ? "Stop" : "Record"
				})
			]
		})]
	});
}
function IconButton({ label, active, disabled, onClick, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		"aria-label": label,
		title: label,
		"aria-pressed": active,
		disabled,
		onClick,
		className: "inline-flex size-11 items-center justify-center rounded-full border " + (active ? "border-blue bg-blue text-on-blue" : "border-line bg-surface text-fg") + " disabled:opacity-40",
		children
	});
}
function TextButton({ children, active, disabled, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		disabled,
		onClick,
		className: "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs " + (active ? "border-blue bg-surface-2 text-blue-2" : "border-line text-muted") + " disabled:opacity-40",
		children
	});
}
function filterTracks(tracks, query, sort, stats) {
	const needle = query.trim().toLowerCase();
	return (needle ? tracks.filter((track) => `${track.title} ${track.tags} ${track.artist}`.toLowerCase().includes(needle)) : tracks).slice().sort((a, b) => {
		if (sort === "title") return a.title.localeCompare(b.title);
		if (sort === "suno") return b.sunoPlays - a.sunoPlays;
		if (sort === "mine") return (stats[b.id]?.plays ?? 0) - (stats[a.id]?.plays ?? 0);
		if (sort === "short") return (a.duration || 0) - (b.duration || 0);
		return b.createdAt.localeCompare(a.createdAt);
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Deck, {});
}
//#endregion
export { Home as component };

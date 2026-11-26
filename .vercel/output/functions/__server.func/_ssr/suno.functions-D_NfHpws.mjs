import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { i as parseUuid, n as normalizeClip, r as parseHandle } from "./normalize-CsOb271U.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/suno.functions-D_NfHpws.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var API = "https://studio-api.prod.suno.com";
async function sunoGet(path) {
	const response = await fetch(`${API}${path}`, {
		headers: {
			accept: "application/json",
			"user-agent": "Mozilla/5.0 (compatible; Blackwire/1.0; +https://suno.com)",
			referer: "https://suno.com/"
		},
		signal: AbortSignal.timeout(2e4)
	});
	if (response.status === 404) throw new Error("Suno has no public page for that.");
	if (!response.ok) throw new Error(`Suno didn't answer (${response.status}).`);
	return response.json();
}
function asRecord(value) {
	return value && typeof value === "object" ? value : {};
}
function clipsFrom(value) {
	const record = asRecord(value);
	const list = Array.isArray(record.clips) ? record.clips : Array.isArray(record.playlist_clips) ? record.playlist_clips.map((entry) => asRecord(entry).clip) : [];
	const tracks = [];
	for (const entry of list) {
		const track = normalizeClip(asRecord(entry));
		if (track) tracks.push(track);
	}
	return tracks;
}
function playlistsFrom(value) {
	const list = asRecord(value).playlists;
	if (!Array.isArray(list)) return [];
	return list.map((entry) => {
		const row = asRecord(entry);
		const id = String(row.id || "");
		if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
		return {
			id,
			name: String(row.name || "Playlist"),
			songCount: Number(row.song_count ?? row.num_total_results ?? 0),
			image: String(row.image_url || "")
		};
	}).filter((row) => row !== null);
}
var getStationPage_createServerFn_handler = createServerRpc({
	id: "ba34551ad3b821e6cd100c136e863e8b809bf5a537cf4333baedf113fc195633",
	name: "getStationPage",
	filename: "src/lib/suno/suno.functions.ts"
}, (opts) => getStationPage.__executeServer(opts));
var getStationPage = createServerFn({ method: "GET" }).validator((input) => {
	return {
		handle: parseHandle(input?.handle),
		page: Math.max(1, Math.min(80, Math.floor(Number(input?.page) || 1)))
	};
}).handler(getStationPage_createServerFn_handler, async ({ data }) => {
	const query = new URLSearchParams({
		page: String(data.page),
		playlists_sort_by: "upvote_count",
		clips_sort_by: "created_at"
	});
	const body = asRecord(await sunoGet(`/api/profiles/${data.handle}?${query.toString()}`));
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
		playlists: data.page === 1 ? playlistsFrom(body) : []
	};
});
var getPlaylistPage_createServerFn_handler = createServerRpc({
	id: "8315d2c615b5f2e80830764a0664a4a4b701b2ed53b187b8849c82e87c4400f5",
	name: "getPlaylistPage",
	filename: "src/lib/suno/suno.functions.ts"
}, (opts) => getPlaylistPage.__executeServer(opts));
var getPlaylistPage = createServerFn({ method: "GET" }).validator((input) => {
	return {
		id: parseUuid(input?.id, "playlist"),
		page: Math.max(1, Math.min(40, Math.floor(Number(input?.page) || 1)))
	};
}).handler(getPlaylistPage_createServerFn_handler, async ({ data }) => {
	const body = asRecord(await sunoGet(`/api/playlist/${data.id}/?page=${data.page}`));
	return {
		id: data.id,
		name: String(body.name || "Playlist"),
		songCount: Number(body.num_total_results ?? body.song_count ?? 0),
		page: Number(body.current_page || data.page),
		tracks: clipsFrom(body)
	};
});
var getClip_createServerFn_handler = createServerRpc({
	id: "d81f37f96da7d9ba30c0aed4e887a3f1754b8e7fd6b48430d766582a2680589d",
	name: "getClip",
	filename: "src/lib/suno/suno.functions.ts"
}, (opts) => getClip.__executeServer(opts));
var getClip = createServerFn({ method: "GET" }).validator((input) => ({ id: parseUuid(input?.id, "song") })).handler(getClip_createServerFn_handler, async ({ data }) => {
	const body = asRecord(await sunoGet(`/api/clip/${data.id}`));
	const track = normalizeClip(body);
	if (!track) throw new Error("That song isn't public.");
	return track;
});
var getRandomBatch_createServerFn_handler = createServerRpc({
	id: "ed0f028dd1c8288ce26c80bba2ffa1765de6a626545519c75e6c2d65b3b72a35",
	name: "getRandomBatch",
	filename: "src/lib/suno/suno.functions.ts"
}, (opts) => getRandomBatch.__executeServer(opts));
var getRandomBatch = createServerFn({ method: "GET" }).validator((input) => {
	return {
		handle: parseHandle(input?.handle),
		count: Math.max(1, Math.min(12, Math.floor(Number(input?.count) || 1))),
		avoid: Array.isArray(input?.avoid) ? input.avoid.filter((id) => typeof id === "string").slice(0, 40) : [],
		totalHint: Math.max(0, Math.min(5e3, Math.floor(Number(input?.totalHint) || 0)))
	};
}).handler(getRandomBatch_createServerFn_handler, async ({ data }) => {
	const avoid = new Set(data.avoid);
	let total = data.totalHint;
	let seed = null;
	if (!total) {
		const query = new URLSearchParams({
			page: "1",
			playlists_sort_by: "upvote_count",
			clips_sort_by: "created_at"
		});
		seed = asRecord(await sunoGet(`/api/profiles/${data.handle}?${query.toString()}`));
		total = Number(seed.num_total_clips || 0);
	}
	const pageSize = 20;
	const pages = Math.max(1, Math.ceil((total || pageSize) / pageSize));
	const wantedPages = /* @__PURE__ */ new Set();
	while (wantedPages.size < Math.min(3, pages)) wantedPages.add(1 + Math.floor(Math.random() * pages));
	const pooled = [];
	for (const page of wantedPages) {
		let body = seed && page === 1 ? seed : null;
		if (!body) {
			const query = new URLSearchParams({
				page: String(page),
				playlists_sort_by: "upvote_count",
				clips_sort_by: "created_at"
			});
			body = asRecord(await sunoGet(`/api/profiles/${data.handle}?${query.toString()}`));
		}
		pooled.push(...clipsFrom(body));
	}
	const fresh = pooled.filter((track) => !avoid.has(track.id));
	const bag = [...fresh.length ? fresh : pooled];
	const tracks = [];
	while (bag.length && tracks.length < data.count) {
		const index = Math.floor(Math.random() * bag.length);
		const [track] = bag.splice(index, 1);
		if (track && !tracks.some((item) => item.id === track.id)) tracks.push(track);
	}
	return {
		total,
		tracks
	};
});
//#endregion
export { getClip_createServerFn_handler, getPlaylistPage_createServerFn_handler, getRandomBatch_createServerFn_handler, getStationPage_createServerFn_handler };

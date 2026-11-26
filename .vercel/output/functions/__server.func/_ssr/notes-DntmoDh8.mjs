//#region node_modules/.nitro/vite/services/ssr/assets/notes-DntmoDh8.js
var HANDLE_RE = /^[A-Za-z0-9_]{2,32}$/;
var UUID_RE$1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseHandle(input) {
	const handle = String(input ?? "").trim().replace(/^@/, "");
	if (!HANDLE_RE.test(handle)) throw new Error("Use a public Suno handle, like drmad69.");
	return handle;
}
function parseUuid(input, label) {
	const id = String(input ?? "").trim();
	if (!UUID_RE$1.test(id)) throw new Error(`Bad ${label}.`);
	return id;
}
function cleanTitle(title) {
	return title.replace(/\*\*/g, "").replace(/^\*+|\*+$/g, "").trim() || "Untitled";
}
function normalizeClip(raw) {
	if (!raw?.id || !UUID_RE$1.test(raw.id)) return null;
	if (raw.status && raw.status !== "complete") return null;
	if (raw.is_public === false) return null;
	const videoUrl = raw.video_url || "";
	if (!videoUrl.startsWith("https://")) return null;
	const duration = Number(raw.metadata?.duration ?? 0);
	const tags = (raw.display_tags || raw.metadata?.tags || "").split(",")[0]?.trim() ? String(raw.display_tags || "").split(",").slice(0, 3).map((tag) => tag.trim()).filter(Boolean).join(" · ") : "";
	return {
		id: raw.id,
		title: cleanTitle(String(raw.title || "Untitled")),
		artist: String(raw.display_name || raw.handle || "Suno"),
		handle: String(raw.handle || ""),
		image: String(raw.image_large_url || raw.image_url || ""),
		videoUrl,
		duration: Number.isFinite(duration) ? duration : 0,
		tags,
		lyrics: String(raw.metadata?.prompt || ""),
		createdAt: String(raw.created_at || ""),
		sunoPlays: Number(raw.play_count || 0),
		sunoLikes: Number(raw.upvote_count || 0),
		model: String(raw.major_model_version || ""),
		explicit: Boolean(raw.explicit)
	};
}
function forgetLyrics(track) {
	const { lyrics: _lyrics, ...known } = track;
	return known;
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var NIL = "00000000-0000-0000-0000-000000000000";
function asRecord(value) {
	return value && typeof value === "object" ? value : {};
}
function str(value) {
	return typeof value === "string" ? value.trim() : "";
}
function num(value) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}
function realId(value) {
	const id = str(value);
	if (!id || id === NIL || !UUID_RE.test(id)) return "";
	return id;
}
function slidersFrom(value) {
	const record = asRecord(value);
	const sliders = {};
	for (const [key, entry] of Object.entries(record)) if (typeof entry === "number" && Number.isFinite(entry)) sliders[key] = entry;
	return sliders;
}
function badgesFrom(value) {
	if (!Array.isArray(value)) return [];
	const names = [];
	for (const entry of value) {
		const name = str(asRecord(entry).display_name);
		if (name && !names.includes(name)) names.push(name);
	}
	return names;
}
function emptyNotes(id) {
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
		songUrl: id ? `https://suno.com/song/${id}` : ""
	};
}
function notesFromTrack(track) {
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
		videoUrl: track.videoUrl
	};
}
function notesFromRaw(raw) {
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
		songUrl: `https://suno.com/song/${id}`
	};
}
function mergeNotes(base, extra) {
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
		badges: extra.badges.length ? extra.badges : base.badges
	};
}
//#endregion
export { notesFromRaw as a, parseUuid as c, normalizeClip as i, forgetLyrics as n, notesFromTrack as o, mergeNotes as r, parseHandle as s, emptyNotes as t };

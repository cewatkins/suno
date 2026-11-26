//#region node_modules/.nitro/vite/services/ssr/assets/normalize-CsOb271U.js
var HANDLE_RE = /^[A-Za-z0-9_]{2,32}$/;
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseHandle(input) {
	const handle = String(input ?? "").trim().replace(/^@/, "");
	if (!HANDLE_RE.test(handle)) throw new Error("Use a public Suno handle, like drmad69.");
	return handle;
}
function parseUuid(input, label) {
	const id = String(input ?? "").trim();
	if (!UUID_RE.test(id)) throw new Error(`Bad ${label}.`);
	return id;
}
function cleanTitle(title) {
	return title.replace(/\*\*/g, "").replace(/^\*+|\*+$/g, "").trim() || "Untitled";
}
function normalizeClip(raw) {
	if (!raw?.id || !UUID_RE.test(raw.id)) return null;
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
//#endregion
export { parseUuid as i, normalizeClip as n, parseHandle as r, forgetLyrics as t };

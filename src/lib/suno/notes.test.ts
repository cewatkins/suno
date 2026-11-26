import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeNotes, notesFromRaw, notesFromTrack } from "./notes.ts";
import type { SlimTrack } from "./types.ts";

const track: SlimTrack = {
  id: "a45ec3de-3202-4028-8af3-b97a8f273812",
  title: "Fence Paint Moon",
  artist: "OxyOsbourne",
  handle: "drmad69",
  image: "https://cdn2.suno.ai/image.jpeg",
  videoUrl: "https://cdn1.suno.ai/a45ec3de-3202-4028-8af3-b97a8f273812.mp4",
  duration: 247,
  tags: "progressive rock",
  lyrics: "from the station list",
  createdAt: "2026-04-24T01:27:23.000Z",
  sunoPlays: 12,
  sunoLikes: 4,
  model: "v5.5",
  explicit: false,
};

describe("suno notes", () => {
  it("keeps the song title and the public suno fields", () => {
    const notes = notesFromRaw({
      id: track.id,
      title: "Fence Paint Moon",
      display_name: "OxyOsbourne",
      handle: "drmad69",
      created_at: "2026-04-24T01:27:23.000Z",
      updated_at: "2026-05-26T20:48:36.441Z",
      major_model_version: "v5.5",
      model_name: "chirp-fenix",
      display_tags: "progressive rock, electric rock, contemporary prog",
      play_count: 12,
      upvote_count: 4,
      comment_count: 1,
      explicit: false,
      image_large_url: track.image,
      video_url: track.videoUrl,
      persona: { id: "00000000-0000-0000-0000-000000000000", name: "My Voice - Apr 23" },
      metadata: {
        tags: "odd-meter prog",
        negative_tags: "lush ballad",
        prompt: "[Chorus]\nCoffins and fence paint",
        duration: 247.2,
        type: "gen",
        task: "vox_cover",
        make_instrumental: false,
        has_vocal: true,
        is_remix: true,
        can_remix: true,
        has_stem: false,
        cover_clip_id: "625f5523-b70e-418d-853c-a68de895ae91",
        control_sliders: { audio_weight: 0.36, weirdness_constraint: 0.69 },
        secondary_badges: [{ display_name: "COVER" }],
      },
    });
    assert.ok(notes);
    assert.equal(notes?.title, "Fence Paint Moon");
    assert.equal(notes?.artist, "OxyOsbourne");
    assert.equal(notes?.style, "odd-meter prog");
    assert.equal(notes?.negativeStyle, "lush ballad");
    assert.equal(notes?.lyrics, "[Chorus]\nCoffins and fence paint");
    assert.equal(notes?.modelName, "chirp-fenix");
    assert.equal(notes?.task, "vox_cover");
    assert.equal(notes?.persona, "My Voice - Apr 23");
    assert.equal(notes?.sliders.weirdness_constraint, 0.69);
    assert.deepEqual(notes?.badges, ["COVER"]);
    assert.equal(notes?.coverOf, "https://suno.com/song/625f5523-b70e-418d-853c-a68de895ae91");
    assert.equal(notes?.songUrl, `https://suno.com/song/${track.id}`);
  });

  it("fills gaps from the station row when the clip read is thin", () => {
    const base = notesFromTrack(track);
    const merged = mergeNotes(base, {
      ...base,
      lyrics: "",
      style: "full style prompt",
      displayTags: "",
    });
    assert.equal(merged.lyrics, "from the station list");
    assert.equal(merged.style, "full style prompt");
    assert.equal(merged.displayTags, "progressive rock");
    assert.equal(merged.title, "Fence Paint Moon");
  });
});

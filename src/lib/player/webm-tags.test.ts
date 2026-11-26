import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyNotes } from "../suno/notes.ts";
import { appendWebmTags, buildWebmTags } from "./webm-tags.ts";

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function vint(value: number): Uint8Array {
  if (value < 127) return Uint8Array.of(0x80 | value);
  return Uint8Array.of(0x40 | (value >> 8), value & 0xff);
}

function element(id: Uint8Array, data: Uint8Array): Uint8Array {
  return concat([id, vint(data.length), data]);
}

const notes = {
  ...emptyNotes("a45ec3de-3202-4028-8af3-b97a8f273812"),
  title: "Fence Paint Moon",
  artist: "OxyOsbourne",
  handle: "drmad69",
  createdAt: "2026-04-24T01:27:23.000Z",
  model: "v5.5",
  modelName: "chirp-fenix",
  displayTags: "progressive rock, electric rock",
  style: "odd-meter prog with a porch-light vocal",
  lyrics: "[Chorus]\nCoffins and fence paint",
  plays: 12,
  likes: 4,
};

describe("webm tags", () => {
  it("appends a track title onto an open-ended webm segment", () => {
    const ebml = element(Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3), element(Uint8Array.of(0x42, 0x82), new TextEncoder().encode("webm")));
    const segment = Uint8Array.of(0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);
    const payload = new TextEncoder().encode("CLUSTER");
    const file = concat([ebml, segment, payload]);
    const tagged = appendWebmTags(file, buildWebmTags(notes, "2026-11-25T00:00:00.000Z"));
    const text = new TextDecoder().decode(tagged);
    assert.ok(text.includes("CLUSTER"));
    assert.ok(text.includes("Fence Paint Moon"));
    assert.ok(text.includes("OxyOsbourne"));
    assert.ok(text.includes("odd-meter prog"));
    assert.ok(text.includes("Coffins and fence paint"));
    assert.ok(text.includes("a45ec3de-3202-4028-8af3-b97a8f273812"));
    assert.ok(text.includes("@drmad69"));
    assert.equal(tagged[0], 0x1a);
    assert.ok(tagged.length > file.length);
  });

  it("grows a known segment size so the tags stay inside it", () => {
    const ebml = element(
      Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3),
      Uint8Array.of(0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d),
    );
    const payload = new TextEncoder().encode("AUDIO");
    const segmentHeader = Uint8Array.of(0x18, 0x53, 0x80, 0x67, 0x20, 0x00, payload.length);
    const file = concat([ebml, segmentHeader, payload]);
    const tags = buildWebmTags(notes, "2026-11-25T00:00:00.000Z");
    const tagged = appendWebmTags(file, tags);
    assert.equal(tagged.length, file.length + tags.length);
    const sizeAt = ebml.length + 4;
    assert.notEqual(tagged[sizeAt + 2], payload.length);
    const text = new TextDecoder().decode(tagged);
    assert.ok(text.includes("Fence Paint Moon"));
    assert.ok(text.includes("AUDIO"));
  });
});

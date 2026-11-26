import type { ClipNotes } from "../suno/types.ts";

const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const SEGMENT = [0x18, 0x53, 0x80, 0x67];
const TAGS = Uint8Array.of(0x12, 0x54, 0xc3, 0x67);
const TAG = Uint8Array.of(0x73, 0x73);
const TARGETS = Uint8Array.of(0x63, 0xc0);
const TARGET_TYPE_VALUE = Uint8Array.of(0x68, 0xca);
const TARGET_TYPE = Uint8Array.of(0x63, 0xca);
const SIMPLE = Uint8Array.of(0x67, 0xc8);
const TAG_NAME = Uint8Array.of(0x45, 0xa3);
const TAG_STRING = Uint8Array.of(0x44, 0x87);

const TEXT_CAP = 20_000;

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
  if (value < 0) throw new Error("Bad EBML size.");
  if (value < 127) return Uint8Array.of(0x80 | value);
  if (value < 16_383) return Uint8Array.of(0x40 | (value >> 8), value & 0xff);
  if (value < 2_097_151) {
    return Uint8Array.of(0x20 | (value >> 16), (value >> 8) & 0xff, value & 0xff);
  }
  return Uint8Array.of(
    0x10 | ((value >>> 24) & 0x0f),
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function element(id: Uint8Array, data: Uint8Array): Uint8Array {
  return concat([id, vint(data.length), data]);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function clipText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= TEXT_CAP) return trimmed;
  return trimmed.slice(0, TEXT_CAP);
}

function idWidth(first: number): number {
  if (first & 0x80) return 1;
  if (first & 0x40) return 2;
  if (first & 0x20) return 3;
  if (first & 0x10) return 4;
  return 0;
}

function sameId(bytes: Uint8Array, offset: number, id: number[]): boolean {
  return id.every((byte, index) => bytes[offset + index] === byte);
}

type SizeRead = { width: number; value: number; unknown: boolean };

function readSize(bytes: Uint8Array, offset: number): SizeRead | null {
  const first = bytes[offset];
  if (!first) return null;
  let width = 1;
  let marker = 0x80;
  while (width <= 8 && (first & marker) === 0) {
    width += 1;
    marker >>= 1;
  }
  if (width > 8 || offset + width > bytes.length) return null;
  const dataMask = marker - 1;
  let unknown = (first & dataMask) === dataMask;
  let value = first & dataMask;
  for (let index = 1; index < width; index += 1) {
    const byte = bytes[offset + index] ?? 0;
    if (byte !== 0xff) unknown = false;
    value = value * 256 + byte;
  }
  return { width, value, unknown };
}

function writeSize(bytes: Uint8Array, offset: number, width: number, value: number) {
  let rest = value;
  for (let index = width - 1; index >= 1; index -= 1) {
    bytes[offset + index] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }
  const marker = 1 << (8 - width);
  bytes[offset] = (marker | rest) & 0xff;
}

function simpleTag(name: string, value: string): Uint8Array | null {
  const text = clipText(value);
  if (!text) return null;
  return element(
    SIMPLE,
    concat([element(TAG_NAME, utf8(name)), element(TAG_STRING, utf8(text))]),
  );
}

function dateOnly(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return match?.[1] ?? "";
}

export function notesArchive(notes: ClipNotes, recordedAt: string): string {
  const archive = {
    recordedAt,
    ...notes,
  };
  const json = JSON.stringify(archive);
  if (json.length <= 60_000) return json;
  return JSON.stringify({
    ...archive,
    lyrics: notes.lyrics.slice(0, 8_000),
    style: notes.style.slice(0, 8_000),
  });
}

export function buildWebmTags(notes: ClipNotes, recordedAt: string): Uint8Array {
  const album = notes.handle ? `@${notes.handle}` : notes.artist;
  const model = [notes.modelName, notes.model].filter(Boolean).join(" ");
  const comment = [
    notes.songUrl,
    model,
    notes.persona ? `Voice: ${notes.persona}` : "",
    notes.coverOf ? `Cover of ${notes.coverOf}` : "",
    notes.badges.length ? notes.badges.join(", ") : "",
    notes.plays ? `${notes.plays} Suno plays` : "",
    notes.likes ? `${notes.likes} likes` : "",
    `Saved ${recordedAt}`,
  ]
    .filter(Boolean)
    .join("\n");
  const pairs: [string, string][] = [
    ["TITLE", notes.title],
    ["ARTIST", notes.artist],
    ["ALBUM", album],
    ["DATE", dateOnly(notes.createdAt)],
    ["GENRE", notes.displayTags],
    ["DESCRIPTION", notes.style],
    ["NEGATIVE", notes.negativeStyle],
    ["PERSONA", notes.persona],
    ["COMMENT", comment],
    ["LYRICS", notes.lyrics],
    ["URL", notes.songUrl],
    ["MODEL", model],
    ["SUNO_ID", notes.id],
    ["SUNO", notesArchive(notes, recordedAt)],
  ];
  const tags = pairs
    .map(([name, value]) => simpleTag(name, value))
    .filter((tag): tag is Uint8Array => tag !== null);
  const targets = element(
    TARGETS,
    concat([
      element(TARGET_TYPE_VALUE, Uint8Array.of(30)),
      element(TARGET_TYPE, utf8("TRACK")),
    ]),
  );
  return element(TAGS, element(TAG, concat([targets, ...tags])));
}

export function appendWebmTags(bytes: Uint8Array, tags: Uint8Array): Uint8Array {
  if (tags.length === 0 || bytes.length < 8 || !sameId(bytes, 0, EBML)) return bytes;
  let offset = 0;
  while (offset + 5 < bytes.length) {
    const width = idWidth(bytes[offset] ?? 0);
    if (!width || offset + width >= bytes.length) return bytes;
    const isSegment = sameId(bytes, offset, SEGMENT);
    offset += width;
    const size = readSize(bytes, offset);
    if (!size) return bytes;
    const sizeAt = offset;
    offset += size.width;
    if (isSegment) {
      if (size.unknown) return concat([bytes, tags]);
      const next = size.value + tags.length;
      const max = size.width >= 7 ? Number.MAX_SAFE_INTEGER : 2 ** (7 * size.width) - 2;
      if (next <= max && offset + size.value <= bytes.length + 1) {
        const copy = bytes.slice();
        writeSize(copy, sizeAt, size.width, next);
        return concat([copy, tags]);
      }
      return concat([bytes, tags]);
    }
    if (size.unknown) return bytes;
    offset += size.value;
  }
  return bytes;
}

export async function tagAudioBlob(blob: Blob, notes: ClipNotes, recordedAt: string): Promise<Blob> {
  const type = blob.type || "audio/webm";
  if (!type.includes("webm")) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const tagged = appendWebmTags(bytes, buildWebmTags(notes, recordedAt));
  if (tagged === bytes) return blob;
  const body = new ArrayBuffer(tagged.byteLength);
  new Uint8Array(body).set(tagged);
  return new Blob([body], { type });
}

// Attachment storage abstraction.
//
// The ingest API always receives screenshots as data: URLs (the widget inlines them). Where the
// bytes actually LIVE is decided here, behind one function, so the rest of the app never changes:
//
//   - "inline"      (default) — keep the data URL in the DB row. Zero setup; fine for a prototype.
//   - "filesystem"  — write the blob to ./uploads and store a "/uploads/<file>" URL instead, so
//                     the DB row holds a small reference, not megabytes of base64.
//
// Going to S3/R2 is then a localized change: add an "s3" branch here that uploads the buffer and
// returns the object URL — nothing upstream (ingest, store, dashboard) needs to change.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { storageMode } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, "../uploads");

export interface AttachmentInput {
  filename: string;
  mime: string;
  dataUrl: string;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

/**
 * Persist one attachment and return the URL/reference to store on the feedback row.
 * Inline mode echoes the data URL; filesystem mode writes the file and returns its path.
 */
export async function putAttachment(input: AttachmentInput): Promise<string> {
  if (storageMode() !== "filesystem") return input.dataUrl; // inline: store as-is

  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed) return input.dataUrl; // not a data URL (already a link) — leave it

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = path.extname(input.filename || "").toLowerCase() || EXT_BY_MIME[parsed.mime] || ".bin";
  const name = `att_${nanoid(16)}${ext}`;
  await fs.promises.writeFile(path.join(UPLOADS_DIR, name), parsed.buffer);
  return `/uploads/${name}`;
}

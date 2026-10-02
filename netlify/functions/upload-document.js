/**
 * Anchoria — Document Upload Handler
 * Stores one uploaded document (base64) in Netlify Blobs.
 *
 * Hardened: the application must already exist (uploads follow a submission),
 * uploads are only accepted for a short window after it was saved, file type is
 * verified from the file's own bytes, size is capped, and requests are rate limited.
 * No Airtable calls — staff read documents through the admin dashboard.
 */
const { getStore } = require("@netlify/blobs");
const { store: appStore } = require("./lib/records");
const { REF_RE, KEY_RE, overLimit } = require("./lib/guard");

const WINDOW_MS = 2 * 60 * 60 * 1000;   // uploads accepted for 2h after submission
const MAX_BYTES = 5 * 1024 * 1024;

function detect(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 4 && buf.slice(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf.length > 12 && buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(), body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors(), body: "Method Not Allowed" };

  if (await overLimit("upload", event, 60, 3600)) return json(429, { error: "Too many uploads. Please try again later." });

  const SITE_ID    = process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
  const BLOB_TOKEN = process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
  if (!SITE_ID || !BLOB_TOKEN) return json(500, { error: "Storage not configured" });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }
  const { ref, key, name, data } = payload;
  if (!REF_RE.test(String(ref || "")) || !KEY_RE.test(String(key || "")) || typeof data !== "string" || !data) {
    return json(400, { error: "Missing or invalid ref, key, or data" });
  }

  // The application must exist and be recent.
  let rec = null;
  try {
    for (const kind of ["corporate", "joint", "minor", "diaspora"]) {
      rec = await appStore().get(`${kind}/${ref}`, { type: "json" });
      if (rec) break;
    }
  } catch (err) { console.error("record lookup failed:", err.message); }
  if (!rec || Date.now() - Date.parse(rec.savedAt) > WINDOW_MS) return json(403, { error: "Uploads are not accepted for this reference" });

  const buffer = Buffer.from(data.includes(",") ? data.split(",")[1] : data, "base64");
  if (!buffer.length || buffer.length > MAX_BYTES) return json(413, { error: "File must be under 5 MB" });
  const mimeType = detect(buffer);
  if (!mimeType) return json(415, { error: "Only JPG, PNG, WebP or PDF files are accepted" });

  try {
    const store = getStore({ name: "documents", siteID: SITE_ID, token: BLOB_TOKEN });
    await store.set(`${ref}/${key}`, buffer, {
      metadata: { name: String(name || key).replace(/[^\w.\- ]/g, "_").slice(0, 120), mimeType, ref },
    });
    console.log("Stored document:", `${ref}/${key}`, mimeType, buffer.length);
    return json(200, { success: true, stored: true });
  } catch (err) {
    console.error("Blobs store error:", err.message);
    return json(500, { error: "Failed to store document" });
  }
};

function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json", ...cors() }, body: JSON.stringify(body) };
}
function cors() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Shared-Secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}

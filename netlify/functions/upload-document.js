/**
 * Anchoria — Document Upload Handler
 * Stores one uploaded document (base64) in Netlify Blobs.
 *
 * Hardened: requires a per-application signed token, same-origin requests only, no CORS; the application must already exist (uploads follow a submission),
 * uploads are only accepted for a short window after it was saved, file type is
 * verified from the file's own bytes, size is capped, and requests are rate limited.
 * No Airtable calls — staff read documents through the admin dashboard.
 */
const { getStore } = require("./lib/blobs");
const { store: appStore } = require("./lib/records");
const { REF_RE, KEY_RE, overLimit, verifyUploadToken, sameOrigin } = require("./lib/guard");
const { checkUpload } = require("./lib/files");

const WINDOW_MS = 2 * 60 * 60 * 1000;   // uploads accepted for 2h after submission
const MAX_BYTES = 5 * 1024 * 1024;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };   // no CORS preflight: same-origin only
  if (!sameOrigin(event)) return json(403, { error: "Cross-site requests are not allowed" });

  if (await overLimit("upload", event, 60, 3600)) return json(429, { error: "Too many uploads. Please try again later." });

  const SITE_ID    = process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
  const BLOB_TOKEN = process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
  if (!process.env.STORAGE_DIR && (!SITE_ID || !BLOB_TOKEN)) return json(500, { error: "Storage not configured" });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }
  const { ref, key, name, data } = payload;
  if (!REF_RE.test(String(ref || "")) || !KEY_RE.test(String(key || "")) || typeof data !== "string" || !data) {
    return json(400, { error: "Missing or invalid ref, key, or data" });
  }
  if (!verifyUploadToken(ref, (event.headers || {})["x-upload-token"])) {
    return json(401, { error: "Upload not authorised for this application" });
  }

  // The application must exist and be recent. The upload follows the submission by a second or
  // two, so retry briefly in case the just-written record is not visible yet.
  let rec = null;
  for (let attempt = 0; attempt < 4 && !rec; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
    try {
      for (const kind of ["corporate", "joint", "minor", "diaspora"]) {
        rec = await appStore().get(`${kind}/${ref}`, { type: "json" });
        if (rec) break;
      }
    } catch (err) { console.error("record lookup failed:", err.message); }
  }
  if (!rec) { console.error("upload refused: no application found for", ref); return json(403, { error: "Uploads are not accepted for this reference" }); }
  if (Date.now() - Date.parse(rec.savedAt) > WINDOW_MS) return json(403, { error: "Uploads are not accepted for this reference" });

  const buffer = Buffer.from(data.includes(",") ? data.split(",")[1] : data, "base64");
  if (!buffer.length || buffer.length > MAX_BYTES) return json(413, { error: "File must be under 5 MB" });
  const checked = checkUpload(buffer, name, key);
  if (!checked.ok) return json(checked.status, { error: checked.error });
  const mimeType = checked.mime;

  try {
    const store = getStore({ name: "documents", siteID: SITE_ID, token: BLOB_TOKEN });
    await store.set(`${ref}/${key}`, buffer, {
      metadata: { name: checked.name, mimeType, ref },
    });
    console.log("Stored document:", `${ref}/${key}`, mimeType, buffer.length);
    return json(200, { success: true, stored: true });
  } catch (err) {
    console.error("Blobs store error:", err.message);
    return json(500, { error: "Failed to store document" });
  }
};

function json(status, body) {
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

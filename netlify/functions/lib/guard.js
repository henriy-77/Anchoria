/** Shared input guards + per-IP rate limiting for the public endpoints. */
const { getStore } = require("./blobs");
const crypto = require("crypto");

const SITE_ID    = () => process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
const BLOB_TOKEN = () => process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;

const REF_RE = /^[A-Za-z0-9-]{4,24}$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

const clientIp = (event) =>
  (event.headers || {})["x-nf-client-connection-ip"] ||
  String((event.headers || {})["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

/** Returns true if the caller is over `limit` hits within `windowSec`. Fails open on storage errors. */
async function overLimit(bucket, event, limit, windowSec) {
  try {
    const st  = getStore({ name: "rate-limit", siteID: SITE_ID(), token: BLOB_TOKEN() });
    const key = `${bucket}-${crypto.createHash("sha256").update(clientIp(event)).digest("hex").slice(0, 32)}`;
    const now = Date.now();
    const rec = (await st.get(key, { type: "json" })) || { start: now, n: 0 };
    if (now - rec.start > windowSec * 1000) { rec.start = now; rec.n = 0; }
    rec.n += 1;
    await st.setJSON(key, rec);
    return rec.n > limit;
  } catch (err) {
    console.error("rate limit check failed:", err.message);
    return false;
  }
}

module.exports = { REF_RE, KEY_RE, overLimit, clientIp };

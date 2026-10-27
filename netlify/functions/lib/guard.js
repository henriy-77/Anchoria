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

/* ── Upload token ──────────────────────────────────────────────────────────────
 * A browser can never hold a secret, so uploads are authorised per application instead:
 * submitting an application returns a token bound to that reference that expires after
 * 2 hours. Only the person who just submitted it holds the token. Signed with
 * UPLOAD_SECRET (or SESSION_SECRET) — never shipped in page source.
 */
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const tokenSecret = () => process.env.UPLOAD_SECRET || process.env.SESSION_SECRET || "";
const tokenSig = (ref, exp) => crypto.createHmac("sha256", tokenSecret()).update(`upload|${ref}|${exp}`).digest("base64url");

function signUploadToken(ref) {
  if (tokenSecret().length < 16) return null;
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${tokenSig(ref, exp)}`;
}
function verifyUploadToken(ref, token) {
  if (tokenSecret().length < 16) return false;
  const [exp, sig] = String(token || "").split(".");
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const want = Buffer.from(tokenSig(ref, exp)), got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/* ── Same-origin enforcement ───────────────────────────────────────────────────
 * The forms live on the same origin as these endpoints, so no other website has any
 * business calling them from a browser. Rejects cross-site browser requests; requests
 * with no Origin header (non-browser clients) are left to the token / validation checks.
 */
function sameOrigin(event) {
  const h = event.headers || {};
  if (String(h["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;
  const origin = h.origin;
  if (!origin || origin === "null") return !origin;
  let oh; try { oh = new URL(origin).host; } catch { return false; }
  const extra = String(process.env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const host = String(h["x-forwarded-host"] || h.host || "").split(",")[0].trim();
  return oh === host || extra.some((e) => { try { return new URL(e).host === oh; } catch { return false; } });
}

module.exports = { REF_RE, KEY_RE, overLimit, clientIp, signUploadToken, verifyUploadToken, sameOrigin };

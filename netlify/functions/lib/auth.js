/**
 * Staff auth for the admin dashboard.
 * - Staff accounts live in Blobs store "staff" (key = lowercase email).
 * - Passwords: scrypt. Sessions: HMAC-signed cookie (12h), no server state.
 * - Bootstrap: ADMIN_EMAIL + ADMIN_PASSWORD env vars act as a built-in admin,
 *   so the first login works before any staff account exists.
 * Env: SESSION_SECRET (required), ADMIN_EMAIL, ADMIN_PASSWORD
 */
const crypto = require("crypto");
const { getStore } = require("./blobs");

const COOKIE = "anchoria_admin";
const TTL_MS = 8 * 60 * 60 * 1000;

const SITE_ID    = () => process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
const BLOB_TOKEN = () => process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
const staffStore = () => getStore({ name: "staff", siteID: SITE_ID(), token: BLOB_TOKEN() });
// SHARED_SECRET is embedded in public form HTML, so it must never sign sessions.
const secret     = () => process.env.SESSION_SECRET || "";

const b64 = (b) => Buffer.from(b).toString("base64url");
const hmac = (s) => crypto.createHmac("sha256", secret()).update(s).digest("base64url");
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  return safeEq(crypto.scryptSync(pw, salt, 64).toString("hex"), hash);
}

/** Returns { email, name, role } on success, else null. */
async function verifyLogin(email, password) {
  email = String(email || "").trim().toLowerCase();
  password = String(password || "");
  if (!email || !password) return null;
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD && email === ADMIN_EMAIL.toLowerCase() && safeEq(password, ADMIN_PASSWORD)) {
    return { email, name: "Administrator", role: "admin", builtin: true };
  }
  try {
    const u = await staffStore().get(email, { type: "json" });
    if (u && !u.disabled && checkPassword(password, u.hash)) return { email, name: u.name || email, role: u.role || "staff" };
  } catch (err) { console.error("staff lookup failed:", err.message); }
  return null;
}

function sessionCookie(user) {
  const body = b64(JSON.stringify({ ...user, exp: Date.now() + TTL_MS }));
  return `${COOKIE}=${body}.${hmac(body)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_MS / 1000}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/**
 * Reads the session cookie and re-checks the account is still active, so removing
 * or disabling someone (or changing their role) takes effect immediately.
 * Returns { email, name, role } or null.
 */
async function getUser(event) {
  if (secret().length < 16) return null;
  const m = String((event.headers || {}).cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig || !safeEq(sig, hmac(body))) return null;
  let u;
  try { u = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  if (!(u.exp > Date.now())) return null;
  const { ADMIN_EMAIL } = process.env;
  if (u.builtin) return ADMIN_EMAIL && u.email === ADMIN_EMAIL.toLowerCase() ? { email: u.email, name: u.name, role: "admin" } : null;
  try {
    const rec = await staffStore().get(u.email, { type: "json" });
    if (!rec || rec.disabled) return null;
    return { email: u.email, name: rec.name || u.email, role: rec.role || "staff" };
  } catch { return null; }
}

/* ── Login throttling: 5 failures per email or IP → 15 min lockout ── */
const LOCK_AFTER = 5, LOCK_MS = 15 * 60 * 1000;
const throttleStore = () => getStore({ name: "login-throttle", siteID: SITE_ID(), token: BLOB_TOKEN() });
const tkey = (kind, v) => `${kind}-${crypto.createHash("sha256").update(String(v).toLowerCase()).digest("hex").slice(0, 32)}`;

async function lockedFor(keys) {
  try {
    const st = throttleStore();
    let wait = 0;
    for (const k of keys) {
      const r = await st.get(k, { type: "json" });
      if (r && r.until && r.until > Date.now()) wait = Math.max(wait, r.until - Date.now());
    }
    return wait;
  } catch { return 0; }
}
async function recordFailure(keys) {
  try {
    const st = throttleStore();
    for (const k of keys) {
      const r = (await st.get(k, { type: "json" })) || { n: 0 };
      const fresh = r.first && Date.now() - r.first < LOCK_MS * 4;
      const n = (fresh ? r.n : 0) + 1;
      await st.setJSON(k, { n, first: fresh ? r.first : Date.now(), until: n >= LOCK_AFTER ? Date.now() + LOCK_MS : 0 });
    }
  } catch (err) { console.error("throttle write failed:", err.message); }
}
async function clearFailures(keys) { try { const st = throttleStore(); for (const k of keys) await st.delete(k); } catch {} }

module.exports = { staffStore, hashPassword, checkPassword, verifyLogin, sessionCookie, clearCookie, getUser, lockedFor, recordFailure, clearFailures, tkey };

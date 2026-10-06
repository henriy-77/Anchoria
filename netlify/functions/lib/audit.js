/**
 * Access log. Every sensitive read or change is recorded in Netlify Blobs
 * (store "access-log") under two keys so it can be listed globally or per application:
 *   all/<iso-ts>-<rand>            → newest last (sort keys to order)
 *   by-ref/<ref>/<iso-ts>-<rand>
 * Logging never throws: an audit failure must not break the request.
 */
const { getStore } = require("./blobs");
const crypto = require("crypto");
const { clientIp } = require("./guard");

const SITE_ID    = () => process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
const BLOB_TOKEN = () => process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
const logStore   = () => getStore({ name: "access-log", siteID: SITE_ID(), token: BLOB_TOKEN() });

/** action: e.g. "view_application"; extra: { kind, ref, doc, detail, email } */
async function logAccess(event, user, action, extra = {}) {
  try {
    const at  = new Date().toISOString();
    const rec = {
      at, action,
      by:   (user && user.email) || extra.email || "anonymous",
      name: (user && user.name) || "",
      ip:   clientIp(event),
      ua:   String((event.headers || {})["user-agent"] || "").slice(0, 120),
      kind: extra.kind || "", ref: extra.ref || "", doc: extra.doc || "", detail: extra.detail || "",
    };
    const id = `${at}-${crypto.randomBytes(3).toString("hex")}`;
    const st = logStore();
    await st.setJSON(`all/${id}`, rec);
    if (rec.ref) await st.setJSON(`by-ref/${rec.ref}/${id}`, rec);
  } catch (err) {
    console.error("audit log failed:", err.message);
  }
}

/** Newest-first entries. prefix: "all/" or "by-ref/<ref>/" */
async function readLog(prefix, limit = 300) {
  const st = logStore();
  const { blobs } = await st.list({ prefix });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const out = [];
  for (let i = 0; i < keys.length; i += 25) {
    const batch = await Promise.all(keys.slice(i, i + 25).map((k) => st.get(k, { type: "json" }).catch(() => null)));
    batch.forEach((r) => r && out.push(r));
  }
  return out;
}

module.exports = { logAccess, readLog };

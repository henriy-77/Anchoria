/**
 * Replays applications that are stored in Netlify Blobs but not yet in Airtable
 * (e.g. saved while Airtable was over its API limit).
 *
 *   GET/POST /.netlify/functions/sync-airtable?limit=20   (header X-Shared-Secret required)
 *   GET      /.netlify/functions/sync-airtable?list=1     → lists pending records only
 */
const { store, pushToAirtable } = require("../lib/records");

exports.handler = async (event) => {
  const secret = process.env.SHARED_SECRET;
  const given  = event.headers["x-shared-secret"] || (event.queryStringParameters || {}).secret || "";
  if (!secret || given !== secret) return resp(401, { error: "Unauthorized" });

  const q     = event.queryStringParameters || {};
  const limit = Math.min(parseInt(q.limit, 10) || 20, 50);
  const s     = store();
  const { blobs } = await s.list();

  const pending = [];
  for (const b of blobs) {
    const rec = await s.get(b.key, { type: "json" });
    if (rec && rec.airtable !== "synced") pending.push(rec);
  }
  if (q.list) {
    return resp(200, { pending: pending.map((r) => ({ key: `${r.kind}/${r.ref}`, savedAt: r.savedAt, lastError: r.lastError })) });
  }

  const results = [];
  for (const rec of pending.slice(0, limit)) {
    const r = await pushToAirtable(rec.table, rec.fields);
    if (r.ok) {
      rec.airtable = "synced"; rec.airtableId = r.id; rec.lastError = null;
      await s.setJSON(`${rec.kind}/${rec.ref}`, rec);
      results.push({ ref: rec.ref, synced: true });
    } else {
      rec.lastError = `${r.status}: ${String(r.detail).slice(0, 500)}`;
      await s.setJSON(`${rec.kind}/${rec.ref}`, rec);
      results.push({ ref: rec.ref, synced: false, error: rec.lastError });
      if (r.status === 429) break; // quota still exhausted — stop early
    }
  }
  return resp(200, { pending: pending.length, attempted: results.length, results });
};

const resp = (status, body) => ({ statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

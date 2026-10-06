/**
 * One-off copy of everything in Netlify Blobs → the self-hosted data folder.
 * Safe to re-run: items already copied are skipped (use --force to overwrite).
 *
 * Needs:   NETLIFY_SITE_ID, NETLIFY_TOKEN (a Netlify personal access token), STORAGE_DIR
 * Run via: see deploy/README.md  (it runs inside a throwaway Node container)
 */
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { diskStore } = require(path.join(ROOT, "netlify", "functions", "lib", "blobs.js"));
const { getStore } = require(path.join(ROOT, "netlify", "functions", "node_modules", "@netlify", "blobs"));

const { NETLIFY_SITE_ID, NETLIFY_TOKEN, STORAGE_DIR } = process.env;
const FORCE = process.argv.includes("--force");
if (!NETLIFY_SITE_ID || !NETLIFY_TOKEN || !STORAGE_DIR) {
  console.error("Set NETLIFY_SITE_ID, NETLIFY_TOKEN and STORAGE_DIR first.");
  process.exit(1);
}

// rate-limit and login-throttle are temporary counters, so they are not copied.
const STORES = ["applications", "documents", "staff", "access-log"];

(async () => {
  let failed = 0;
  for (const name of STORES) {
    const from = getStore({ name, siteID: NETLIFY_SITE_ID, token: NETLIFY_TOKEN });
    const to   = diskStore(path.resolve(STORAGE_DIR), name);
    const { blobs } = await from.list();
    let copied = 0, skipped = 0;
    for (const { key } of blobs) {
      try {
        if (!FORCE && (await to.getMetadata(key)) !== null) { skipped++; continue; }
        const item = await from.getWithMetadata(key, { type: "arrayBuffer" });
        if (!item) continue;
        await to.set(key, Buffer.from(item.data), { metadata: item.metadata });
        copied++;
        if (copied % 25 === 0) process.stdout.write(`  ${name}: ${copied}/${blobs.length}\r`);
      } catch (err) {
        failed++;
        console.error(`\n  FAILED ${name}/${key}: ${err.message}`);
      }
    }
    const after = (await to.list()).blobs.length;
    console.log(`${name.padEnd(13)} netlify: ${String(blobs.length).padStart(5)}   copied: ${String(copied).padStart(5)}   already there: ${String(skipped).padStart(5)}   now on server: ${String(after).padStart(5)}`);
    if (after < blobs.length) failed++;
  }
  console.log(failed ? `\nFinished with ${failed} problem(s) — re-run to retry.` : "\nAll data copied.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("Migration failed:", e.message); process.exit(1); });

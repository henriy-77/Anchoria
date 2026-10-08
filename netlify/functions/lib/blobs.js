/**
 * Storage backend selector.
 *  - STORAGE_DIR set  → files on local disk (self-hosted, e.g. Oracle Cloud VM)
 *  - otherwise        → Netlify Blobs
 * Both expose the same getStore() API: get / getWithMetadata / getMetadata / set /
 * setJSON / delete / list({ prefix }).
 */
const fs   = require("fs");
const path = require("path");

function diskStore(root, name) {
  const dir = path.join(root, encodeURIComponent(name));

  // Keys look like "corporate/CASL-ABC123" or "by-ref/<ref>/<ts>"; each segment is encoded
  // and "." / ".." are refused so a key can never escape the store directory.
  const fileFor = (key) => {
    const parts = String(key).split("/").map((s) => {
      if (!s || s === "." || s === "..") throw new Error("Invalid blob key");
      return encodeURIComponent(s);
    });
    return path.join(dir, ...parts);
  };
  const metaFor = (file) => file + ".meta";

  const write = async (file, data) => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, file);           // atomic replace
  };
  const read = async (file) => {
    try { return await fs.promises.readFile(file); }
    catch (e) { if (e.code === "ENOENT" || e.code === "EISDIR" || e.code === "ENOTDIR") return null; throw e; }
  };
  const shape = (buf, type) => {
    if (type === "json") return JSON.parse(buf.toString("utf8"));
    if (type === "arrayBuffer") return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return buf.toString("utf8");
  };
  const readMeta = async (file) => {
    const m = await read(metaFor(file));
    if (!m) return null;
    try { return JSON.parse(m.toString("utf8")); } catch { return null; }
  };

  return {
    async get(key, opts = {}) {
      const buf = await read(fileFor(key));
      return buf ? shape(buf, opts.type) : null;
    },
    async getWithMetadata(key, opts = {}) {
      const file = fileFor(key), buf = await read(file);
      return buf ? { data: shape(buf, opts.type), metadata: (await readMeta(file)) || {} } : null;
    },
    async getMetadata(key) {
      const file = fileFor(key);
      return (await read(file)) ? ((await readMeta(file)) || {}) : null;
    },
    async set(key, value, opts = {}) {
      const file = fileFor(key);
      await write(file, Buffer.isBuffer(value) ? value : Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : String(value)));
      if (opts.metadata) await write(metaFor(file), JSON.stringify(opts.metadata));
      else await fs.promises.rm(metaFor(file), { force: true });
    },
    async setJSON(key, value) { await write(fileFor(key), JSON.stringify(value)); },
    async delete(key) {
      const file = fileFor(key);
      await fs.promises.rm(file, { force: true });
      await fs.promises.rm(metaFor(file), { force: true });
    },
    async list(opts = {}) {
      const blobs = [];
      const walk = async (d, rel) => {
        let entries;
        try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.isDirectory()) await walk(path.join(d, e.name), rel + decodeURIComponent(e.name) + "/");
          else if (!e.name.endsWith(".meta") && !e.name.endsWith(".tmp")) blobs.push({ key: rel + decodeURIComponent(e.name) });
        }
      };
      await walk(dir, "");
      return { blobs: opts.prefix ? blobs.filter((b) => b.key.startsWith(opts.prefix)) : blobs, directories: [] };
    },
  };
}

function getStore(opts) {
  const root = process.env.STORAGE_DIR;
  if (root) return diskStore(path.resolve(root), typeof opts === "string" ? opts : opts.name);
  // Netlify Blobs is eventually consistent by default: a read just after a write (e.g. the upload
  // step looking up the application that was saved a second earlier) can miss it for up to a minute.
  // Always read fresh data.
  const o = typeof opts === "string" ? { name: opts } : opts;
  return require("@netlify/blobs").getStore({ consistency: "strong", ...o });
}

module.exports = { getStore, diskStore };

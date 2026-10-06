/**
 * Anchoria — self-hosted server (Oracle Cloud VM, Docker, or any Node 18+ host).
 *
 * Serves the static pages and runs the same handlers that Netlify runs, at the same
 * /.netlify/functions/<name> URLs, so the forms and the admin need no changes.
 * Zero dependencies. Configuration is by environment variables (see .env.example).
 */
const http = require("http");
const fs   = require("fs");
const path = require("path");

const ROOT      = __dirname;
const FUNCTIONS = path.join(ROOT, "netlify", "functions");
const PORT      = parseInt(process.env.PORT, 10) || 3000;
const MAX_BODY  = 8 * 1024 * 1024;

// Only these file types are ever served from the project root — never source code or config.
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp", ".pdf": "application/pdf",
  ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

// Mirrors netlify.toml redirects.
const REDIRECTS = {
  "/accountopening.html":           ["https://app.anchoriang.com/signup", 301],
  "/individualaccountopening.html": ["https://app.anchoriang.com/signup", 301],
  "/corporate-opening.html":        ["/corporateaccountopening.html", 301],
  "/admin":                         ["/admin.html", 301],
};

// Mirrors netlify.toml headers.
function securityHeaders(pathname) {
  const h = {
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
  if (pathname === "/admin.html") {
    Object.assign(h, {
      "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
  }
  if (pathname.startsWith("/.netlify/functions/")) h["Cache-Control"] = "no-store";
  return h;
}

// Load every handler once at startup.
const handlers = {};
for (const f of fs.readdirSync(FUNCTIONS)) {
  if (f.endsWith(".js")) handlers[f.slice(0, -3)] = require(path.join(FUNCTIONS, f)).handler;
}

// Rate limits and login lockout key off the visitor's IP. Never trust a client-supplied value:
// drop the Netlify header and derive the address from the connection, or from the last
// X-Forwarded-For entry (appended by our own reverse proxy) when TRUST_PROXY is on.
function trustedHeaders(req) {
  const h = { ...req.headers };
  delete h["x-nf-client-connection-ip"];
  let ip = req.socket.remoteAddress || "unknown";
  if (process.env.TRUST_PROXY === "1" && h["x-forwarded-for"]) {
    const parts = String(h["x-forwarded-for"]).split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length) ip = parts[parts.length - 1];
  }
  h["x-nf-client-connection-ip"] = ip.replace(/^::ffff:/, "");
  return h;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        // Stop buffering, discard the rest, answer 413, then close the connection.
        req.removeAllListeners("data"); req.resume();
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function runFunction(name, req, res, url) {
  const handler = handlers[name];
  if (!handler) return send(res, 404, { "Content-Type": "text/plain" }, "Not found");
  let body = "";
  if (req.method !== "GET" && req.method !== "HEAD") {
    try { body = (await readBody(req)).toString("utf8"); }
    catch (e) {
      res.on("finish", () => req.destroy());
      return send(res, e.status || 400, { "Content-Type": "application/json", Connection: "close" }, JSON.stringify({ error: e.message }));
    }
  }
  const event = {
    httpMethod: req.method,
    path: url.pathname,
    rawQuery: url.search.slice(1),
    queryStringParameters: Object.fromEntries(url.searchParams),
    headers: trustedHeaders(req),         // Node already lower-cases header names
    body,
    isBase64Encoded: false,
  };
  let out;
  try { out = await handler(event, {}); }
  catch (err) { console.error(`Function ${name} crashed:`, err); return send(res, 500, { "Content-Type": "application/json" }, JSON.stringify({ error: "Internal server error" })); }
  const headers = { ...securityHeaders(url.pathname), ...(out.headers || {}) };
  const payload = out.isBase64Encoded ? Buffer.from(out.body || "", "base64") : (out.body || "");
  send(res, out.statusCode || 200, headers, payload, req.method === "HEAD");
}

function send(res, status, headers, body, headOnly) {
  res.writeHead(status, headers);
  res.end(headOnly ? undefined : body);
}

async function serveStatic(req, res, pathname) {
  if (pathname === "/") pathname = "/index.html";
  let name;
  try { name = decodeURIComponent(pathname); } catch { return send(res, 400, {}, "Bad request"); }
  const ext = path.extname(name).toLowerCase();
  // Root-level files only: no sub-directories, no hidden files, no unlisted types.
  if (name.indexOf("/", 1) !== -1 || name.includes("..") || path.basename(name).startsWith(".") || !STATIC_TYPES[ext]) {
    return send(res, 404, { "Content-Type": "text/plain" }, "Not found");
  }
  try {
    const data = await fs.promises.readFile(path.join(ROOT, name));
    const headers = { ...securityHeaders(pathname), "Content-Type": STATIC_TYPES[ext], "Cache-Control": securityHeaders(pathname)["Cache-Control"] || (ext === ".html" ? "no-cache" : "public, max-age=3600") };
    send(res, 200, headers, data, req.method === "HEAD");
  } catch {
    send(res, 404, { "Content-Type": "text/plain" }, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/healthz") return send(res, 200, { "Content-Type": "text/plain" }, "ok");

    const r = REDIRECTS[url.pathname];
    if (r) return send(res, r[1], { Location: r[0], ...securityHeaders(url.pathname) }, "");

    const m = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)\/?$/);
    if (m) return await runFunction(m[1], req, res, url);

    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { Allow: "GET, HEAD" }, "Method Not Allowed");
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error("Request failed:", err);
    if (!res.headersSent) send(res, 500, { "Content-Type": "text/plain" }, "Internal server error");
  }
});

if (require.main === module) {
  if (!process.env.STORAGE_DIR) console.warn("WARNING: STORAGE_DIR is not set — falling back to Netlify Blobs, which will not work off Netlify.");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) console.warn("WARNING: SESSION_SECRET is missing or too short — staff sign-in will not work.");
  server.listen(PORT, () => console.log(`Anchoria listening on :${PORT} (${Object.keys(handlers).length} functions loaded)`));
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
}

module.exports = server;

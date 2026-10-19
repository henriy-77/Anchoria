/**
 * Anchoria Securities — Document Download Handler
 * Retrieves uploaded documents from Netlify Blobs
 * Usage: /.netlify/functions/get-document?ref=ASL-XXXXX&doc=passportPhoto           (opens in the browser)
 *        …&download=1                                                              (forces a download)
 *        /.netlify/functions/get-document?ref=ASL-XXXXX&all=1                       (every document, as a .zip)
 */

const { getStore } = require("./lib/blobs");
const { getUser } = require("./lib/auth");
const { REF_RE, KEY_RE } = require("./lib/guard");
const { logAccess } = require("./lib/audit");
const { zip } = require("./lib/zip");

const INLINE = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const MAX_ZIP = 5 * 1024 * 1024;   // Netlify caps a function response at ~6 MB; the self-hosted server has no cap

// Header-safe filename (ASCII fallback + RFC 5987 UTF-8 form) so odd characters can never break the response.
const disposition = (type, name) => {
  const n = String(name || "file");
  return `${type}; filename="${n.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(n)}`;
};

exports.handler = async (event) => {
  const user = await getUser(event);
  if (!user) return { statusCode: 302, headers: { Location: "/admin.html?next=" + encodeURIComponent(event.path + (event.rawQuery ? "?" + event.rawQuery : "")) }, body: "" };
  const q = event.queryStringParameters || {};
  const { ref, doc } = q;

  if (!REF_RE.test(String(ref || "")) || (!q.all && !KEY_RE.test(String(doc || "")))) {
    return { statusCode: 400, body: "Invalid ref or doc parameter" };
  }

  try {
    const SITE_ID    = process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
    const BLOB_TOKEN = process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
    const store = getStore({ name: "documents", siteID: SITE_ID, token: BLOB_TOKEN });

    // Every document for one application, bundled as a .zip
    if (q.all) {
      const { blobs } = await store.list({ prefix: `${ref}/` });
      const files = [];
      let total = 0;
      for (const b of blobs) {
        const r = await store.getWithMetadata(b.key, { type: "arrayBuffer" });
        if (!r) continue;
        const key = b.key.slice(ref.length + 1);
        const orig = String((r.metadata && r.metadata.name) || key);
        const data = Buffer.from(r.data);
        total += data.length;
        files.push({ name: orig.toLowerCase().startsWith(key.toLowerCase()) ? orig : `${key}-${orig}`, data });
      }
      if (!files.length) return { statusCode: 404, body: "No documents were uploaded for this application" };
      if (!process.env.STORAGE_DIR && total > MAX_ZIP) return { statusCode: 413, body: "These documents are too large to bundle — open them one at a time instead." };
      await logAccess(event, user, "download_documents", { ref, detail: `${files.length} file(s)` });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/zip", "Content-Disposition": disposition("attachment", `${ref}-documents.zip`), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
        body: zip(files).toString("base64"),
        isBase64Encoded: true,
      };
    }

    const key = `${ref}/${doc}`;
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });

    if (!result) {
      return { statusCode: 404, body: "Document not found" };
    }

    // Images/iframes inside the printable page are covered by its own log entry (the admin viewer passes log=1).
    const dest = String(event.headers["sec-fetch-dest"] || "");
    if ((dest !== "image" && dest !== "iframe") || q.log === "1") await logAccess(event, user, "view_document", { ref, doc });

    const { data, metadata } = result;
    const mimeType = (metadata && metadata.mimeType) || "application/octet-stream";
    const fileName = (metadata && metadata.name) || doc;
    // Images and PDFs open in the browser so staff can read them; anything else (or ?download=1) is saved.
    const type = INLINE.test(mimeType) && q.download !== "1" ? "inline" : "attachment";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": disposition(type, fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
      body: Buffer.from(data).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("Get document error:", err);
    return { statusCode: 500, body: "Failed to retrieve document" };
  }
};

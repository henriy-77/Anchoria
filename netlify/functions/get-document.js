/**
 * Anchoria Securities — Document Download Handler
 * Retrieves uploaded documents from Netlify Blobs
 * Usage: /.netlify/functions/get-document?ref=ASL-XXXXX&doc=passportPhoto
 */

const { getStore } = require("@netlify/blobs");
const { getUser } = require("./lib/auth");
const { REF_RE, KEY_RE } = require("./lib/guard");
const { logAccess } = require("./lib/audit");

exports.handler = async (event) => {
  const user = await getUser(event);
  if (!user) return { statusCode: 302, headers: { Location: "/admin.html" }, body: "" };
  const { ref, doc } = event.queryStringParameters || {};

  if (!REF_RE.test(String(ref || "")) || !KEY_RE.test(String(doc || ""))) {
    return { statusCode: 400, body: "Invalid ref or doc parameter" };
  }

  try {
    const SITE_ID    = process.env.NETLIFY_SITE_ID || "eba96b4a-432f-4acb-932b-4fe80c961281";
    const BLOB_TOKEN = process.env.NETLIFY_TOKEN   || process.env.NETLIFY_BLOBS_TOKEN;
    const store = getStore({ name: "documents", siteID: SITE_ID, token: BLOB_TOKEN });
    const key = `${ref}/${doc}`;
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });

    if (!result) {
      return { statusCode: 404, body: "Document not found" };
    }

    // Images/iframes inside the printable page are covered by its own log entry.
    const dest = String(event.headers["sec-fetch-dest"] || "");
    if (dest !== "image" && dest !== "iframe") await logAccess(event, user, "view_document", { ref, doc });

    const { data, metadata } = result;
    const mimeType = metadata.mimeType || "application/octet-stream";
    const fileName = metadata.name || doc;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, max-age=3600",
      },
      body: Buffer.from(data).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("Get document error:", err);
    return { statusCode: 500, body: "Failed to retrieve document" };
  }
};

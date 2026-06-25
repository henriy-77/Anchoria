/**
 * Anchoria Securities — Document Download Handler
 * Retrieves uploaded documents from Netlify Blobs
 * Usage: /.netlify/functions/get-document?ref=ASL-XXXXX&doc=passportPhoto
 */

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const { ref, doc } = event.queryStringParameters || {};

  if (!ref || !doc) {
    return { statusCode: 400, body: "Missing ref or doc parameter" };
  }

  const SHARED_SECRET = process.env.SHARED_SECRET;
  const token = event.queryStringParameters.token || event.headers["x-shared-secret"] || "";
  if (SHARED_SECRET && token !== SHARED_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  try {
    const store = getStore("documents");
    const key = `${ref}/${doc}`;
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });

    if (!result) {
      return { statusCode: 404, body: "Document not found" };
    }

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

/**
 * Validation for uploaded KYC documents. Never trust the file name, the extension or the
 * browser-supplied type: decide what a file is from its own bytes, then store it under a
 * name and type that we choose.
 */
const TYPES = {
  "image/jpeg":      { ext: "jpg" },
  "image/png":       { ext: "png" },
  "image/webp":      { ext: "webp" },
  "application/pdf": { ext: "pdf" },
};
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

function detect(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 33 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      && buf.subarray(12, 16).toString("latin1") === "IHDR") return "image/png";
  if (buf.length > 8 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

// Markup / script payloads hidden inside an "image" (polyglot files), and active content in PDFs.
const IMAGE_BAD = /<\s*script|<\?php|<%|<\s*html|<\s*svg|<\s*iframe|<\s*object|<\s*embed|javascript\s*:|onerror\s*=|onload\s*=/i;
const PDF_BAD   = /\/(JavaScript|JS|Launch|OpenAction|AA|EmbeddedFile|RichMedia|XFA|SubmitForm|ImportData)(?![A-Za-z])/;

/**
 * Returns { ok:true, mime, name } with a safe stored name, or { ok:false, status, error }.
 * `declaredName` is whatever the client called the file.
 */
function checkUpload(buffer, declaredName, fallbackName) {
  const original = String(declaredName || "").split(/[\\/]/).pop();           // drop any path
  const dot = original.lastIndexOf(".");
  const declaredExt = dot > 0 ? original.slice(dot + 1).toLowerCase() : "";
  if (declaredExt && !ALLOWED_EXT.has(declaredExt)) {
    return { ok: false, status: 415, error: "Only JPG, PNG, WebP or PDF files are accepted" };
  }
  const mime = detect(buffer);
  if (!mime) return { ok: false, status: 415, error: "Only JPG, PNG, WebP or PDF files are accepted" };

  const text = buffer.toString("latin1");
  if (mime === "application/pdf" ? PDF_BAD.test(text) : IMAGE_BAD.test(text)) {
    return { ok: false, status: 415, error: "This file contains content that is not allowed" };
  }
  // Store under a name we control: sanitised base, no dots (kills "shell.php.png"), real extension from content.
  const base = (dot > 0 ? original.slice(0, dot) : original).replace(/[^\w \-]/g, "_").replace(/_{2,}/g, "_").trim().slice(0, 80) || fallbackName || "document";
  return { ok: true, mime, name: `${base}.${TYPES[mime].ext}` };
}

module.exports = { checkUpload, detect };

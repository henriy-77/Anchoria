/**
 * Retired: the individual account form now lives at https://app.anchoriang.com/signup.
 * Kept as a stub so the old endpoint no longer accepts anonymous writes.
 */
exports.handler = async () => ({
  statusCode: 410,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ error: "This form has moved to https://app.anchoriang.com/signup" }),
});

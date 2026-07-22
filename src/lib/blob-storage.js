import "server-only";

export function getBlobStorageReadiness() {
  const mode = process.env.BLOB_STORE_ID
    ? "oidc"
    : process.env.BLOB_READ_WRITE_TOKEN
      ? "token"
      : "unconfigured";
  return {
    configured: mode !== "unconfigured",
    mode,
  };
}

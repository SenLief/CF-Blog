export async function serveMedia(
  bucket: R2Bucket,
  encodedKey: string
): Promise<Response> {
  let key: string;
  try {
    key = decodeURIComponent(encodedKey);
  } catch {
    return new Response("Invalid media key", { status: 400 });
  }

  if (!key || key.includes("\0")) {
    return new Response("Invalid media key", { status: 400 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response("Media not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

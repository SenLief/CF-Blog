import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const headers = new Headers(response.headers);
  const isPreview = context.url.pathname.startsWith("/__preview/");

  if (isPreview) {
    headers.set("Cache-Control", "private, no-store");
    headers.set("Referrer-Policy", "origin");
    headers.set("X-Robots-Tag", "noindex, nofollow");
  } else if (
    context.request.method === "GET" &&
    response.status < 400 &&
    !headers.has("Cache-Control")
  ) {
    headers.set(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=86400, stale-if-error=86400"
    );
  }
  headers.set("X-Content-Type-Options", "nosniff");
  if (!isPreview) {
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
});

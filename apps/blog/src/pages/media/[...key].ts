import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ params }) => {
  if (!params.key) {
    return new Response("Media not found", { status: 404 });
  }

  const encodedKey = params.key
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const upstream = await env.CMS.fetch(
    new Request(`https://cms.internal/media/${encodedKey}`)
  );

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers
  });
};

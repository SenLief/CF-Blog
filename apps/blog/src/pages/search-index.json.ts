import type { APIRoute } from "astro";
import { cms } from "@/lib/cms";

export const GET: APIRoute = async () => {
  const entries = await cms.searchIndex();
  return Response.json(entries, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=86400"
    }
  });
};

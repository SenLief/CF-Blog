import type { APIRoute } from "astro";
import { cms } from "@/lib/cms";
import { escapeXml } from "@/lib/format";

export const GET: APIRoute = async ({ request }) => {
  const [site, posts] = await Promise.all([
    cms.site(),
    cms.archive()
  ]);
  const origin = new URL(request.url).origin;
  const items = posts
    .slice(0, 50)
    .map(
      (post) => `
      <item>
        <title>${escapeXml(post.title)}</title>
        <link>${origin}/posts/${encodeURIComponent(post.slug)}</link>
        <guid>${origin}/posts/${encodeURIComponent(post.slug)}</guid>
        <description>${escapeXml(post.excerpt)}</description>
        <pubDate>${new Date(post.publishedAt ?? post.updatedAt).toUTCString()}</pubDate>
      </item>`
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>${escapeXml(site.title)}</title>
        <link>${origin}</link>
        <description>${escapeXml(site.description)}</description>
        <language>${escapeXml(site.locale)}</language>
        ${items}
      </channel>
    </rss>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" }
  });
};

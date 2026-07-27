import type { APIRoute } from "astro";
import { ABOUT_PAGE_SLUG } from "@cf-blog/contracts";
import { cms } from "@/lib/cms";
import { escapeXml } from "@/lib/format";

export const GET: APIRoute = async ({ request }) => {
  const [site, posts, groups, about] = await Promise.all([
    cms.site(),
    cms.archive(),
    cms.groups(),
    cms.post(ABOUT_PAGE_SLUG)
  ]);
  const origin = new URL(request.url).origin;
  const paths = [
    "/",
    ...(site.enableMemos ? ["/memo"] : []),
    "/archives",
    "/tags",
    "/series",
    "/search"
  ];
  const urls = [
    ...paths.map((path) => ({ loc: `${origin}${path}`, modified: null })),
    ...(about.post
      ? [{ loc: `${origin}/about`, modified: about.post.updatedAt }]
      : []),
    ...groups.map((group) => ({
      loc: `${origin}/series/${encodeURIComponent(group.slug)}`,
      modified: group.updatedAt
    })),
    ...posts.map((post) => ({
      loc: `${origin}/posts/${encodeURIComponent(post.slug)}`,
      modified: post.updatedAt
    }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${urls
        .map(
          ({ loc, modified }) =>
            `<url><loc>${escapeXml(loc)}</loc>${modified ? `<lastmod>${escapeXml(modified)}</lastmod>` : ""}</url>`
        )
        .join("")}
    </urlset>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" }
  });
};

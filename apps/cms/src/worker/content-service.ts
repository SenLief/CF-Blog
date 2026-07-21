import { WorkerEntrypoint } from "cloudflare:workers";
import {
  getGroupDetailBySlug,
  getGroupRedirect,
  getPostById,
  getPublicPostBySlug,
  getSiteSettings,
  listGroups,
  listPosts
} from "./db";
import { sha256Hex } from "./http";
import { serveMedia } from "./media";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function integerParam(
  url: URL,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum
    ? Math.min(value, maximum)
    : fallback;
}

export class ContentService extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/site") {
      return json(
        await getSiteSettings(this.env.DB, this.env.MEDIA_BASE_URL)
      );
    }

    if (url.pathname === "/posts") {
      const limit = integerParam(url, "limit", 20, 1, 100);
      const offset = integerParam(url, "offset", 0, 0);
      return json(
        await listPosts(this.env.DB, {
          status: "published",
          excludeStandalonePages: true,
          limit,
          offset
        })
      );
    }

    if (url.pathname === "/archive") {
      return json(
        await listPosts(this.env.DB, {
          status: "published",
          excludeStandalonePages: true,
          limit: 500,
          offset: 0
        })
      );
    }

    if (url.pathname === "/groups") {
      return json(await listGroups(this.env.DB, { publicOnly: true }));
    }

    const groupMatch = url.pathname.match(/^\/groups\/([^/]+)$/);
    if (groupMatch?.[1]) {
      const slug = decodeURIComponent(groupMatch[1]);
      const limit = integerParam(url, "limit", 20, 1, 100);
      const offset = integerParam(url, "offset", 0, 0);
      const group = await getGroupDetailBySlug(
        this.env.DB,
        slug,
        limit,
        offset
      );
      if (group) return json(group);
      const redirectTo = await getGroupRedirect(this.env.DB, slug);
      return redirectTo
        ? json({ redirectTo }, 308)
        : json({ error: "Not found" }, 404);
    }

    if (url.pathname === "/search-index") {
      const posts = await listPosts(this.env.DB, {
        status: "published",
        excludeStandalonePages: true,
        limit: 500,
        offset: 0
      });
      return json(
        posts
          .filter((post) => post.publishedAt)
          .map((post) => ({
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            tags: post.tags,
            publishedAt: post.publishedAt
          }))
      );
    }

    if (url.pathname.startsWith("/media/")) {
      return serveMedia(this.env.MEDIA, url.pathname.slice("/media/".length));
    }

    const postMatch = url.pathname.match(/^\/posts\/([^/]+)$/);
    if (postMatch?.[1]) {
      const post = await getPublicPostBySlug(
        this.env.DB,
        decodeURIComponent(postMatch[1])
      );
      if (post) {
        return json(post);
      }
      const redirect = await this.env.DB
        .prepare(
          `SELECT p.slug
           FROM post_redirects r
           JOIN posts p ON p.id = r.post_id
           WHERE r.from_slug = ? AND p.status = 'published'`
        )
        .bind(decodeURIComponent(postMatch[1]))
        .first<{ slug: string }>();
      return redirect
        ? json({ redirectTo: redirect.slug }, 308)
        : json({ error: "Not found" }, 404);
    }

    const previewMatch = url.pathname.match(/^\/preview\/([^/]+)$/);
    if (previewMatch?.[1]) {
      const tokenHash = await sha256Hex(previewMatch[1]);
      const token = await this.env.DB
        .prepare(
          `SELECT post_id FROM preview_tokens
           WHERE token_hash = ? AND expires_at > ?`
        )
        .bind(tokenHash, new Date().toISOString())
        .first<{ post_id: string }>();
      if (!token) {
        return json({ error: "Preview expired" }, 404);
      }
      const post = await getPostById(this.env.DB, token.post_id);
      return post ? json(post) : json({ error: "Not found" }, 404);
    }

    return json({ error: "Not found" }, 404);
  }
}

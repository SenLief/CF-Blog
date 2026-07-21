import {
  externalVideoInputSchema,
  groupInputSchema,
  normalizeVideoSource,
  postBulkActionSchema,
  postInputSchema,
  postStatusSchema,
  siteSettingsSchema
} from "@cf-blog/contracts";
import { renderMarkdown } from "@cf-blog/markdown";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { requireAccess, requireSameOrigin } from "./auth";
import {
  applyPostBulkAction,
  createRevision,
  createGroup,
  deleteGroup,
  getGroupDetailById,
  getPostById,
  getSiteSettings,
  listGroups,
  listMedia,
  listPosts,
  listRevisions,
  mediaUrl,
  reorderGroups,
  replaceGroupPosts,
  restoreRevision,
  updateGroup
} from "./db";
import { ContentService } from "./content-service";
import {
  AppError,
  jsonError,
  nowIso,
  randomToken,
  sha256Hex
} from "./http";
import { handleMcpRequest } from "./mcp";
import { serveMedia } from "./media";
import {
  changePostStatus,
  createDraft,
  updatePost
} from "./post-service";

export { ContentService };

type AppContext = {
  Bindings: Env;
  Variables: {
    requestId: string;
    userEmail: string;
  };
};

const app = new Hono<AppContext>();
const allowedMediaTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"]
]);

app.use("*", async (c, next) => {
  const requestId = c.req.header("Cf-Ray") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  const startedAt = Date.now();
  await next();
  c.header("X-Request-Id", requestId);
  console.log(
    JSON.stringify({
      message: "request",
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - startedAt
    })
  );
});

app.get("/health", (c) =>
  c.json({ ok: true, service: "cf-blog-cms", time: nowIso() })
);

app.get("/media/*", async (c) => {
  return serveMedia(c.env.MEDIA, c.req.path.slice("/media/".length));
});

app.use("/mcp", requireAccess);
app.all("/mcp", async (c) =>
  handleMcpRequest(
    c.req.raw,
    c.env,
    // Hono types only the legacy subset; Workers supplies the full context here.
    c.executionCtx as ExecutionContext,
    c.get("userEmail")
  )
);

app.use("/api/*", requireAccess);
app.use("/api/*", requireSameOrigin);

app.get("/api/overview", async (c) => {
  const counts = await c.env.DB.prepare(
    `SELECT
      COUNT(*) AS total,
      SUM(status = 'draft') AS drafts,
      SUM(status = 'published') AS published,
      SUM(status = 'archived') AS archived
     FROM posts`
  ).first<{
    total: number;
    drafts: number;
    published: number;
    archived: number;
  }>();
  const recent = await listPosts(c.env.DB, { limit: 6 });
  return c.json({
    counts: counts ?? { total: 0, drafts: 0, published: 0, archived: 0 },
    recent
  });
});

app.get("/api/settings", async (c) =>
  c.json(await getSiteSettings(c.env.DB, c.env.MEDIA_BASE_URL))
);

app.put(
  "/api/settings",
  zValidator("json", siteSettingsSchema),
  async (c) => {
    const input = c.req.valid("json");
    if (input.faviconMediaId) {
      const favicon = await c.env.DB.prepare(
        "SELECT id FROM media WHERE id = ?"
      )
        .bind(input.faviconMediaId)
        .first<{ id: string }>();
      if (!favicon) {
        throw new AppError(
          422,
          "FAVICON_MEDIA_NOT_FOUND",
          "选择的网站图标不存在"
        );
      }
    }
    const updatedAt = nowIso();
    await c.env.DB.prepare(
      `UPDATE site_settings SET
        title = ?, description = ?, author_name = ?, author_bio = ?,
        locale = ?, timezone = ?, accent = ?, default_theme = ?,
        show_toc = ?, show_reading_time = ?, nav_json = ?, social_json = ?,
        favicon_media_id = ?, seo_image_url = ?, updated_at = ?
       WHERE id = 1`
    )
      .bind(
        input.title,
        input.description,
        input.authorName,
        input.authorBio,
        input.locale,
        input.timezone,
        input.accent,
        input.defaultTheme,
        input.showToc ? 1 : 0,
        input.showReadingTime ? 1 : 0,
        JSON.stringify(input.nav),
        JSON.stringify(input.social),
        input.faviconMediaId,
        input.seoImageUrl,
        updatedAt
      )
      .run();
    return c.json(
      await getSiteSettings(c.env.DB, c.env.MEDIA_BASE_URL)
    );
  }
);

app.get("/api/groups", async (c) => c.json(await listGroups(c.env.DB)));

app.post(
  "/api/groups",
  zValidator("json", groupInputSchema),
  async (c) => c.json(await createGroup(c.env.DB, c.req.valid("json")), 201)
);

app.put(
  "/api/groups/order",
  zValidator(
    "json",
    z.object({ groupIds: z.array(z.string().uuid()).max(500) })
  ),
  async (c) =>
    c.json(await reorderGroups(c.env.DB, c.req.valid("json").groupIds))
);

app.get("/api/groups/:id", async (c) => {
  const group = await getGroupDetailById(c.env.DB, c.req.param("id"));
  if (!group) {
    throw new AppError(404, "GROUP_NOT_FOUND", "找不到分组");
  }
  return c.json(group);
});

app.put(
  "/api/groups/:id",
  zValidator("json", groupInputSchema),
  async (c) =>
    c.json(
      await updateGroup(
        c.env.DB,
        c.req.param("id"),
        c.req.valid("json")
      )
    )
);

app.put(
  "/api/groups/:id/posts",
  zValidator(
    "json",
    z.object({ postIds: z.array(z.string()).max(500) })
  ),
  async (c) =>
    c.json(
      await replaceGroupPosts(
        c.env.DB,
        c.req.param("id"),
        c.req.valid("json").postIds
      )
    )
);

app.delete("/api/groups/:id", async (c) => {
  await deleteGroup(c.env.DB, c.req.param("id"));
  return c.body(null, 204);
});

app.get("/api/posts", async (c) => {
  const statusValue = c.req.query("status");
  const statusResult = statusValue
    ? postStatusSchema.safeParse(statusValue)
    : null;
  if (statusValue && !statusResult?.success) {
    throw new AppError(422, "INVALID_STATUS", "文章状态无效");
  }
  return c.json(
    await listPosts(c.env.DB, {
      status: statusResult?.success ? statusResult.data : undefined,
      query: c.req.query("q")?.trim() || undefined
    })
  );
});

app.post("/api/posts", async (c) => {
  const body = await c.req.json<unknown>().catch(() => ({}));
  const title =
    typeof body === "object" &&
    body !== null &&
    "title" in body &&
    typeof body.title === "string" &&
    body.title.trim()
      ? body.title
      : undefined;
  return c.json(await createDraft(c.env.DB, { title }), 201);
});

app.post(
  "/api/posts/bulk-action",
  zValidator("json", postBulkActionSchema),
  async (c) =>
    c.json(
      await applyPostBulkAction(c.env.DB, c.req.valid("json"))
    )
);

app.get("/api/posts/:id", async (c) => {
  const post = await getPostById(c.env.DB, c.req.param("id"));
  if (!post) {
    throw new AppError(404, "POST_NOT_FOUND", "找不到文章");
  }
  return c.json(post);
});

app.put(
  "/api/posts/:id",
  zValidator("json", postInputSchema),
  async (c) =>
    c.json(
      await updatePost(
        c.env.DB,
        c.req.param("id"),
        c.req.valid("json")
      )
    )
);

app.delete("/api/posts/:id", async (c) => {
  await applyPostBulkAction(c.env.DB, {
    action: "delete",
    postIds: [c.req.param("id")]
  });
  return c.body(null, 204);
});

app.post(
  "/api/posts/:id/action",
  zValidator(
    "json",
    z.object({
      action: z.enum(["publish", "unpublish", "archive", "save-version"]),
      expectedVersion: z.number().int().nonnegative()
    })
  ),
  async (c) => {
    const { action, expectedVersion } = c.req.valid("json");
    const id = c.req.param("id");
    const post = await getPostById(c.env.DB, id);
    if (!post) {
      throw new AppError(404, "POST_NOT_FOUND", "找不到文章");
    }
    if (action === "save-version") {
      if (post.version !== expectedVersion) {
        throw new AppError(409, "VERSION_CONFLICT", "文章已在其他页面中更新", {
          serverVersion: post.version
        });
      }
      await createRevision(c.env.DB, post, "manual");
      return c.json(await getPostById(c.env.DB, id));
    }
    return c.json(
      await changePostStatus(
        c.env.DB,
        id,
        expectedVersion,
        action
      )
    );
  }
);

app.get("/api/posts/:id/revisions", async (c) =>
  c.json(await listRevisions(c.env.DB, c.req.param("id")))
);

app.post("/api/posts/:id/revisions/:revisionId/restore", async (c) =>
  c.json(
    await restoreRevision(
      c.env.DB,
      c.req.param("id"),
      c.req.param("revisionId")
    )
  )
);

app.post("/api/posts/:id/preview-token", async (c) => {
  const post = await getPostById(c.env.DB, c.req.param("id"));
  if (!post) {
    throw new AppError(404, "POST_NOT_FOUND", "找不到文章");
  }
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO preview_tokens (token_hash, post_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .bind(tokenHash, post.id, expiresAt, nowIso()),
    c.env.DB
      .prepare("DELETE FROM preview_tokens WHERE expires_at <= ?")
      .bind(nowIso())
  ]);
  return c.json({
    url: `${c.env.BLOG_URL.replace(/\/+$/, "")}/__preview/${token}`,
    expiresAt
  });
});

app.post(
  "/api/render",
  zValidator("json", z.object({ markdown: z.string().max(500_000) })),
  async (c) => c.json(await renderMarkdown(c.req.valid("json").markdown))
);

app.get("/api/media", async (c) =>
  c.json(await listMedia(c.env.DB, c.env.MEDIA_BASE_URL))
);

app.post(
  "/api/media/videos",
  zValidator("json", externalVideoInputSchema),
  async (c) => {
    const input = c.req.valid("json");
    const normalized = normalizeVideoSource(input.sourceUrl);
    if (!normalized) {
      throw new AppError(
        422,
        "UNSUPPORTED_VIDEO_URL",
        "仅支持 YouTube、Bilibili、Vimeo 完整链接或 HTTPS MP4/WebM 直链"
      );
    }
    const duplicate = await c.env.DB.prepare(
      "SELECT id FROM external_videos WHERE source_url = ?"
    )
      .bind(normalized.sourceUrl)
      .first<{ id: string }>();
    if (duplicate) {
      throw new AppError(409, "VIDEO_ALREADY_EXISTS", "这个在线视频已在素材库中");
    }

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    try {
      await c.env.DB.prepare(
        `INSERT INTO external_videos (
          id, title, source_url, provider, provider_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
          input.title,
          normalized.sourceUrl,
          normalized.provider,
          normalized.providerKey,
          createdAt
        )
        .run();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new AppError(409, "VIDEO_ALREADY_EXISTS", "这个在线视频已在素材库中");
      }
      throw error;
    }

    return c.json(
      {
        kind: "video" as const,
        id,
        title: input.title,
        sourceUrl: normalized.sourceUrl,
        provider: normalized.provider,
        preview: normalized.preview,
        createdAt
      },
      201
    );
  }
);

app.post("/api/media", async (c) => {
  const mimeType = c.req.header("Content-Type")?.split(";")[0]?.trim() ?? "";
  const extension = allowedMediaTypes.get(mimeType);
  if (!extension) {
    throw new AppError(422, "UNSUPPORTED_MEDIA", "仅支持 JPEG、PNG、WebP 和 AVIF");
  }
  const bytes = Number(
    c.req.header("Content-Length") ?? c.req.header("X-File-Size") ?? 0
  );
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw new AppError(422, "MEDIA_LENGTH_REQUIRED", "缺少有效的文件大小");
  }
  if (bytes > 10 * 1024 * 1024) {
    throw new AppError(413, "MEDIA_TOO_LARGE", "图片不能超过 10 MB");
  }
  if (!c.req.raw.body) {
    throw new AppError(422, "EMPTY_MEDIA", "上传内容为空");
  }

  const id = crypto.randomUUID();
  const key = `${new Date().toISOString().slice(0, 7)}/${id}.${extension}`;
  const filename = decodeURIComponent(c.req.header("X-Filename") ?? `image.${extension}`);
  const alt = decodeURIComponent(c.req.header("X-Alt") ?? "");
  const width = Number(c.req.header("X-Width") ?? 0) || null;
  const height = Number(c.req.header("X-Height") ?? 0) || null;

  await c.env.MEDIA.put(key, c.req.raw.body, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: { originalFilename: filename }
  });
  try {
    await c.env.DB.prepare(
      `INSERT INTO media (
        id, object_key, filename, mime_type, bytes, width, height, alt, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, key, filename, mimeType, bytes, width, height, alt, nowIso())
      .run();
  } catch (error) {
    await c.env.MEDIA.delete(key);
    throw error;
  }

  return c.json(
    {
      kind: "image" as const,
      id,
      key,
      url: mediaUrl(c.env.MEDIA_BASE_URL, key),
      filename,
      mimeType,
      bytes,
      width,
      height,
      alt,
      createdAt: nowIso()
    },
    201
  );
});

app.delete("/api/media/:id", async (c) => {
  const mediaId = c.req.param("id");
  const item = await c.env.DB.prepare(
    "SELECT object_key FROM media WHERE id = ?"
  )
    .bind(mediaId)
    .first<{ object_key: string }>();
  if (!item) {
    const video = await c.env.DB.prepare(
      "SELECT id FROM external_videos WHERE id = ?"
    )
      .bind(mediaId)
      .first<{ id: string }>();
    if (!video) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "找不到媒体");
    }
    await c.env.DB.prepare("DELETE FROM external_videos WHERE id = ?")
      .bind(mediaId)
      .run();
    return c.body(null, 204);
  }
  const selectedAsFavicon = await c.env.DB.prepare(
    "SELECT id FROM site_settings WHERE id = 1 AND favicon_media_id = ?"
  )
    .bind(mediaId)
    .first<{ id: number }>();
  if (selectedAsFavicon) {
    throw new AppError(
      409,
      "MEDIA_IN_USE",
      "该图片正在作为网站图标使用，请先在设置中移除"
    );
  }
  const referenced = await c.env.DB.prepare(
    `SELECT id FROM posts
     WHERE cover_url LIKE ? OR content_markdown LIKE ?
     LIMIT 1`
  )
    .bind(`%${item.object_key}%`, `%${item.object_key}%`)
    .first<{ id: string }>();
  if (referenced) {
    throw new AppError(409, "MEDIA_IN_USE", "该图片仍被文章引用");
  }
  await Promise.all([
    c.env.MEDIA.delete(item.object_key),
    c.env.DB.prepare("DELETE FROM media WHERE id = ?").bind(mediaId).run()
  ]);
  return c.body(null, 204);
});

app.notFound((c) =>
  c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "找不到请求的资源",
        requestId: c.get("requestId") ?? crypto.randomUUID()
      }
    },
    404
  )
);

app.onError((error, c) => {
  const requestId = c.get("requestId") ?? crypto.randomUUID();
  if (error instanceof AppError) {
    return jsonError(c, error, requestId);
  }
  console.error(
    JSON.stringify({
      message: "unhandled error",
      requestId,
      path: c.req.path,
      error: error instanceof Error ? error.message : String(error)
    })
  );
  return jsonError(
    c,
    new AppError(500, "INTERNAL_ERROR", "服务器发生错误"),
    requestId
  );
});

export default app;

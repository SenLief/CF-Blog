import type {
  GroupDetail,
  GroupInput,
  GroupReference,
  GroupSummary,
  MediaItem,
  PostBulkAction,
  PostBulkActionResult,
  PostDetail,
  PostNavigation,
  PublicPostDetail,
  PostRevision,
  PostStatus,
  PostSummary,
  SeriesNavigation,
  SiteSettings
} from "@cf-blog/contracts";
import {
  ABOUT_PAGE_SLUG,
  isStandalonePageSlug,
  normalizeVideoSource,
  slugify
} from "@cf-blog/contracts";
import { renderMarkdown } from "@cf-blog/markdown";
import { AppError, nowIso } from "./http";

interface SiteRow {
  title: string;
  description: string;
  author_name: string;
  author_bio: string;
  locale: string;
  timezone: string;
  accent: string;
  default_theme: "system" | "light" | "dark";
  show_toc: number;
  show_reading_time: number;
  favicon_media_id: string | null;
  favicon_object_key: string | null;
  nav_json: string;
  social_json: string;
  seo_image_url: string;
  updated_at: string;
}

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_markdown: string;
  content_html: string;
  cover_url: string;
  status: PostStatus;
  reading_minutes: number;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  tags: string | null;
  group_id: string | null;
  group_position: number | null;
  group_name: string | null;
  group_slug: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  post_count: number;
  created_at: string;
  updated_at: string;
}

interface RevisionRow {
  id: string;
  post_id: string;
  version: number;
  title: string;
  slug: string;
  excerpt: string;
  content_markdown: string;
  reason: "manual" | "publish" | "unpublish" | "restore";
  created_at: string;
}

interface BulkPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_markdown: string;
  status: PostStatus;
  version: number;
  group_id: string | null;
}

interface MediaRow {
  id: string;
  object_key: string;
  filename: string;
  mime_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  created_at: string;
}

interface ExternalVideoRow {
  id: string;
  title: string;
  source_url: string;
  provider: string;
  provider_key: string;
  created_at: string;
}

const POST_SELECT = `
  SELECT
    p.*,
    COALESCE(group_concat(t.name, char(31)), '') AS tags,
    g.name AS group_name,
    g.slug AS group_slug
  FROM posts p
  LEFT JOIN post_tags pt ON pt.post_id = p.id
  LEFT JOIN tags t ON t.id = pt.tag_id
  LEFT JOIN "groups" g ON g.id = p.group_id
`;

const GROUP_SELECT = `
  SELECT
    g.*,
    COUNT(p.id) AS post_count
  FROM "groups" g
  LEFT JOIN posts p
    ON p.group_id = g.id
    AND p.status = 'published'
    AND p.slug != '${ABOUT_PAGE_SLUG}' COLLATE NOCASE
`;

function parseJsonArray<T>(input: string): T[] {
  try {
    const value: unknown = JSON.parse(input);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

function mapSite(row: SiteRow, mediaBaseUrl: string): SiteSettings {
  const hasFavicon = Boolean(row.favicon_media_id && row.favicon_object_key);
  return {
    title: row.title,
    description: row.description,
    authorName: row.author_name,
    authorBio: row.author_bio,
    locale: row.locale,
    timezone: row.timezone,
    accent: row.accent,
    defaultTheme: row.default_theme,
    showToc: row.show_toc === 1,
    showReadingTime: row.show_reading_time === 1,
    faviconMediaId: hasFavicon ? row.favicon_media_id : null,
    faviconUrl:
      hasFavicon && row.favicon_object_key
        ? mediaUrl(mediaBaseUrl, row.favicon_object_key)
        : "",
    nav: parseJsonArray(row.nav_json),
    social: parseJsonArray(row.social_json),
    seoImageUrl: row.seo_image_url,
    updatedAt: row.updated_at
  };
}

function mapPost(row: PostRow): PostDetail {
  const group: GroupReference | null =
    row.group_id && row.group_name && row.group_slug
      ? {
          id: row.group_id,
          name: row.group_name,
          slug: row.group_slug
        }
      : null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    contentMarkdown: row.content_markdown,
    contentHtml: row.content_html,
    coverUrl: row.cover_url,
    status: row.status,
    tags: row.tags ? row.tags.split("\u001f").filter(Boolean) : [],
    group,
    groupPosition: group ? row.group_position : null,
    readingMinutes: row.reading_minutes,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version
  };
}

function mapGroup(row: GroupRow): GroupSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    postCount: row.post_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSummary(post: PostDetail): PostSummary {
  const { contentMarkdown: _markdown, contentHtml: _html, ...summary } = post;
  return summary;
}

function mapRevision(row: RevisionRow): PostRevision {
  return {
    id: row.id,
    postId: row.post_id,
    version: row.version,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    contentMarkdown: row.content_markdown,
    reason: row.reason,
    createdAt: row.created_at
  };
}

export async function getSiteSettings(
  db: D1Database,
  mediaBaseUrl: string
): Promise<SiteSettings> {
  const row = await db
    .prepare(
      `SELECT
        s.*,
        m.object_key AS favicon_object_key
       FROM site_settings s
       LEFT JOIN media m ON m.id = s.favicon_media_id
       WHERE s.id = 1`
    )
    .first<SiteRow>();
  if (!row) {
    throw new AppError(503, "SITE_NOT_INITIALIZED", "站点尚未初始化");
  }
  return mapSite(row, mediaBaseUrl);
}

export async function listPosts(
  db: D1Database,
  options: {
    status?: PostStatus;
    query?: string;
    groupId?: string;
    ungrouped?: boolean;
    excludeStandalonePages?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<PostSummary[]> {
  const filters: string[] = [];
  const values: Array<string | number> = [];
  if (options.status) {
    filters.push("p.status = ?");
    values.push(options.status);
  }
  if (options.query) {
    filters.push("(p.title LIKE ? OR p.excerpt LIKE ?)");
    const query = `%${options.query}%`;
    values.push(query, query);
  }
  if (options.groupId) {
    filters.push("p.group_id = ?");
    values.push(options.groupId);
  } else if (options.ungrouped) {
    filters.push("p.group_id IS NULL");
  }
  if (options.excludeStandalonePages) {
    filters.push("p.slug != ? COLLATE NOCASE");
    values.push(ABOUT_PAGE_SLUG);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const order = options.groupId
    ? "p.group_position ASC, p.published_at ASC, p.id ASC"
    : "COALESCE(p.published_at, p.updated_at) DESC";
  values.push(Math.min(options.limit ?? 200, 500), options.offset ?? 0);
  const result = await db
    .prepare(
      `${POST_SELECT}
       ${where}
       GROUP BY p.id
       ORDER BY ${order}
       LIMIT ? OFFSET ?`
    )
    .bind(...values)
    .all<PostRow>();
  return result.results.map((row) => mapSummary(mapPost(row)));
}

export async function listGroups(
  db: D1Database,
  options: { publicOnly?: boolean } = {}
): Promise<GroupSummary[]> {
  const result = await db
    .prepare(
      `${GROUP_SELECT}
       GROUP BY g.id
       ${options.publicOnly ? "HAVING COUNT(p.id) > 0" : ""}
       ORDER BY g.sort_order ASC, g.created_at ASC`
    )
    .all<GroupRow>();
  return result.results.map(mapGroup);
}

export async function getGroupById(
  db: D1Database,
  id: string
): Promise<GroupSummary | null> {
  const row = await db
    .prepare(`${GROUP_SELECT} WHERE g.id = ? GROUP BY g.id`)
    .bind(id)
    .first<GroupRow>();
  return row ? mapGroup(row) : null;
}

export async function getGroupBySlug(
  db: D1Database,
  slug: string
): Promise<GroupSummary | null> {
  const row = await db
    .prepare(`${GROUP_SELECT} WHERE g.slug = ? COLLATE NOCASE GROUP BY g.id`)
    .bind(slug)
    .first<GroupRow>();
  return row ? mapGroup(row) : null;
}

export async function getGroupDetailById(
  db: D1Database,
  id: string
): Promise<GroupDetail | null> {
  const group = await getGroupById(db, id);
  if (!group) return null;
  return {
    ...group,
    posts: await listPosts(db, {
      status: "published",
      groupId: id,
      excludeStandalonePages: true,
      limit: 500
    })
  };
}

export async function getGroupDetailBySlug(
  db: D1Database,
  slug: string,
  limit: number,
  offset: number
): Promise<GroupDetail | null> {
  const group = await getGroupBySlug(db, slug);
  if (!group || group.postCount === 0) return null;
  return {
    ...group,
    posts: await listPosts(db, {
      status: "published",
      groupId: group.id,
      excludeStandalonePages: true,
      limit,
      offset
    })
  };
}

export async function getGroupRedirect(
  db: D1Database,
  fromSlug: string
): Promise<string | null> {
  const redirect = await db
    .prepare(
      `SELECT g.slug
       FROM group_redirects r
       JOIN "groups" g ON g.id = r.group_id
       WHERE r.from_slug = ? COLLATE NOCASE`
    )
    .bind(fromSlug)
    .first<{ slug: string }>();
  return redirect?.slug ?? null;
}

export async function createGroup(
  db: D1Database,
  input: GroupInput
): Promise<GroupSummary> {
  await assertGroupIdentityAvailable(db, input.name, input.slug);
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const position = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS position FROM "groups"')
    .first<{ position: number }>();
  await db
    .prepare(
      `INSERT INTO "groups" (
        id, name, slug, description, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.name,
      input.slug,
      input.description,
      position?.position ?? 0,
      timestamp,
      timestamp
    )
    .run();
  const group = await getGroupById(db, id);
  if (!group) {
    throw new AppError(500, "GROUP_CREATE_FAILED", "分组创建失败");
  }
  return group;
}

export async function updateGroup(
  db: D1Database,
  id: string,
  input: GroupInput
): Promise<GroupSummary> {
  const existing = await getGroupById(db, id);
  if (!existing) {
    throw new AppError(404, "GROUP_NOT_FOUND", "找不到分组");
  }
  await assertGroupIdentityAvailable(db, input.name, input.slug, id);
  const timestamp = nowIso();
  const statements: D1PreparedStatement[] = [];
  if (existing.slug !== input.slug) {
    statements.push(
      db
        .prepare(
          "DELETE FROM group_redirects WHERE from_slug = ? COLLATE NOCASE AND group_id = ?"
        )
        .bind(input.slug, id),
      db
        .prepare(
          `INSERT OR REPLACE INTO group_redirects (
            from_slug, group_id, created_at
          ) VALUES (?, ?, ?)`
        )
        .bind(existing.slug, id, timestamp)
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE "groups" SET
          name = ?, slug = ?, description = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(input.name, input.slug, input.description, timestamp, id)
  );
  await db.batch(statements);
  const group = await getGroupById(db, id);
  if (!group) {
    throw new AppError(500, "GROUP_UPDATE_FAILED", "分组更新失败");
  }
  return group;
}

async function assertGroupIdentityAvailable(
  db: D1Database,
  name: string,
  slug: string,
  excludeId?: string
): Promise<void> {
  const values = excludeId ? [name, slug, excludeId] : [name, slug];
  const duplicate = await db
    .prepare(
      `SELECT id, name, slug FROM "groups"
       WHERE (name = ? COLLATE NOCASE OR slug = ? COLLATE NOCASE)
       ${excludeId ? "AND id != ?" : ""}
       LIMIT 1`
    )
    .bind(...values)
    .first<{ id: string; name: string; slug: string }>();
  if (duplicate) {
    throw new AppError(
      409,
      duplicate.name.toLocaleLowerCase() === name.toLocaleLowerCase()
        ? "GROUP_NAME_CONFLICT"
        : "GROUP_SLUG_CONFLICT",
      duplicate.name.toLocaleLowerCase() === name.toLocaleLowerCase()
        ? "分组名称已存在"
        : "分组 Slug 已存在"
    );
  }
  const redirect = await db
    .prepare(
      "SELECT group_id FROM group_redirects WHERE from_slug = ? COLLATE NOCASE"
    )
    .bind(slug)
    .first<{ group_id: string }>();
  if (redirect && redirect.group_id !== excludeId) {
    throw new AppError(409, "GROUP_SLUG_CONFLICT", "该 Slug 已被旧分组地址使用");
  }
}

export async function reorderGroups(
  db: D1Database,
  groupIds: string[]
): Promise<GroupSummary[]> {
  const current = await listGroups(db);
  assertExactIds(
    groupIds,
    current.map((group) => group.id),
    "GROUP_ORDER_INVALID",
    "分组排序列表与现有分组不一致"
  );
  const timestamp = nowIso();
  await db.batch(
    groupIds.map((id, position) =>
      db
        .prepare('UPDATE "groups" SET sort_order = ?, updated_at = ? WHERE id = ?')
        .bind(position, timestamp, id)
    )
  );
  return listGroups(db);
}

export async function replaceGroupPosts(
  db: D1Database,
  groupId: string,
  postIds: string[]
): Promise<GroupDetail> {
  const group = await getGroupById(db, groupId);
  if (!group) {
    throw new AppError(404, "GROUP_NOT_FOUND", "找不到分组");
  }
  if (new Set(postIds).size !== postIds.length) {
    throw new AppError(422, "GROUP_POSTS_DUPLICATED", "文章排序中存在重复项");
  }
  const requested = JSON.stringify(postIds);
  const rows =
    postIds.length === 0
      ? []
      : (
          await db
            .prepare(
              `SELECT p.id, p.slug, p.status, p.group_id
               FROM posts p
               JOIN json_each(?) requested ON requested.value = p.id`
            )
            .bind(requested)
            .all<{
              id: string;
              slug: string;
              status: PostStatus;
              group_id: string | null;
            }>()
        ).results;
  if (rows.length !== postIds.length) {
    throw new AppError(404, "GROUP_POST_NOT_FOUND", "排序列表中包含不存在的文章");
  }
  if (rows.some((post) => post.status !== "published")) {
    throw new AppError(422, "GROUP_REQUIRES_PUBLISHED_POST", "系列只能包含已发布文章");
  }
  if (rows.some((post) => isStandalonePageSlug(post.slug))) {
    throw new AppError(422, "GROUP_REJECTS_STANDALONE_PAGE", "独立页面不能加入系列");
  }
  if (rows.some((post) => post.group_id && post.group_id !== groupId)) {
    throw new AppError(409, "POST_ALREADY_GROUPED", "有文章已属于其他分组");
  }

  const timestamp = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE posts SET
          group_id = NULL, group_position = NULL,
          version = version + 1, updated_at = ?
         WHERE group_id = ?
           AND id NOT IN (SELECT value FROM json_each(?))`
      )
      .bind(timestamp, groupId, requested),
    db
      .prepare(
        `WITH desired AS (
          SELECT value AS id, CAST(key AS INTEGER) AS position
          FROM json_each(?)
        )
        UPDATE posts SET
          group_id = ?,
          group_position = (
            SELECT desired.position FROM desired WHERE desired.id = posts.id
          ),
          version = version + 1,
          updated_at = ?
        WHERE id IN (SELECT id FROM desired)`
      )
      .bind(requested, groupId, timestamp),
    db
      .prepare('UPDATE "groups" SET updated_at = ? WHERE id = ?')
      .bind(timestamp, groupId)
  ]);
  const detail = await getGroupDetailById(db, groupId);
  if (!detail) {
    throw new AppError(500, "GROUP_UPDATE_FAILED", "分组文章保存失败");
  }
  return detail;
}

function assertExactIds(
  submitted: string[],
  expected: string[],
  code: string,
  message: string
): void {
  if (
    new Set(submitted).size !== submitted.length ||
    submitted.length !== expected.length ||
    submitted.some((id) => !expected.includes(id))
  ) {
    throw new AppError(422, code, message);
  }
}

export async function getPostById(
  db: D1Database,
  id: string
): Promise<PostDetail | null> {
  const row = await db
    .prepare(`${POST_SELECT} WHERE p.id = ? GROUP BY p.id`)
    .bind(id)
    .first<PostRow>();
  return row ? mapPost(row) : null;
}

export async function getPostBySlug(
  db: D1Database,
  slug: string
): Promise<PostDetail | null> {
  const row = await db
    .prepare(
      `${POST_SELECT}
       WHERE p.slug = ? COLLATE NOCASE
       GROUP BY p.id`
    )
    .bind(slug)
    .first<PostRow>();
  return row ? mapPost(row) : null;
}

export async function getPublishedPostBySlug(
  db: D1Database,
  slug: string
): Promise<PostDetail | null> {
  const row = await db
    .prepare(
      `${POST_SELECT}
       WHERE p.slug = ? AND p.status = 'published'
       GROUP BY p.id`
    )
    .bind(slug)
    .first<PostRow>();
  return row ? mapPost(row) : null;
}

export async function getPublicPostBySlug(
  db: D1Database,
  slug: string
): Promise<PublicPostDetail | null> {
  const post = await getPublishedPostBySlug(db, slug);
  if (!post) return null;
  const [seriesNavigation, postNavigation] = await Promise.all([
    getSeriesNavigation(db, post),
    getPostNavigation(db, post)
  ]);
  return {
    ...post,
    seriesNavigation,
    postNavigation
  };
}

async function getSeriesNavigation(
  db: D1Database,
  post: PostDetail
): Promise<SeriesNavigation | null> {
  if (!post.group || post.groupPosition === null) return null;
  const result = await db
    .prepare(
      `SELECT id, slug, title FROM posts
       WHERE group_id = ?
         AND status = 'published'
         AND slug != ? COLLATE NOCASE
       ORDER BY group_position ASC, published_at ASC, id ASC`
    )
    .bind(post.group.id, ABOUT_PAGE_SLUG)
    .all<{ id: string; slug: string; title: string }>();
  const index = result.results.findIndex((item) => item.id === post.id);
  const posts = result.results.map(({ slug, title }) => ({ slug, title }));
  return {
    group: post.group,
    index: index >= 0 ? index : post.groupPosition,
    total: posts.length,
    previous: index > 0 ? (posts[index - 1] ?? null) : null,
    next:
      index >= 0 && index < posts.length - 1
        ? (posts[index + 1] ?? null)
        : null,
    posts
  };
}

async function getPostNavigation(
  db: D1Database,
  post: PostDetail
): Promise<PostNavigation> {
  const publishedOrderAt = post.publishedAt ?? post.updatedAt;
  const [previous, next] = await Promise.all([
    db
      .prepare(
        `SELECT slug, title FROM posts
         WHERE status = 'published'
           AND slug != ? COLLATE NOCASE
           AND (
             COALESCE(published_at, updated_at) < ?
             OR (COALESCE(published_at, updated_at) = ? AND id < ?)
           )
         ORDER BY COALESCE(published_at, updated_at) DESC, id DESC
         LIMIT 1`
      )
      .bind(ABOUT_PAGE_SLUG, publishedOrderAt, publishedOrderAt, post.id)
      .first<{ slug: string; title: string }>(),
    db
      .prepare(
        `SELECT slug, title FROM posts
         WHERE status = 'published'
           AND slug != ? COLLATE NOCASE
           AND (
             COALESCE(published_at, updated_at) > ?
             OR (COALESCE(published_at, updated_at) = ? AND id > ?)
           )
         ORDER BY COALESCE(published_at, updated_at) ASC, id ASC
         LIMIT 1`
      )
      .bind(ABOUT_PAGE_SLUG, publishedOrderAt, publishedOrderAt, post.id)
      .first<{ slug: string; title: string }>()
  ]);
  return {
    previous: previous ?? null,
    next: next ?? null
  };
}

async function prepareGroupPositionCompactionExcluding(
  db: D1Database,
  groupId: string,
  excludedPostIds: string[]
): Promise<D1PreparedStatement> {
  const result = await db
    .prepare(
      `SELECT id FROM posts
       WHERE group_id = ? AND status = 'published'
       ORDER BY group_position ASC, published_at ASC, id ASC`
    )
    .bind(groupId)
    .all<{ id: string }>();
  const excluded = new Set(excludedPostIds);
  const orderedIds = JSON.stringify(
    result.results
      .filter((post) => !excluded.has(post.id))
      .map((post) => post.id)
  );
  return db
    .prepare(
      `WITH desired AS (
        SELECT value AS id, CAST(key AS INTEGER) AS position
        FROM json_each(?)
      )
      UPDATE posts SET
        group_position = (
          SELECT desired.position FROM desired WHERE desired.id = posts.id
        )
      WHERE group_id = ? AND id IN (SELECT id FROM desired)`
    )
    .bind(orderedIds, groupId);
}

export async function prepareGroupPositionCompaction(
  db: D1Database,
  groupId: string,
  excludePostId?: string
): Promise<D1PreparedStatement> {
  return prepareGroupPositionCompactionExcluding(
    db,
    groupId,
    excludePostId ? [excludePostId] : []
  );
}

export async function deleteGroup(
  db: D1Database,
  id: string
): Promise<void> {
  const group = await getGroupById(db, id);
  if (!group) {
    throw new AppError(404, "GROUP_NOT_FOUND", "找不到分组");
  }
  const remaining = (await listGroups(db))
    .filter((item) => item.id !== id)
    .map((item) => item.id);
  const timestamp = nowIso();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE posts SET
          group_id = NULL, group_position = NULL,
          version = version + 1, updated_at = ?
         WHERE group_id = ?`
      )
      .bind(timestamp, id),
    db.prepare('DELETE FROM "groups" WHERE id = ?').bind(id),
    ...remaining.map((groupId, position) =>
      db
        .prepare('UPDATE "groups" SET sort_order = ?, updated_at = ? WHERE id = ?')
        .bind(position, timestamp, groupId)
    )
  ];
  await db.batch(statements);
}

export async function syncTags(
  db: D1Database,
  postId: string,
  tagNames: string[]
): Promise<void> {
  const normalized = [...new Set(tagNames.map((tag) => tag.trim()).filter(Boolean))];
  const tagIds: string[] = [];
  for (const name of normalized) {
    const existing = await db
      .prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE")
      .bind(name)
      .first<{ id: string }>();
    if (existing) {
      tagIds.push(existing.id);
      continue;
    }
    const id = crypto.randomUUID();
    const baseSlug = slugify(name) || `tag-${id.slice(0, 8)}`;
    const slugCollision = await db
      .prepare("SELECT id FROM tags WHERE slug = ? COLLATE NOCASE")
      .bind(baseSlug)
      .first<{ id: string }>();
    const tagSlug = slugCollision ? `${baseSlug}-${id.slice(0, 6)}` : baseSlug;
    await db
      .prepare("INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)")
      .bind(id, name, tagSlug)
      .run();
    tagIds.push(id);
  }

  const statements = [
    db.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(postId),
    ...tagIds.map((tagId) =>
      db
        .prepare("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)")
        .bind(postId, tagId)
    )
  ];
  await db.batch(statements);
}

export async function createRevision(
  db: D1Database,
  post: PostDetail,
  reason: PostRevision["reason"]
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO post_revisions (
          id, post_id, version, title, slug, excerpt, content_markdown, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        post.id,
        post.version,
        post.title,
        post.slug,
        post.excerpt,
        post.contentMarkdown,
        reason,
        nowIso()
      ),
    db
      .prepare(
        `DELETE FROM post_revisions
         WHERE post_id = ?
           AND id NOT IN (
             SELECT id FROM post_revisions
             WHERE post_id = ?
             ORDER BY created_at DESC
             LIMIT 30
           )`
      )
      .bind(post.id, post.id)
  ]);
}

function prepareRevisionStatements(
  db: D1Database,
  post: BulkPostRow,
  reason: "publish" | "unpublish",
  createdAt: string
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO post_revisions (
          id, post_id, version, title, slug, excerpt, content_markdown, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        post.id,
        post.version,
        post.title,
        post.slug,
        post.excerpt,
        post.content_markdown,
        reason,
        createdAt
      ),
    db
      .prepare(
        `DELETE FROM post_revisions
         WHERE post_id = ?
           AND id NOT IN (
             SELECT id FROM post_revisions
             WHERE post_id = ?
             ORDER BY created_at DESC
             LIMIT 30
           )`
      )
      .bind(post.id, post.id)
  ];
}

export async function applyPostBulkAction(
  db: D1Database,
  input: PostBulkAction
): Promise<PostBulkActionResult> {
  const placeholders = input.postIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT
        id, slug, title, excerpt, content_markdown, status, version, group_id
       FROM posts
       WHERE id IN (${placeholders})`
    )
    .bind(...input.postIds)
    .all<BulkPostRow>();
  const postsById = new Map(result.results.map((post) => [post.id, post]));
  const missingPostIds = input.postIds.filter((id) => !postsById.has(id));
  if (missingPostIds.length > 0) {
    throw new AppError(404, "POST_NOT_FOUND", "部分文章不存在", {
      postIds: missingPostIds
    });
  }

  const posts = input.postIds.map((id) => postsById.get(id)!);
  const affectedPosts =
    input.action === "delete"
      ? posts
      : posts.filter((post) => post.status !== input.action);

  if (input.action === "publish") {
    for (const post of affectedPosts) {
      if (!post.title.trim() || !post.content_markdown.trim()) {
        throw new AppError(
          422,
          "POST_INCOMPLETE",
          `《${post.title || "未命名文章"}》的标题和正文不能为空`,
          { postId: post.id }
        );
      }
      if (/!\[\s*\]\([^)]+\)/.test(post.content_markdown)) {
        throw new AppError(
          422,
          "IMAGE_ALT_REQUIRED",
          `《${post.title}》的正文图片缺少替代文本`,
          { postId: post.id }
        );
      }
    }
  }

  if (affectedPosts.length === 0) {
    return {
      action: input.action,
      affected: 0,
      postIds: []
    };
  }

  const timestamp = nowIso();
  const affectedGroupIds = new Set(
    affectedPosts
      .map((post) => post.group_id)
      .filter((groupId): groupId is string => groupId !== null)
  );
  const statements: D1PreparedStatement[] = [];

  if (input.action === "delete") {
    statements.push(
      db
        .prepare(`DELETE FROM posts WHERE id IN (${placeholders})`)
        .bind(...input.postIds)
    );
  } else {
    for (const post of affectedPosts) {
      if (input.action === "publish") {
        statements.push(
          ...prepareRevisionStatements(db, post, "publish", timestamp),
          db
            .prepare(
              `UPDATE posts SET
                status = 'published',
                published_at = COALESCE(published_at, ?),
                group_id = NULL,
                group_position = NULL,
                version = version + 1,
                updated_at = ?
               WHERE id = ?`
            )
            .bind(timestamp, timestamp, post.id)
        );
      } else if (input.action === "draft") {
        statements.push(
          ...prepareRevisionStatements(db, post, "unpublish", timestamp),
          db
            .prepare(
              `UPDATE posts SET
                status = 'draft',
                group_id = NULL,
                group_position = NULL,
                version = version + 1,
                updated_at = ?
               WHERE id = ?`
            )
            .bind(timestamp, post.id)
        );
      } else {
        statements.push(
          db
            .prepare(
              `UPDATE posts SET
                status = 'archived',
                group_id = NULL,
                group_position = NULL,
                version = version + 1,
                updated_at = ?
               WHERE id = ?`
            )
            .bind(timestamp, post.id)
        );
      }
    }
  }

  for (const groupId of affectedGroupIds) {
    statements.push(
      await prepareGroupPositionCompactionExcluding(
        db,
        groupId,
        affectedPosts
          .filter((post) => post.group_id === groupId)
          .map((post) => post.id)
      ),
      db
        .prepare('UPDATE "groups" SET updated_at = ? WHERE id = ?')
        .bind(timestamp, groupId)
    );
  }

  await db.batch(statements);
  return {
    action: input.action,
    affected: affectedPosts.length,
    postIds: affectedPosts.map((post) => post.id)
  };
}

export async function listRevisions(
  db: D1Database,
  postId: string
): Promise<PostRevision[]> {
  const result = await db
    .prepare(
      `SELECT * FROM post_revisions
       WHERE post_id = ?
       ORDER BY created_at DESC
       LIMIT 30`
    )
    .bind(postId)
    .all<RevisionRow>();
  return result.results.map(mapRevision);
}

export function mediaUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export async function listMedia(
  db: D1Database,
  baseUrl: string
): Promise<MediaItem[]> {
  const [imageResult, videoResult] = await Promise.all([
    db.prepare("SELECT * FROM media ORDER BY created_at DESC LIMIT 500").all<MediaRow>(),
    db
      .prepare("SELECT * FROM external_videos ORDER BY created_at DESC LIMIT 500")
      .all<ExternalVideoRow>()
  ]);
  const images: MediaItem[] = imageResult.results.map((row) => ({
    kind: "image",
    id: row.id,
    key: row.object_key,
    url: mediaUrl(baseUrl, row.object_key),
    filename: row.filename,
    mimeType: row.mime_type,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    alt: row.alt,
    createdAt: row.created_at
  }));
  const videos: MediaItem[] = videoResult.results.flatMap((row) => {
    const normalized = normalizeVideoSource(row.source_url);
    if (!normalized) return [];
    return [
      {
        kind: "video" as const,
        id: row.id,
        title: row.title,
        sourceUrl: normalized.sourceUrl,
        provider: normalized.provider,
        preview: normalized.preview,
        createdAt: row.created_at
      }
    ];
  });
  return [...images, ...videos]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 500);
}

export async function restoreRevision(
  db: D1Database,
  postId: string,
  revisionId: string
): Promise<PostDetail> {
  const [post, revision] = await Promise.all([
    getPostById(db, postId),
    db
      .prepare("SELECT * FROM post_revisions WHERE id = ? AND post_id = ?")
      .bind(revisionId, postId)
      .first<RevisionRow>()
  ]);
  if (!post || !revision) {
    throw new AppError(404, "REVISION_NOT_FOUND", "找不到该文章版本");
  }
  await createRevision(db, post, "restore");
  const rendered = await renderMarkdown(revision.content_markdown);
  const timestamp = nowIso();
  const restoredAsStandalonePage = isStandalonePageSlug(revision.slug);
  const update = db.prepare(
      `UPDATE posts SET
        title = ?, slug = ?, excerpt = ?, content_markdown = ?,
        content_html = ?, content_text = ?, reading_minutes = ?,
        ${restoredAsStandalonePage ? "group_id = NULL, group_position = NULL," : ""}
        version = version + 1, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      revision.title,
      revision.slug,
      revision.excerpt,
      revision.content_markdown,
      rendered.html,
      rendered.plainText,
      rendered.readingMinutes,
      timestamp,
      postId
    );
  await db.batch(
    restoredAsStandalonePage && post.group
      ? [
          update,
          await prepareGroupPositionCompaction(db, post.group.id, post.id),
          db
            .prepare('UPDATE "groups" SET updated_at = ? WHERE id = ?')
            .bind(timestamp, post.group.id)
        ]
      : [update]
  );
  const restored = await getPostById(db, postId);
  if (!restored) {
    throw new AppError(500, "RESTORE_FAILED", "版本恢复失败");
  }
  return restored;
}

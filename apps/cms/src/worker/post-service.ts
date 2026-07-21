import type { PostDetail, PostInput } from "@cf-blog/contracts";
import {
  isStandalonePageSlug,
  slugify
} from "@cf-blog/contracts";
import { renderMarkdown } from "@cf-blog/markdown";
import {
  createRevision,
  getGroupById,
  getPostById,
  prepareGroupPositionCompaction,
  syncTags
} from "./db";
import { AppError, nowIso } from "./http";

export interface CreateDraftInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  contentMarkdown?: string;
  coverUrl?: string;
  tags?: string[];
}

export type PostStatusAction = "publish" | "unpublish" | "archive";

function assertExpectedVersion(post: PostDetail, expectedVersion: number): void {
  if (post.version !== expectedVersion) {
    throw new AppError(409, "VERSION_CONFLICT", "文章已在其他页面中更新", {
      serverVersion: post.version
    });
  }
}

async function requirePost(db: D1Database, id: string): Promise<PostDetail> {
  const post = await getPostById(db, id);
  if (!post) {
    throw new AppError(404, "POST_NOT_FOUND", "找不到文章");
  }
  return post;
}

async function assertUniqueSlug(
  db: D1Database,
  slug: string,
  excludePostId?: string
): Promise<void> {
  const duplicate = excludePostId
    ? await db
        .prepare(
          "SELECT id FROM posts WHERE slug = ? COLLATE NOCASE AND id != ?"
        )
        .bind(slug, excludePostId)
        .first<{ id: string }>()
    : await db
        .prepare("SELECT id FROM posts WHERE slug = ? COLLATE NOCASE")
        .bind(slug)
        .first<{ id: string }>();
  if (duplicate) {
    throw new AppError(409, "SLUG_CONFLICT", "该 slug 已被其他文章使用");
  }
}

export async function createDraft(
  db: D1Database,
  input: CreateDraftInput = {}
): Promise<PostDetail> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const title = input.title?.trim() || "未命名文章";
  const requestedSlug = input.slug?.trim();
  const slug =
    requestedSlug ||
    (input.title?.trim() ? slugify(title) : "") ||
    `untitled-${id.slice(0, 8)}`;
  const contentMarkdown = input.contentMarkdown ?? "";
  const rendered = await renderMarkdown(contentMarkdown);
  const excerpt = input.excerpt?.trim() || rendered.excerpt;

  await assertUniqueSlug(db, slug);
  try {
    await db
      .prepare(
        `INSERT INTO posts (
          id, slug, title, excerpt, content_markdown, content_html,
          content_text, cover_url, status, reading_minutes, version,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0, ?, ?)`
      )
      .bind(
        id,
        slug,
        title,
        excerpt,
        contentMarkdown,
        rendered.html,
        rendered.plainText,
        input.coverUrl ?? "",
        rendered.readingMinutes,
        timestamp,
        timestamp
      )
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new AppError(409, "SLUG_CONFLICT", "该 slug 已被其他文章使用");
    }
    throw error;
  }

  try {
    await syncTags(db, id, input.tags ?? []);
  } catch (error) {
    await db.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
    throw error;
  }

  return requirePost(db, id);
}

export async function updatePost(
  db: D1Database,
  id: string,
  input: PostInput,
  options: { snapshotPublished?: boolean } = {}
): Promise<PostDetail> {
  const existing = await requirePost(db, id);
  assertExpectedVersion(existing, input.version);
  await assertUniqueSlug(db, input.slug, id);

  const groupId = isStandalonePageSlug(input.slug) ? null : input.groupId;
  if (groupId && existing.status !== "published") {
    throw new AppError(
      422,
      "GROUP_REQUIRES_PUBLISHED_POST",
      "草稿和归档文章不能加入分组"
    );
  }

  let groupPosition: number | null = null;
  if (groupId) {
    const group = await getGroupById(db, groupId);
    if (!group) {
      throw new AppError(422, "GROUP_NOT_FOUND", "选择的分组不存在");
    }
    if (existing.group?.id === groupId && existing.groupPosition !== null) {
      groupPosition = existing.groupPosition;
    } else {
      const position = await db
        .prepare(
          `SELECT COALESCE(MAX(group_position), -1) + 1 AS position
           FROM posts
           WHERE group_id = ? AND status = 'published'`
        )
        .bind(groupId)
        .first<{ position: number }>();
      groupPosition = position?.position ?? 0;
    }
  }

  if (options.snapshotPublished && existing.status === "published") {
    await createRevision(db, existing, "manual");
  }

  const rendered = await renderMarkdown(input.contentMarkdown);
  const excerpt = input.excerpt || rendered.excerpt;
  const updatedAt = nowIso();
  const updateStatement = db
    .prepare(
      `UPDATE posts SET
        title = ?, slug = ?, excerpt = ?, content_markdown = ?,
        content_html = ?, content_text = ?, cover_url = ?,
        group_id = ?, group_position = ?, reading_minutes = ?,
        version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`
    )
    .bind(
      input.title,
      input.slug,
      excerpt,
      input.contentMarkdown,
      rendered.html,
      rendered.plainText,
      input.coverUrl,
      groupId,
      groupPosition,
      rendered.readingMinutes,
      updatedAt,
      id,
      input.version
    );
  const previousGroupId = existing.group?.id ?? null;
  const groupChanged = previousGroupId !== groupId;
  const updateStatements: D1PreparedStatement[] = [updateStatement];
  if (groupChanged && previousGroupId) {
    updateStatements.push(
      await prepareGroupPositionCompaction(db, previousGroupId, id),
      db
        .prepare('UPDATE "groups" SET updated_at = ? WHERE id = ?')
        .bind(updatedAt, previousGroupId)
    );
  }
  if (groupChanged && groupId) {
    updateStatements.push(
      db
        .prepare('UPDATE "groups" SET updated_at = ? WHERE id = ?')
        .bind(updatedAt, groupId)
    );
  }
  const results =
    updateStatements.length > 1
      ? await db.batch(updateStatements)
      : [await updateStatement.run()];
  const update = results[0];
  if (!update || (update.meta.changes ?? 0) !== 1) {
    const latest = await getPostById(db, id);
    throw new AppError(409, "VERSION_CONFLICT", "文章已在其他页面中更新", {
      ...(latest ? { serverVersion: latest.version } : {})
    });
  }

  if (existing.status === "published" && existing.slug !== input.slug) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO post_redirects (from_slug, post_id, created_at)
         VALUES (?, ?, ?)`
      )
      .bind(existing.slug, id, updatedAt)
      .run();
  }
  await syncTags(db, id, input.tags);
  return requirePost(db, id);
}

export async function changePostStatus(
  db: D1Database,
  id: string,
  expectedVersion: number,
  action: PostStatusAction
): Promise<PostDetail> {
  const post = await requirePost(db, id);
  assertExpectedVersion(post, expectedVersion);
  const targetStatus =
    action === "publish"
      ? "published"
      : action === "unpublish"
        ? "draft"
        : "archived";
  if (post.status === targetStatus) return post;

  if (action === "publish") {
    if (!post.title.trim() || !post.contentMarkdown.trim()) {
      throw new AppError(422, "POST_INCOMPLETE", "标题和正文不能为空");
    }
    if (/!\[\s*\]\([^)]+\)/.test(post.contentMarkdown)) {
      throw new AppError(
        422,
        "IMAGE_ALT_REQUIRED",
        "所有正文图片都需要替代文本"
      );
    }
    await createRevision(db, post, "publish");
  } else if (action === "unpublish") {
    await createRevision(db, post, "unpublish");
  }

  const timestamp = nowIso();
  const update = await db
    .prepare(
      `UPDATE posts SET
        status = ?,
        published_at = CASE
          WHEN ? = 'published' THEN COALESCE(published_at, ?)
          ELSE published_at
        END,
        group_id = NULL,
        group_position = NULL,
        version = version + 1,
        updated_at = ?
       WHERE id = ? AND version = ?`
    )
    .bind(
      targetStatus,
      targetStatus,
      timestamp,
      timestamp,
      id,
      expectedVersion
    )
    .run();
  if ((update.meta.changes ?? 0) !== 1) {
    const latest = await getPostById(db, id);
    throw new AppError(409, "VERSION_CONFLICT", "文章已在其他页面中更新", {
      ...(latest ? { serverVersion: latest.version } : {})
    });
  }

  if (post.group) {
    await db.batch([
      await prepareGroupPositionCompaction(db, post.group.id, id),
      db
        .prepare('UPDATE "groups" SET updated_at = ? WHERE id = ?')
        .bind(timestamp, post.group.id)
    ]);
  }
  return requirePost(db, id);
}

export async function deletePost(
  db: D1Database,
  id: string,
  expectedVersion: number,
  confirmTitle: string
): Promise<{ id: string; title: string; deleted: true }> {
  const post = await requirePost(db, id);
  assertExpectedVersion(post, expectedVersion);
  if (post.title !== confirmTitle) {
    throw new AppError(
      422,
      "POST_TITLE_MISMATCH",
      "确认标题与当前文章标题不一致"
    );
  }

  const result = await db
    .prepare("DELETE FROM posts WHERE id = ? AND version = ?")
    .bind(id, expectedVersion)
    .run();
  // D1 may include cascading revision/tag deletions in `changes`.
  if ((result.meta.changes ?? 0) < 1) {
    const latest = await getPostById(db, id);
    throw new AppError(409, "VERSION_CONFLICT", "文章已在其他页面中更新", {
      ...(latest ? { serverVersion: latest.version } : {})
    });
  }

  if (post.group) {
    const timestamp = nowIso();
    await db.batch([
      await prepareGroupPositionCompaction(db, post.group.id, id),
      db
        .prepare('UPDATE "groups" SET updated_at = ? WHERE id = ?')
        .bind(timestamp, post.group.id)
    ]);
  }
  return { id: post.id, title: post.title, deleted: true };
}

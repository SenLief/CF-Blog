import type {
  Memo,
  MemoCreateInput,
  MemoImage,
  MemoInput,
  MemoStatus,
  MemoVideo
} from "@cf-blog/contracts";
import {
  extractMemoTags,
  normalizeVideoSource,
  slugify
} from "@cf-blog/contracts";
import { mediaUrl } from "./db";
import { AppError, nowIso } from "./http";

interface MemoRow {
  id: string;
  content_markdown: string;
  status: MemoStatus;
  is_pinned: number;
  video_json: string;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MemoTagRow {
  memo_id: string;
  name: string;
}

interface MemoImageRow {
  memo_id: string;
  id: string;
  object_key: string;
  filename: string;
  mime_type: string;
  bytes: number;
  alt: string;
  width: number | null;
  height: number | null;
}

const MEMO_SELECT = `
  SELECT id, content_markdown, status, is_pinned, video_json,
    version, published_at, created_at, updated_at
  FROM memos
`;

function plainTextHtml(content: string): string {
  if (!content) return "";
  const escaped = content
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  return `<p>${escaped.replaceAll("\n", "<br />")}</p>`;
}

function normalizeVideoUrls(urls: string[]): string[] {
  return urls.flatMap((url) => {
    const source = normalizeVideoSource(url);
    return source ? [source.sourceUrl] : [];
  });
}

function parseVideos(input: string): MemoVideo[] {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const source = normalizeVideoSource(item);
    return source
      ? [{
          sourceUrl: source.sourceUrl,
          provider: source.provider,
          preview: source.preview
        }]
      : [];
  });
}

function mapMemo(
  row: MemoRow,
  tags: string[] = [],
  images: MemoImage[] = []
): Memo {
  return {
    id: row.id,
    content: row.content_markdown,
    tags,
    images,
    videos: parseVideos(row.video_json),
    status: row.status,
    isPinned: row.is_pinned === 1,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function hydrateMemos(
  db: D1Database,
  mediaBaseUrl: string,
  rows: MemoRow[]
): Promise<Memo[]> {
  if (rows.length === 0) return [];
  const tagMap = new Map<string, string[]>();
  const imageMap = new Map<string, MemoImage[]>();
  const ids = rows.map((row) => row.id);

  for (const idChunk of chunks(ids, 80)) {
    const placeholders = idChunk.map(() => "?").join(", ");
    const [tags, images] = await Promise.all([
      db
        .prepare(
          `SELECT mt.memo_id, t.name
           FROM memo_tags mt
           JOIN tags t ON t.id = mt.tag_id
           WHERE mt.memo_id IN (${placeholders})
           ORDER BY lower(t.name), t.id`
        )
        .bind(...idChunk)
        .all<MemoTagRow>(),
      db
        .prepare(
          `SELECT mi.memo_id, m.id, m.object_key, m.filename, m.mime_type,
             m.bytes, m.alt, m.width, m.height
           FROM memo_images mi
           JOIN media m ON m.id = mi.media_id
           WHERE mi.memo_id IN (${placeholders})
           ORDER BY mi.memo_id, mi.sort_order`
        )
        .bind(...idChunk)
        .all<MemoImageRow>()
    ]);
    for (const tag of tags.results) {
      tagMap.set(tag.memo_id, [...(tagMap.get(tag.memo_id) ?? []), tag.name]);
    }
    for (const image of images.results) {
      imageMap.set(image.memo_id, [
        ...(imageMap.get(image.memo_id) ?? []),
        {
          id: image.id,
          url: mediaUrl(mediaBaseUrl, image.object_key),
          filename: image.filename,
          mimeType: image.mime_type,
          bytes: image.bytes,
          alt: image.alt,
          width: image.width,
          height: image.height
        }
      ]);
    }
  }

  return rows.map((row) =>
    mapMemo(row, tagMap.get(row.id) ?? [], imageMap.get(row.id) ?? [])
  );
}

export async function listMemos(
  db: D1Database,
  mediaBaseUrl: string,
  options: {
    status?: MemoStatus;
    query?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Memo[]> {
  const filters: string[] = [];
  const values: Array<string | number> = [];
  if (options.status) {
    filters.push("status = ?");
    values.push(options.status);
  }
  if (options.query) {
    filters.push(
      `(content_text LIKE ? OR EXISTS (
        SELECT 1 FROM memo_tags mt
        JOIN tags t ON t.id = mt.tag_id
        WHERE mt.memo_id = memos.id AND t.name LIKE ?
      ))`
    );
    values.push(`%${options.query}%`, `%${options.query}%`);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  values.push(Math.min(options.limit ?? 100, 200), options.offset ?? 0);

  const result = await db
    .prepare(
      `${MEMO_SELECT}
       ${where}
       ORDER BY is_pinned DESC,
         COALESCE(published_at, created_at) DESC,
         id DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...values)
    .all<MemoRow>();
  return hydrateMemos(db, mediaBaseUrl, result.results);
}

export async function getMemoById(
  db: D1Database,
  id: string,
  mediaBaseUrl: string
): Promise<Memo | null> {
  const row = await db
    .prepare(`${MEMO_SELECT} WHERE id = ?`)
    .bind(id)
    .first<MemoRow>();
  if (!row) return null;
  return (await hydrateMemos(db, mediaBaseUrl, [row]))[0] ?? null;
}

async function requireMemo(
  db: D1Database,
  id: string,
  mediaBaseUrl: string
): Promise<Memo> {
  const memo = await getMemoById(db, id, mediaBaseUrl);
  if (!memo) {
    throw new AppError(404, "MEMO_NOT_FOUND", "找不到这条短文");
  }
  return memo;
}

async function resolveTagIds(
  db: D1Database,
  tagNames: string[]
): Promise<string[]> {
  const tagIds: string[] = [];
  for (const name of tagNames) {
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
    const collision = await db
      .prepare("SELECT id FROM tags WHERE slug = ? COLLATE NOCASE")
      .bind(baseSlug)
      .first<{ id: string }>();
    const tagSlug = collision ? `${baseSlug}-${id.slice(0, 6)}` : baseSlug;
    await db
      .prepare("INSERT OR IGNORE INTO tags (id, name, slug) VALUES (?, ?, ?)")
      .bind(id, name, tagSlug)
      .run();
    const resolved = await db
      .prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE")
      .bind(name)
      .first<{ id: string }>();
    if (!resolved) {
      throw new AppError(409, "TAG_CONFLICT", `无法创建标签“${name}”`);
    }
    tagIds.push(resolved.id);
  }
  return tagIds;
}

async function assertImagesExist(
  db: D1Database,
  imageIds: string[]
): Promise<void> {
  if (imageIds.length === 0) return;
  const result = await db
    .prepare(`SELECT id FROM media WHERE id IN (${imageIds.map(() => "?").join(", ")})`)
    .bind(...imageIds)
    .all<{ id: string }>();
  if (new Set(result.results.map((item) => item.id)).size !== imageIds.length) {
    throw new AppError(422, "MEMO_IMAGE_NOT_FOUND", "选择的短文图片不存在");
  }
}

export async function createMemo(
  db: D1Database,
  mediaBaseUrl: string,
  input: MemoCreateInput
): Promise<Memo> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const publishedAt = input.status === "published" ? timestamp : null;
  const tagIds = await resolveTagIds(db, extractMemoTags(input.content));
  await assertImagesExist(db, input.imageIds);
  const videoUrls = normalizeVideoUrls(input.videoUrls);

  await db.batch([
    db
      .prepare(
        `INSERT INTO memos (
          id, content_markdown, content_html, content_text, status,
          is_pinned, video_json, version, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)`
      )
      .bind(
        id,
        input.content,
        plainTextHtml(input.content),
        input.content,
        input.status,
        JSON.stringify(videoUrls),
        publishedAt,
        timestamp,
        timestamp
      ),
    ...tagIds.map((tagId) =>
      db
        .prepare("INSERT INTO memo_tags (memo_id, tag_id) VALUES (?, ?)")
        .bind(id, tagId)
    ),
    ...input.imageIds.map((mediaId, index) =>
      db
        .prepare(
          "INSERT INTO memo_images (memo_id, media_id, sort_order) VALUES (?, ?, ?)"
        )
        .bind(id, mediaId, index)
    )
  ]);

  return requireMemo(db, id, mediaBaseUrl);
}

export async function updateMemo(
  db: D1Database,
  id: string,
  mediaBaseUrl: string,
  input: MemoInput
): Promise<Memo> {
  const existing = await requireMemo(db, id, mediaBaseUrl);
  if (existing.version !== input.version) {
    throw new AppError(409, "VERSION_CONFLICT", "短文已在其他页面中更新", {
      serverVersion: existing.version
    });
  }

  const tagIds = await resolveTagIds(db, extractMemoTags(input.content));
  await assertImagesExist(db, input.imageIds);
  const videoUrls = normalizeVideoUrls(input.videoUrls);
  const timestamp = nowIso();
  const publishedAt =
    input.status === "published" ? existing.publishedAt ?? timestamp : null;
  const nextVersion = input.version + 1;
  const result = await db.batch([
    db
      .prepare(
        `UPDATE memos SET
          content_markdown = ?, content_html = ?, content_text = ?,
          status = ?, is_pinned = ?, video_json = ?, published_at = ?,
          version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`
      )
      .bind(
        input.content,
        plainTextHtml(input.content),
        input.content,
        input.status,
        input.isPinned ? 1 : 0,
        JSON.stringify(videoUrls),
        publishedAt,
        timestamp,
        id,
        input.version
      ),
    db
      .prepare(
        `DELETE FROM memo_tags
         WHERE memo_id = ?
           AND EXISTS (
             SELECT 1 FROM memos WHERE id = ? AND version = ? AND updated_at = ?
           )`
      )
      .bind(id, id, nextVersion, timestamp),
    ...tagIds.map((tagId) =>
      db
        .prepare(
          `INSERT INTO memo_tags (memo_id, tag_id)
           SELECT ?, ? WHERE EXISTS (
             SELECT 1 FROM memos
             WHERE id = ? AND version = ? AND updated_at = ?
           )`
        )
        .bind(id, tagId, id, nextVersion, timestamp)
    ),
    db
      .prepare(
        `DELETE FROM memo_images
         WHERE memo_id = ?
           AND EXISTS (
             SELECT 1 FROM memos WHERE id = ? AND version = ? AND updated_at = ?
           )`
      )
      .bind(id, id, nextVersion, timestamp),
    ...input.imageIds.map((mediaId, index) =>
      db
        .prepare(
          `INSERT INTO memo_images (memo_id, media_id, sort_order)
           SELECT ?, ?, ? WHERE EXISTS (
             SELECT 1 FROM memos
             WHERE id = ? AND version = ? AND updated_at = ?
           )`
        )
        .bind(id, mediaId, index, id, nextVersion, timestamp)
    )
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) {
    const latest = await getMemoById(db, id, mediaBaseUrl);
    throw new AppError(409, "VERSION_CONFLICT", "短文已在其他页面中更新", {
      ...(latest ? { serverVersion: latest.version } : {})
    });
  }
  return requireMemo(db, id, mediaBaseUrl);
}

export async function deleteMemo(
  db: D1Database,
  id: string
): Promise<void> {
  const result = await db
    .prepare("DELETE FROM memos WHERE id = ?")
    .bind(id)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new AppError(404, "MEMO_NOT_FOUND", "找不到这条短文");
  }
}

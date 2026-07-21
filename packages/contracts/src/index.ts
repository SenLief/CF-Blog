import { z } from "zod";

export const postStatusSchema = z.enum(["draft", "published", "archived"]);
export type PostStatus = z.infer<typeof postStatusSchema>;

export const ABOUT_PAGE_SLUG = "about";

export function isStandalonePageSlug(input: string): boolean {
  return input.trim().replace(/^\/+|\/+$/g, "").toLocaleLowerCase() === ABOUT_PAGE_SLUG;
}

export const postBulkActionSchema = z
  .object({
    action: z.enum(["publish", "draft", "archive", "delete"]),
    postIds: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(100)
  })
  .superRefine(({ postIds }, context) => {
    if (new Set(postIds).size !== postIds.length) {
      context.addIssue({
        code: "custom",
        message: "文章 ID 不能重复",
        path: ["postIds"]
      });
    }
  });
export type PostBulkAction = z.infer<typeof postBulkActionSchema>;

export interface PostBulkActionResult {
  action: PostBulkAction["action"];
  affected: number;
  postIds: string[];
}

export const contentSlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9\u4e00-\u9fff]+(?:-[a-z0-9\u4e00-\u9fff]+)*$/)
  .max(180);

export const groupInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: contentSlugSchema,
  description: z.string().trim().max(240)
});
export type GroupInput = z.infer<typeof groupInputSchema>;

export interface GroupReference {
  id: string;
  name: string;
  slug: string;
}

export interface SeriesPostLink {
  slug: string;
  title: string;
}

export interface SeriesNavigation {
  group: GroupReference;
  index: number;
  total: number;
  previous: SeriesPostLink | null;
  next: SeriesPostLink | null;
  posts: SeriesPostLink[];
}

export interface PostNavigation {
  previous: SeriesPostLink | null;
  next: SeriesPostLink | null;
}

export const siteSettingsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(320),
  authorName: z.string().trim().max(120),
  authorBio: z.string().trim().max(600),
  locale: z.string().trim().min(2).max(20),
  timezone: z.string().trim().min(1).max(80),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  defaultTheme: z.enum(["system", "light", "dark"]),
  showToc: z.boolean(),
  showReadingTime: z.boolean(),
  faviconMediaId: z.string().uuid().nullable(),
  nav: z.array(
    z.object({
      label: z.string().trim().min(1).max(40),
      href: z.string().trim().min(1).max(300)
    })
  ).max(10),
  social: z.array(
    z.object({
      label: z.string().trim().min(1).max(40),
      href: z.string().url().max(300)
    })
  ).max(10),
  seoImageUrl: z.string().url().or(z.literal(""))
});
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

export interface SiteSettings extends SiteSettingsInput {
  faviconUrl: string;
  updatedAt: string;
}

export const postInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: contentSlugSchema,
  excerpt: z.string().trim().max(500),
  contentMarkdown: z.string().max(500_000),
  coverUrl: z.string().url().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  groupId: z.string().uuid().nullable(),
  version: z.number().int().nonnegative()
});
export type PostInput = z.infer<typeof postInputSchema>;

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string;
  status: PostStatus;
  tags: string[];
  group: GroupReference | null;
  groupPosition: number | null;
  readingMinutes: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PostDetail extends PostSummary {
  contentMarkdown: string;
  contentHtml: string;
}

export interface PublicPostDetail extends PostDetail {
  seriesNavigation: SeriesNavigation | null;
  postNavigation: PostNavigation;
}

export interface GroupSummary extends GroupReference {
  description: string;
  sortOrder: number;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupDetail extends GroupSummary {
  posts: PostSummary[];
}

export interface PostRevision {
  id: string;
  postId: string;
  version: number;
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  reason: "manual" | "publish" | "unpublish" | "restore";
  createdAt: string;
}

export const videoProviderSchema = z.enum([
  "youtube",
  "bilibili",
  "vimeo",
  "direct"
]);
export type VideoProvider = z.infer<typeof videoProviderSchema>;

export type VideoPreview =
  | {
      kind: "iframe";
      url: string;
    }
  | {
      kind: "video";
      url: string;
      mimeType: "video/mp4" | "video/webm";
    };

export interface NormalizedVideoSource {
  provider: VideoProvider;
  providerKey: string;
  sourceUrl: string;
  preview: VideoPreview;
}

export function normalizeVideoSource(input: string): NormalizedVideoSource | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;

  url.hash = "";
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const youtubeHosts = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com"
  ]);
  let youtubeId: string | null = null;
  if (hostname === "youtu.be") {
    youtubeId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (youtubeHosts.has(hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") {
      youtubeId = url.searchParams.get("v");
    } else if (["shorts", "embed"].includes(parts[0] ?? "")) {
      youtubeId = parts[1] ?? null;
    }
  }
  if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
    return {
      provider: "youtube",
      providerKey: youtubeId,
      sourceUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      preview: {
        kind: "iframe",
        url: `https://www.youtube-nocookie.com/embed/${youtubeId}`
      }
    };
  }

  const bilibiliHosts = new Set([
    "bilibili.com",
    "www.bilibili.com",
    "m.bilibili.com",
    "player.bilibili.com"
  ]);
  if (bilibiliHosts.has(hostname)) {
    const pathMatch = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/i);
    const candidate = pathMatch?.[1] ?? url.searchParams.get("bvid");
    if (candidate && /^BV[0-9A-Za-z]{10}$/i.test(candidate)) {
      const bvid = `BV${candidate.slice(2)}`;
      return {
        provider: "bilibili",
        providerKey: bvid,
        sourceUrl: `https://www.bilibili.com/video/${bvid}`,
        preview: {
          kind: "iframe",
          url: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}`
        }
      };
    }
  }

  const vimeoHosts = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
  if (vimeoHosts.has(hostname)) {
    const vimeoId = [...url.pathname.matchAll(/(?:^|\/)(\d+)(?=\/|$)/g)].at(-1)?.[1];
    if (vimeoId && /^\d{1,20}$/.test(vimeoId)) {
      return {
        provider: "vimeo",
        providerKey: vimeoId,
        sourceUrl: `https://vimeo.com/${vimeoId}`,
        preview: {
          kind: "iframe",
          url: `https://player.vimeo.com/video/${vimeoId}`
        }
      };
    }
  }

  const directMatch = url.pathname.toLowerCase().match(/\.(mp4|webm)$/);
  if (directMatch) {
    const mimeType = directMatch[1] === "mp4" ? "video/mp4" : "video/webm";
    return {
      provider: "direct",
      providerKey: url.href,
      sourceUrl: url.href,
      preview: { kind: "video", url: url.href, mimeType }
    };
  }

  return null;
}

export const externalVideoInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    sourceUrl: z.string().trim().min(1).max(2048)
  })
  .superRefine(({ sourceUrl }, context) => {
    if (!normalizeVideoSource(sourceUrl)) {
      context.addIssue({
        code: "custom",
        message: "仅支持 YouTube、Bilibili、Vimeo 完整链接或 HTTPS MP4/WebM 直链",
        path: ["sourceUrl"]
      });
    }
  });
export type ExternalVideoInput = z.infer<typeof externalVideoInputSchema>;

export interface ImageMediaItem {
  kind: "image";
  id: string;
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  createdAt: string;
}

export interface VideoMediaItem {
  kind: "video";
  id: string;
  title: string;
  sourceUrl: string;
  provider: VideoProvider;
  preview: VideoPreview;
  createdAt: string;
}

export type MediaItem = ImageMediaItem | VideoMediaItem;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface SearchEntry {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  publishedAt: string;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
}

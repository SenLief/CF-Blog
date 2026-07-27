import { describe, expect, it } from "vitest";
import {
  ABOUT_PAGE_SLUG,
  contentSlugSchema,
  extractMemoTags,
  externalVideoInputSchema,
  groupInputSchema,
  isStandalonePageSlug,
  memoCreateSchema,
  memoInputSchema,
  normalizeVideoSource,
  postBulkActionSchema,
  postInputSchema,
  siteSettingsSchema,
  slugify
} from "../src";

describe("memo inputs", () => {
  it("defaults new memos to published and trims their content", () => {
    const result = memoCreateSchema.parse({ content: "  此刻有风。  " });

    expect(result).toEqual({
      content: "此刻有风。",
      tags: [],
      imageIds: [],
      videoUrls: [],
      status: "published"
    });
  });

  it("derives unique structured tags from inline #tags", () => {
    const result = memoCreateSchema.parse({
      content: "今天在写 #Cloudflare，也记录 #生活。再次出现 #cloudflare 不应重复。",
      tags: ["不会采用这个字段"]
    });

    expect(result.tags).toEqual(["Cloudflare", "生活"]);
    expect(extractMemoTags("foo#anchor 与 ##标题 不算，#正常标签 可以")).toEqual([
      "正常标签"
    ]);
  });

  it("accepts structured tags and attachments with a concurrency version", () => {
    expect(
      memoInputSchema.safeParse({
        content: "更新后的短文",
        tags: ["生活", "此刻"],
        imageIds: [],
        videoUrls: ["https://vimeo.com/76979871"],
        status: "draft",
        isPinned: true,
        version: 2
      }).success
    ).toBe(true);
    expect(
      memoCreateSchema.safeParse({
        content: "",
        imageIds: ["019f7e83-5ad4-7c51-88ba-7f97381ad81f"]
      }).success
    ).toBe(true);
  });

  it("rejects empty memos, duplicate tags, and unsupported videos", () => {
    expect(
      memoInputSchema.safeParse({
        content: "   ",
        tags: [],
        imageIds: [],
        videoUrls: [],
        status: "published",
        isPinned: false,
        version: 0
      }).success
    ).toBe(false);
    expect(
      memoCreateSchema.safeParse({
        content: "正文",
        tags: ["生活", "生活"]
      }).success
    ).toBe(false);
    expect(
      memoCreateSchema.safeParse({
        content: "正文",
        videoUrls: ["https://example.com/watch/123"]
      }).success
    ).toBe(false);
  });
});

describe("post slugs", () => {
  it("creates stable slugs for mixed Chinese and Latin titles", () => {
    expect(slugify("Cloudflare 上的第一篇文章")).toBe(
      "cloudflare-上的第一篇文章"
    );
  });

  it("accepts the slugs generated from Chinese titles", () => {
    const result = postInputSchema.safeParse({
      title: "端到端验证",
      slug: slugify("端到端验证"),
      excerpt: "",
      contentMarkdown: "# 正文",
      coverUrl: "",
      tags: ["验证"],
      groupId: null,
      version: 0
    });

    expect(result.success).toBe(true);
  });

  it("does not leave a trailing separator when a long slug is truncated", () => {
    const slug = slugify(`${"a".repeat(179)} title`);

    expect(slug.endsWith("-")).toBe(false);
    expect(contentSlugSchema.safeParse(slug).success).toBe(true);
  });

  it("recognizes the about article as a standalone page", () => {
    expect(ABOUT_PAGE_SLUG).toBe("about");
    expect(isStandalonePageSlug("about")).toBe(true);
    expect(isStandalonePageSlug("/ABOUT/")).toBe(true);
    expect(isStandalonePageSlug("about-cloudflare")).toBe(false);
  });
});

describe("group inputs", () => {
  it("accepts a lightweight series definition", () => {
    const result = groupInputSchema.safeParse({
      name: "读书笔记",
      slug: "reading-notes",
      description: "关于阅读、摘录与延伸思考。"
    });

    expect(result.success).toBe(true);
  });

  it("rejects descriptions longer than one short paragraph", () => {
    const result = groupInputSchema.safeParse({
      name: "旅行手记",
      slug: "travel-notes",
      description: "旅".repeat(241)
    });

    expect(result.success).toBe(false);
  });
});

describe("bulk post actions", () => {
  it("accepts up to 100 unique article ids", () => {
    const result = postBulkActionSchema.safeParse({
      action: "archive",
      postIds: Array.from({ length: 100 }, (_, index) => `post-${index}`)
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty, duplicate, and oversized selections", () => {
    expect(
      postBulkActionSchema.safeParse({ action: "delete", postIds: [] }).success
    ).toBe(false);
    expect(
      postBulkActionSchema.safeParse({
        action: "draft",
        postIds: ["post-1", "post-1"]
      }).success
    ).toBe(false);
    expect(
      postBulkActionSchema.safeParse({
        action: "publish",
        postIds: Array.from({ length: 101 }, (_, index) => `post-${index}`)
      }).success
    ).toBe(false);
  });
});

describe("site settings", () => {
  const settings = {
    title: "纸上",
    description: "",
    authorName: "",
    authorBio: "",
    locale: "zh-CN",
    timezone: "Asia/Shanghai",
    accent: "#1d4ed8",
    defaultTheme: "system" as const,
    showToc: true,
    showReadingTime: true,
    enableMemos: true,
    memoDescription: "一些轻量、即时的记录。",
    faviconMediaId: null,
    nav: [],
    social: [],
    seoImageUrl: ""
  };

  it("accepts an empty or media-backed website icon", () => {
    expect(siteSettingsSchema.safeParse(settings).success).toBe(true);
    expect(
      siteSettingsSchema.safeParse({
        ...settings,
        faviconMediaId: "019f7e83-5ad4-7c51-88ba-7f97381ad81f"
      }).success
    ).toBe(true);
  });
});

describe("external video sources", () => {
  it("normalizes supported platform and direct video links", () => {
    expect(normalizeVideoSource("https://youtu.be/M7lc1UVf-VE")?.preview).toEqual({
      kind: "iframe",
      url: "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"
    });
    expect(
      normalizeVideoSource("https://www.bilibili.com/video/BV1B7411m7LV")?.providerKey
    ).toBe("BV1B7411m7LV");
    expect(normalizeVideoSource("https://vimeo.com/76979871")?.preview).toEqual({
      kind: "iframe",
      url: "https://player.vimeo.com/video/76979871"
    });
    expect(
      normalizeVideoSource("https://media.example.com/demo.webm?token=abc")?.preview
    ).toEqual({
      kind: "video",
      url: "https://media.example.com/demo.webm?token=abc",
      mimeType: "video/webm"
    });
  });

  it("rejects unsafe, shortened, and unsupported links", () => {
    expect(normalizeVideoSource("javascript:alert(1)")).toBeNull();
    expect(normalizeVideoSource("http://media.example.com/demo.mp4")).toBeNull();
    expect(normalizeVideoSource("https://b23.tv/example")).toBeNull();
    expect(normalizeVideoSource("https://example.com/watch/123")).toBeNull();
  });

  it("validates the manually entered video title and URL", () => {
    expect(
      externalVideoInputSchema.safeParse({
        title: "  示例视频  ",
        sourceUrl: "https://vimeo.com/76979871"
      }).success
    ).toBe(true);
    expect(
      externalVideoInputSchema.safeParse({
        title: "示例视频",
        sourceUrl: "https://example.com/page"
      }).success
    ).toBe(false);
  });
});

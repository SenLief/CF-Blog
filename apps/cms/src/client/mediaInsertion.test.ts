import type { ImageMediaItem, VideoMediaItem } from "@cf-blog/contracts";
import { describe, expect, it } from "vitest";
import { insertMarkdownBlock, mediaMarkdown } from "./mediaInsertion";

const image: ImageMediaItem = {
  kind: "image",
  id: "image-1",
  key: "2026-07/image.jpg",
  url: "https://blog.example/media/2026-07/image.jpg",
  filename: "image.jpg",
  mimeType: "image/jpeg",
  bytes: 1024,
  width: 800,
  height: 600,
  alt: "示例图片",
  createdAt: "2026-07-21T00:00:00.000Z"
};

const video: VideoMediaItem = {
  kind: "video",
  id: "video-1",
  title: "演示视频",
  sourceUrl: "https://vimeo.com/76979871",
  provider: "vimeo",
  preview: { kind: "iframe", url: "https://player.vimeo.com/video/76979871" },
  createdAt: "2026-07-21T00:00:00.000Z"
};

describe("media markdown insertion", () => {
  it("creates canonical image and video markdown", () => {
    expect(mediaMarkdown(image)).toBe(
      "![示例图片](https://blog.example/media/2026-07/image.jpg)"
    );
    expect(mediaMarkdown(video)).toBe(
      "[video: 演示视频](https://vimeo.com/76979871)"
    );
  });

  it("inserts at the start, middle, and end as a standalone block", () => {
    expect(insertMarkdownBlock("正文", 0, 0, "素材").value).toBe("素材\n\n正文");
    expect(insertMarkdownBlock("第一段\n第二段", 4, 4, "素材").value).toBe(
      "第一段\n\n素材\n\n第二段"
    );
    expect(insertMarkdownBlock("正文", 2, 2, "素材").value).toBe("正文\n\n素材");
  });

  it("replaces a selection and leaves the caret after the inserted block", () => {
    const result = insertMarkdownBlock("开头旧内容结尾", 2, 5, "素材");
    expect(result.value).toBe("开头\n\n素材\n\n结尾");
    expect(result.selectionStart).toBe(result.selectionEnd);
    expect(result.selectionStart).toBe("开头\n\n素材\n\n".length);
  });
});

import { describe, expect, it } from "vitest";
import { calculateReadingMinutes, renderMarkdown } from "../src/index";

describe("renderMarkdown", () => {
  it("renders GFM while removing active HTML", async () => {
    const result = await renderMarkdown("# Hello\n\n<script>alert(1)</script>\n\n- [x] safe");
    expect(result.html).toContain("<h2");
    expect(result.html).toContain("safe");
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("alert(1)");
  });

  it("creates stable reading estimates for Chinese text", () => {
    expect(calculateReadingMinutes("中".repeat(401))).toBe(2);
  });

  it("keeps heading anchors aligned with sanitized ids", async () => {
    const result = await renderMarkdown("## 第二节");

    expect(result.html).toContain('id="user-content-第二节"');
    expect(result.html).toContain('href="#user-content-第二节"');
  });

  it("reserves the document h1 for the article title", async () => {
    const result = await renderMarkdown("# 正文标题");

    expect(result.html).not.toContain("<h1");
    expect(result.html).toContain("<h2");
  });

  it("renders a standalone video link as a sanitized player", async () => {
    const result = await renderMarkdown(
      "[video: 演示视频](https://youtu.be/M7lc1UVf-VE)"
    );

    expect(result.html).toContain('<figure class="video-embed">');
    expect(result.html).toContain("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE");
    expect(result.html).toContain("<iframe");
    expect(result.html).toContain("打开原视频");
  });

  it("renders HTTPS MP4 links with the native video player", async () => {
    const result = await renderMarkdown(
      "[video: 直链视频](https://media.example.com/demo.mp4)"
    );

    expect(result.html).toContain("<video");
    expect(result.html).toContain('controls');
    expect(result.html).toContain('preload="metadata"');
    expect(result.html).toContain('src="https://media.example.com/demo.mp4"');
  });

  it("keeps inline or unsupported video labels as ordinary safe links", async () => {
    const inline = await renderMarkdown(
      "文字 [video: 演示](https://youtu.be/M7lc1UVf-VE) 文字"
    );
    const unsupported = await renderMarkdown(
      "[video: 未知](https://example.com/watch/123)"
    );
    const rawIframe = await renderMarkdown(
      '<iframe src="https://evil.example"></iframe>'
    );

    expect(inline.html).not.toContain("<iframe");
    expect(inline.html).toContain("<a href=");
    expect(unsupported.html).not.toContain("<iframe");
    expect(rawIframe.html).not.toContain("<iframe");
  });
});

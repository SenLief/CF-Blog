import { describe, expect, it } from "vitest";
import { slugAfterTitleChange } from "./postSlug";

describe("slugAfterTitleChange", () => {
  it("keeps the temporary slug until a title contains usable characters", () => {
    const temporarySlug = "untitled-1234abcd";
    const punctuationOnly = slugAfterTitleChange({
      currentSlug: temporarySlug,
      currentTitle: "未命名文章",
      nextTitle: "《",
      status: "draft"
    });
    const completed = slugAfterTitleChange({
      currentSlug: punctuationOnly,
      currentTitle: "《",
      nextTitle: "《中文标题》",
      status: "draft"
    });

    expect(punctuationOnly).toBe(temporarySlug);
    expect(completed).toBe("中文标题");
  });

  it("continues following the title after the first keystroke", () => {
    expect(
      slugAfterTitleChange({
        currentSlug: "中文",
        currentTitle: "中文",
        nextTitle: "中文标题",
        status: "draft"
      })
    ).toBe("中文标题");
  });

  it("preserves customized and published slugs", () => {
    expect(
      slugAfterTitleChange({
        currentSlug: "custom-address",
        currentTitle: "旧标题",
        nextTitle: "新标题",
        status: "draft"
      })
    ).toBe("custom-address");
    expect(
      slugAfterTitleChange({
        currentSlug: "published-address",
        currentTitle: "旧标题",
        nextTitle: "新标题",
        status: "published"
      })
    ).toBe("published-address");
  });
});

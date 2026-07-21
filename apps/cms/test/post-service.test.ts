import type { PostDetail } from "@cf-blog/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRevision: vi.fn(),
  getGroupById: vi.fn(),
  getPostById: vi.fn(),
  prepareGroupPositionCompaction: vi.fn(),
  syncTags: vi.fn()
}));

vi.mock("../src/worker/db", () => mocks);

import {
  changePostStatus,
  deletePost
} from "../src/worker/post-service";

const POST_ID = "dbe67962-84f4-44b4-81a7-a81fecf5ac30";

function makePost(overrides: Partial<PostDetail> = {}): PostDetail {
  return {
    id: POST_ID,
    slug: "service-test",
    title: "服务测试",
    excerpt: "",
    contentMarkdown: "正文",
    contentHtml: "<p>正文</p>",
    coverUrl: "",
    status: "draft",
    tags: [],
    group: null,
    groupPosition: null,
    readingMinutes: 1,
    publishedAt: null,
    createdAt: "2026-07-21T08:00:00.000Z",
    updatedAt: "2026-07-21T08:00:00.000Z",
    version: 2,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("post service concurrency and validation", () => {
  it("returns a structured version conflict before a write", async () => {
    mocks.getPostById.mockResolvedValue(makePost({ version: 3 }));

    await expect(
      changePostStatus({} as D1Database, POST_ID, 2, "publish")
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
      details: { serverVersion: 3 }
    });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("blocks incomplete posts and images without alt text", async () => {
    mocks.getPostById.mockResolvedValueOnce(
      makePost({ contentMarkdown: "" })
    );
    await expect(
      changePostStatus({} as D1Database, POST_ID, 2, "publish")
    ).rejects.toMatchObject({ code: "POST_INCOMPLETE", status: 422 });

    mocks.getPostById.mockResolvedValueOnce(
      makePost({ contentMarkdown: "正文\n\n![](https://example.com/a.png)" })
    );
    await expect(
      changePostStatus({} as D1Database, POST_ID, 2, "publish")
    ).rejects.toMatchObject({ code: "IMAGE_ALT_REQUIRED", status: 422 });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("accepts D1 delete counts that include cascading rows", async () => {
    const statement = {
      bind: vi.fn(),
      run: vi.fn().mockResolvedValue({ meta: { changes: 4 } })
    };
    statement.bind.mockReturnValue(statement);
    const db = {
      prepare: vi.fn().mockReturnValue(statement)
    } as unknown as D1Database;
    mocks.getPostById.mockResolvedValue(makePost());

    await expect(deletePost(db, POST_ID, 2, "服务测试")).resolves.toEqual({
      id: POST_ID,
      title: "服务测试",
      deleted: true
    });
  });
});

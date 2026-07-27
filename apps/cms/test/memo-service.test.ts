import type { Memo } from "@cf-blog/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createMemo,
  deleteMemo,
  updateMemo
} from "../src/worker/memo-service";

const MEMO_ID = "80b52b6d-6a29-46d0-a11d-9fcebb2d76e3";
const NOW = "2026-07-27T08:00:00.000Z";
const MEDIA_BASE_URL = "https://media.example.com";

function memoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMO_ID,
    content_markdown: "一条短文",
    status: "published",
    is_pinned: 0,
    video_json: "[]",
    version: 0,
    published_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...overrides
  };
}

function statement(options: {
  first?: unknown;
  results?: unknown[];
  changes?: number;
} = {}) {
  const value = {
    bind: vi.fn(),
    first: vi.fn().mockResolvedValue(options.first ?? null),
    all: vi.fn().mockResolvedValue({ results: options.results ?? [] }),
    run: vi.fn().mockResolvedValue({ meta: { changes: options.changes ?? 1 } })
  };
  value.bind.mockReturnValue(value);
  return value;
}

describe("memo service", () => {
  it("stores memo content as escaped plain text instead of Markdown HTML", async () => {
    const insert = statement();
    const select = statement({
      first: memoRow({ content_markdown: "<b>纯文本</b>" })
    });
    const relations = statement({ results: [] });
    const db = {
      prepare: vi.fn((query: string) => {
        if (query.includes("INSERT INTO memos")) return insert;
        if (query.includes("FROM memo_tags") || query.includes("FROM memo_images")) {
          return relations;
        }
        return select;
      }),
      batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }])
    } as unknown as D1Database;

    const created = await createMemo(db, MEDIA_BASE_URL, {
      content: "<b>纯文本</b>",
      tags: [],
      imageIds: [],
      videoUrls: [],
      status: "published"
    });

    expect(insert.bind).toHaveBeenCalledWith(
      expect.any(String),
      "<b>纯文本</b>",
      "<p>&lt;b&gt;纯文本&lt;/b&gt;</p>",
      "<b>纯文本</b>",
      "published",
      "[]",
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
    expect(created).toMatchObject<Partial<Memo>>({
      content: "<b>纯文本</b>",
      tags: [],
      images: [],
      videos: [],
      status: "published",
      version: 0
    });
  });

  it("rejects a stale edit before writing relationships", async () => {
    const select = statement({ first: memoRow({ version: 3 }) });
    const relations = statement({ results: [] });
    const db = {
      prepare: vi.fn((query: string) =>
        query.includes("FROM memo_tags") || query.includes("FROM memo_images")
          ? relations
          : select
      ),
      batch: vi.fn()
    } as unknown as D1Database;

    await expect(
      updateMemo(db, MEMO_ID, MEDIA_BASE_URL, {
        content: "过期修改",
        tags: [],
        imageIds: [],
        videoUrls: [],
        status: "published",
        isPinned: false,
        version: 2
      })
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
      details: { serverVersion: 3 }
    });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("deletes the current memo without rejecting a stale client version", async () => {
    const deletion = statement({ changes: 1 });
    const db = {
      prepare: vi.fn().mockReturnValue(deletion)
    } as unknown as D1Database;

    await deleteMemo(db, MEMO_ID);

    expect(db.prepare).toHaveBeenCalledWith("DELETE FROM memos WHERE id = ?");
    expect(deletion.bind).toHaveBeenCalledWith(MEMO_ID);
  });
});

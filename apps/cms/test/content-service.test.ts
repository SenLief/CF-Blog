import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSiteSettings, listMemos, listPosts } = vi.hoisted(() => ({
  getSiteSettings: vi.fn(),
  listMemos: vi.fn(),
  listPosts: vi.fn()
}));

vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class {
    constructor(_ctx: ExecutionContext, readonly env: Env) {}
  }
}));
vi.mock("../src/worker/db", () => ({ getSiteSettings, listPosts }));
vi.mock("../src/worker/memo-service", () => ({ listMemos }));

import { ContentService } from "../src/worker/content-service";

const mediaBaseUrl = "https://blog.example/media";
const db = {} as D1Database;
const worker = new ContentService({} as ExecutionContext, {
  DB: db,
  MEDIA_BASE_URL: mediaBaseUrl
} as Env);

function get(path: string) {
  return worker.fetch(new Request(`https://cms.internal${path}`));
}

beforeEach(() => vi.resetAllMocks());

describe("public content service", () => {
  it("loads site settings and the memo page in the same request", async () => {
    const site = { enableMemos: true, title: "博客" };
    const memos = [{ id: "memo-1" }];
    getSiteSettings.mockResolvedValue(site);
    listMemos.mockResolvedValue(memos);

    const response = await get("/memo-page?limit=21&offset=20&tag=life");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ site, memos });
    expect(getSiteSettings).toHaveBeenCalledExactlyOnceWith(db, mediaBaseUrl);
    expect(listMemos).toHaveBeenCalledExactlyOnceWith(db, mediaBaseUrl, {
      status: "published",
      limit: 21,
      offset: 20,
      tag: "life"
    });
    expect(await (await get("/memos")).json()).toEqual(memos);
  });

  it("skips querying memos when the feature is disabled", async () => {
    getSiteSettings.mockResolvedValue({ enableMemos: false });

    expect((await get("/memo-page")).status).toBe(404);
    expect((await get("/memos")).status).toBe(404);
    expect(listMemos).not.toHaveBeenCalled();
  });

  it("limits feed queries while preserving the default archive size", async () => {
    listPosts.mockResolvedValue([]);

    expect((await get("/archive?limit=50")).status).toBe(200);
    expect((await get("/archive")).status).toBe(200);
    expect((await get("/posts?limit=6&offset=5")).status).toBe(200);

    const options = { status: "published", excludeStandalonePages: true };
    expect(listPosts.mock.calls).toEqual([
      [db, { ...options, limit: 50, offset: 0 }],
      [db, { ...options, limit: 500, offset: 0 }],
      [db, { ...options, limit: 6, offset: 5 }]
    ]);
  });
});

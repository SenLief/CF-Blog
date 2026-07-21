import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class WorkerEntrypoint {}
}));
vi.mock("agents/mcp", () => ({ createMcpHandler: vi.fn() }));

import app from "../src/worker/index";
import { listMedia } from "../src/worker/db";

type ImageRow = {
  id: string;
  object_key: string;
  filename: string;
  mime_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  created_at: string;
};

type VideoRow = {
  id: string;
  title: string;
  source_url: string;
  provider: string;
  provider_key: string;
  created_at: string;
};

class FakeStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: FakeDatabase,
    private readonly sql: string
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("FROM external_videos WHERE source_url")) {
      const video = [...this.database.videos.values()].find(
        (item) => item.source_url === this.values[0]
      );
      return (video ? { id: video.id } : null) as T | null;
    }
    if (this.sql.includes("FROM external_videos WHERE id")) {
      const video = this.database.videos.get(String(this.values[0]));
      return (video ? { id: video.id } : null) as T | null;
    }
    if (this.sql.includes("SELECT object_key FROM media WHERE id")) {
      const image = this.database.images.get(String(this.values[0]));
      return (image ? { object_key: image.object_key } : null) as T | null;
    }
    if (this.sql.includes("FROM site_settings")) {
      return (this.database.faviconMediaId === this.values[0]
        ? { id: 1 }
        : null) as T | null;
    }
    if (this.sql.includes("FROM posts")) {
      return (this.database.referencedObjectKeys.has(
        String(this.values[0]).replaceAll("%", "")
      )
        ? { id: "referencing-post" }
        : null) as T | null;
    }
    throw new Error(`Unexpected first query: ${this.sql}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes("SELECT * FROM media")) {
      return { results: [...this.database.images.values()] as T[] };
    }
    if (this.sql.includes("SELECT * FROM external_videos")) {
      return { results: [...this.database.videos.values()] as T[] };
    }
    throw new Error(`Unexpected all query: ${this.sql}`);
  }

  async run(): Promise<{ meta: { changes: number } }> {
    if (this.sql.includes("INSERT INTO external_videos")) {
      const [id, title, sourceUrl, provider, providerKey, createdAt] = this.values;
      this.database.videos.set(String(id), {
        id: String(id),
        title: String(title),
        source_url: String(sourceUrl),
        provider: String(provider),
        provider_key: String(providerKey),
        created_at: String(createdAt)
      });
      return { meta: { changes: 1 } };
    }
    if (this.sql.includes("DELETE FROM external_videos")) {
      return {
        meta: {
          changes: this.database.videos.delete(String(this.values[0])) ? 1 : 0
        }
      };
    }
    if (this.sql.includes("DELETE FROM media")) {
      return {
        meta: {
          changes: this.database.images.delete(String(this.values[0])) ? 1 : 0
        }
      };
    }
    throw new Error(`Unexpected run query: ${this.sql}`);
  }
}

class FakeDatabase {
  readonly images = new Map<string, ImageRow>();
  readonly videos = new Map<string, VideoRow>();
  readonly referencedObjectKeys = new Set<string>();
  faviconMediaId: string | null = null;

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

function createEnvironment() {
  const database = new FakeDatabase();
  const r2Operations: string[] = [];
  const media = {
    delete: async () => {
      r2Operations.push("delete");
    },
    put: async () => {
      r2Operations.push("put");
    }
  };
  const environment = {
    DB: database,
    MEDIA: media,
    ENVIRONMENT: "development",
    BLOG_URL: "http://localhost:4321",
    MEDIA_BASE_URL: "http://localhost:4321/media"
  };
  return { database, environment, r2Operations };
}

function apiRequest(
  environment: ReturnType<typeof createEnvironment>["environment"],
  path: string,
  init: RequestInit
) {
  return app.request(
    `http://localhost${path}`,
    {
      ...init,
      headers: {
        Origin: "http://localhost",
        ...init.headers
      }
    },
    environment as unknown as Env
  );
}

describe("media worker API", () => {
  it("creates normalized videos, rejects duplicates, and never writes to R2", async () => {
    const { database, environment, r2Operations } = createEnvironment();
    const create = await apiRequest(environment, "/api/media/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "演示视频",
        sourceUrl: "https://youtu.be/M7lc1UVf-VE"
      })
    });

    expect(create.status).toBe(201);
    expect(await create.json()).toMatchObject({
      kind: "video",
      title: "演示视频",
      sourceUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
      provider: "youtube"
    });
    expect(database.videos.size).toBe(1);
    expect(r2Operations).toEqual([]);

    const duplicate = await apiRequest(environment, "/api/media/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "重复链接",
        sourceUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE"
      })
    });

    expect(duplicate.status).toBe(409);
    expect(database.videos.size).toBe(1);
    expect(r2Operations).toEqual([]);
  });

  it("rejects unsupported video pages without touching D1 or R2", async () => {
    const { database, environment, r2Operations } = createEnvironment();
    const response = await apiRequest(environment, "/api/media/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "未知平台",
        sourceUrl: "https://example.com/watch/123"
      })
    });

    expect(response.status).toBe(400);
    expect(database.videos.size).toBe(0);
    expect(r2Operations).toEqual([]);
  });

  it("deletes video records without deleting an R2 object", async () => {
    const { database, environment, r2Operations } = createEnvironment();
    database.videos.set("video-1", {
      id: "video-1",
      title: "演示视频",
      source_url: "https://vimeo.com/76979871",
      provider: "vimeo",
      provider_key: "76979871",
      created_at: "2026-07-21T03:00:00.000Z"
    });

    const response = await apiRequest(environment, "/api/media/video-1", {
      method: "DELETE"
    });

    expect(response.status).toBe(204);
    expect(database.videos.size).toBe(0);
    expect(r2Operations).toEqual([]);
  });

  it("keeps referenced images and deletes unreferenced image objects", async () => {
    const { database, environment, r2Operations } = createEnvironment();
    database.images.set("image-1", {
      id: "image-1",
      object_key: "2026-07/image-1.webp",
      filename: "image.webp",
      mime_type: "image/webp",
      bytes: 128,
      width: 16,
      height: 9,
      alt: "演示图",
      created_at: "2026-07-21T02:00:00.000Z"
    });
    database.referencedObjectKeys.add("2026-07/image-1.webp");

    const blocked = await apiRequest(environment, "/api/media/image-1", {
      method: "DELETE"
    });
    expect(blocked.status).toBe(409);
    expect(database.images.has("image-1")).toBe(true);
    expect(r2Operations).toEqual([]);

    database.referencedObjectKeys.clear();
    const deleted = await apiRequest(environment, "/api/media/image-1", {
      method: "DELETE"
    });
    expect(deleted.status).toBe(204);
    expect(database.images.has("image-1")).toBe(false);
    expect(r2Operations).toEqual(["delete"]);
  });

  it("returns images and videos in one descending timeline", async () => {
    const { database, environment } = createEnvironment();
    database.images.set("image-1", {
      id: "image-1",
      object_key: "2026-07/image-1.webp",
      filename: "image.webp",
      mime_type: "image/webp",
      bytes: 128,
      width: 16,
      height: 9,
      alt: "演示图",
      created_at: "2026-07-21T02:00:00.000Z"
    });
    database.videos.set("video-1", {
      id: "video-1",
      title: "演示视频",
      source_url: "https://vimeo.com/76979871",
      provider: "vimeo",
      provider_key: "76979871",
      created_at: "2026-07-21T03:00:00.000Z"
    });

    const items = await listMedia(
      database as unknown as D1Database,
      environment.MEDIA_BASE_URL
    );

    expect(items.map((item) => item.kind)).toEqual(["video", "image"]);
    expect(items[0]).toMatchObject({
      kind: "video",
      sourceUrl: "https://vimeo.com/76979871"
    });
    expect(items[1]).toMatchObject({
      kind: "image",
      url: "http://localhost:4321/media/2026-07/image-1.webp"
    });
  });
});

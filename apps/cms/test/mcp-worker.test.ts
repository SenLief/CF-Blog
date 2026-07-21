import type { PostDetail, PostInput } from "@cf-blog/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("agents/mcp", () => ({ createMcpHandler: vi.fn() }));

const mocks = vi.hoisted(() => ({
  changePostStatus: vi.fn(),
  createDraft: vi.fn(),
  deletePost: vi.fn(),
  getPostById: vi.fn(),
  getPostBySlug: vi.fn(),
  listPosts: vi.fn(),
  updatePost: vi.fn()
}));

vi.mock("../src/worker/db", () => ({
  getPostById: mocks.getPostById,
  getPostBySlug: mocks.getPostBySlug,
  listPosts: mocks.listPosts
}));

vi.mock("../src/worker/post-service", () => ({
  changePostStatus: mocks.changePostStatus,
  createDraft: mocks.createDraft,
  deletePost: mocks.deletePost,
  updatePost: mocks.updatePost
}));

import { AppError } from "../src/worker/http";
import { createBlogMcpServer } from "../src/worker/mcp";

const POST_ID = "926a73a9-9432-4d52-8073-76f057929cb0";
const NOW = "2026-07-21T08:00:00.000Z";

let currentPost: PostDetail | null;
const openClients: Client[] = [];
const openServers: McpServer[] = [];

function makePost(overrides: Partial<PostDetail> = {}): PostDetail {
  return {
    id: POST_ID,
    slug: "mcp-draft",
    title: "MCP 草稿",
    excerpt: "摘要",
    coverUrl: "",
    status: "draft",
    tags: ["mcp"],
    group: null,
    groupPosition: null,
    readingMinutes: 1,
    publishedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    version: 0,
    contentMarkdown: "初始正文",
    contentHtml: "<p>初始正文</p>",
    ...overrides
  };
}

function requireCurrentPost(): PostDetail {
  if (!currentPost) {
    throw new AppError(404, "POST_NOT_FOUND", "找不到文章");
  }
  return currentPost;
}

function assertVersion(expectedVersion: number): PostDetail {
  const post = requireCurrentPost();
  if (post.version !== expectedVersion) {
    throw new AppError(409, "VERSION_CONFLICT", "文章已在其他页面中更新", {
      serverVersion: post.version
    });
  }
  return post;
}

async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createBlogMcpServer({
    db: {} as D1Database,
    actor: "codex-service-token"
  });
  const client = new Client({ name: "cf-blog-test", version: "1.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
  openClients.push(client);
  openServers.push(server);
  return client;
}

function structuredData(result: Awaited<ReturnType<Client["callTool"]>>) {
  return (result.structuredContent as { data?: unknown; error?: unknown }) ?? {};
}

beforeEach(() => {
  currentPost = null;
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  mocks.listPosts.mockImplementation(async () =>
    currentPost
      ? [
          {
            ...currentPost,
            contentMarkdown: undefined,
            contentHtml: undefined
          }
        ]
      : []
  );
  mocks.getPostById.mockImplementation(async (_db, id: string) =>
    currentPost?.id === id ? currentPost : null
  );
  mocks.getPostBySlug.mockImplementation(async (_db, slug: string) =>
    currentPost?.slug === slug ? currentPost : null
  );
  mocks.createDraft.mockImplementation(async (_db, input) => {
    if (currentPost?.slug === input.slug) {
      throw new AppError(409, "SLUG_CONFLICT", "该 slug 已被其他文章使用");
    }
    currentPost = makePost({
      title: input.title,
      slug: input.slug ?? "mcp-draft",
      excerpt: input.excerpt ?? "",
      contentMarkdown: input.contentMarkdown ?? "",
      tags: input.tags ?? []
    });
    return currentPost;
  });
  mocks.updatePost.mockImplementation(
    async (_db, _id: string, input: PostInput) => {
      const post = assertVersion(input.version);
      currentPost = {
        ...post,
        ...input,
        group: post.group,
        version: post.version + 1,
        updatedAt: NOW
      };
      return currentPost;
    }
  );
  mocks.changePostStatus.mockImplementation(
    async (_db, _id: string, expectedVersion: number, action: string) => {
      const post = assertVersion(expectedVersion);
      const status =
        action === "publish"
          ? "published"
          : action === "unpublish"
            ? "draft"
            : "archived";
      currentPost = {
        ...post,
        status,
        publishedAt: status === "published" ? NOW : post.publishedAt,
        version: post.version + 1,
        updatedAt: NOW
      };
      return currentPost;
    }
  );
  mocks.deletePost.mockImplementation(
    async (_db, _id: string, expectedVersion: number, confirmTitle: string) => {
      const post = assertVersion(expectedVersion);
      if (post.title !== confirmTitle) {
        throw new AppError(
          422,
          "POST_TITLE_MISMATCH",
          "确认标题与当前文章标题不一致"
        );
      }
      currentPost = null;
      return { id: post.id, title: post.title, deleted: true };
    }
  );
});

afterEach(async () => {
  await Promise.all([
    ...openClients.splice(0).map((client) => client.close()),
    ...openServers.splice(0).map((server) => server.close())
  ]);
  vi.restoreAllMocks();
});

describe("stateless blog MCP", () => {
  it("initializes and discovers the six annotated tools", async () => {
    const client = await connectClient();
    const result = await client.listTools();

    expect(result.tools.map((tool) => tool.name)).toEqual([
      "search_posts",
      "get_post",
      "create_draft",
      "update_post",
      "change_post_status",
      "delete_post"
    ]);
    expect(
      result.tools.find((tool) => tool.name === "get_post")?.annotations
    ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(
      result.tools.find((tool) => tool.name === "delete_post")?.annotations
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("validates mutually exclusive post locators", async () => {
    const client = await connectClient();

    const missingLocator = await client.callTool({
      name: "get_post",
      arguments: {}
    });
    const duplicateLocator = await client.callTool({
      name: "get_post",
      arguments: { postId: POST_ID, slug: "mcp-draft" }
    });

    expect(missingLocator).toMatchObject({ isError: true });
    expect(missingLocator.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("postId 和 slug 必须且只能提供一个")
        })
      ])
    );
    expect(duplicateLocator).toMatchObject({ isError: true });
    expect(duplicateLocator.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("postId 和 slug 必须且只能提供一个")
        })
      ])
    );
  });

  it("returns structured version conflicts", async () => {
    currentPost = makePost({ version: 3 });
    const client = await connectClient();
    const result = await client.callTool({
      name: "update_post",
      arguments: {
        postId: POST_ID,
        expectedVersion: 2,
        editableFields: {
          title: "MCP 草稿",
          slug: "mcp-draft",
          excerpt: "摘要",
          contentMarkdown: "正文",
          coverUrl: "",
          tags: ["mcp"]
        }
      }
    });

    expect(result.isError).toBe(true);
    expect(structuredData(result)).toEqual({
      error: {
        code: "VERSION_CONFLICT",
        message: "文章已在其他页面中更新",
        details: { serverVersion: 3 }
      }
    });
  });

  it("supports a stateless create, update, publish, read, and delete flow", async () => {
    const client = await connectClient();
    const created = await client.callTool({
      name: "create_draft",
      arguments: {
        title: "MCP 草稿",
        slug: "mcp-draft",
        contentMarkdown: "初始正文",
        tags: ["mcp"]
      }
    });
    expect(structuredData(created)).toMatchObject({
      data: { id: POST_ID, status: "draft", version: 0 }
    });

    const updated = await client.callTool({
      name: "update_post",
      arguments: {
        postId: POST_ID,
        expectedVersion: 0,
        editableFields: {
          title: "MCP 草稿（已修改）",
          slug: "mcp-draft",
          excerpt: "新摘要",
          contentMarkdown: "修改后的正文",
          coverUrl: "",
          tags: ["mcp", "codex"]
        }
      }
    });
    expect(structuredData(updated)).toMatchObject({
      data: { title: "MCP 草稿（已修改）", version: 1 }
    });

    const published = await client.callTool({
      name: "change_post_status",
      arguments: {
        postId: POST_ID,
        expectedVersion: 1,
        action: "publish"
      }
    });
    expect(structuredData(published)).toMatchObject({
      data: { status: "published", version: 2 }
    });

    const read = await client.callTool({
      name: "get_post",
      arguments: { slug: "mcp-draft" }
    });
    expect(structuredData(read)).toMatchObject({
      data: {
        contentMarkdown: "修改后的正文",
        status: "published",
        version: 2
      }
    });

    const rejectedDelete = await client.callTool({
      name: "delete_post",
      arguments: {
        postId: POST_ID,
        expectedVersion: 2,
        confirmTitle: "错误标题"
      }
    });
    expect(structuredData(rejectedDelete)).toMatchObject({
      error: { code: "POST_TITLE_MISMATCH" }
    });

    const deleted = await client.callTool({
      name: "delete_post",
      arguments: {
        postId: POST_ID,
        expectedVersion: 2,
        confirmTitle: "MCP 草稿（已修改）"
      }
    });
    expect(structuredData(deleted)).toMatchObject({
      data: { id: POST_ID, deleted: true }
    });
  });

  it("publishes a newly created article with the default version", async () => {
    const client = await connectClient();
    const created = await client.callTool({
      name: "create_draft",
      arguments: {
        title: "直接发布草稿",
        slug: "direct-publish-draft",
        contentMarkdown: "可以发布的正文"
      }
    });
    expect(structuredData(created)).toMatchObject({
      data: { status: "draft", version: 0 }
    });

    const published = await client.callTool({
      name: "change_post_status",
      arguments: {
        postId: POST_ID,
        action: "publish"
      }
    });

    expect(structuredData(published)).toMatchObject({
      data: { status: "published", version: 1 }
    });
    expect(mocks.changePostStatus).toHaveBeenCalledWith(
      expect.anything(),
      POST_ID,
      0,
      "publish"
    );
  });

  it("creates a fresh MCP server for separate client sessions", async () => {
    const first = await connectClient();
    const second = await connectClient();

    const [firstTools, secondTools] = await Promise.all([
      first.listTools(),
      second.listTools()
    ]);
    expect(firstTools.tools).toHaveLength(6);
    expect(secondTools.tools).toHaveLength(6);
  });
});

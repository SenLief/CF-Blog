import {
  contentSlugSchema,
  postInputSchema,
  postStatusSchema
} from "@cf-blog/contracts";
import type { PostDetail } from "@cf-blog/contracts";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { z } from "zod";
import {
  getPostById,
  getPostBySlug,
  listPosts
} from "./db";
import { AppError } from "./http";
import {
  changePostStatus,
  createDraft,
  deletePost,
  updatePost
} from "./post-service";

interface McpRequestContext {
  db: D1Database;
  actor: string;
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

const createAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false
} as const;

const destructiveAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false
} as const;

const createDraftInputSchema = z.object({
  title: postInputSchema.shape.title.describe("文章标题"),
  slug: contentSlugSchema.optional().describe("可选文章 slug；省略时由标题生成"),
  excerpt: postInputSchema.shape.excerpt.optional().describe("可选摘要"),
  contentMarkdown: postInputSchema.shape.contentMarkdown
    .optional()
    .describe("Markdown 正文；省略时创建空草稿"),
  coverUrl: postInputSchema.shape.coverUrl.optional().describe("可选封面 URL"),
  tags: postInputSchema.shape.tags.optional().describe("可选标签列表")
});

const editablePostSchema = postInputSchema
  .omit({ groupId: true, version: true })
  .describe("文章的完整可编辑字段；请先 get_post，避免覆盖未读取的值");

const expectedVersionSchema = z
  .number()
  .int()
  .nonnegative()
  .default(0)
  .describe("并发控制版本；新建文章默认为 0，已有文章应使用最近一次读取的版本");

function publicPost(post: PostDetail): Omit<PostDetail, "contentHtml"> {
  const { contentHtml: _contentHtml, ...result } = post;
  return result;
}

function successResult(data: unknown) {
  const payload = { data };
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
}

function errorResult(error: unknown) {
  const normalized =
    error instanceof AppError
      ? error
      : new AppError(500, "INTERNAL_ERROR", "服务器发生错误");
  const payload = {
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined
        ? {}
        : { details: normalized.details })
    }
  };
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
}

async function runTool(
  context: McpRequestContext,
  tool: string,
  postId: string | undefined,
  operation: () => Promise<unknown>
) {
  try {
    const data = await operation();
    const resultPostId =
      data &&
      typeof data === "object" &&
      "id" in data &&
      typeof data.id === "string"
        ? data.id
        : undefined;
    console.log(
      JSON.stringify({
        message: "mcp_tool",
        actor: context.actor,
        tool,
        ...(postId ?? resultPostId
          ? { postId: postId ?? resultPostId }
          : {}),
        outcome: "success"
      })
    );
    return successResult(data);
  } catch (error) {
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    console.error(
      JSON.stringify({
        message: "mcp_tool",
        actor: context.actor,
        tool,
        ...(postId ? { postId } : {}),
        outcome: "error",
        code
      })
    );
    return errorResult(error);
  }
}

export function createBlogMcpServer(context: McpRequestContext): McpServer {
  const server = new McpServer({
    name: "cf-blog",
    version: "1.0.0"
  });

  server.registerTool(
    "search_posts",
    {
      title: "搜索博客文章",
      description: "按标题或摘要搜索文章，并可按状态过滤。返回摘要，不返回正文。",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(200).optional(),
        status: postStatusSchema.optional(),
        limit: z.number().int().min(1).max(50).default(20)
      }),
      annotations: readOnlyAnnotations
    },
    async ({ query, status, limit }) =>
      runTool(context, "search_posts", undefined, async () =>
        listPosts(context.db, { query, status, limit })
      )
  );

  server.registerTool(
    "get_post",
    {
      title: "读取博客文章",
      description: "通过文章 UUID 或 slug 读取完整 Markdown、元数据、状态和版本。",
      inputSchema: z
        .object({
          postId: z.string().uuid().optional(),
          slug: contentSlugSchema.optional()
        })
        .refine(({ postId, slug }) => Boolean(postId) !== Boolean(slug), {
          message: "postId 和 slug 必须且只能提供一个"
        }),
      annotations: readOnlyAnnotations
    },
    async ({ postId, slug }) =>
      runTool(context, "get_post", postId, async () => {
        const post = postId
          ? await getPostById(context.db, postId)
          : await getPostBySlug(context.db, slug!);
        if (!post) {
          throw new AppError(404, "POST_NOT_FOUND", "找不到文章");
        }
        return publicPost(post);
      })
  );

  server.registerTool(
    "create_draft",
    {
      title: "创建文章草稿",
      description: "创建一篇草稿。不会发布；slug 省略时由标题生成。",
      inputSchema: createDraftInputSchema,
      annotations: createAnnotations
    },
    async (input) =>
      runTool(context, "create_draft", undefined, async () =>
        publicPost(await createDraft(context.db, input))
      )
  );

  server.registerTool(
    "update_post",
    {
      title: "更新博客文章",
      description:
        "用完整字段更新文章。新建文章的 expectedVersion 可省略并默认为 0；已有文章应使用最近一次 get_post 返回的版本。如果文章已发布，本次修改会立即公开并在写入前创建版本快照。",
      inputSchema: z.object({
        postId: z.string().uuid(),
        expectedVersion: expectedVersionSchema,
        editableFields: editablePostSchema
      }),
      annotations: destructiveAnnotations
    },
    async ({ postId, expectedVersion, editableFields }) =>
      runTool(context, "update_post", postId, async () => {
        const existing = await getPostById(context.db, postId);
        if (!existing) {
          throw new AppError(404, "POST_NOT_FOUND", "找不到文章");
        }
        const input = postInputSchema.parse({
          ...editableFields,
          groupId: existing.group?.id ?? null,
          version: expectedVersion
        });
        const updated = await updatePost(context.db, postId, input, {
          snapshotPublished: true
        });
        return publicPost(updated);
      })
  );

  server.registerTool(
    "change_post_status",
    {
      title: "更改文章状态",
      description:
        "发布、撤回或归档文章。发布会校验标题、正文与图片替代文本；新建文章的 expectedVersion 可省略并默认为 0，已有文章应使用最近一次读取的版本。",
      inputSchema: z.object({
        postId: z.string().uuid(),
        expectedVersion: expectedVersionSchema,
        action: z.enum(["publish", "unpublish", "archive"])
      }),
      annotations: destructiveAnnotations
    },
    async ({ postId, expectedVersion, action }) =>
      runTool(context, "change_post_status", postId, async () =>
        publicPost(
          await changePostStatus(
            context.db,
            postId,
            expectedVersion,
            action
          )
        )
      )
  );

  server.registerTool(
    "delete_post",
    {
      title: "永久删除文章",
      description:
        "永久删除文章及其版本记录。confirmTitle 必须与当前标题完全一致；通常应优先归档。",
      inputSchema: z.object({
        postId: z.string().uuid(),
        expectedVersion: expectedVersionSchema,
        confirmTitle: postInputSchema.shape.title
      }),
      annotations: destructiveAnnotations
    },
    async ({ postId, expectedVersion, confirmTitle }) =>
      runTool(context, "delete_post", postId, async () =>
        deletePost(context.db, postId, expectedVersion, confirmTitle)
      )
  );

  return server;
}

export function handleMcpRequest(
  request: Request,
  env: Env,
  executionContext: ExecutionContext,
  actor: string
): Promise<Response> {
  const server = createBlogMcpServer({
    db: env.DB,
    actor
  });
  return createMcpHandler(server, {
    route: "/mcp",
    enableJsonResponse: true
  })(
    request,
    env,
    executionContext
  );
}

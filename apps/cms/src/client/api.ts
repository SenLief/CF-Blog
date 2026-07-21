import type {
  ApiError,
  ExternalVideoInput,
  GroupDetail,
  GroupInput,
  GroupSummary,
  ImageMediaItem,
  MediaItem,
  PostBulkAction,
  PostBulkActionResult,
  PostDetail,
  PostInput,
  PostRevision,
  PostSummary,
  SiteSettings,
  SiteSettingsInput,
  VideoMediaItem
} from "@cf-blog/contracts";

export class ApiException extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof Blob ? {} : { "Content-Type": "application/json" }),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiException(
      body?.error.message ?? `请求失败 (${response.status})`,
      response.status,
      body?.error.code ?? "REQUEST_FAILED",
      body?.error.details
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  overview: () =>
    request<{
      counts: { total: number; drafts: number; published: number; archived: number };
      recent: PostSummary[];
    }>("/api/overview"),

  getSettings: () => request<SiteSettings>("/api/settings"),
  saveSettings: (input: SiteSettingsInput) =>
    request<SiteSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(input)
    }),

  listGroups: () => request<GroupSummary[]>("/api/groups"),
  createGroup: (input: GroupInput) =>
    request<GroupSummary>("/api/groups", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  getGroup: (id: string) => request<GroupDetail>(`/api/groups/${id}`),
  saveGroup: (id: string, input: GroupInput) =>
    request<GroupSummary>(`/api/groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(input)
    }),
  reorderGroups: (groupIds: string[]) =>
    request<GroupSummary[]>("/api/groups/order", {
      method: "PUT",
      body: JSON.stringify({ groupIds })
    }),
  saveGroupPosts: (id: string, postIds: string[]) =>
    request<GroupDetail>(`/api/groups/${id}/posts`, {
      method: "PUT",
      body: JSON.stringify({ postIds })
    }),
  deleteGroup: (id: string) =>
    request<void>(`/api/groups/${id}`, { method: "DELETE" }),

  listPosts: (status?: string, query?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query) params.set("q", query);
    return request<PostSummary[]>(`/api/posts?${params}`);
  },
  createPost: () =>
    request<PostDetail>("/api/posts", {
      method: "POST",
      body: "{}"
    }),
  getPost: (id: string) => request<PostDetail>(`/api/posts/${id}`),
  savePost: (id: string, input: PostInput) =>
    request<PostDetail>(`/api/posts/${id}`, {
      method: "PUT",
      body: JSON.stringify(input)
    }),
  deletePost: (id: string) =>
    request<void>(`/api/posts/${id}`, { method: "DELETE" }),
  bulkPostAction: (input: PostBulkAction) =>
    request<PostBulkActionResult>("/api/posts/bulk-action", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  postAction: (
    id: string,
    action: "publish" | "unpublish" | "archive" | "save-version",
    expectedVersion: number
  ) =>
    request<PostDetail>(`/api/posts/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ action, expectedVersion })
    }),
  listRevisions: (id: string) =>
    request<PostRevision[]>(`/api/posts/${id}/revisions`),
  restoreRevision: (postId: string, revisionId: string) =>
    request<PostDetail>(`/api/posts/${postId}/revisions/${revisionId}/restore`, {
      method: "POST",
      body: "{}"
    }),
  previewToken: (id: string) =>
    request<{ url: string; expiresAt: string }>(`/api/posts/${id}/preview-token`, {
      method: "POST",
      body: "{}"
    }),
  render: (markdown: string) =>
    request<{ html: string; excerpt: string; readingMinutes: number }>("/api/render", {
      method: "POST",
      body: JSON.stringify({ markdown })
    }),

  listMedia: () => request<MediaItem[]>("/api/media"),
  uploadMedia: async (file: File, alt: string): Promise<ImageMediaItem> => {
    const dimensions = await imageDimensions(file);
    return request<ImageMediaItem>("/api/media", {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type,
        "X-File-Size": String(file.size),
        "X-Filename": encodeURIComponent(file.name),
        "X-Alt": encodeURIComponent(alt),
        ...(dimensions
          ? {
              "X-Width": String(dimensions.width),
              "X-Height": String(dimensions.height)
            }
          : {})
      }
    });
  },
  createVideo: (input: ExternalVideoInput) =>
    request<VideoMediaItem>("/api/media/videos", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  deleteMedia: (id: string) =>
    request<void>(`/api/media/${id}`, { method: "DELETE" })
};

async function imageDimensions(
  file: File
): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("无法读取图片尺寸"));
        image.src = url;
      }
    );
    return dimensions;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

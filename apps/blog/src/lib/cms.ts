import type {
  GroupDetail,
  GroupSummary,
  PostDetail,
  PublicMemoPage,
  PublicPostDetail,
  PostSummary,
  SearchEntry,
  SiteSettings
} from "@cf-blog/contracts";
import { env } from "cloudflare:workers";

async function call(path: string): Promise<Response> {
  return env.CMS.fetch(
    new Request(`https://cms.internal${path}`, {
      headers: { Accept: "application/json" }
    })
  );
}

async function readJson<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`CMS request failed: ${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

async function json<T>(path: string): Promise<T> {
  return readJson<T>(await call(path), path);
}

export const cms = {
  site: () => json<SiteSettings>("/site"),
  async memoPage(limit: number, offset: number, tag?: string): Promise<PublicMemoPage | null> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset)
    });
    if (tag) params.set("tag", tag);
    const path = `/memo-page?${params}`;
    const response = await call(path);
    return response.status === 404 ? null : readJson<PublicMemoPage>(response, path);
  },
  posts: (limit = 20, offset = 0) =>
    json<PostSummary[]>(`/posts?limit=${limit}&offset=${offset}`),
  groups: () => json<GroupSummary[]>("/groups"),
  async group(
    slug: string,
    limit = 20,
    offset = 0
  ): Promise<{ group: GroupDetail | null; redirectTo: string | null }> {
    const response = await call(
      `/groups/${encodeURIComponent(slug)}?limit=${limit}&offset=${offset}`
    );
    if (response.status === 308) {
      const body = (await response.json()) as { redirectTo: string };
      return { group: null, redirectTo: body.redirectTo };
    }
    if (response.status === 404) {
      return { group: null, redirectTo: null };
    }
    if (!response.ok) {
      throw new Error(`CMS request failed: ${response.status}`);
    }
    return {
      group: (await response.json()) as GroupDetail,
      redirectTo: null
    };
  },
  archive: (limit?: number) =>
    json<PostSummary[]>(limit === undefined ? "/archive" : `/archive?limit=${limit}`),
  searchIndex: () => json<SearchEntry[]>("/search-index"),
  preview: (token: string) =>
    json<PostDetail>(`/preview/${encodeURIComponent(token)}`),
  async post(
    slug: string
  ): Promise<{ post: PublicPostDetail | null; redirectTo: string | null }> {
    const response = await call(`/posts/${encodeURIComponent(slug)}`);
    if (response.status === 308) {
      const body = (await response.json()) as { redirectTo: string };
      return { post: null, redirectTo: body.redirectTo };
    }
    if (response.status === 404) {
      return { post: null, redirectTo: null };
    }
    if (!response.ok) {
      throw new Error(`CMS request failed: ${response.status}`);
    }
    return {
      post: (await response.json()) as PublicPostDetail,
      redirectTo: null
    };
  }
};

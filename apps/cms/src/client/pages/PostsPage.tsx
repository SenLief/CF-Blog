import type { PostBulkAction, PostSummary } from "@cf-blog/contracts";
import { isStandalonePageSlug } from "@cf-blog/contracts";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatDate, StatusBadge } from "../components/PostMeta";

const bulkActionLabels: Record<PostBulkAction["action"], string> = {
  publish: "发布",
  draft: "转为草稿",
  archive: "归档",
  delete: "永久删除"
};

export function PostsPage() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingAction, setPendingAction] = useState<
    PostBulkAction["action"] | null
  >(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [status, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void api
        .listPosts(status || undefined, query || undefined)
        .then((items) => {
          setPosts(items);
          setError("");
        })
        .catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : "加载失败")
        )
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [status, query, refreshKey]);

  const selectedCount = selectedIds.size;
  const allSelected =
    posts.length > 0 && posts.every((post) => selectedIds.has(post.id));
  const partlySelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = partlySelected;
    }
  }, [partlySelected]);

  const togglePost = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setNotice("");
  };

  const toggleAll = () => {
    setSelectedIds(
      allSelected ? new Set() : new Set(posts.map((post) => post.id))
    );
    setNotice("");
  };

  const runBulkAction = async (action: PostBulkAction["action"]) => {
    if (selectedCount === 0 || pendingAction) return;
    if (
      action === "delete" &&
      !window.confirm(
        `永久删除所选 ${selectedCount} 篇文章？文章内容和版本记录都无法恢复。`
      )
    ) {
      return;
    }

    setPendingAction(action);
    setError("");
    setNotice("");
    try {
      const result = await api.bulkPostAction({
        action,
        postIds: [...selectedIds]
      });
      setSelectedIds(new Set());
      setRefreshKey((current) => current + 1);
      setNotice(
        result.affected === 0
          ? "所选文章已经处于目标状态。"
          : action === "delete"
            ? `已永久删除 ${result.affected} 篇文章。`
            : `已将 ${result.affected} 篇文章${bulkActionLabels[action]}。`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批量操作失败");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="page narrow-page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">内容</p>
          <h1>文章</h1>
        </div>
        <Link className="button primary" to="/posts/new">
          新建文章
        </Link>
      </header>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="筛选状态">
          {([
            ["", "全部"],
            ["draft", "草稿"],
            ["published", "已发布"],
            ["archived", "归档"]
          ] as const).map(([value, label]) => (
            <button
              className={status === value ? "active" : ""}
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <input
          aria-label="搜索文章"
          className="search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题或摘要…"
          type="search"
          value={query}
        />
      </div>

      {error && <div className="notice error">{error}</div>}
      {notice && (
        <div aria-live="polite" className="notice">
          {notice}
        </div>
      )}

      {posts.length > 0 && (
        <div className={`bulk-toolbar ${selectedCount > 0 ? "active" : ""}`}>
          <label className="bulk-select-all">
            <input
              aria-label="选择当前结果中的全部文章"
              checked={allSelected}
              disabled={Boolean(pendingAction)}
              onChange={toggleAll}
              ref={selectAllRef}
              type="checkbox"
            />
            <span>
              {selectedCount > 0
                ? `已选 ${selectedCount} 篇`
                : `全选当前 ${posts.length} 篇`}
            </span>
          </label>
          {selectedCount > 0 && (
            <div className="bulk-actions" role="group" aria-label="批量操作">
              {(["publish", "draft", "archive"] as const).map((action) => (
                <button
                  className="button small"
                  disabled={Boolean(pendingAction)}
                  key={action}
                  onClick={() => void runBulkAction(action)}
                  type="button"
                >
                  {pendingAction === action
                    ? "处理中…"
                    : bulkActionLabels[action]}
                </button>
              ))}
              <button
                className="button danger small"
                disabled={Boolean(pendingAction)}
                onClick={() => void runBulkAction("delete")}
                type="button"
              >
                {pendingAction === "delete" ? "删除中…" : "删除"}
              </button>
            </div>
          )}
        </div>
      )}

      <div
        aria-busy={loading || Boolean(pendingAction)}
        className={`post-table ${loading ? "loading" : ""}`}
      >
        {posts.map((post) => (
          <article
            className={`post-row selectable ${selectedIds.has(post.id) ? "selected" : ""}`}
            key={post.id}
          >
            <label className="post-select">
              <input
                aria-label={`选择《${post.title}》`}
                checked={selectedIds.has(post.id)}
                disabled={Boolean(pendingAction)}
                onChange={() => togglePost(post.id)}
                type="checkbox"
              />
            </label>
            <Link className="post-title-cell" to={`/posts/${post.id}`}>
              <strong>{post.title}</strong>
              <span>{post.excerpt || "暂无摘要"}</span>
            </Link>
            <div className="post-tags">
              {isStandalonePageSlug(post.slug) ? (
                <span className="standalone-page-marker">独立页面 · /about</span>
              ) : (
                post.tags.slice(0, 2).map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))
              )}
            </div>
            <StatusBadge status={post.status} />
            <time>{formatDate(post.updatedAt)}</time>
          </article>
        ))}
        {!loading && posts.length === 0 && (
          <div className="empty">没有符合条件的文章。</div>
        )}
      </div>
    </div>
  );
}

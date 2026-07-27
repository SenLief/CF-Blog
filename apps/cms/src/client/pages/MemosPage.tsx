import type { Memo } from "@cf-blog/contracts";
import { memoContentParts } from "@cf-blog/contracts";
import { useEffect, useState } from "react";
import {
  MemoComposer,
  type MemoComposerValue
} from "../components/memo/MemoComposer";
import { MemoAttachments } from "../components/memo/MemoMedia";
import { api } from "../api";

function formatMemoDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function closeActionMenu(event: React.MouseEvent<HTMLButtonElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function MemosPage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void api
        .listMemos(status || undefined, query.trim() || undefined)
        .then((items) => {
          if (!active) return;
          setMemos(items);
          setError("");
        })
        .catch((reason: unknown) => {
          if (active) {
            setError(reason instanceof Error ? reason.message : "短文加载失败");
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, refreshKey, status]);

  const createMemo = async (value: MemoComposerValue) => {
    setError("");
    setNotice("");
    await api.createMemo(value);
    setNotice(value.status === "published" ? "短文已发布" : "草稿已保存");
    setRefreshKey((current) => current + 1);
  };

  const updateMemo = async (memo: Memo, value: MemoComposerValue) => {
    setError("");
    setNotice("");
    const updated = await api.saveMemo(memo.id, {
      ...value,
      isPinned: memo.isPinned,
      version: memo.version
    });
    setMemos((items) =>
      items.map((item) => (item.id === updated.id ? updated : item))
    );
    setEditingMemo(null);
    setNotice("短文已更新");
    if (status && updated.status !== status) {
      setRefreshKey((current) => current + 1);
    }
  };

  const quickSave = async (
    memo: Memo,
    changes: Partial<Pick<Memo, "status" | "isPinned">>
  ) => {
    if (pendingId) return;
    setPendingId(memo.id);
    setError("");
    setNotice("");
    try {
      const updated = await api.saveMemo(memo.id, {
        content: memo.content,
        tags: memo.tags,
        imageIds: memo.images.map((image) => image.id),
        videoUrls: memo.videos.map((video) => video.sourceUrl),
        status: changes.status ?? memo.status,
        isPinned: changes.isPinned ?? memo.isPinned,
        version: memo.version
      });
      setMemos((items) =>
        items.map((item) => (item.id === updated.id ? updated : item))
      );
      setNotice("短文已更新");
      if ((status && updated.status !== status) || changes.isPinned !== undefined) {
        setRefreshKey((current) => current + 1);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "短文更新失败");
    } finally {
      setPendingId(null);
    }
  };

  const startEditing = (memo: Memo) => {
    setEditingMemo(memo);
    setError("");
    setNotice("");
  };

  const remove = async (memo: Memo) => {
    if (pendingId || !window.confirm("永久删除这条短文？删除后无法恢复。")) return;
    const previousMemos = memos;
    setPendingId(memo.id);
    setError("");
    setNotice("");
    setMemos((items) => items.filter((item) => item.id !== memo.id));
    if (editingMemo?.id === memo.id) setEditingMemo(null);
    try {
      await api.deleteMemo(memo.id);
      setNotice("短文已删除，图片仍保留在媒体库中");
    } catch (reason) {
      setMemos(previousMemos);
      setError(reason instanceof Error ? reason.message : "短文删除失败");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="page memo-admin-page">
      <div className="memo-admin-column">
        <header className="memo-page-header">
          <div>
            <h1>短文</h1>
            <p>快速记录，稍后再整理。</p>
          </div>
        </header>

        <MemoComposer
          memo={null}
          onCancel={() => undefined}
          onSubmit={createMemo}
        />

        <div className="memo-list-toolbar">
          <div className="segmented" role="group" aria-label="筛选短文状态">
            {([
              ["", "全部"],
              ["published", "公开"],
              ["draft", "草稿"]
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
            aria-label="搜索短文"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索"
            type="search"
            value={query}
          />
        </div>

        {(error || notice) && (
          <div className={`memo-page-message ${error ? "error" : ""}`} role="status">
            {error || notice}
          </div>
        )}

        <section
          aria-busy={loading}
          aria-label="短文列表"
          className={`memo-feed ${loading ? "loading" : ""}`}
        >
          {memos.map((memo) => {
            const isPending = pendingId === memo.id;
            if (editingMemo?.id === memo.id) {
              return (
                <MemoComposer
                  key={`editor-${memo.id}`}
                  memo={memo}
                  onCancel={() => setEditingMemo(null)}
                  onSubmit={(value) => updateMemo(memo, value)}
                />
              );
            }
            return (
              <article className="memo-feed-card" key={memo.id}>
                <header>
                  <div className="memo-feed-meta">
                    <time dateTime={memo.publishedAt ?? memo.createdAt}>
                      {formatMemoDate(memo.publishedAt ?? memo.createdAt)}
                    </time>
                    {memo.isPinned && <span>已置顶</span>}
                    {memo.status === "draft" && <span>草稿</span>}
                  </div>
                  <details className="memo-action-menu">
                    <summary aria-label="短文操作">•••</summary>
                    <div>
                      <button
                        disabled={isPending}
                        onClick={(event) => {
                          closeActionMenu(event);
                          void quickSave(memo, { isPinned: !memo.isPinned });
                        }}
                        type="button"
                      >{memo.isPinned ? "取消置顶" : "置顶"}</button>
                      <button
                        disabled={isPending}
                        onClick={(event) => {
                          closeActionMenu(event);
                          startEditing(memo);
                        }}
                        type="button"
                      >编辑</button>
                      <button
                        disabled={isPending}
                        onClick={(event) => {
                          closeActionMenu(event);
                          void quickSave(memo, {
                            status: memo.status === "published" ? "draft" : "published"
                          });
                        }}
                        type="button"
                      >{memo.status === "published" ? "转为草稿" : "公开发布"}</button>
                      <button
                        className="danger-text"
                        disabled={isPending}
                        onClick={(event) => {
                          closeActionMenu(event);
                          void remove(memo);
                        }}
                        type="button"
                      >删除</button>
                    </div>
                  </details>
                </header>

                {memo.content && (
                  <p className="memo-feed-content">
                    {memoContentParts(memo.content).map((part, index) =>
                      part.type === "tag" ? (
                        <span className="memo-inline-tag" key={`${part.value}-${index}`}>
                          {part.value}
                        </span>
                      ) : part.value
                    )}
                  </p>
                )}
                <MemoAttachments memo={memo} />
              </article>
            );
          })}
          {!loading && memos.length === 0 && (
            <div className="memo-feed-empty">还没有短文。</div>
          )}
        </section>
      </div>
    </div>
  );
}

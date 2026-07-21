import type { MediaItem, VideoMediaItem } from "@cf-blog/contracts";
import { useMemo, useState } from "react";
import { providerLabel } from "./MediaPreview";

type MediaFilter = "all" | MediaItem["kind"];

export function MediaShelf({
  items,
  loading,
  error,
  onClose,
  onInsert,
  onPreview
}: {
  items: MediaItem[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onInsert: (item: MediaItem) => void;
  onPreview: (item: VideoMediaItem) => void;
}) {
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.kind !== filter) return false;
      if (!normalizedQuery) return true;
      const haystack =
        item.kind === "image"
          ? `${item.filename} ${item.alt}`
          : `${item.title} ${item.sourceUrl} ${item.provider}`;
      return haystack.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [filter, items, query]);

  return (
    <aside aria-label="文章素材" className="media-shelf">
      <header className="media-shelf-header">
        <div>
          <span>写作素材</span>
          <h2>媒体库</h2>
        </div>
        <button aria-label="关闭素材栏" onClick={onClose} type="button">
          ×
        </button>
      </header>
      <div className="media-shelf-tools">
        <div aria-label="素材类型" className="media-filter" role="group">
          {(["all", "image", "video"] as const).map((value) => (
            <button
              aria-pressed={filter === value}
              className={filter === value ? "active" : ""}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {value === "all" ? "全部" : value === "image" ? "图片" : "视频"}
            </button>
          ))}
        </div>
        <input
          aria-label="搜索素材"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索素材…"
          type="search"
          value={query}
        />
      </div>
      <div className="media-shelf-list">
        {loading && <div className="media-shelf-state">正在加载素材…</div>}
        {!loading && error && <div className="media-shelf-state error">{error}</div>}
        {!loading && !error && visibleItems.length === 0 && (
          <div className="media-shelf-state">没有匹配的素材。</div>
        )}
        {visibleItems.map((item) => (
          <article className="media-shelf-item" key={`${item.kind}-${item.id}`}>
            {item.kind === "image" ? (
              <img alt={item.alt || ""} loading="lazy" src={item.url} />
            ) : (
              <button
                aria-label={`预览 ${item.title}`}
                className="media-video-tile"
                onClick={() => onPreview(item)}
                type="button"
              >
                <span>▶</span>
                <small>{providerLabel(item.provider)}</small>
              </button>
            )}
            <div>
              <strong title={item.kind === "image" ? item.filename : item.title}>
                {item.kind === "image" ? item.filename : item.title}
              </strong>
              <span>
                {item.kind === "image"
                  ? item.alt || `${item.width ?? "?"}×${item.height ?? "?"}`
                  : providerLabel(item.provider)}
              </span>
              <div className="media-shelf-actions">
                {item.kind === "video" && (
                  <button onClick={() => onPreview(item)} type="button">
                    预览
                  </button>
                )}
                <button className="insert" onClick={() => onInsert(item)} type="button">
                  插入
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

import type { MediaItem, VideoMediaItem } from "@cf-blog/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { MediaPreviewDialog, providerLabel } from "../components/MediaPreview";
import { mediaMarkdown } from "../mediaInsertion";

type MediaFilter = "all" | MediaItem["kind"];
type AddMode = MediaItem["kind"];

export function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [addMode, setAddMode] = useState<AddMode>("image");
  const [query, setQuery] = useState("");
  const [alt, setAlt] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [previewItem, setPreviewItem] = useState<VideoMediaItem | null>(null);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creatingVideo, setCreatingVideo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api.listMedia().then(setItems).catch((reason: unknown) => {
      setMessage(reason instanceof Error ? reason.message : "媒体加载失败");
    });

  useEffect(() => {
    void load();
  }, []);

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

  const upload = async (file: File) => {
    setUploading(true);
    setMessage("");
    try {
      const item = await api.uploadMedia(file, alt);
      setItems((current) => [item, ...current]);
      setAlt("");
      setMessage("图片已上传，可直接插入文章。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const createVideo = async () => {
    setCreatingVideo(true);
    setMessage("");
    try {
      const item = await api.createVideo({ title: videoTitle, sourceUrl: videoUrl });
      setItems((current) => [item, ...current]);
      setVideoTitle("");
      setVideoUrl("");
      setMessage("在线视频已加入素材库。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "视频添加失败");
    } finally {
      setCreatingVideo(false);
    }
  };

  const copyMarkdown = async (item: MediaItem) => {
    try {
      await navigator.clipboard.writeText(mediaMarkdown(item));
      setMessage("Markdown 已复制。");
    } catch {
      setMessage("无法访问剪贴板，请在编辑器素材栏中直接插入。");
    }
  };

  const deleteItem = async (item: MediaItem) => {
    const label = item.kind === "image" ? "这张图片" : "这个在线视频素材";
    if (!window.confirm(`确认删除${label}？`)) return;
    try {
      await api.deleteMedia(item.id);
      setItems((current) => current.filter(({ id, kind }) => id !== item.id || kind !== item.kind));
      setMessage(item.kind === "image" ? "图片已删除。" : "视频素材已删除，文章中的既有嵌入不受影响。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "删除失败");
    }
  };

  return (
    <div className="page narrow-page media-page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">写作素材</p>
          <h1>媒体库</h1>
          <p>图片保存到 R2；在线视频仅保存链接，按需预览和嵌入。</p>
        </div>
      </header>

      <div aria-label="添加素材类型" className="media-add-switch segmented" role="group">
        <button
          className={addMode === "image" ? "active" : ""}
          onClick={() => setAddMode("image")}
          type="button"
        >
          上传图片
        </button>
        <button
          className={addMode === "video" ? "active" : ""}
          onClick={() => setAddMode("video")}
          type="button"
        >
          添加在线视频
        </button>
      </div>

      {addMode === "image" ? (
        <section
          className="upload-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void upload(file);
          }}
        >
          <input
            accept="image/jpeg,image/png,image/webp,image/avif"
            hidden
            ref={fileRef}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) void upload(file);
            }}
          />
          <div>
            <strong>{uploading ? "正在上传…" : "拖放图片到这里"}</strong>
            <span>JPEG、PNG、WebP 或 AVIF，最大 10 MB</span>
          </div>
          <input
            aria-label="图片替代文本"
            onChange={(event) => setAlt(event.target.value)}
            placeholder="图片替代文本"
            value={alt}
          />
          <button
            className="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            选择图片
          </button>
        </section>
      ) : (
        <form
          className="video-add-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void createVideo();
          }}
        >
          <div>
            <strong>登记在线视频</strong>
            <span>YouTube、Bilibili、Vimeo，或 HTTPS MP4/WebM 直链</span>
          </div>
          <label>
            视频标题
            <input
              maxLength={200}
              onChange={(event) => setVideoTitle(event.target.value)}
              placeholder="用于素材识别和文章说明"
              required
              value={videoTitle}
            />
          </label>
          <label>
            视频链接
            <input
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://…"
              required
              type="url"
              value={videoUrl}
            />
          </label>
          <button className="button primary" disabled={creatingVideo} type="submit">
            {creatingVideo ? "正在添加…" : "加入素材库"}
          </button>
        </form>
      )}

      {message && <div className="notice">{message}</div>}

      <section className="media-library-controls">
        <div aria-label="素材筛选" className="segmented" role="group">
          {(["all", "image", "video"] as const).map((value) => (
            <button
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
          className="search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文件名、标题或链接…"
          type="search"
          value={query}
        />
      </section>

      {visibleItems.length === 0 ? (
        <div className="empty media-empty">没有匹配的素材。</div>
      ) : (
        <section className="media-grid">
          {visibleItems.map((item) => (
            <article className={`media-card ${item.kind}`} key={`${item.kind}-${item.id}`}>
              {item.kind === "image" ? (
                <div className="media-card-visual">
                  <img alt={item.alt || ""} loading="lazy" src={item.url} />
                </div>
              ) : (
                <button
                  aria-label={`预览 ${item.title}`}
                  className="media-card-visual media-video-cover"
                  onClick={() => setPreviewItem(item)}
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
                    ? `${formatBytes(item.bytes)} · ${item.width ?? "?"}×${item.height ?? "?"}`
                    : `${providerLabel(item.provider)} · ${sourceHost(item.sourceUrl)}`}
                </span>
                <p>
                  {item.kind === "image"
                    ? item.alt || "未填写替代文本"
                    : item.sourceUrl}
                </p>
                <div className="media-actions">
                  <div>
                    {item.kind === "video" && (
                      <button
                        className="button small"
                        onClick={() => setPreviewItem(item)}
                        type="button"
                      >
                        预览
                      </button>
                    )}
                    <button
                      className="button small"
                      onClick={() => void copyMarkdown(item)}
                      type="button"
                    >
                      复制 Markdown
                    </button>
                  </div>
                  <button
                    className="text-button danger-text"
                    onClick={() => void deleteItem(item)}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {previewItem && (
        <MediaPreviewDialog item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

import type { VideoMediaItem } from "@cf-blog/contracts";
import { useEffect } from "react";

export function VideoPlayer({ item }: { item: VideoMediaItem }) {
  return (
    <div className="video-player-frame">
      {item.preview.kind === "iframe" ? (
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          src={item.preview.url}
          title={item.title}
        />
      ) : (
        <video controls playsInline preload="metadata" src={item.preview.url} />
      )}
    </div>
  );
}

export function MediaPreviewDialog({
  item,
  onClose
}: {
  item: VideoMediaItem;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="media-preview-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="media-preview-title"
        aria-modal="true"
        className="media-preview-dialog"
        role="dialog"
      >
        <header>
          <div>
            <span>{providerLabel(item.provider)}</span>
            <h2 id="media-preview-title">{item.title}</h2>
          </div>
          <button aria-label="关闭视频预览" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <VideoPlayer item={item} />
        <footer>
          <a href={item.sourceUrl} rel="noreferrer" target="_blank">
            打开原视频 ↗
          </a>
        </footer>
      </section>
    </div>
  );
}

export function providerLabel(provider: VideoMediaItem["provider"]): string {
  if (provider === "youtube") return "YouTube";
  if (provider === "bilibili") return "Bilibili";
  if (provider === "vimeo") return "Vimeo";
  return "视频直链";
}

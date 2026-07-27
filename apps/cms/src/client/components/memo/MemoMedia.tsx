import type { Memo, MemoVideo, NormalizedVideoSource } from "@cf-blog/contracts";

export function memoVideoProviderLabel(
  provider: MemoVideo["provider"] | NormalizedVideoSource["provider"]
): string {
  return {
    youtube: "YouTube",
    bilibili: "Bilibili",
    vimeo: "Vimeo",
    direct: "视频"
  }[provider];
}

export function MemoVideoEmbed({
  video
}: {
  video: MemoVideo | NormalizedVideoSource;
}) {
  return (
    <div className="memo-video-frame">
      {video.preview.kind === "iframe" ? (
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          src={video.preview.url}
          title={`${memoVideoProviderLabel(video.provider)} 视频预览`}
        />
      ) : (
        <video controls preload="metadata">
          <source src={video.preview.url} type={video.preview.mimeType} />
        </video>
      )}
    </div>
  );
}

export function MemoAttachments({ memo }: { memo: Memo }) {
  if (memo.images.length === 0 && memo.videos.length === 0) return null;

  return (
    <div className="memo-attachments">
      {memo.images.length > 0 && (
        <div
          className={`memo-image-grid memo-image-grid-${Math.min(memo.images.length, 4)}`}
        >
          {memo.images.map((image) => (
            <a href={image.url} key={image.id} rel="noreferrer" target="_blank">
              <img
                alt={image.alt || "短文图片"}
                height={image.height ?? undefined}
                loading="lazy"
                src={image.url}
                width={image.width ?? undefined}
              />
            </a>
          ))}
        </div>
      )}
      {memo.videos.map((video) => (
        <figure className="memo-video-preview" key={video.sourceUrl}>
          <MemoVideoEmbed video={video} />
          <figcaption>
            <span>{memoVideoProviderLabel(video.provider)}</span>
            <a href={video.sourceUrl} rel="noreferrer" target="_blank">
              打开原链接
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

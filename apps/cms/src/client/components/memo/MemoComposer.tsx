import type {
  ImageMediaItem,
  Memo,
  MemoImage,
  MemoLocation,
  MemoLocationPrecision,
  MemoLocationSearchResult,
  MemoStatus
} from "@cf-blog/contracts";
import {
  extractMemoTags,
  memoLocationSchema,
  normalizeVideoSource,
  openStreetMapLocationUrl
} from "@cf-blog/contracts";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from "react";
import { api } from "../../api";
import {
  MemoVideoEmbed,
  memoVideoProviderLabel
} from "./MemoMedia";

export interface MemoComposerValue {
  content: string;
  tags: string[];
  imageIds: string[];
  videoUrls: string[];
  location: MemoLocation | null;
  status: MemoStatus;
}

interface MemoComposerProps {
  memo: Memo | null;
  onCancel: () => void;
  onSubmit: (value: MemoComposerValue) => Promise<void>;
}

interface DraftState {
  content: string;
  images: MemoImage[];
  videoUrls: string[];
  location: MemoLocation | null;
  status: MemoStatus;
}

interface LocationFormState {
  name: string;
  latitude: string;
  longitude: string;
  precision: MemoLocationPrecision;
}

const DRAFT_KEY = "cf-blog:memo-draft:v1";

function blankDraft(): DraftState {
  return {
    content: "",
    images: [],
    videoUrls: [],
    location: null,
    status: "published"
  };
}

function memoDraft(memo: Memo): DraftState {
  return {
    content: memo.content,
    images: memo.images,
    videoUrls: memo.videos.map((video) => video.sourceUrl),
    location: memo.location,
    status: memo.status
  };
}

function locationForm(location: MemoLocation | null): LocationFormState {
  return {
    name: location?.name ?? "",
    latitude: location ? String(location.latitude) : "",
    longitude: location ? String(location.longitude) : "",
    precision: location?.precision ?? "approximate"
  };
}

function cachedDraft(): DraftState {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as
      | Partial<DraftState>
      | null;
    if (!value || typeof value.content !== "string") return blankDraft();
    return {
      content: value.content,
      images: Array.isArray(value.images)
        ? value.images.flatMap((image) => {
            if (
              typeof image !== "object" ||
              image === null ||
              !("id" in image) ||
              typeof image.id !== "string" ||
              !("url" in image) ||
              typeof image.url !== "string"
            ) {
              return [];
            }
            const alt = "alt" in image && typeof image.alt === "string" ? image.alt : "";
            return [{
              id: image.id,
              url: image.url,
              filename:
                "filename" in image && typeof image.filename === "string"
                  ? image.filename
                  : alt || "短文图片",
              mimeType:
                "mimeType" in image && typeof image.mimeType === "string"
                  ? image.mimeType
                  : "image/*",
              bytes:
                "bytes" in image && typeof image.bytes === "number"
                  ? image.bytes
                  : 0,
              alt,
              width:
                "width" in image && typeof image.width === "number"
                  ? image.width
                  : null,
              height:
                "height" in image && typeof image.height === "number"
                  ? image.height
                  : null
            }];
          })
        : [],
      videoUrls: Array.isArray(value.videoUrls)
        ? value.videoUrls.filter((url): url is string => typeof url === "string")
        : [],
      location: (() => {
        const parsed = memoLocationSchema.safeParse(value.location);
        return parsed.success ? parsed.data : null;
      })(),
      status: value.status === "draft" ? "draft" : "published"
    };
  } catch {
    return blankDraft();
  }
}

function toMemoImage(image: ImageMediaItem): MemoImage {
  return {
    id: image.id,
    url: image.url,
    filename: image.filename,
    mimeType: image.mimeType,
    bytes: image.bytes,
    alt: image.alt,
    width: image.width,
    height: image.height
  };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "大小未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatMimeType(mimeType: string): string {
  const value = mimeType.split("/").pop()?.toLocaleUpperCase();
  return value === "JPG" ? "JPEG" : value || "图片";
}

function moveItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 18 5-5 3 3 2-2 6 5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={direction === "up" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function PreviewIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m9 7 8 5-8 5Z" />
    </svg>
  );
}

export function MemoComposer({ memo, onCancel, onSubmit }: MemoComposerProps) {
  const [draft, setDraft] = useState<DraftState>(() =>
    memo ? memoDraft(memo) : cachedDraft()
  );
  const [videoInput, setVideoInput] = useState("");
  const [activePanel, setActivePanel] = useState<"video" | "location" | null>(null);
  const [locationInput, setLocationInput] = useState<LocationFormState>(() =>
    locationForm(draft.location)
  );
  const [locating, setLocating] = useState(false);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [locationSearchDone, setLocationSearchDone] = useState(false);
  const [locationSearchResults, setLocationSearchResults] = useState<
    MemoLocationSearchResult[]
  >([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const locationSearchPendingRef = useRef(false);
  const lastLocationSearchAtRef = useRef(0);

  useEffect(() => {
    const nextDraft = memo ? memoDraft(memo) : cachedDraft();
    setDraft(nextDraft);
    setLocationInput(locationForm(nextDraft.location));
    setVideoInput("");
    setLocating(false);
    setSearchingLocation(false);
    setLocationSearchDone(false);
    setLocationSearchResults([]);
    setSelectedLocationId(null);
    setActivePanel(null);
    setInsertMenuOpen(false);
    setPreviewUrl(null);
    setError("");
  }, [memo?.id, memo?.version]);

  useEffect(() => {
    if (memo) return;
    const timer = window.setTimeout(() => {
      const empty =
        !draft.content.trim() &&
        draft.images.length === 0 &&
        draft.videoUrls.length === 0 &&
        !draft.location;
      if (empty) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, memo]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 104), 360)}px`;
  }, [draft.content]);

  const patchDraft = (patch: Partial<DraftState>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const addVideo = () => {
    const video = normalizeVideoSource(videoInput);
    if (!video) {
      setError("仅支持 YouTube、Bilibili、Vimeo 或 HTTPS MP4/WebM 直链");
      return;
    }
    if (draft.videoUrls.includes(video.sourceUrl)) {
      setError("这个视频已经添加过了");
      return;
    }
    if (draft.videoUrls.length >= 4) {
      setError("每条短文最多添加 4 个视频");
      return;
    }
    patchDraft({ videoUrls: [...draft.videoUrls, video.sourceUrl] });
    setVideoInput("");
    setActivePanel(null);
    setError("");
  };

  const openLocationEditor = () => {
    setLocationInput(locationForm(draft.location));
    setLocationSearchDone(false);
    setLocationSearchResults([]);
    setSelectedLocationId(null);
    setActivePanel("location");
    setInsertMenuOpen(false);
    setError("");
  };

  const searchLocation = async () => {
    if (locationSearchPendingRef.current) return;
    const query = locationInput.name.trim();
    if (query.length < 2) {
      setError("请至少输入两个字后再搜索位置");
      return;
    }
    locationSearchPendingRef.current = true;
    setSearchingLocation(true);
    setLocationSearchDone(false);
    setLocationSearchResults([]);
    setSelectedLocationId(null);
    setError("");
    try {
      const delay = Math.max(
        0,
        1_000 - (Date.now() - lastLocationSearchAtRef.current)
      );
      if (delay > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
      lastLocationSearchAtRef.current = Date.now();
      const results = await api.searchMemoLocations(query);
      setLocationSearchResults(results);
      setLocationSearchDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "位置搜索失败");
    } finally {
      locationSearchPendingRef.current = false;
      setSearchingLocation(false);
    }
  };

  const selectLocationResult = (result: MemoLocationSearchResult) => {
    setLocationInput((current) => ({
      ...current,
      latitude: String(result.latitude),
      longitude: String(result.longitude)
    }));
    setSelectedLocationId(result.id);
    setError("");
  };

  const applyLocation = () => {
    if (
      !locationInput.name.trim() ||
      !locationInput.latitude.trim() ||
      !locationInput.longitude.trim()
    ) {
      setError("请填写位置名称、纬度和经度");
      return;
    }
    const parsed = memoLocationSchema.safeParse({
      name: locationInput.name,
      latitude: Number(locationInput.latitude),
      longitude: Number(locationInput.longitude),
      precision: locationInput.precision
    });
    if (!parsed.success) {
      setError("位置坐标无效：纬度应在 -90 到 90，经度应在 -180 到 180");
      return;
    }
    patchDraft({ location: parsed.data });
    setLocationInput(locationForm(parsed.data));
    setActivePanel(null);
    setError("");
  };

  const useCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("当前浏览器不支持读取地理位置");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationInput((current) => ({
          ...current,
          name: current.name || "当前位置",
          latitude: coords.latitude.toFixed(6),
          longitude: coords.longitude.toFixed(6)
        }));
        setLocationSearchDone(false);
        setLocationSearchResults([]);
        setSelectedLocationId(null);
        setLocating(false);
      },
      (reason) => {
        const messages: Record<number, string> = {
          1: "未获得定位权限，你仍可以手动填写坐标",
          2: "暂时无法获取当前位置，请稍后重试或手动填写",
          3: "获取当前位置超时，请重试或手动填写"
        };
        setError(messages[reason.code] ?? "无法获取当前位置");
        setLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 }
    );
  };

  const uploadImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setInsertMenuOpen(false);
    if (files.length === 0) return;
    if (draft.images.length + files.length > 9) {
      setError("每条短文最多添加 9 张图片");
      return;
    }
    setUploading(true);
    setError("");
    const uploaded: MemoImage[] = [];
    try {
      for (const file of files) {
        const alt = file.name.replace(/\.[^.]+$/, "") || "短文图片";
        uploaded.push(toMemoImage(await api.uploadMedia(file, alt)));
      }
      patchDraft({ images: [...draft.images, ...uploaded] });
    } catch (reason) {
      if (uploaded.length > 0) {
        patchDraft({ images: [...draft.images, ...uploaded] });
      }
      setError(reason instanceof Error ? reason.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const canSave = Boolean(
    draft.content.trim() || draft.images.length > 0 || draft.videoUrls.length > 0
  );
  const inlineTags = extractMemoTags(draft.content);
  const attachmentCount = draft.images.length + draft.videoUrls.length;
  const locationPreview = (() => {
    if (
      !locationInput.name.trim() ||
      !locationInput.latitude.trim() ||
      !locationInput.longitude.trim()
    ) return null;
    const parsed = memoLocationSchema.safeParse({
      name: locationInput.name,
      latitude: Number(locationInput.latitude),
      longitude: Number(locationInput.longitude),
      precision: locationInput.precision
    });
    return parsed.success ? parsed.data : null;
  })();

  const save = async () => {
    if (!canSave || saving || uploading) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        content: draft.content,
        tags: inlineTags,
        imageIds: draft.images.map((image) => image.id),
        videoUrls: draft.videoUrls,
        location: draft.location,
        status: draft.status
      });
      if (!memo) {
        localStorage.removeItem(DRAFT_KEY);
        setDraft(blankDraft());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "短文保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  };

  return (
    <section className="memo-editor-shell" aria-label={memo ? "编辑短文" : "新建短文"}>
      {memo && (
        <div className="memo-editor-mode">
          <span>编辑短文</span>
          <button onClick={onCancel} type="button">取消</button>
        </div>
      )}

      <textarea
        aria-label="短文内容"
        maxLength={20_000}
        onChange={(event) => patchDraft({ content: event.target.value })}
        onKeyDown={handleKeyDown}
        placeholder="此刻的想法… 使用 #标签 添加标签"
        ref={textareaRef}
        value={draft.content}
      />

      {attachmentCount > 0 && (
        <section className="memo-editor-attachments" aria-label={`附件（${attachmentCount}）`}>
          <header>
            <PaperclipIcon />
            <span>附件（{attachmentCount}）</span>
          </header>
          <div className="memo-attachment-list">
          {draft.images.map((image, index) => (
            <div className="memo-attachment-item" key={image.id}>
              <img
                alt=""
                className="memo-attachment-thumbnail"
                src={image.url}
              />
              <div className="memo-attachment-info">
                <strong title={image.filename}>{image.filename}</strong>
                <small>
                  {formatMimeType(image.mimeType)}
                  <span aria-hidden="true">·</span>
                  {formatBytes(image.bytes)}
                </small>
              </div>
              <div className="memo-attachment-actions">
                <button
                  aria-label={`上移图片 ${image.filename}`}
                  disabled={index === 0}
                  onClick={() => patchDraft({ images: moveItem(draft.images, index, -1) })}
                  title="上移"
                  type="button"
                ><ArrowIcon direction="up" /></button>
                <button
                  aria-label={`下移图片 ${image.filename}`}
                  disabled={index === draft.images.length - 1}
                  onClick={() => patchDraft({ images: moveItem(draft.images, index, 1) })}
                  title="下移"
                  type="button"
                ><ArrowIcon direction="down" /></button>
                <button
                  aria-label={`移除图片 ${image.filename}`}
                  className="memo-attachment-remove"
                  onClick={() =>
                    patchDraft({
                      images: draft.images.filter((item) => item.id !== image.id)
                    })
                  }
                  title="移除附件"
                  type="button"
                ><CloseIcon /></button>
              </div>
            </div>
          ))}
          {draft.videoUrls.map((url, index) => {
            const video = normalizeVideoSource(url);
            if (!video) return null;
            const showingPreview = previewUrl === video.sourceUrl;
            const provider = memoVideoProviderLabel(video.provider);
            return (
              <div className="memo-video-attachment" key={video.sourceUrl}>
                <div className="memo-attachment-item">
                  <span className="memo-attachment-video-icon"><PreviewIcon /></span>
                  <div className="memo-attachment-info">
                    <strong>{provider}</strong>
                    <small title={video.sourceUrl}>视频链接<span aria-hidden="true">·</span>{video.sourceUrl}</small>
                  </div>
                  <div className="memo-attachment-actions">
                    <button
                      aria-label={`${showingPreview ? "收起" : "预览"}${provider}视频`}
                      className={showingPreview ? "active" : ""}
                      onClick={() => setPreviewUrl(showingPreview ? null : video.sourceUrl)}
                      title={showingPreview ? "收起预览" : "预览"}
                      type="button"
                    ><PreviewIcon /></button>
                    <button
                      aria-label={`上移${provider}视频`}
                      disabled={index === 0}
                      onClick={() => patchDraft({ videoUrls: moveItem(draft.videoUrls, index, -1) })}
                      title="上移"
                      type="button"
                    ><ArrowIcon direction="up" /></button>
                    <button
                      aria-label={`下移${provider}视频`}
                      disabled={index === draft.videoUrls.length - 1}
                      onClick={() => patchDraft({ videoUrls: moveItem(draft.videoUrls, index, 1) })}
                      title="下移"
                      type="button"
                    ><ArrowIcon direction="down" /></button>
                    <button
                      aria-label={`移除${provider}视频`}
                      className="memo-attachment-remove"
                      onClick={() => {
                        patchDraft({
                          videoUrls: draft.videoUrls.filter(
                            (item) => item !== video.sourceUrl
                          )
                        });
                        if (showingPreview) setPreviewUrl(null);
                      }}
                      title="移除附件"
                      type="button"
                    ><CloseIcon /></button>
                  </div>
                </div>
                {showingPreview && <MemoVideoEmbed video={video} />}
              </div>
            );
          })}
          </div>
        </section>
      )}

      {activePanel === "video" && (
        <div className="memo-editor-panel">
          <LinkIcon />
          <input
            aria-label="视频链接"
            autoFocus
            onChange={(event) => setVideoInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addVideo();
              }
              if (event.key === "Escape") setActivePanel(null);
            }}
            placeholder="粘贴视频链接"
            type="url"
            value={videoInput}
          />
          <button disabled={!videoInput.trim()} onClick={addVideo} type="button">添加</button>
        </div>
      )}

      {draft.location && activePanel !== "location" && (
        <div className="memo-editor-location-summary">
          <button onClick={openLocationEditor} type="button">
            <LocationIcon />
            <span>{draft.location.name}</span>
          </button>
          <button
            aria-label="移除位置"
            onClick={() => patchDraft({ location: null })}
            title="移除位置"
            type="button"
          ><CloseIcon /></button>
        </div>
      )}

      {activePanel === "location" && (
        <div className="memo-editor-panel memo-location-panel">
          <div className="memo-location-panel-heading">
            <LocationIcon />
            <strong>位置标签</strong>
            <span>访客点击后将在 OpenStreetMap 查看</span>
          </div>
          <div className="memo-location-name-field">
            <label>
              <span>位置名称</span>
              <input
                autoFocus
                maxLength={120}
                onChange={(event) => {
                  setLocationInput((current) => ({
                    ...current,
                    name: event.target.value
                  }));
                  setLocationSearchDone(false);
                  setLocationSearchResults([]);
                  setSelectedLocationId(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchLocation();
                  }
                }}
                placeholder="例如：上海静安寺"
                type="search"
                value={locationInput.name}
              />
            </label>
            <button
              disabled={searchingLocation || locationInput.name.trim().length < 2}
              onClick={() => void searchLocation()}
              type="button"
            >{searchingLocation ? "搜索中…" : "搜索位置"}</button>
          </div>
          {locationSearchDone && (
            <div className="memo-location-search-results">
              {locationSearchResults.length > 0 ? (
                <div aria-label="位置搜索结果" role="listbox">
                  {locationSearchResults.map((result) => (
                    <button
                      aria-selected={selectedLocationId === result.id}
                      key={result.id}
                      onClick={() => selectLocationResult(result)}
                      role="option"
                      type="button"
                    >
                      <span aria-hidden="true">⌖</span>
                      <span>{result.displayName}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p>没有找到匹配位置，可以换个名称或直接填写坐标。</p>
              )}
              <small>
                搜索结果来自 <a href="https://nominatim.openstreetmap.org/" rel="noreferrer" target="_blank">Nominatim</a>
                ，地图数据 © <a href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">OpenStreetMap contributors</a>
              </small>
            </div>
          )}
          <div className="memo-location-coordinates">
            <label>
              <span>纬度</span>
              <input
                inputMode="decimal"
                max="90"
                min="-90"
                onChange={(event) => {
                  setLocationInput((current) => ({
                    ...current,
                    latitude: event.target.value
                  }));
                  setSelectedLocationId(null);
                }}
                placeholder="31.2304"
                step="any"
                type="number"
                value={locationInput.latitude}
              />
            </label>
            <label>
              <span>经度</span>
              <input
                inputMode="decimal"
                max="180"
                min="-180"
                onChange={(event) => {
                  setLocationInput((current) => ({
                    ...current,
                    longitude: event.target.value
                  }));
                  setSelectedLocationId(null);
                }}
                placeholder="121.4737"
                step="any"
                type="number"
                value={locationInput.longitude}
              />
            </label>
            <label>
              <span>精度</span>
              <select
                onChange={(event) =>
                  setLocationInput((current) => ({
                    ...current,
                    precision: event.target.value as MemoLocationPrecision
                  }))
                }
                value={locationInput.precision}
              >
                <option value="approximate">大致位置（推荐）</option>
                <option value="exact">精确位置</option>
              </select>
            </label>
          </div>
          <p>大致位置会将经纬度保留到小数点后三位，约为街区范围。</p>
          <div className="memo-location-panel-actions">
            <button disabled={locating} onClick={useCurrentLocation} type="button">
              {locating ? "定位中…" : "使用当前位置"}
            </button>
            {locationPreview && (
              <a
                href={openStreetMapLocationUrl(locationPreview)}
                rel="noreferrer"
                target="_blank"
              >在 OSM 预览</a>
            )}
            {draft.location && (
              <button
                className="danger-text"
                onClick={() => {
                  patchDraft({ location: null });
                  setActivePanel(null);
                }}
                type="button"
              >移除</button>
            )}
            <button className="primary" onClick={applyLocation} type="button">
              应用位置
            </button>
          </div>
        </div>
      )}

      {error && <p className="memo-editor-error" role="alert">{error}</p>}

      <footer className="memo-editor-toolbar">
        <div className="memo-editor-tools">
          <div className="memo-insert-menu">
            <button
              aria-expanded={insertMenuOpen}
              aria-label="添加内容"
              className="memo-icon-button"
              disabled={uploading}
              onClick={() => setInsertMenuOpen((open) => !open)}
              type="button"
            >
              <PlusIcon />
            </button>
            {insertMenuOpen && (
              <div className="memo-insert-popover">
                <label>
                  <ImageIcon />
                  <span>{uploading ? "上传中…" : "图片"}</span>
                  <input
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    disabled={uploading || draft.images.length >= 9}
                    multiple
                    onChange={(event) => void uploadImages(event)}
                    type="file"
                  />
                </label>
                <button
                  disabled={draft.videoUrls.length >= 4}
                  onClick={() => {
                    setActivePanel("video");
                    setInsertMenuOpen(false);
                  }}
                  type="button"
                ><LinkIcon />视频链接</button>
                <button onClick={openLocationEditor} type="button">
                  <LocationIcon />位置
                </button>
              </div>
            )}
          </div>
          <label className="memo-status-select">
            <span className={`memo-status-dot ${draft.status}`} />
            <select
              aria-label="短文状态"
              onChange={(event) =>
                patchDraft({ status: event.target.value as MemoStatus })
              }
              value={draft.status}
            >
              <option value="published">公开</option>
              <option value="draft">草稿</option>
            </select>
          </label>
          {(inlineTags.length > 0 || attachmentCount > 0 || draft.location) && (
            <small>
              {inlineTags.length > 0 && `${inlineTags.length} 标签`}
              {attachmentCount > 0 && `${inlineTags.length > 0 ? " · " : ""}${attachmentCount} 附件`}
              {draft.location && `${inlineTags.length > 0 || attachmentCount > 0 ? " · " : ""}位置`}
            </small>
          )}
        </div>
        <div className="memo-editor-actions">
          {memo && <button className="memo-cancel-button" onClick={onCancel} type="button">取消</button>}
          <button
            className="memo-save-button"
            disabled={!canSave || saving || uploading}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "保存中…" : memo ? "保存" : draft.status === "published" ? "发布" : "保存"}
          </button>
        </div>
      </footer>
    </section>
  );
}

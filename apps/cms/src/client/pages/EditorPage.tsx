import type {
  GroupSummary,
  MediaItem,
  PostDetail,
  PostInput,
  PostRevision,
  VideoMediaItem
} from "@cf-blog/contracts";
import {
  isStandalonePageSlug,
  postInputSchema,
  slugify
} from "@cf-blog/contracts";
import {
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiException, api } from "../api";
import { MediaPreviewDialog } from "../components/MediaPreview";
import { MediaShelf } from "../components/MediaShelf";
import { formatDate, StatusBadge } from "../components/PostMeta";
import { insertMarkdownBlock, mediaMarkdown } from "../mediaInsertion";
import { slugAfterTitleChange } from "../postSlug";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type EditorView = "write" | "preview";

interface WritingSurfaceProps {
  className?: string;
  form: PostInput;
  onContentChange: (contentMarkdown: string) => void;
  onTitleChange: (title: string) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
}

function WritingSurface({
  className = "",
  form,
  onContentChange,
  onTitleChange,
  textareaRef
}: WritingSurfaceProps) {
  return (
    <section className={`writing-pane ${className}`.trim()}>
      <textarea
        aria-label="文章标题"
        className="title-input"
        onChange={(event) => onTitleChange(event.target.value.replace(/\n/g, " "))}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        placeholder="文章标题"
        rows={1}
        value={form.title}
      />
      <textarea
        aria-label="Markdown 正文"
        className="markdown-editor"
        onChange={(event) => onContentChange(event.target.value)}
        placeholder={"从这里开始写作…\n\n支持 Markdown、表格、脚注和任务列表。"}
        ref={textareaRef}
        spellCheck
        value={form.contentMarkdown}
      />
    </section>
  );
}

interface PreviewSurfaceProps {
  className?: string;
  form: PostInput;
  previewHtml: string;
}

function PreviewSurface({
  className = "",
  form,
  previewHtml
}: PreviewSurfaceProps) {
  return (
    <section
      aria-label="文章预览"
      className={`preview-pane ${className}`.trim()}
    >
      <div className="preview-label">预览</div>
      <article className="article-prose">
        <h1>{form.title || "未命名文章"}</h1>
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </article>
    </section>
  );
}

function signature(input: Omit<PostInput, "version">): string {
  return JSON.stringify(input);
}

function toInput(post: PostDetail): PostInput {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    contentMarkdown: post.contentMarkdown,
    coverUrl: post.coverUrl,
    tags: post.tags,
    groupId: post.group?.id ?? null,
    version: post.version
  };
}

export function EditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [form, setForm] = useState<PostInput | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<PostRevision[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [viewMode, setViewMode] = useState<EditorView>("write");
  const [focusMode, setFocusMode] = useState(false);
  const [focusPreviewOpen, setFocusPreviewOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaPreviewItem, setMediaPreviewItem] = useState<VideoMediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const lastSaved = useRef("");
  const lastObservedSignature = useRef("");
  const formRef = useRef<PostInput | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const focusTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  formRef.current = form;

  const load = useCallback(async () => {
    const [loaded, availableGroups] = await Promise.all([
      api.getPost(id),
      api.listGroups()
    ]);
    setPost(loaded);
    setGroups(availableGroups);
    const input = toInput(loaded);
    setForm(input);
    const { version: _version, ...content } = input;
    lastSaved.current = signature(content);
    setPreviewHtml(loaded.contentHtml);
  }, [id]);

  useEffect(() => {
    void load().catch((reason: unknown) =>
      setMessage(reason instanceof Error ? reason.message : "文章加载失败")
    );
  }, [load]);

  const currentSignature = useMemo(() => {
    if (!form) return "";
    const { version: _version, ...content } = form;
    return signature(content);
  }, [form]);

  useEffect(() => {
    if (!currentSignature) return;
    const contentChanged =
      lastObservedSignature.current &&
      lastObservedSignature.current !== currentSignature;
    lastObservedSignature.current = currentSignature;
    if (contentChanged && saveState !== "conflict") {
      setSaveState("idle");
      setMessage("");
    }
  }, [currentSignature, saveState]);

  const saveCurrent = useCallback(async (): Promise<PostDetail | null> => {
    const input = formRef.current;
    if (!input) return null;
    const { version: _version, ...content } = input;
    const inputSignature = signature(content);
    if (inputSignature === lastSaved.current) return post;

    const validation = postInputSchema.safeParse(input);
    if (!validation.success) {
      const invalidField = validation.error.issues[0]?.path[0];
      setSaveState("error");
      setMessage(
        invalidField === "title"
          ? "标题不能为空，且不能超过 200 个字符。"
          : invalidField === "slug"
            ? "Slug 不能为空，只能包含小写字母、数字、中文和连字符。"
            : "文章信息格式有误，请检查文章属性。"
      );
      return null;
    }

    setSaveState("saving");
    try {
      const saved = await api.savePost(id, input);
      lastSaved.current = inputSignature;
      setPost(saved);
      setForm((current) =>
        current
          ? {
              ...current,
              version: saved.version,
              excerpt: current.excerpt || saved.excerpt
            }
          : current
      );
      setSaveState("saved");
      setMessage("");
      return saved;
    } catch (reason) {
      if (reason instanceof ApiException && reason.code === "VERSION_CONFLICT") {
        setSaveState("conflict");
        setMessage("这篇文章已在另一个页面更新。请重新加载后再编辑。");
      } else {
        setSaveState("error");
        setMessage(reason instanceof Error ? reason.message : "保存失败");
      }
      return null;
    }
  }, [id, post]);

  useEffect(() => {
    if (
      deleting ||
      !form ||
      post?.status === "published" ||
      !currentSignature ||
      currentSignature === lastSaved.current
    ) {
      return;
    }
    const timer = window.setTimeout(() => void saveCurrent(), 1500);
    return () => window.clearTimeout(timer);
  }, [currentSignature, deleting, form, post?.status, saveCurrent]);

  useEffect(() => {
    if (!form) return;
    const timer = window.setTimeout(() => {
      void api
        .render(form.contentMarkdown)
        .then((rendered) => {
          setPreviewHtml(rendered.html);
        })
        .catch((reason: unknown) =>
          setMessage(reason instanceof Error ? reason.message : "预览渲染失败")
        );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form?.contentMarkdown]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (currentSignature !== lastSaved.current) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [currentSignature]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mediaPreviewItem) {
        setMediaPreviewItem(null);
      } else if (metadataOpen) {
        setMetadataOpen(false);
      } else if (revisionsOpen) {
        setRevisionsOpen(false);
      } else if (mediaOpen) {
        setMediaOpen(false);
      } else if (focusMode) {
        setFocusMode(false);
        setFocusPreviewOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode, mediaOpen, mediaPreviewItem, metadataOpen, revisionsOpen]);

  useEffect(() => {
    if (!mediaOpen || mediaLoaded || mediaLoading) return;
    setMediaLoading(true);
    setMediaError("");
    void api
      .listMedia()
      .then((items) => {
        setMediaItems(items);
        setMediaLoaded(true);
      })
      .catch((reason: unknown) => {
        setMediaError(reason instanceof Error ? reason.message : "素材加载失败");
      })
      .finally(() => setMediaLoading(false));
  }, [mediaLoaded, mediaLoading, mediaOpen]);

  useEffect(() => {
    if (!focusMode) return;
    const previousOverflow = document.body.style.overflow;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".sidebar, .editor-toolbar, .editor-body"
      )
    ).map((element) => ({
      element,
      hadInert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden")
    }));
    document.body.style.overflow = "hidden";
    backgroundElements.forEach(({ element }) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    const animationFrame = window.requestAnimationFrame(() => {
      focusTextareaRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      backgroundElements.forEach(({ element, hadInert, ariaHidden }) => {
        if (!hadInert) element.removeAttribute("inert");
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
      });
      window.cancelAnimationFrame(animationFrame);
    };
  }, [focusMode]);

  const runAction = async (action: "publish" | "archive" | "save-version") => {
    if (
      post?.status === "published" &&
      currentSignature !== lastSaved.current
    ) {
      setMessage("存在待更新内容，请先点击“更新”后再执行此操作。");
      return;
    }
    const saved = await saveCurrent();
    if (!saved && currentSignature !== lastSaved.current) return;
    try {
      const expectedVersion = saved?.version ?? post?.version;
      if (expectedVersion === undefined) return;
      const updated = await api.postAction(id, action, expectedVersion);
      setPost(updated);
      const input = toInput(updated);
      setForm(input);
      const { version: _version, ...content } = input;
      lastSaved.current = signature(content);
      setMessage(
        action === "publish"
          ? "文章已发布，边缘缓存将在约 60 秒内更新。"
          : action === "save-version"
            ? "已保存版本快照。"
            : "文章已归档。"
      );
      if (action === "archive") navigate("/posts");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "操作失败");
    }
  };

  const updatePublished = async () => {
    const saved = await saveCurrent();
    if (saved) {
      setMessage("文章已更新，边缘缓存将在约 60 秒内更新。");
    }
  };

  const showRevisions = async () => {
    const next = !revisionsOpen;
    setMetadataOpen(false);
    setMediaOpen(false);
    setRevisionsOpen(next);
    if (next) {
      try {
        setRevisions(await api.listRevisions(id));
      } catch (reason) {
        setMessage(reason instanceof Error ? reason.message : "版本历史加载失败");
        setRevisionsOpen(false);
      }
    }
  };

  const deleteCurrent = async () => {
    const confirmation = window.prompt(
      "永久删除这篇文章？正文、版本记录和预览链接都无法恢复。\n\n请输入“永久删除”确认："
    );
    if (confirmation === null) return;
    if (confirmation.trim() !== "永久删除") {
      setMessage("确认文字不匹配，文章未删除。");
      return;
    }

    setDeleting(true);
    setMessage("");
    try {
      await api.deletePost(id);
      lastSaved.current = currentSignature;
      navigate("/posts", { replace: true });
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "删除失败");
      setDeleting(false);
    }
  };

  if (!post || !form) {
    return <div className="center-screen"><span className="spinner" />载入稿纸…</div>;
  }

  const hasPendingChanges = currentSignature !== lastSaved.current;
  const saveStateText =
    saveState === "saving"
      ? post.status === "published"
        ? "更新中…"
        : "保存中…"
        : saveState === "conflict"
          ? "有冲突"
          : saveState === "error"
            ? "保存失败"
            : hasPendingChanges
              ? post.status === "published"
                ? "待更新"
                : "待保存"
              : "已保存";
  const isAboutPage = isStandalonePageSlug(form.slug);

  const updateTitle = (title: string) => {
    setForm((current) =>
      current
        ? {
            ...current,
            title,
            slug: slugAfterTitleChange({
              currentSlug: current.slug,
              currentTitle: current.title,
              nextTitle: title,
              status: post.status
            })
          }
        : current
    );
  };

  const updateContent = (contentMarkdown: string) => {
    setForm((current) =>
      current ? { ...current, contentMarkdown } : current
    );
  };

  const enterFocusMode = () => {
    setMetadataOpen(false);
    setRevisionsOpen(false);
    setMediaOpen(false);
    setFocusPreviewOpen(false);
    setFocusMode(true);
  };

  const leaveFocusMode = () => {
    setFocusMode(false);
    setFocusPreviewOpen(false);
    setMediaOpen(false);
  };

  const toggleMedia = () => {
    const next = !mediaOpen;
    setMetadataOpen(false);
    setRevisionsOpen(false);
    if (focusMode && next) setFocusPreviewOpen(false);
    setMediaOpen(next);
  };

  const insertMedia = (item: MediaItem) => {
    const input = formRef.current;
    if (!input) return;
    const textarea = focusMode ? focusTextareaRef.current : editorTextareaRef.current;
    const start = textarea?.selectionStart ?? input.contentMarkdown.length;
    const end = textarea?.selectionEnd ?? input.contentMarkdown.length;
    const insertion = insertMarkdownBlock(
      input.contentMarkdown,
      start,
      end,
      mediaMarkdown(item)
    );
    updateContent(insertion.value);
    if (!focusMode && viewMode !== "write") setViewMode("write");
    window.requestAnimationFrame(() => {
      const nextTextarea = focusMode
        ? focusTextareaRef.current
        : editorTextareaRef.current;
      nextTextarea?.focus();
      nextTextarea?.setSelectionRange(insertion.selectionStart, insertion.selectionEnd);
    });
  };

  return (
    <div className={`editor-page ${focusMode ? "focus-mode" : ""}`}>
      <header className="editor-toolbar">
        <div className="editor-breadcrumb">
          <Link to="/posts">文章</Link>
          <span>/</span>
          <span>{post.title}</span>
        </div>
        <div className="editor-toolbar-center">
          <div className={`save-state ${saveState}`}>{saveStateText}</div>
          <div className="editor-view-switch" role="group" aria-label="编辑器视图">
            <button
              aria-pressed={viewMode === "write"}
              className={viewMode === "write" ? "active" : ""}
              onClick={() => setViewMode("write")}
            >
              书写
            </button>
            <button
              aria-pressed={viewMode === "preview"}
              className={viewMode === "preview" ? "active" : ""}
              onClick={() => setViewMode("preview")}
            >
              预览
            </button>
          </div>
        </div>
        <div className="editor-actions">
          <button
            aria-expanded={mediaOpen && !focusMode}
            className={`button ghost media-action ${mediaOpen && !focusMode ? "active" : ""}`}
            onClick={toggleMedia}
            type="button"
          >
            素材
          </button>
          <button className="button ghost" onClick={enterFocusMode}>
            专注
          </button>
          <button
            aria-expanded={metadataOpen}
            className={`button ghost ${metadataOpen ? "active" : ""}`}
            onClick={() => {
              setMediaOpen(false);
              setRevisionsOpen(false);
              setMetadataOpen((open) => !open);
            }}
          >
            属性
          </button>
          <button className="button ghost version-action" onClick={() => void showRevisions()}>
            版本
          </button>
          {post.status === "published" ? (
            <button
              className="button primary"
              disabled={!hasPendingChanges || saveState === "saving"}
              onClick={() => void updatePublished()}
              type="button"
            >
              {saveState === "saving" ? "更新中…" : "更新"}
            </button>
          ) : (
            <button className="button primary" onClick={() => void runAction("publish")}>
              发布
            </button>
          )}
        </div>
      </header>

      {message && (
        <div className={`editor-message ${saveState === "error" || saveState === "conflict" ? "error" : ""}`}>
          {message}
          {saveState === "conflict" && (
            <button onClick={() => void load()}>重新加载</button>
          )}
        </div>
      )}

      <div className={`editor-workspace ${mediaOpen && !focusMode ? "media-open" : ""}`}>
        <main className={`editor-body view-${viewMode}`}>
          {viewMode === "write" ? (
            <WritingSurface
              className="editor-paper"
              form={form}
              onContentChange={updateContent}
              onTitleChange={updateTitle}
              textareaRef={editorTextareaRef}
            />
          ) : (
            <PreviewSurface
              className="editor-paper"
              form={form}
              previewHtml={previewHtml}
            />
          )}
        </main>
        {mediaOpen && !focusMode && (
          <div className="editor-media-shelf">
            <MediaShelf
              error={mediaError}
              items={mediaItems}
              loading={mediaLoading}
              onClose={() => setMediaOpen(false)}
              onInsert={insertMedia}
              onPreview={setMediaPreviewItem}
            />
          </div>
        )}
      </div>

      {(metadataOpen || revisionsOpen) && (
        <button
          aria-label="关闭侧边栏"
          className="editor-drawer-backdrop"
          onClick={() => {
            setMetadataOpen(false);
            setRevisionsOpen(false);
          }}
        />
      )}

      {metadataOpen && (
        <aside className="metadata-panel" role="dialog" aria-label="文章属性">
          <div className="drawer-heading">
            <h2>文章属性</h2>
            <button
              aria-label="关闭文章属性"
              onClick={() => setMetadataOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="metadata-content">
            <div className="status-line">
              <StatusBadge status={post.status} />
              <span>v{form.version}</span>
            </div>
            <label>
              Slug
              <input
                value={form.slug}
                onChange={(event) => {
                  const slug = slugify(event.target.value);
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          slug,
                          groupId: isStandalonePageSlug(slug)
                            ? null
                            : current.groupId
                        }
                      : current
                  );
                }}
              />
            </label>
            {isAboutPage && (
              <div className="standalone-page-note">
                <strong>关于页面</strong>
                <span>
                  发布地址固定为 /about，不显示在首页、归档、标签、搜索、RSS 或系列中。
                </span>
              </div>
            )}
            <label>
              摘要
              <textarea
                rows={4}
                value={form.excerpt}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, excerpt: event.target.value } : current
                  )
                }
                placeholder="留空则从正文自动生成"
              />
            </label>
            <label>
              标签
              <input
                value={form.tags.join(", ")}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          tags: event.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                        }
                      : current
                  )
                }
                placeholder="技术, 随笔"
              />
            </label>
            {post.status === "published" && !isAboutPage && (
              <label>
                所属分组
                <select
                  value={form.groupId ?? ""}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            groupId: event.target.value || null
                          }
                        : current
                    )
                  }
                >
                  <option value="">不属于系列</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              封面 URL
              <input
                value={form.coverUrl}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, coverUrl: event.target.value } : current
                  )
                }
                placeholder="https://media.example.com/…"
              />
            </label>
            <div className="metadata-info">
              <span>阅读约 {post.readingMinutes} 分钟</span>
              <span>更新于 {formatDate(post.updatedAt)}</span>
            </div>
            <button
              className="button full"
              disabled={post.status === "published" && hasPendingChanges}
              onClick={() => void runAction("save-version")}
              title={
                post.status === "published" && hasPendingChanges
                  ? "请先更新文章"
                  : undefined
              }
            >
              保存版本快照
            </button>
            {post.status !== "archived" && (
              <button
                className="button danger full"
                disabled={post.status === "published" && hasPendingChanges}
                onClick={() => void runAction("archive")}
                title={
                  post.status === "published" && hasPendingChanges
                    ? "请先更新文章"
                    : undefined
                }
              >
                归档文章
              </button>
            )}
            <div className="metadata-danger-zone">
              <strong>永久删除</strong>
              <p>删除正文和版本记录；媒体库中的图片不会被删除。</p>
              <button
                className="button danger full"
                disabled={deleting}
                onClick={() => void deleteCurrent()}
                type="button"
              >
                {deleting ? "删除中…" : "永久删除文章"}
              </button>
            </div>
          </div>
        </aside>
      )}

      {revisionsOpen && (
        <aside className="revisions-drawer" role="dialog" aria-label="版本历史">
          <div className="drawer-heading">
            <h2>版本历史</h2>
            <button onClick={() => setRevisionsOpen(false)} aria-label="关闭">×</button>
          </div>
          {revisions.length === 0 && <div className="empty">还没有版本快照。</div>}
          {revisions.map((revision) => (
            <article key={revision.id} className="revision-item">
              <strong>{revision.title}</strong>
              <span>{formatDate(revision.createdAt)} · {revision.reason}</span>
              <p>{revision.contentMarkdown.slice(0, 100) || "空白版本"}</p>
              <button
                className="button small"
                onClick={async () => {
                  if (!window.confirm("恢复此版本？当前内容会先保存为快照。")) return;
                  const restored = await api.restoreRevision(id, revision.id);
                  setPost(restored);
                  const input = toInput(restored);
                  setForm(input);
                  const { version: _version, ...content } = input;
                  lastSaved.current = signature(content);
                  setPreviewHtml(restored.contentHtml);
                  setRevisionsOpen(false);
                }}
              >
                恢复
              </button>
            </article>
          ))}
        </aside>
      )}

      {focusMode && (
        <div
          aria-label="专注写作模式"
          aria-modal="true"
          className={`focus-editor ${focusPreviewOpen ? "preview-open" : ""}`}
          role="dialog"
        >
          <div
            aria-label={saveStateText}
            className={`focus-save-indicator ${saveState}`}
            role="status"
            title={saveStateText}
          >
            <span aria-hidden="true" />
            <span className="focus-save-label">{saveStateText}</span>
          </div>
          <div className="focus-floating-actions">
            <button
              aria-pressed={focusPreviewOpen}
              className="focus-preview-action"
              onClick={() => {
                setMediaOpen(false);
                setFocusPreviewOpen((open) => !open);
              }}
              title={focusPreviewOpen ? "回到书写" : "打开预览"}
            >
              {focusPreviewOpen ? "书写" : "预览"}
            </button>
            <button
              aria-pressed={mediaOpen}
              onClick={toggleMedia}
              title={mediaOpen ? "关闭素材" : "打开素材"}
              type="button"
            >
              素材
            </button>
            <button onClick={leaveFocusMode} title="退出专注模式">
              退出
            </button>
          </div>
          {mediaOpen && (
            <div className="focus-media-shelf">
              <MediaShelf
                error={mediaError}
                items={mediaItems}
                loading={mediaLoading}
                onClose={() => setMediaOpen(false)}
                onInsert={insertMedia}
                onPreview={setMediaPreviewItem}
              />
            </div>
          )}
          <div className={`focus-pages ${focusPreviewOpen ? "preview-open" : ""}`}>
            <WritingSurface
              className="focus-paper focus-writing-paper"
              form={form}
              onContentChange={updateContent}
              onTitleChange={updateTitle}
              textareaRef={focusTextareaRef}
            />
            <div aria-hidden={!focusPreviewOpen} className="focus-preview-slot">
              <PreviewSurface
                className="focus-paper focus-preview-paper"
                form={form}
                previewHtml={previewHtml}
              />
            </div>
          </div>
        </div>
      )}

      {mediaPreviewItem && (
        <MediaPreviewDialog
          item={mediaPreviewItem}
          onClose={() => setMediaPreviewItem(null)}
        />
      )}
    </div>
  );
}

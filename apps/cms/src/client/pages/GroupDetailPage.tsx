import type {
  GroupDetail,
  GroupInput,
  PostSummary
} from "@cf-blog/contracts";
import { isStandalonePageSlug, slugify } from "@cf-blog/contracts";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { formatDate, StatusBadge } from "../components/PostMeta";
import { SortableRow } from "../components/SortableRow";

function toInput(group: GroupDetail): GroupInput {
  return {
    name: group.name,
    slug: group.slug,
    description: group.description
  };
}

export function GroupDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [form, setForm] = useState<GroupInput | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [allPublished, setAllPublished] = useState<PostSummary[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    void Promise.all([api.getGroup(id), api.listPosts("published")])
      .then(([loaded, published]) => {
        setGroup(loaded);
        setForm(toInput(loaded));
        setPosts(loaded.posts);
        setSavedPostIds(loaded.posts.map((post) => post.id));
        setAllPublished(published);
      })
      .catch((reason: unknown) =>
        setMessage(reason instanceof Error ? reason.message : "分组加载失败")
      );
  }, [id]);

  const postIds = useMemo(() => posts.map((post) => post.id), [posts]);
  const postsChanged = postIds.join("|") !== savedPostIds.join("|");
  const assignedIds = useMemo(() => new Set(postIds), [postIds]);
  const available = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return allPublished
      .filter(
        (post) =>
          !isStandalonePageSlug(post.slug) &&
          !assignedIds.has(post.id) &&
          (!post.group || post.group.id === id) &&
          (!keyword ||
            post.title.toLocaleLowerCase().includes(keyword) ||
            post.excerpt.toLocaleLowerCase().includes(keyword))
      )
      .slice(0, 8);
  }, [allPublished, assignedIds, id, query]);

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= posts.length) return;
    setPosts((current) => arrayMove(current, index, target));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setPosts((current) => {
      const from = current.findIndex((post) => post.id === active.id);
      const to = current.findIndex((post) => post.id === over.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };

  const saveMetadata = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await api.saveGroup(id, form);
      setGroup((current) => (current ? { ...current, ...saved } : current));
      setForm({
        name: saved.name,
        slug: saved.slug,
        description: saved.description
      });
      setMessage("分组信息已保存。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "分组保存失败");
    } finally {
      setSaving(false);
    }
  };

  const savePosts = async () => {
    setSaving(true);
    try {
      const saved = await api.saveGroupPosts(id, postIds);
      const published = await api.listPosts("published");
      setGroup(saved);
      setPosts(saved.posts);
      setSavedPostIds(saved.posts.map((post) => post.id));
      setAllPublished(published);
      setMessage("系列文章与顺序已保存。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "文章顺序保存失败");
    } finally {
      setSaving(false);
    }
  };

  const removeGroup = async () => {
    if (!group || !window.confirm(`删除分组“${group.name}”？文章不会被删除。`)) {
      return;
    }
    setSaving(true);
    try {
      await api.deleteGroup(id);
      navigate("/groups", { replace: true });
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "分组删除失败");
      setSaving(false);
    }
  };

  if (!group || !form) {
    return (
      <div className="center-screen">
        <span className="spinner" />
        载入分组…
      </div>
    );
  }

  return (
    <div className="page narrow-page group-detail-page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">
            <Link to="/groups">分组</Link> / 编辑
          </p>
          <h1>{group.name}</h1>
          <p>{group.postCount} 篇已发布文章</p>
        </div>
        <button
          className="button danger"
          disabled={saving}
          onClick={() => void removeGroup()}
          type="button"
        >
          删除分组
        </button>
      </header>

      {message && <div className="notice">{message}</div>}

      <section className="group-metadata-card">
        <div className="field-pair">
          <label>
            名称
            <input
              maxLength={80}
              onChange={(event) =>
                setForm((current) =>
                  current ? { ...current, name: event.target.value } : current
                )
              }
              value={form.name}
            />
          </label>
          <label>
            Slug
            <input
              maxLength={180}
              onChange={(event) =>
                setForm((current) =>
                  current
                    ? { ...current, slug: slugify(event.target.value) }
                    : current
                )
              }
              value={form.slug}
            />
          </label>
        </div>
        <label>
          一句简介
          <input
            maxLength={240}
            onChange={(event) =>
              setForm((current) =>
                current
                  ? { ...current, description: event.target.value }
                  : current
              )
            }
            value={form.description}
          />
        </label>
        <button
          className="button"
          disabled={saving || !form.name || !form.slug}
          onClick={() => void saveMetadata()}
          type="button"
        >
          保存分组信息
        </button>
      </section>

      <section className="section-block">
        <div className="section-heading group-section-heading">
          <div>
            <h2>系列文章</h2>
            <p>这里只能加入已发布文章，顺序将直接用于前台系列页。</p>
          </div>
          <button
            className="button primary"
            disabled={!postsChanged || saving}
            onClick={() => void savePosts()}
            type="button"
          >
            {saving ? "保存中…" : "保存文章顺序"}
          </button>
        </div>

        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          sensors={sensors}
        >
          <SortableContext
            items={postIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="group-post-list">
              {posts.map((post, index) => (
                <SortableRow id={post.id} key={post.id} label={post.title}>
                  <div className="group-post-main">
                    <strong>
                      {String(index + 1).padStart(2, "0")} · {post.title}
                    </strong>
                    <span>更新于 {formatDate(post.updatedAt)}</span>
                  </div>
                  <StatusBadge status={post.status} />
                  <div className="sort-actions">
                    <button
                      aria-label={`${post.title}上移`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`${post.title}下移`}
                      disabled={index === posts.length - 1}
                      onClick={() => move(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`从系列移除${post.title}`}
                      className="danger-text"
                      onClick={() =>
                        setPosts((current) =>
                          current.filter((item) => item.id !== post.id)
                        )
                      }
                      type="button"
                    >
                      移除
                    </button>
                  </div>
                </SortableRow>
              ))}
              {posts.length === 0 && (
                <div className="empty">这个系列还没有文章。</div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      <section className="section-block add-post-panel">
        <div className="section-heading">
          <div>
            <h2>添加已发布文章</h2>
            <p>已属于其他系列的文章请在文章编辑页中移动。</p>
          </div>
        </div>
        <input
          aria-label="搜索可添加文章"
          className="search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题或摘要…"
          type="search"
          value={query}
        />
        <div className="available-post-list">
          {available.map((post) => (
            <div className="available-post-row" key={post.id}>
              <div>
                <strong>{post.title}</strong>
                <span>{post.excerpt || "暂无摘要"}</span>
              </div>
              <button
                className="button small"
                onClick={() => setPosts((current) => [...current, post])}
                type="button"
              >
                添加
              </button>
            </div>
          ))}
          {available.length === 0 && (
            <div className="empty">没有可添加的已发布文章。</div>
          )}
        </div>
      </section>
    </div>
  );
}

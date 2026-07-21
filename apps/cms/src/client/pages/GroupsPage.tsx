import type { GroupInput, GroupSummary } from "@cf-blog/contracts";
import { slugify } from "@cf-blog/contracts";
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
import { Link } from "react-router-dom";
import { SortableRow } from "../components/SortableRow";
import { api } from "../api";

const emptyForm: GroupInput = {
  name: "",
  slug: "",
  description: ""
};

export function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const [form, setForm] = useState<GroupInput>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [message, setMessage] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    void api
      .listGroups()
      .then((items) => {
        setGroups(items);
        setSavedOrder(items.map((group) => group.id));
      })
      .catch((reason: unknown) =>
        setMessage(reason instanceof Error ? reason.message : "分组加载失败")
      );
  }, []);

  const currentOrder = useMemo(() => groups.map((group) => group.id), [groups]);
  const orderChanged = currentOrder.join("|") !== savedOrder.join("|");

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= groups.length) return;
    setGroups((current) => arrayMove(current, index, target));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setGroups((current) => {
      const from = current.findIndex((group) => group.id === active.id);
      const to = current.findIndex((group) => group.id === over.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };

  const create = async () => {
    setCreating(true);
    try {
      const created = await api.createGroup(form);
      const next = [...groups, created];
      setGroups(next);
      setSavedOrder(next.map((group) => group.id));
      setForm(emptyForm);
      setMessage("分组已创建。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "分组创建失败");
    } finally {
      setCreating(false);
    }
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      const saved = await api.reorderGroups(currentOrder);
      setGroups(saved);
      setSavedOrder(saved.map((group) => group.id));
      setMessage("分组顺序已保存。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "顺序保存失败");
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <div className="page narrow-page">
      <header className="page-header compact">
        <div>
          <p className="eyebrow">组织</p>
          <h1>分组</h1>
          <p>组织系列文章，并决定它们在前台的阅读顺序。</p>
        </div>
        <button
          className="button primary"
          disabled={!orderChanged || savingOrder}
          onClick={() => void saveOrder()}
          type="button"
        >
          {savingOrder ? "保存中…" : "保存顺序"}
        </button>
      </header>

      {message && <div className="notice">{message}</div>}

      <section className="group-create-panel" aria-label="新建分组">
        <div className="field-pair">
          <label>
            名称
            <input
              maxLength={80}
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({
                  ...current,
                  name,
                  slug:
                    current.slug === slugify(current.name)
                      ? slugify(name)
                      : current.slug
                }));
              }}
              placeholder="读书笔记"
              value={form.name}
            />
          </label>
          <label>
            Slug
            <input
              maxLength={180}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  slug: slugify(event.target.value)
                }))
              }
              placeholder="reading-notes"
              value={form.slug}
            />
          </label>
        </div>
        <label>
          一句简介
          <input
            maxLength={240}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value
              }))
            }
            placeholder="关于阅读、摘录与延伸思考"
            value={form.description}
          />
        </label>
        <button
          className="button"
          disabled={creating || !form.name || !form.slug}
          onClick={() => void create()}
          type="button"
        >
          {creating ? "创建中…" : "新建分组"}
        </button>
      </section>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={currentOrder}
          strategy={verticalListSortingStrategy}
        >
          <div className="group-admin-list">
            {groups.map((group, index) => (
              <SortableRow id={group.id} key={group.id} label={group.name}>
                <Link className="group-admin-main" to={`/groups/${group.id}`}>
                  <strong>{group.name}</strong>
                  <span>{group.description || "暂无简介"}</span>
                </Link>
                <span className="group-count">{group.postCount} 篇</span>
                <div className="sort-actions">
                  <button
                    aria-label={`${group.name}上移`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`${group.name}下移`}
                    disabled={index === groups.length - 1}
                    onClick={() => move(index, 1)}
                    type="button"
                  >
                    ↓
                  </button>
                </div>
              </SortableRow>
            ))}
            {groups.length === 0 && (
              <div className="empty">还没有分组，可以从上方创建。</div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

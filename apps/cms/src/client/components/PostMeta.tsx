import type { PostStatus } from "@cf-blog/contracts";

const statusLabels: Record<PostStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档"
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={`badge ${status}`}>{statusLabels[status]}</span>;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

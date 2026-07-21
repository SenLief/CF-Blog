import type { PostSummary } from "@cf-blog/contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatDate, StatusBadge } from "../components/PostMeta";

interface Overview {
  counts: { total: number; drafts: number; published: number; archived: number };
  recent: PostSummary[];
}

export function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void api.overview().then(setData).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "加载失败");
    });
  }, []);

  return (
    <div className="page narrow-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">写作中枢</p>
          <h1>今天写点什么？</h1>
          <p>保持简单，把注意力留给文字。</p>
        </div>
        <Link className="button primary" to="/posts/new">
          新建文章
        </Link>
      </header>

      {error && <div className="notice error">{error}</div>}
      <section className="stats-grid" aria-label="文章统计">
        {[
          ["全部", data?.counts.total ?? "—"],
          ["草稿", data?.counts.drafts ?? "—"],
          ["已发布", data?.counts.published ?? "—"],
          ["已归档", data?.counts.archived ?? "—"]
        ].map(([label, value]) => (
          <article className="stat" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>最近编辑</h2>
          <Link to="/posts">查看全部</Link>
        </div>
        <div className="simple-list">
          {data?.recent.length === 0 && <div className="empty">还没有文章。</div>}
          {data?.recent.map((post) => (
            <Link className="simple-row" to={`/posts/${post.id}`} key={post.id}>
              <div>
                <strong>{post.title}</strong>
                <span>{post.excerpt || "尚未填写摘要"}</span>
              </div>
              <div className="row-meta">
                <StatusBadge status={post.status} />
                <time>{formatDate(post.updatedAt)}</time>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

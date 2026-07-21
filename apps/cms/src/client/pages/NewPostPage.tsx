import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export function NewPostPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void api
      .createPost()
      .then((post) => navigate(`/posts/${post.id}`, { replace: true }))
      .catch(() => navigate("/posts", { replace: true }));
  }, [navigate]);

  return (
    <div className="center-screen">
      <span className="spinner" />
      正在准备一张新稿纸…
    </div>
  );
}

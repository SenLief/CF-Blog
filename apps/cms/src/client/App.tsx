import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { EditorPage } from "./pages/EditorPage";
import { GroupDetailPage } from "./pages/GroupDetailPage";
import { GroupsPage } from "./pages/GroupsPage";
import { MediaPage } from "./pages/MediaPage";
import { MemosPage } from "./pages/MemosPage";
import { NewPostPage } from "./pages/NewPostPage";
import { PostsPage } from "./pages/PostsPage";
import { SettingsPage } from "./pages/SettingsPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "posts", element: <PostsPage /> },
      { path: "posts/new", element: <NewPostPage /> },
      { path: "posts/:id", element: <EditorPage /> },
      { path: "memos", element: <MemosPage /> },
      { path: "groups", element: <GroupsPage /> },
      { path: "groups/:id", element: <GroupDetailPage /> },
      { path: "media", element: <MediaPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}

import type { SiteSettings } from "@cf-blog/contracts";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { SITE_SETTINGS_UPDATED_EVENT } from "../siteSettingsEvents";

const navItems = [
  { href: "/", label: "概览", icon: "⌂" },
  { href: "/posts", label: "文章", icon: "¶" },
  { href: "/groups", label: "分组", icon: "≡" },
  { href: "/media", label: "媒体", icon: "◫" },
  { href: "/settings", label: "设置", icon: "⚙" }
];

export function Layout() {
  const location = useLocation();
  const [siteTitle, setSiteTitle] = useState("站点");
  const isEditor = location.pathname.startsWith("/posts/") && location.pathname !== "/posts";
  const brandMark = useMemo(
    () => Array.from(siteTitle.trim())[0] ?? "站",
    [siteTitle]
  );

  useEffect(() => {
    let active = true;
    const applyTitle = (settings: SiteSettings) => {
      if (active) setSiteTitle(settings.title.trim() || "站点");
    };
    const onSettingsUpdated = (event: Event) => {
      applyTitle((event as CustomEvent<SiteSettings>).detail);
    };

    void api.getSettings().then(applyTitle).catch(() => {
      // Keep the neutral fallback when settings cannot be loaded.
    });
    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, onSettingsUpdated);

    return () => {
      active = false;
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, onSettingsUpdated);
    };
  }, []);

  return (
    <div className={`app-shell ${isEditor ? "editor-shell" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{brandMark}</span>
          <div>
            <strong title={siteTitle}>{siteTitle}</strong>
            <small>写作后台</small>
          </div>
        </div>
        <nav aria-label="主导航">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" />
          Cloudflare Edge
        </div>
      </aside>
      <main className="workspace">
        <Outlet />
      </main>
    </div>
  );
}

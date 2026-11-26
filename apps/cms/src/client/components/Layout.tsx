import type { SiteSettings } from "@cf-blog/contracts";
import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { SITE_SETTINGS_UPDATED_EVENT } from "../siteSettingsEvents";

const navItems = [
  { href: "/", label: "概览", icon: "⌂" },
  { href: "/posts", label: "文章", icon: "¶" },
  { href: "/memos", label: "碎念", icon: "·" },
  { href: "/groups", label: "分组", icon: "≡" },
  { href: "/media", label: "媒体", icon: "◫" },
  { href: "/settings", label: "设置", icon: "⚙" }
];

export function Layout() {
  const location = useLocation();
  const [siteTitle, setSiteTitle] = useState("站点");
  const [memoEnabled, setMemoEnabled] = useState<boolean | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationDrawer = useRef<HTMLDialogElement>(null);
  const brandMark = Array.from(siteTitle)[0] ?? "站";

  useEffect(() => {
    let active = true;
    const applySettings = (settings: SiteSettings) => {
      if (!active) return;
      setSiteTitle(settings.title.trim() || "站点");
      setMemoEnabled(settings.enableMemos);
    };
    const onSettingsUpdated = (event: Event) => {
      applySettings((event as CustomEvent<SiteSettings>).detail);
    };

    void api.getSettings().then(applySettings).catch(() => {
      // Keep the neutral fallback when settings cannot be loaded.
    });
    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, onSettingsUpdated);

    return () => {
      active = false;
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, onSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    navigationDrawer.current?.close();
  }, [location.key]);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 820px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) navigationDrawer.current?.close();
    };
    mobileViewport.addEventListener("change", closeOnDesktop);
    return () => mobileViewport.removeEventListener("change", closeOnDesktop);
  }, []);

  const visibleNavItems = navItems.filter(
    (item) => item.href !== "/memos" || memoEnabled === true
  );
  const memoRouteDisabled =
    memoEnabled === false && location.pathname.startsWith("/memos");

  const sidebarContent = (
    <>
      <div className="brand">
        <span className="brand-mark">{brandMark}</span>
        <div>
          <strong title={siteTitle}>{siteTitle}</strong>
          <small>写作后台</small>
        </div>
      </div>
      <nav aria-label="主导航">
        {visibleNavItems.map((item) => (
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
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar desktop-sidebar">{sidebarContent}</aside>
      <header className="mobile-header">
        <button
          aria-controls="mobile-navigation"
          aria-expanded={navigationOpen}
          aria-haspopup="dialog"
          aria-label="打开导航"
          className="mobile-nav-button"
          onClick={() => {
            navigationDrawer.current?.showModal();
            setNavigationOpen(true);
          }}
          type="button"
        >
          <span aria-hidden="true" className="mobile-nav-icon" />
        </button>
        <strong>{siteTitle}</strong>
      </header>
      <dialog
        aria-label="站点导航"
        className="sidebar-drawer"
        id="mobile-navigation"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        onClose={() => setNavigationOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.stopPropagation();
        }}
        ref={navigationDrawer}
      >
        <div className="sidebar">
          <button
            aria-label="关闭导航"
            className="mobile-nav-button sidebar-drawer-close"
            onClick={() => navigationDrawer.current?.close()}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          {sidebarContent}
        </div>
      </dialog>
      <main className="workspace">
        {memoRouteDisabled ? <Navigate replace to="/settings" /> : <Outlet />}
      </main>
    </div>
  );
}

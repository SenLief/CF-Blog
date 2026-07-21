import type {
  ImageMediaItem,
  SiteSettings,
  SiteSettingsInput
} from "@cf-blog/contracts";
import { useEffect, useState } from "react";
import { api } from "../api";
import { notifySiteSettingsUpdated } from "../siteSettingsEvents";

function linesToLinks(value: string) {
  return value
    .split("\n")
    .map((line) => {
      const [label, ...href] = line.split("|");
      return { label: label?.trim() ?? "", href: href.join("|").trim() };
    })
    .filter((link) => link.label && link.href);
}

function linksToLines(links: Array<{ label: string; href: string }>) {
  return links.map((link) => `${link.label}|${link.href}`).join("\n");
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [mediaItems, setMediaItems] = useState<ImageMediaItem[]>([]);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [navLines, setNavLines] = useState("");
  const [socialLines, setSocialLines] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .getSettings()
      .then((value) => {
        setSettings(value);
        setNavLines(linksToLines(value.nav));
        setSocialLines(linksToLines(value.social));
      })
      .catch((reason: unknown) => {
        setMessage(reason instanceof Error ? reason.message : "设置加载失败");
      });
    void api
      .listMedia()
      .then((items) =>
        setMediaItems(items.filter((item): item is ImageMediaItem => item.kind === "image"))
      )
      .catch((reason: unknown) => {
        setMessage(reason instanceof Error ? reason.message : "媒体库加载失败");
      });
  }, []);

  useEffect(() => {
    if (!mediaPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMediaPickerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [mediaPickerOpen]);

  if (!settings) {
    return (
      <div className="center-screen">
        <span className="spinner" />
        {message || "加载设置…"}
      </div>
    );
  }

  const selectedIcon =
    mediaItems.find((item) => item.id === settings.faviconMediaId) ?? null;

  const update = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    const {
      updatedAt: _updatedAt,
      faviconUrl: _faviconUrl,
      ...base
    } = settings;
    const input: SiteSettingsInput = {
      ...base,
      nav: linesToLinks(navLines),
      social: linesToLinks(socialLines)
    };
    try {
      const saved = await api.saveSettings(input);
      setSettings(saved);
      notifySiteSettingsUpdated(saved);
      setMessage("设置已保存。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page settings-page">
        <header className="page-header compact">
          <div>
            <p className="eyebrow">站点</p>
            <h1>博客设置</h1>
            <p>这里的配置会直接影响公开博客。</p>
          </div>
          <button className="button primary" disabled={saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存设置"}
          </button>
        </header>

        {message && <div className="notice">{message}</div>}
        <div className="settings-grid">
          <section className="settings-section">
            <h2>基本信息</h2>
            <label>站点名<input value={settings.title} onChange={(e) => update("title", e.target.value)} /></label>
            <label>描述<textarea rows={3} value={settings.description} onChange={(e) => update("description", e.target.value)} /></label>
            <label>作者<input value={settings.authorName} onChange={(e) => update("authorName", e.target.value)} /></label>
            <label>作者简介<textarea rows={4} value={settings.authorBio} onChange={(e) => update("authorBio", e.target.value)} /></label>
            <div className="field-pair">
              <label>语言<input value={settings.locale} onChange={(e) => update("locale", e.target.value)} /></label>
              <label>时区<input value={settings.timezone} onChange={(e) => update("timezone", e.target.value)} /></label>
            </div>
          </section>

          <section className="settings-section">
            <h2>外观</h2>
            <div className="site-icon-field">
              <span className="site-icon-label">网站图标</span>
              <div className="site-icon-setting">
                <div className="site-icon-preview">
                  {settings.faviconUrl ? (
                    <img alt="" src={settings.faviconUrl} />
                  ) : (
                    <span aria-hidden="true">无</span>
                  )}
                </div>
                <div className="site-icon-details">
                  <strong>
                    {selectedIcon?.filename ??
                      (settings.faviconMediaId ? "已选择媒体" : "尚未设置")}
                  </strong>
                  <span>建议使用清晰的正方形 PNG、WebP 或 AVIF 图片。</span>
                  <div className="site-icon-actions">
                    <button
                      className="button small"
                      onClick={() => setMediaPickerOpen(true)}
                    >
                      从媒体库选择
                    </button>
                    {settings.faviconMediaId && (
                      <button
                        className="text-button"
                        onClick={() =>
                          setSettings((current) =>
                            current
                              ? {
                                  ...current,
                                  faviconMediaId: null,
                                  faviconUrl: ""
                                }
                              : current
                          )
                        }
                      >
                        移除
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p className="site-icon-help">选择后需点击“保存设置”才会应用。</p>
            </div>
            <label>
              默认主题
              <select value={settings.defaultTheme} onChange={(e) => update("defaultTheme", e.target.value as SiteSettings["defaultTheme"])}>
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label>强调色<input type="color" value={settings.accent} onChange={(e) => update("accent", e.target.value)} /></label>
            <label className="check-label"><input type="checkbox" checked={settings.showToc} onChange={(e) => update("showToc", e.target.checked)} />显示文章目录</label>
            <label className="check-label"><input type="checkbox" checked={settings.showReadingTime} onChange={(e) => update("showReadingTime", e.target.checked)} />显示阅读时长</label>
            <label>默认分享图<input value={settings.seoImageUrl} onChange={(e) => update("seoImageUrl", e.target.value)} placeholder="https://media.example.com/…" /></label>
          </section>

          <section className="settings-section">
            <h2>导航</h2>
            <p className="field-help">每行使用“名称|地址”，相对地址可指向博客内部。</p>
            <textarea rows={7} value={navLines} onChange={(e) => setNavLines(e.target.value)} placeholder={"归档|/archives\n关于|/about"} />
          </section>

          <section className="settings-section">
            <h2>社交链接</h2>
            <p className="field-help">每行使用“名称|完整 URL”。</p>
            <textarea rows={7} value={socialLines} onChange={(e) => setSocialLines(e.target.value)} placeholder={"GitHub|https://github.com/yourname"} />
          </section>
        </div>
      </div>

      {mediaPickerOpen && (
        <div
          className="media-picker-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMediaPickerOpen(false);
          }}
        >
          <section
            aria-labelledby="media-picker-title"
            aria-modal="true"
            className="media-picker-dialog"
            role="dialog"
          >
            <header className="media-picker-header">
              <div>
                <p className="eyebrow">媒体库</p>
                <h2 id="media-picker-title">选择网站图标</h2>
              </div>
              <button
                aria-label="关闭"
                className="media-picker-close"
                onClick={() => setMediaPickerOpen(false)}
              >
                ×
              </button>
            </header>
            {mediaItems.length > 0 ? (
              <div className="media-picker-grid">
                {mediaItems.map((item) => {
                  const selected = item.id === settings.faviconMediaId;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`media-picker-item${selected ? " selected" : ""}`}
                      key={item.id}
                      onClick={() => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                faviconMediaId: item.id,
                                faviconUrl: item.url
                              }
                            : current
                        );
                        setMediaPickerOpen(false);
                      }}
                    >
                      <span className="media-picker-image">
                        <img alt={item.alt || ""} loading="lazy" src={item.url} />
                        {selected && <span className="media-picker-check">✓</span>}
                      </span>
                      <strong title={item.filename}>{item.filename}</strong>
                      <span>{item.width ?? "?"}×{item.height ?? "?"}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="media-picker-empty">
                <p>媒体库中还没有图片，请先上传一张适合作为图标的图片。</p>
                <a className="button" href="/media">前往媒体库</a>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

# 后端（CMS）功能使用指南

这份文档面向博客维护者，介绍 CMS 后台的日常操作、本地调试方式和主要安全边界。部署、Cloudflare Access 与 MCP 的完整配置分别见项目 README、[Cloudflare Access 配置](cloudflare-access.md) 和 [Codex MCP 接入与运维](codex-mcp.md)。

## 1. 本地启动

首次运行：

```bash
corepack enable
pnpm install
pnpm types
pnpm db:migrate:local
pnpm db:seed:demo:local # 可选，写入演示文章和分组
pnpm dev
```

启动后使用：

- 管理后台：<http://localhost:5173>
- CMS Worker：<http://localhost:8787>
- 公开博客：<http://localhost:4321>
- 健康检查：<http://localhost:8787/health>

本地 D1 与 R2 数据保存在 `apps/cms/.wrangler/state`。只有 `ENVIRONMENT=development` 且请求来自本机时，CMS 才会使用本地开发身份；线上不会绕过 Cloudflare Access。

## 2. 后台功能

### 概览

首页显示全部、草稿、已发布和已归档文章数量，并列出最近编辑的文章。点击“新建文章”进入编辑器，点击最近文章可继续编辑。

### 文章管理

“文章”页面支持按状态筛选、关键词搜索和批量操作。文章有三种状态：

- `draft`：草稿，只在后台和限时预览中可见。
- `published`：已发布，可由 Blog Worker 公开读取。
- `archived`：已归档，不在公开站点展示。

推荐工作流：

1. 新建文章，填写标题与 Markdown 正文。
2. 在“属性”中设置 slug、摘要、封面、标签和分组。
3. 使用“预览”检查排版；需要在公开博客环境核对时生成 10 分钟有效的预览链接。
4. 首次发布前确认标题、正文和图片替代文本完整。
5. 已发布文章修改后点击“更新”，公开内容才会改变。
6. 重要修改前可在“版本”中保存快照，之后可查看或恢复历史版本。

编辑器会保存草稿，并通过文章版本号防止多个页面相互覆盖。出现版本冲突时，应重新载入服务器版本后再合并修改。

### 短文管理

“短文”是独立于文章的轻量内容流，不需要标题和 slug：

- 在页面顶部输入纯文本，直接在正文中使用 `#标签`；系统会自动识别并同步最多 8 个标签，短文正文不会解析 Markdown 或 HTML。
- 可添加最多 9 张图片和 4 个视频链接。附件面板支持缩略图、文件信息、排序、移除和视频预览；移除图片附件不会删除媒体库中的原文件。
- 已发布短文会出现在公开站点的 `/memo` 时间轴，草稿只在后台可见。
- 短文可置顶、在原卡片位置编辑、在草稿与发布状态间切换，或永久删除；确认删除后卡片会立即从列表移除，图片仍保留在媒体库。
- 后台支持按状态筛选，以及按正文或标签关键词搜索。

短文编辑和状态变更使用版本号避免多个页面相互覆盖；用户已明确确认的永久删除不受旧版本号阻塞。公开内容通过 CMS 的 Service Binding 提供给 Blog Worker，不会暴露管理接口。

### 分组与系列

“分组”用于组织系列文章：

- 可创建、编辑、删除分组，并拖拽调整分组顺序。
- 进入分组详情后可调整组内文章顺序。
- 只有已发布文章可以加入分组。
- `about` 等独立页面不会加入系列。

公开博客会按这里的顺序生成系列页和文章内系列导航。

### 媒体库

媒体库支持图片和在线视频：

- 图片格式：JPEG、PNG、WebP、AVIF；单张最大 10 MB。
- 图片原文件写入 R2，文件名、尺寸、替代文本和对象 key 记录在 D1。
- 在线视频支持 YouTube、Bilibili、Vimeo，以及 HTTPS `.mp4` / `.webm` 直链；系统只保存规范化链接，不下载视频。
- 可从媒体库复制 Markdown，或直接从编辑器的“素材”面板插入正文。

正在作为网站图标、封面或正文资源使用的图片不能直接删除。请先移除引用，再回到媒体库删除。

### 站点设置

“设置”页面可修改：

- 站点名、描述、作者和作者简介
- 语言、时区、默认主题和强调色
- 文章目录、阅读时长、默认分享图和网站图标
- 短文功能开关与公开页介绍。开关会单独即时保存；开启后可编辑介绍，公开页作者读取“基本信息 → 作者”
- 公开站点导航与社交链接

导航和社交链接每行使用 `名称|地址`。修改后必须点击“保存设置”，公开博客才会读取新配置。

关闭短文功能不会删除已有数据，但会隐藏后台短文导航、阻止后台短文接口、隐藏公开 Memo 导航、让 `/memo` 返回 404，并从 Sitemap 移除该地址。重新开启即可恢复；短文介绍等文本修改仍需点击页面顶部“保存设置”。

## 3. 后端接口与数据流

CMS Worker 负责管理接口、Markdown 渲染、版本控制和数据存储；Blog Worker 只通过 Service Binding 读取公开内容。

| 路径 | 用途 |
| --- | --- |
| `/health` | CMS 健康检查 |
| `/api/overview` | 后台统计与最近文章 |
| `/api/posts/*` | 文章、状态、版本和预览链接 |
| `/api/memos/*` | 纯文本短文、标签、图片、视频、状态、置顶和删除 |
| `/api/groups/*` | 分组与文章排序 |
| `/api/media*` | 图片上传、在线视频和媒体删除 |
| `/api/settings` | 站点设置 |
| `/api/settings/memos` | 即时开启或关闭短文功能 |
| `/api/render` | Markdown 服务端预览 |
| `/mcp` | 受 Access 保护的 MCP 自动化入口 |
| `/media/*` | CMS 侧媒体读取；公开站点通过 Blog Worker 代理 |

浏览器管理接口不是公开第三方 API：`/api/*` 需要 Cloudflare Access 身份，写操作还要求同源请求。外部自动化应使用 `/mcp` 和独立的 Access Service Token，不要复制浏览器 Cookie 或直接暴露管理接口。

数据分工：

- D1：文章、短文、发布状态、标签、分组、版本、预览令牌、媒体元数据和站点设置。
- R2：图片原文件。
- Blog Worker：通过 `ContentService` Service Binding 读取已发布内容，并代理公开图片。

## 4. 常用维护命令

```bash
pnpm db:migrate:local      # 应用本地 D1 migration
pnpm db:seed:demo:local    # 重建本地演示文章与分组
pnpm typecheck             # 类型与 Astro 检查
pnpm test                  # 单元和回归测试
pnpm build                 # 生产构建
pnpm check                 # 依次执行类型检查、测试和构建
pnpm db:migrate:remote     # 应用远程 D1 migration
pnpm deploy                # 检查、迁移并依次部署 CMS 与 Blog
```

远程迁移或部署前应先确认 Wrangler 当前登录账号、`wrangler.jsonc` 中的资源名称、Service Binding 和生产域名配置。敏感值不要写入命令、截图、配置文件或日志；Worker secret 使用 Wrangler 的交互式 secret 命令设置。

## 5. 常见问题

### 后台可以打开，但接口返回 401

线上检查 Cloudflare Access Application、`ACCESS_TEAM_DOMAIN` 和 `ACCESS_AUD` 是否匹配当前 CMS 域名。本地则确认 CMS Worker 以项目的 `dev:worker` 脚本启动，并且地址是 `localhost` 或 `127.0.0.1`。

### 公开博客返回 503

本地开发时通常是 Blog 无法连接 CMS Service Binding。确认 `pnpm dev` 中的 CMS Worker 已在 `8787` 端口就绪，再重载 Blog。线上检查 Blog 配置中的 CMS 服务名是否与 CMS Worker 名称一致。

### 发布提示版本冲突

文章已在另一个页面或客户端更新。重新读取文章，确认差异后再保存；不要反复提交旧的版本号覆盖新内容。

### 图片无法删除

图片仍被文章、封面或网站图标引用。先在文章或设置中移除引用并保存，再回到媒体库删除。

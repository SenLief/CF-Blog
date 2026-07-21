# Codex MCP 接入与运维

cf-blog 在 CMS Worker 的 `/mcp` 提供无状态 Streamable HTTP MCP。它直接复用现有 D1、文章服务、Cloudflare Access 鉴权和版本冲突控制，不需要额外数据库或同步任务。

## 1. 创建专用 Service Token

1. 打开 **Cloudflare Zero Trust > Access controls > Service credentials > Service Tokens**。
2. 创建一个只供 MCP 客户端使用的 Token，将 Client ID 与 Client Secret 保存到密码管理器；Secret 通常只展示一次。
3. 打开保护 CMS 的 Access Application。
4. 新增一条 policy：
   - Action：`Service Auth`
   - Include：`Service Token`
   - Value：只选择刚创建的 Token
5. 保留供浏览器登录使用的原有 `Allow` policy。

不要给 Service Token 配置 `Everyone` 或其他宽泛 selector，也不要与浏览器登录凭证混用。

Cloudflare 参考：[Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) 与 [Authenticate agents](https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/)。

## 2. 配置 MCP 客户端

MCP endpoint 是受 Access 保护的 CMS 域名加 `/mcp`：

```text
https://admin.example.com/mcp
```

客户端需要在每次请求中发送：

```text
CF-Access-Client-Id: <client-id>
CF-Access-Client-Secret: <client-secret>
```

以 Codex 项目配置为例，可把凭证值留在环境变量中，只在配置里引用变量名：

```toml
[mcp_servers.cf_blog]
url = "https://admin.example.com/mcp"
env_http_headers = { "CF-Access-Client-Id" = "CF_BLOG_ACCESS_CLIENT_ID", "CF-Access-Client-Secret" = "CF_BLOG_ACCESS_CLIENT_SECRET" }
startup_timeout_sec = 20
tool_timeout_sec = 60
```

启动 Codex 的环境中提供值：

```bash
export CF_BLOG_ACCESS_CLIENT_ID='...'
export CF_BLOG_ACCESS_CLIENT_SECRET='...'
```

不要把真实 Token 写进 TOML、仓库、终端截图或日志。修改环境变量后需要重启客户端，使其重新加载配置。

## 3. 工具与边界

当前 MCP 提供六个文章工具：

- `search_posts`：按关键词和状态搜索摘要。
- `get_post`：按 UUID 或 slug 读取完整 Markdown、状态和版本。
- `create_draft`：创建草稿，不会直接发布。
- `update_post`：完整更新文章字段。
- `change_post_status`：发布、转为草稿或归档。
- `delete_post`：确认标题后删除文章。

媒体、系列排序、站点设置和版本恢复仍通过网页后台操作。

安全约束：

- 所有请求都复用 CMS 的 Access JWT 验证。
- 已有文章的修改要求最近读取到的 `expectedVersion`；新建文章版本从 `0` 开始。
- 版本过期会返回 `VERSION_CONFLICT`，客户端应重新读取，不应盲目覆盖。
- 已发布文章只有在显式执行更新后才改变公开内容，写作过程中的本地修改不会自动发布。
- 删除要求 `confirmTitle` 与当前标题完全一致。
- 服务端结构化日志不会记录文章正文、Client ID 或 Client Secret。

MCP tool annotations 只用于向客户端描述只读、幂等或破坏性意图，不替代服务端鉴权与版本检查。

## 4. 验证

未认证请求应被 Access 或 Worker 拒绝：

```bash
curl -i https://admin.example.com/mcp
```

建议先在 MCP 客户端中执行 `search_posts` 与 `get_post` 验证只读访问，再测试写入：

1. 创建一篇临时草稿。
2. 读取文章并记录版本。
3. 使用该版本更新正文。
4. 明确执行状态变更后发布。
5. 再次读取并确认状态、Markdown 和版本。
6. 按需归档，或用完全匹配的标题确认删除测试文章。

## 5. 轮换与撤销

轮换时：

1. 创建新的 Service Token。
2. 将 Access `Service Auth` policy 精确切换到新 Token。
3. 更新本机环境变量并重启 MCP 客户端。
4. 验证新 Token 后撤销旧 Token。

怀疑 Secret 泄露时应立即撤销旧 Token，从 policy 中移除它，并清除本机与密码管理器中的旧值。不要删除浏览器登录所需的 `Allow` policy。

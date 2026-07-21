# Cloudflare Access 配置

目标是让 Blog 与图片保持公开，只保护 CMS 管理域名。公开图片由 Blog 的 `/media/*` 代理输出，因此 CMS 整个域名都可以放在 Access 后面，不需要为图片路由设置 Bypass。

以下示例使用：

- Blog：`https://blog.example.com`
- CMS：`https://admin.example.com`
- Zero Trust team domain：`https://your-team.cloudflareaccess.com`

请替换为自己的域名和账号值。

## 1. 初始化 Zero Trust

1. 登录 Cloudflare Dashboard，进入 **Zero Trust**。
2. 首次使用时设置 team name。
3. 在 Zero Trust 设置中找到 team domain。

项目配置需要含协议的完整地址：

```text
https://your-team.cloudflareaccess.com
```

## 2. 保护 CMS

可以先保护 Worker 的 `workers.dev` 地址，验证后再切换自定义域名：

1. 进入 **Workers & Pages**，打开 CMS Worker。
2. 在 **Settings > Domains & Routes** 中为目标域名启用 Cloudflare Access；也可以在 Zero Trust 中创建 Self-hosted Application。
3. 新建 `Allow` policy，只包含需要登录后台的邮箱或身份组。
4. 在 Application 设置中复制 **Application Audience (AUD) Tag**。

不要把 Access 配置到 Blog Worker，否则公开博客、RSS、Sitemap 和图片也会要求登录。

## 3. 回填 Worker 配置

编辑 `apps/cms/wrangler.jsonc`：

```jsonc
{
  "vars": {
    "ENVIRONMENT": "production",
    "ACCESS_TEAM_DOMAIN": "https://your-team.cloudflareaccess.com",
    "ACCESS_AUD": "your-application-audience-tag",
    "BLOG_URL": "https://blog.example.com",
    "MEDIA_BASE_URL": "https://blog.example.com/media"
  }
}
```

注意：

- `ACCESS_TEAM_DOMAIN` 必须以 `https://` 开头，不要附加 `/cdn-cgi/access/certs`。
- `ACCESS_AUD` 必须来自当前 CMS 域名对应的 Access Application。
- `MEDIA_BASE_URL` 应指向 Blog，不应指向受保护的 CMS。
- 这些值不是密码，但必须与 Access Application 和实际域名完全一致。

更新配置后生成类型并部署：

```bash
pnpm types
pnpm --filter @cf-blog/cms deploy
pnpm --filter @cf-blog/blog deploy
```

## 4. 验证

在浏览器无痕窗口打开 CMS：

```text
https://admin.example.com
```

正确流程是先出现 Cloudflare Access 登录页，授权后进入管理后台，并能读取概览数据。

再检查公开侧：

```bash
curl -I https://blog.example.com
curl -I https://blog.example.com/rss.xml
curl -I https://blog.example.com/media/not-found.jpg
```

博客与 RSS 应直接返回公开响应；不存在的图片应返回 `404`，三者都不应重定向到 Access 登录页。

## 5. 使用自定义域名

建议分别绑定：

- `blog.example.com` → `cf-blog-web`
- `admin.example.com` → `cf-blog-cms`

在 Workers 的 **Domains & Routes** 中添加 Custom Domain，然后为 CMS 自定义域名创建新的 Self-hosted Access Application。Access Application 如果被重新创建，其 AUD 也会改变，需要重新写入配置并部署。

正式域名全部验证后，可关闭临时地址：

```jsonc
{
  "workers_dev": false,
  "preview_urls": false
}
```

两个 Worker 可以分别设置。关闭前先确认自定义域名、Access、Service Binding 和公开媒体代理都已正常工作。

## 6. 为什么 Worker 仍校验 JWT

Access 会在边缘认证用户，并通过 `Cf-Access-Jwt-Assertion` 请求头传递应用 JWT。CMS Worker 还会校验 JWT 签名、issuer 和 AUD；这让管理 API 不只依赖路由侧的一层配置。

浏览器管理写操作还需要同源请求。MCP 等非浏览器客户端则通过 Access Service Token 获得 JWT，不依赖浏览器 Origin。

Cloudflare 官方参考：

- [Protect with Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/)
- [Validate Access tokens](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/)
- [Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)

## 常见问题

### 登录成功，但后台仍返回未授权

依次检查：

1. `ACCESS_AUD` 是否来自当前 CMS Access Application。
2. `ACCESS_TEAM_DOMAIN` 是否为当前 Zero Trust 组织的 team domain。
3. 配置修改后是否重新部署 CMS。
4. Access Application 是否被删除后重建；重建会产生新 AUD。

### 文章图片跳转到登录页

`MEDIA_BASE_URL` 很可能指向了 CMS。应改为公开 Blog 的媒体路径，例如：

```text
https://blog.example.com/media
```

### CMS 没有出现 Access 登录页

确认 Access Application 的 hostname 与实际打开的域名一致，并检查 policy 的 Action 是否为 `Allow`。浏览器可能仍持有有效 Cookie，可用无痕窗口复测。

### 登录页提示无权访问

当前身份没有匹配任何 Allow policy。检查邮箱、身份提供商或组条件；个人部署不建议使用 `Everyone` 等宽泛规则。

# 安全策略

## 支持范围

安全修复优先合入默认分支。项目尚未承诺长期维护旧版本；部署者应及时同步默认分支、检查 migration，并关注 Cloudflare 与 npm 依赖更新。

## 报告漏洞

请使用 GitHub 仓库的 **Security > Report a vulnerability** 私下提交报告。不要为未修复漏洞创建公开 issue，也不要在示例、日志或截图中附带真实 Access Token、JWT、账号 ID 或文章数据。

报告中请包含：

- 受影响的提交或版本。
- 可复现的最小步骤。
- 实际影响和可能的攻击条件。
- 如有，建议的修复方向。

维护者确认问题后会协调修复和披露时间。若仓库尚未启用 Private Vulnerability Reporting，请联系仓库所有者并仅发送不含敏感利用细节的初始说明。

## 部署者责任

- 用 Cloudflare Access 保护整个 CMS 域名，并保持 Worker 内 JWT 校验启用。
- 为人类登录和自动化客户端使用不同 policy 与凭证。
- 定期轮换 Service Token，不把 Secret 写入仓库或 Wrangler 明文变量。
- 将公开媒体指向 Blog 的 `/media/*`，不要绕过 CMS 的鉴权路由。
- 对 D1 和 R2 采用符合自身恢复目标的备份与保留策略。

# 参与贡献

感谢你愿意改进 cf-blog。提交前请先搜索现有 issue，避免重复工作；较大的功能或数据模型变化建议先开 issue 讨论范围。

## 开发环境

要求 Node.js `^20.19.0` 或 `>=22.12.0`，并使用仓库声明的 pnpm 版本。

```bash
corepack enable
pnpm install
pnpm types
pnpm db:migrate:local
pnpm dev
```

本地地址和完整说明见 [README](README.md#本地开发)。

## 修改原则

- 保持 Blog、CMS、共享契约与 Markdown 包之间的职责边界。
- API 或 D1 schema 变更需要同步更新共享类型、migration 和测试。
- 新 migration 只能向前新增；不要改写已经发布的 migration。
- 媒体 URL、Markdown 和外部输入必须经过服务端校验与清理。
- 不要提交 `.dev.vars`、Access Token、账号 ID、资源 ID、真实域名或本地 Wrangler 状态。
- UI 文案与现有中文界面保持一致；响应式改动需覆盖普通编辑和专注模式。

## 提交前检查

```bash
pnpm check
```

如果修改了 `wrangler.jsonc` 的绑定或变量，再运行：

```bash
pnpm types
```

并提交相应的 `worker-configuration.d.ts` 变化。

## Pull Request

PR 请保持单一目的，并说明：

- 解决的问题和主要设计取舍。
- 用户可见变化及必要的截图。
- 数据库、绑定、部署顺序或兼容性影响。
- 已执行的测试与仍需人工验证的部分。

提交信息建议使用清晰的祈使句，例如 `fix editor publish flow` 或 `add media filter`。项目不强制特定提交规范。

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { renderMarkdown } from "../packages/markdown/src/index.ts";

const useLocalDatabase = process.argv.includes("--local");
const useRemoteDatabase = process.argv.includes("--remote");
if (useLocalDatabase && useRemoteDatabase) {
  throw new Error("只能选择 --local 或 --remote 其中一个数据库目标。");
}
const databaseTarget = useLocalDatabase ? "--local" : "--remote";

const posts = [
  {
    id: "demo-cloudflare-architecture-0001",
    slug: "cloudflare-workers-d1-r2",
    title: "Cloudflare Workers、D1 与 R2：一套轻量内容系统的取舍",
    excerpt:
      "从一次真实的个人博客设计出发，看看计算、关系数据与对象存储如何分工，以及哪些复杂度值得保留。",
    tags: [
      ["Cloudflare", "cloudflare"],
      ["工程", "工程"],
      ["架构", "架构"]
    ],
    publishedAt: "2026-07-18T08:30:00.000Z",
    markdown: String.raw`
> 小系统真正稀缺的，不是功能，而是清晰的边界。

个人博客看起来很简单：写文章、传图片、把页面展示出来。可一旦把“以后还要继续用”算进去，问题就变成了另一件事——数据放在哪里，公开读取与后台写入如何隔离，部署失败时能否快速回退，以及一年后自己是否还看得懂。

这套博客最后选择了 Workers、D1、R2 和 Service Binding。不是因为组件越多越好，而是它们恰好对应四个互不混淆的责任。

## 先把数据流画清楚

公开请求只经过 Blog Worker。它负责页面渲染、SEO、RSS、搜索索引和缓存，但不具备管理文章的能力。

后台写作发生在 CMS Worker：

1. Cloudflare Access 确认操作者身份；
2. CMS 校验输入并渲染 Markdown；
3. 文章与版本进入 D1；
4. 图片原文件进入 R2；
5. Blog 通过同账户 Service Binding 读取已经发布的内容。

这样做的直接收益是：公开站点即使面对大量请求，也不会把管理 API 一同暴露出去。

## 三种能力，各自只做一件事

| 能力 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| Workers | 请求处理、鉴权、渲染 | 长期保存业务数据 |
| D1 | 文章、标签、版本和设置 | 大文件与图片分发 |
| R2 | 原始媒体对象 | 关系查询与发布状态 |

这张表看似朴素，却能阻止很多“顺手放进去”的决定。边界一旦稳定，代码通常也会跟着变短。

## 一个很小的读取接口

Blog 不需要知道 CMS 的路由、Access Cookie 或数据库结构。它只依赖一个内部读取入口：

~~~ts
export class ContentService extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/posts") {
      return Response.json(await listPublishedPosts(this.env.DB));
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
~~~

这层接口的价值不在于“少写一次 HTTP 地址”，而在于明确表达：这是账户内部的能力，不是面向互联网的公共 API。

## 缓存不是越久越好

文章站点很适合缓存，但发布体验也需要可预测。这里选择了一分钟的新鲜期，并允许边缘节点在后台更新：

- 正常访问优先返回缓存内容；
- 缓存过期后可以边返回、边刷新；
- 上游短暂失败时继续提供旧页面；
- 预览链接始终使用 private, no-store。

一分钟并不是某个神奇数字。它只是一个容易理解的承诺：发布后稍等片刻，所有读者都会看到新版本。

## 被刻意放弃的复杂度

- [x] 不引入独立数据库服务器
- [x] 不在浏览器中保存管理密钥
- [x] 不为个人站点建设多租户权限系统
- [x] 不让 Blog 直接查询可写数据库接口
- [x] 不把图片二进制塞进关系表

工程设计经常被误解为“增加正确的东西”。对个人项目来说，更重要的往往是持续删除那些需要长期照看的东西。

## 最后看维护成本

这套结构并不适合所有内容系统。它没有复杂的审核流、协同编辑和插件市场，却非常适合一个人长期写作：资源数量少，计费边界清楚，数据可以导出，前后端也能分别演进。

当一个系统安静到几乎感觉不到它的存在，写作者才有机会把注意力重新放回文字本身。
`.trim()
  },
  {
    id: "demo-edge-writing-0002",
    slug: "writing-at-the-edge",
    title: "在边缘写作：把个人博客做成一件长期可维护的事",
    excerpt:
      "个人博客的意义不在于拥有另一个发布渠道，而在于建立一块可以缓慢积累、不被时间线冲走的地方。",
    tags: [
      ["写作", "写作"],
      ["博客", "博客"],
      ["长期主义", "长期主义"]
    ],
    publishedAt: "2026-07-12T13:20:00.000Z",
    markdown: String.raw`
社交网络训练我们快速表达：一个观点最好在几句话内结束，一张图要在半秒内抓住注意力，刚刚发布的内容很快就会被下一条信息推走。

个人博客做的是相反的事。它允许一篇文章慢一点抵达，也允许作者在几个月后回来修改一句不够准确的话。

## 写作需要一块不会移动的地面

我想要的博客并不是一个“内容分发矩阵”的节点，而是一间小书房。门可以一直开着，但桌椅的位置由自己决定。

这里没有推荐算法替我判断什么值得被看见，也没有一个不断变化的产品规则提醒我适应新的格式。文章按照时间归档，标签只是路标，搜索负责在记忆模糊时把旧文字找回来。

> 发布不是一次终结，它只是文字开始拥有地址的时刻。

一个稳定的地址很重要。它让引用成为可能，让旧文章可以在新文章里继续生长，也让今天的思考和三年后的自己发生联系。

## 简洁不是页面上什么都没有

真正的简洁，应该把层级做得足够清楚：

- 标题承担判断，不承担装饰；
- 摘要帮助读者决定是否继续；
- 正文拥有舒适的行宽和稳定的节奏；
- 标签负责横向连接，归档负责纵向回看；
- 明暗主题尊重阅读环境，而不是展示技巧。

当这些基础关系被处理好，页面就不需要用动画证明自己“有设计”。

## 长期维护依赖低摩擦

写作后台最重要的按钮不是“发布”，而是让人愿意再次打开它。

自动保存减少对丢稿的担心；真实预览让排版问题在发布前出现；版本快照允许大胆修改；媒体库把图片地址变成可以重复使用的资产。每一项都很普通，但组合起来会改变写作时的心理负担。

我越来越相信，好的个人工具应该在日常里退后一步。它不要求形成一套复杂的使用仪式，只在需要时出现，然后可靠地完成工作。

## 留下一点未完成

博客上线时不必拥有完整的栏目、精致的头像和十篇存货。空白本身也是诚实的状态。

可以先写一篇说明为什么要建立这里，再写一篇最近真正想明白的事。慢慢地，链接会出现，主题会聚拢，语言也会找到自己的速度。

长期项目很少由某一次冲刺完成。它更像每天经过时顺手浇一点水：动作不大，却因为没有中断而变得可见。
`.trim()
  },
  {
    id: "demo-reading-notes-0003",
    slug: "slow-down-to-write-clearly",
    title: "读书笔记：为什么慢一点，反而写得更清楚",
    excerpt:
      "速度擅长制造完成感，停顿则帮助我们分辨：哪些是事实，哪些是判断，哪些只是刚刚形成的情绪。",
    tags: [
      ["阅读", "阅读"],
      ["写作", "写作"],
      ["笔记", "笔记"]
    ],
    publishedAt: "2026-06-30T02:10:00.000Z",
    markdown: String.raw`
最近重新整理过去一年的读书笔记，最明显的感受不是“读得太少”，而是许多记录写得太快。

当时觉得已经抓住了重点，现在再看，只剩下一串没有上下文的结论。它们很像是答案，却无法还原问题。

## 摘抄只完成了第一步

一句话让人停下来，通常因为它碰到了某段经验。只收藏原句，会把最重要的那部分丢掉：**它为什么在此刻击中了我？**

现在我会在摘抄之后补三行：

1. 作者正在回答什么问题；
2. 我同意或怀疑的部分是什么；
3. 它与哪一段亲身经验发生了连接。

这样记录会慢很多，却更容易在几个月后重新进入当时的思路。

## 把判断和事实分开

很多含糊并不是词汇不够，而是句子里混进了不同性质的东西。

“这个产品很难用”是一项判断；“我在五分钟内没有找到导出入口”是一段事实；“我因此有些烦躁”则是感受。三者都可以写，但应该知道自己正在写哪一种。

> 清楚不是把句子变短，而是让每句话只承担它能够证明的重量。

这个方法也适合日常沟通。先描述观察，再说明理解，最后提出需要。许多争论会因此失去继续升级的燃料。

## 给草稿一晚时间

完成初稿后立刻发布，获得的是速度；隔一晚再读，获得的是距离。

距离会暴露重复的段落、过度用力的形容词，以及那些作者以为读者一定知道、实际上从未交代的前提。修改并不总是增加内容，更多时候是在撤掉脚手架。

我给自己的新规则很简单：

- 短札至少离开屏幕十分钟；
- 普通文章隔一晚；
- 重要文章在不同设备上各读一次；
- 如果一句话主要为了显得聪明，就删掉它。

慢一点并不会自动带来好文字。但它会给判断力留下进入现场的时间。
`.trim()
  },
  {
    id: "demo-city-walk-0004",
    slug: "a-walk-after-the-rain",
    title: "雨停之后，沿着旧街走一段",
    excerpt:
      "傍晚的雨把城市擦亮了一遍。没有目的地的时候，熟悉的街道反而显出许多平时看不见的细节。",
    tags: [
      ["随笔", "随笔"],
      ["城市", "城市"]
    ],
    publishedAt: "2026-06-15T10:45:00.000Z",
    markdown: String.raw`
雨是在六点左右停的。

楼下积水还没有退，公交车经过路口时推起一阵很轻的浪。空气里混着湿树叶、柏油和晚饭的味道。原本只是下楼取快递，走到街角时却突然不想马上回去。

## 被雨改变的光

云层没有完全散开，天色像一张没有晾干的纸。商店的灯提前亮了，颜色落在路面上，被水拉成长长的影子。

平时匆忙经过的修鞋铺只有两米宽。师傅坐在门口，慢慢给一双旧皮鞋上油。旁边的小电扇仍在转，吹动墙上一张已经褪色的价目表。

再往前，一棵香樟树把雨滴断断续续地落下来。有人经过时缩一下肩，随后又若无其事地继续走。

---

旧街没有值得专程前往的景点。它的好看来自那些没有被安排过的部分：阳台上收晚了的衣服，窗台边乘凉的猫，店主用粉笔写下又被雨水晕开的菜单。

## 没有目的地的半小时

我们太习惯把行走变成两点之间的运输。地图给出最快路线，耳机填满途中空白，身体到达了，意识却没有真正经过。

那天我把手机留在口袋里，只沿着有树的方向走。半小时后绕回原来的街口，快递纸箱已经被雨后的潮气浸得有些软。

并没有想明白什么重要的事，心里却安静了一点。

或许散步的作用就是这样：它不解决问题，只把问题从眼前稍微移开，让世界重新拥有一点纵深。
`.trim()
  },
  {
    id: "demo-weekly-notes-0005",
    slug: "weekly-notes-01",
    title: "本周拾遗 01：五个没有答案的小问题",
    excerpt:
      "一些不足以写成长文、又不想立刻丢掉的念头。先把问题留下，答案可以晚一点出现。",
    tags: [
      ["拾遗", "拾遗"],
      ["思考", "思考"]
    ],
    publishedAt: "2026-05-28T15:00:00.000Z",
    markdown: String.raw`
有些念头太小，撑不起一篇完整文章；但如果不记下来，它们又会很快消失。

这一周留下了五个问题：

1. 当一个工具越来越懂我，它是在减少选择成本，还是悄悄缩小选择范围？
2. 为什么我们愿意花很多时间整理任务，却很少整理“不再做什么”？
3. 一段关系里的坦诚，是否也应该包含表达的时机？
4. 如果阅读没有立刻转化成输出，它是否仍然有价值？
5. 什么样的重复是练习，什么样的重复只是惯性？

暂时没有答案。

把问题留下并不是拖延。很多真正属于自己的判断，都需要先在生活里经过几次碰撞。

下次回看时，也许其中三个已经不再重要，一个被证明问错了，最后一个终于长成了值得认真写下去的主题。
`.trim()
  }
];

const groups = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "读书笔记",
    slug: "reading-notes",
    description: "关于阅读、摘录与延伸思考。",
    postIds: [
      "demo-reading-notes-0003",
      "demo-edge-writing-0002",
      "demo-cloudflare-architecture-0001"
    ]
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "旅行手记",
    slug: "travel-notes",
    description: "记录城市、路线和途中见闻。",
    postIds: ["demo-city-walk-0004"]
  }
];

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const demoIds = posts.map((post) => sqlString(post.id)).join(", ");
const demoSlugs = posts.map((post) => sqlString(post.slug)).join(", ");
const demoGroupIds = groups.map((group) => sqlString(group.id)).join(", ");
const demoGroupSlugs = groups.map((group) => sqlString(group.slug)).join(", ");
const statements = [
  "PRAGMA foreign_keys = ON;",
  `DELETE FROM posts WHERE id IN (${demoIds}) OR slug IN (${demoSlugs});`,
  `DELETE FROM "groups"
   WHERE id IN (${demoGroupIds}) OR slug IN (${demoGroupSlugs});`
];

for (const [sortOrder, group] of groups.entries()) {
  statements.push(
    `INSERT INTO "groups" (
      id, name, slug, description, sort_order, created_at, updated_at
    ) VALUES (
      ${sqlString(group.id)},
      ${sqlString(group.name)},
      ${sqlString(group.slug)},
      ${sqlString(group.description)},
      ${sortOrder},
      '2026-07-20T00:00:00.000Z',
      '2026-07-20T00:00:00.000Z'
    );`
  );
}

for (const post of posts) {
  const rendered = await renderMarkdown(post.markdown);
  statements.push(
    `INSERT INTO posts (
      id, slug, title, excerpt, content_markdown, content_html, content_text,
      cover_url, status, reading_minutes, version, published_at, created_at, updated_at
    ) VALUES (
      ${sqlString(post.id)},
      ${sqlString(post.slug)},
      ${sqlString(post.title)},
      ${sqlString(post.excerpt)},
      ${sqlString(post.markdown)},
      ${sqlString(rendered.html)},
      ${sqlString(rendered.plainText)},
      '',
      'published',
      ${rendered.readingMinutes},
      0,
      ${sqlString(post.publishedAt)},
      ${sqlString(post.publishedAt)},
      ${sqlString(post.publishedAt)}
    );`
  );

  statements.push(
    `INSERT INTO post_revisions (
      id, post_id, version, title, slug, excerpt, content_markdown, reason, created_at
    ) VALUES (
      ${sqlString(`${post.id}-revision-0`)},
      ${sqlString(post.id)},
      0,
      ${sqlString(post.title)},
      ${sqlString(post.slug)},
      ${sqlString(post.excerpt)},
      ${sqlString(post.markdown)},
      'publish',
      ${sqlString(post.publishedAt)}
    );`
  );

  for (const [tagName, tagSlug] of post.tags) {
    const tagId = `demo-tag-${tagSlug}`;
    statements.push(
      `INSERT OR IGNORE INTO tags (id, name, slug)
       VALUES (${sqlString(tagId)}, ${sqlString(tagName)}, ${sqlString(tagSlug)});`,
      `INSERT INTO post_tags (post_id, tag_id)
       SELECT ${sqlString(post.id)}, id FROM tags
       WHERE name = ${sqlString(tagName)} COLLATE NOCASE;`
    );
  }
}

for (const group of groups) {
  for (const [position, postId] of group.postIds.entries()) {
    statements.push(
      `UPDATE posts
       SET group_id = ${sqlString(group.id)}, group_position = ${position}
       WHERE id = ${sqlString(postId)} AND status = 'published';`
    );
  }
}

const directory = await mkdtemp(join(tmpdir(), "cf-blog-seed-"));
const seedPath = join(directory, "demo-posts.sql");

try {
  await writeFile(seedPath, `${statements.join("\n\n")}\n`, "utf8");
  const result = spawnSync(
    join(process.cwd(), "node_modules", ".bin", "wrangler"),
    ["d1", "execute", "DB", databaseTarget, "--file", seedPath, "--yes"],
    {
      cwd: join(process.cwd(), "apps", "cms"),
      encoding: "utf8",
      stdio: "inherit"
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  else {
    const targetLabel = databaseTarget === "--local" ? "本地" : "远程";
    console.log(
      `已向${targetLabel}数据库写入 ${posts.length} 篇示例文章和 ${groups.length} 个系列。`
    );
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

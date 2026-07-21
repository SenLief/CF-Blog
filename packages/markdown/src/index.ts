import { normalizeVideoSource } from "@cf-blog/contracts";
import type { Element, ElementContent, Root, RootContent } from "hast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";

const schema: Options = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "figure",
    "figcaption",
    "iframe",
    "video"
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    a: [...(defaultSchema.attributes?.a ?? []), "ariaLabel"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    h1: [...(defaultSchema.attributes?.h1 ?? []), "id"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
    h4: [...(defaultSchema.attributes?.h4 ?? []), "id"],
    h5: [...(defaultSchema.attributes?.h5 ?? []), "id"],
    h6: [...(defaultSchema.attributes?.h6 ?? []), "id"],
    iframe: ["allow", "allowFullScreen", "loading", "referrerPolicy", "src", "title"],
    video: ["controls", "playsInline", "preload", "src"]
  }
};

const demoteHeadingOne: Plugin<[], Root> = () => (tree) => {
  const walk = (node: Root | RootContent): void => {
    if (node.type === "element" && node.tagName === "h1") {
      node.tagName = "h2";
    }
    if ("children" in node) {
      node.children.forEach(walk);
    }
  };

  walk(tree);
};

function elementText(node: Element): string {
  return node.children
    .map((child) => {
      if (child.type === "text") return child.value;
      if (child.type === "element") return elementText(child);
      return "";
    })
    .join("");
}

function videoEmbedFromParagraph(node: RootContent | ElementContent): Element | null {
  if (node.type !== "element" || node.tagName !== "p" || node.children.length !== 1) {
    return null;
  }
  const link = node.children[0];
  if (link?.type !== "element" || link.tagName !== "a") return null;
  const label = elementText(link).trim();
  const match = label.match(/^video:\s*(.+)$/i);
  const href = link.properties.href;
  if (!match?.[1] || typeof href !== "string") return null;
  const source = normalizeVideoSource(href);
  if (!source) return null;

  const title = match[1].trim();
  const player: Element =
    source.preview.kind === "iframe"
      ? {
          type: "element",
          tagName: "iframe",
          properties: {
            allow:
              "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
            allowFullScreen: true,
            loading: "lazy",
            referrerPolicy: "strict-origin-when-cross-origin",
            src: source.preview.url,
            title
          },
          children: []
        }
      : {
          type: "element",
          tagName: "video",
          properties: {
            controls: true,
            playsInline: true,
            preload: "metadata",
            src: source.preview.url
          },
          children: []
        };

  return {
    type: "element",
    tagName: "figure",
    properties: { className: ["video-embed"] },
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: ["video-embed-frame"] },
        children: [player]
      },
      {
        type: "element",
        tagName: "figcaption",
        properties: {},
        children: [
          { type: "text", value: `${title} · ` },
          {
            type: "element",
            tagName: "a",
            properties: { href: source.sourceUrl },
            children: [{ type: "text", value: "打开原视频" }]
          }
        ]
      }
    ]
  };
}

const rehypeVideoEmbeds: Plugin<[], Root> = () => (tree) => {
  const walk = (parent: Root | Element): void => {
    parent.children.forEach((child, index) => {
      const replacement = videoEmbedFromParagraph(child);
      if (replacement) {
        parent.children[index] = replacement;
      } else if (child.type === "element") {
        walk(child);
      }
    });
  };

  walk(tree);
};

export interface RenderedMarkdown {
  html: string;
  plainText: string;
  excerpt: string;
  readingMinutes: number;
}

export async function renderMarkdown(markdown: string): Promise<RenderedMarkdown> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(demoteHeadingOne)
    .use(rehypeSlug)
    .use(rehypeVideoEmbeds)
    .use(rehypeSanitize, schema)
    .use(rehypeAutolinkHeadings, {
      behavior: "wrap",
      properties: { className: ["heading-anchor"] }
    })
    .use(rehypeStringify)
    .process(markdown);

  const plainText = markdownToPlainText(markdown);
  return {
    html: String(file),
    plainText,
    excerpt: plainText.slice(0, 220),
    readingMinutes: calculateReadingMinutes(plainText)
  };
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[video:\s*([^\]]+)]\([^)]+\)/gi, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function calculateReadingMinutes(text: string): number {
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinCount = text
    .replace(/[\u3400-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(cjkCount / 400 + latinCount / 220));
}

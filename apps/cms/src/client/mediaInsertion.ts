import type { MediaItem } from "@cf-blog/contracts";

function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\\[\]])/g, "\\$1");
}

function escapeMarkdownDestination(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

export function mediaMarkdown(item: MediaItem): string {
  if (item.kind === "image") {
    const label = item.alt.trim() || item.filename;
    return `![${escapeMarkdownLabel(label)}](${escapeMarkdownDestination(item.url)})`;
  }
  return `[video: ${escapeMarkdownLabel(item.title)}](${escapeMarkdownDestination(item.sourceUrl)})`;
}

export interface MarkdownInsertion {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function insertMarkdownBlock(
  value: string,
  start: number,
  end: number,
  markdown: string
): MarkdownInsertion {
  const selectionStart = Math.max(0, Math.min(start, value.length));
  const selectionEnd = Math.max(selectionStart, Math.min(end, value.length));
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const prefix =
    before.length === 0 || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n";
  const suffix =
    after.length === 0 || after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n")
        ? "\n"
        : "\n\n";
  const nextValue = `${before}${prefix}${markdown}${suffix}${after}`;
  const caret = before.length + prefix.length + markdown.length + suffix.length;
  return { value: nextValue, selectionStart: caret, selectionEnd: caret };
}

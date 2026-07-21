import { slugify, type PostStatus } from "@cf-blog/contracts";

export function slugAfterTitleChange({
  currentSlug,
  currentTitle,
  nextTitle,
  status
}: {
  currentSlug: string;
  currentTitle: string;
  nextTitle: string;
  status: PostStatus;
}): string {
  if (status === "published") return currentSlug;

  const slugIsAutomatic =
    !currentSlug ||
    currentSlug.startsWith("untitled-") ||
    currentSlug === slugify(currentTitle);
  if (!slugIsAutomatic) return currentSlug;

  return slugify(nextTitle) || currentSlug;
}

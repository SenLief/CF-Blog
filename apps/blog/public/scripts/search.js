const input = document.querySelector("[data-search-input]");
const results = document.querySelector("[data-search-results]");
let index = null;

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

input?.addEventListener("input", async () => {
  if (!input || !results) return;
  const query = input.value.trim().toLocaleLowerCase();
  if (!query) {
    results.innerHTML = '<p class="empty-state">输入关键词开始搜索。</p>';
    return;
  }

  index ??= await fetch("/search-index.json").then((response) =>
    response.json()
  );
  const matches = index
    .filter((entry) =>
      [entry.title, entry.excerpt, ...entry.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    )
    .slice(0, 30);

  if (matches.length === 0) {
    results.innerHTML = '<p class="empty-state">没有找到匹配文章。</p>';
    return;
  }

  results.innerHTML = matches
    .map(
      (entry) =>
        `<a href="/posts/${encodeURIComponent(entry.slug)}"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.excerpt)}</span></a>`
    )
    .join("");
});

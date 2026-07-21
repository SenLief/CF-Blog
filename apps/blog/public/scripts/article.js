const article = document.querySelector("[data-article]");
const toc = document.querySelector("[data-toc]");
const sidebar = document.querySelector("[data-article-sidebar]");

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

if (article && toc) {
  const headings = [...article.querySelectorAll("h2, h3")];
  if (headings.length > 1) {
    if (sidebar) sidebar.hidden = false;
    toc.hidden = false;
    toc.innerHTML = `<strong>目录</strong><ol>${headings
      .map(
        (heading) =>
          `<li class="${heading.tagName === "H3" ? "nested" : ""}"><a href="#${encodeURIComponent(heading.id)}" data-heading-id="${escapeHtml(heading.id)}">${escapeHtml(heading.textContent ?? "")}</a></li>`
      )
      .join("")}</ol>`;

    const links = [...toc.querySelectorAll("a[data-heading-id]")];
    const setActiveHeading = () => {
      const marker = Math.min(180, window.innerHeight * 0.22);
      let activeHeading = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= marker) {
          activeHeading = heading;
        } else {
          break;
        }
      }
      for (const link of links) {
        const isActive = link.dataset.headingId === activeHeading.id;
        if (isActive) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      }
    };

    let updateQueued = false;
    const queueActiveHeadingUpdate = () => {
      if (updateQueued) return;
      updateQueued = true;
      requestAnimationFrame(() => {
        setActiveHeading();
        updateQueued = false;
      });
    };

    setActiveHeading();
    addEventListener("scroll", queueActiveHeadingUpdate, { passive: true });
    addEventListener("resize", queueActiveHeadingUpdate);
  }
}

document.querySelectorAll(".prose pre").forEach((pre) => {
  pre.insertAdjacentHTML(
    "beforeend",
    '<button class="copy-code" type="button">复制</button>'
  );
  const button = pre.querySelector(".copy-code");
  button?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(
      pre.textContent?.replace("复制", "") ?? ""
    );
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = "复制";
    }, 1200);
  });
});

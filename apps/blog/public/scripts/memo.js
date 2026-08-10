const lightbox = document.querySelector("[data-memo-lightbox]");

if (lightbox instanceof HTMLDialogElement) {
  const lightboxImage = lightbox.querySelector("[data-memo-lightbox-image]");
  const caption = lightbox.querySelector("[data-memo-lightbox-caption]");
  const counter = lightbox.querySelector("[data-memo-lightbox-counter]");
  const shell = lightbox.querySelector(".memo-lightbox-shell");
  const stage = lightbox.querySelector("[data-memo-lightbox-stage]");
  const previousButton = lightbox.querySelector("[data-memo-lightbox-previous]");
  const nextButton = lightbox.querySelector("[data-memo-lightbox-next]");
  const closeButton = lightbox.querySelector("[data-memo-lightbox-close]");
  let items = [];
  let activeIndex = 0;
  let opener = null;
  let touchStartX = 0;
  let touchStartY = 0;

  const imageFor = (item) => item.querySelector("img");

  const preloadAdjacentImages = () => {
    if (items.length < 2) return;
    for (const index of [
      (activeIndex - 1 + items.length) % items.length,
      (activeIndex + 1) % items.length
    ]) {
      const preload = new Image();
      preload.src = items[index].href;
    }
  };

  const showImage = (index) => {
    if (!(lightboxImage instanceof HTMLImageElement) || items.length === 0) return;
    activeIndex = (index + items.length) % items.length;
    const item = items[activeIndex];
    const thumbnail = imageFor(item);
    const alt = thumbnail?.alt ?? "";
    lightboxImage.src = item.href;
    lightboxImage.alt = alt;
    if (caption) caption.textContent = alt === "短文图片" ? "" : alt;
    if (counter) counter.textContent = `${activeIndex + 1} / ${items.length}`;
    preloadAdjacentImages();
  };

  const move = (direction) => showImage(activeIndex + direction);

  document.querySelectorAll("[data-memo-gallery]").forEach((gallery) => {
    gallery.addEventListener("click", (event) => {
      const item = event.target.closest("[data-memo-image]");
      if (!(item instanceof HTMLAnchorElement) || !lightbox.showModal) return;
      event.preventDefault();
      items = [...gallery.querySelectorAll("[data-memo-image]")];
      opener = item;
      const index = items.indexOf(item);
      const hasMultipleImages = items.length > 1;
      if (previousButton) previousButton.hidden = !hasMultipleImages;
      if (nextButton) nextButton.hidden = !hasMultipleImages;
      showImage(index);
      lightbox.showModal();
      document.documentElement.classList.add("memo-lightbox-open");
      closeButton?.focus();
    });
  });

  previousButton?.addEventListener("click", () => move(-1));
  nextButton?.addEventListener("click", () => move(1));
  closeButton?.addEventListener("click", () => lightbox.close());

  lightbox.addEventListener("click", (event) => {
    if ([lightbox, shell, stage].includes(event.target)) lightbox.close();
  });

  lightbox.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" && items.length > 1) {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight" && items.length > 1) {
      event.preventDefault();
      move(1);
    }
  });

  stage?.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    touchStartX = touch?.clientX ?? 0;
    touchStartY = touch?.clientY ?? 0;
  }, { passive: true });

  stage?.addEventListener("touchend", (event) => {
    if (items.length < 2) return;
    const touch = event.changedTouches[0];
    const deltaX = (touch?.clientX ?? touchStartX) - touchStartX;
    const deltaY = (touch?.clientY ?? touchStartY) - touchStartY;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    move(deltaX < 0 ? 1 : -1);
  }, { passive: true });

  lightbox.addEventListener("close", () => {
    document.documentElement.classList.remove("memo-lightbox-open");
    lightboxImage?.removeAttribute("src");
    opener?.focus();
    opener = null;
    items = [];
  });
}

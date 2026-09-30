(() => {
  const header = document.querySelector(".site-header");
  if (header) {
    const syncHeaderHeight = () => {
      const height = Math.ceil(header.getBoundingClientRect().height);
      if (height > 0) document.documentElement.style.setProperty("--header-height", `${height}px`);
    };
    syncHeaderHeight();
    if ("ResizeObserver" in window) {
      new ResizeObserver(syncHeaderHeight).observe(header);
    } else {
      window.addEventListener("resize", syncHeaderHeight, { passive: true });
    }
  }

  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav");

  if (toggle && nav) {
    const closeMenu = () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menu";
    };

    nav.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("open")) {
        closeMenu();
        toggle.focus();
      }
    });

    const desktop = window.matchMedia("(min-width: 1101px)");
    const syncMenuLayout = () => {
      if (desktop.matches) closeMenu();
    };
    desktop.addEventListener("change", syncMenuLayout);
    syncMenuLayout();
  }

  const artwork = document.querySelector(".poster-illustration, .inner-hero-art");
  if (!artwork) return;

  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motionEnabled = false;
  let frame = null;
  let pointerX = 0;
  let pointerY = 0;

  const resetArtwork = () => {
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
    artwork.style.setProperty("--art-x", "0px");
    artwork.style.setProperty("--art-y", "0px");
  };

  const updateArtwork = () => {
    frame = null;
    if (!motionEnabled) return;

    const bounds = artwork.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const x = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / bounds.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / bounds.height) * 2 - 1));
    artwork.style.setProperty("--art-x", `${(x * 8).toFixed(2)}px`);
    artwork.style.setProperty("--art-y", `${(y * 8).toFixed(2)}px`);
  };

  const handlePointerMove = (event) => {
    if (!motionEnabled || event.pointerType === "touch") return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (frame === null) frame = window.requestAnimationFrame(updateArtwork);
  };

  const syncArtworkMotion = () => {
    const enabled = finePointer.matches && !reducedMotion.matches;
    if (enabled === motionEnabled) return;
    motionEnabled = enabled;

    if (enabled) {
      artwork.addEventListener("pointermove", handlePointerMove, { passive: true });
      artwork.addEventListener("pointerleave", resetArtwork, { passive: true });
      artwork.addEventListener("pointercancel", resetArtwork, { passive: true });
    } else {
      artwork.removeEventListener("pointermove", handlePointerMove);
      artwork.removeEventListener("pointerleave", resetArtwork);
      artwork.removeEventListener("pointercancel", resetArtwork);
      resetArtwork();
    }
  };

  finePointer.addEventListener("change", syncArtworkMotion);
  reducedMotion.addEventListener("change", syncArtworkMotion);
  syncArtworkMotion();
})();

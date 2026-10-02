(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const desktopPointer = window.matchMedia("(min-width: 960px) and (hover: hover) and (pointer: fine)");
  const smoothScrollToggle = document.querySelector(".site-smooth-toggle");
  const smoothScrollStorageKey = "spark-smooth-scroll-enabled";
  const artwork = document.querySelector(".poster-illustration, .inner-hero-art");
  const aperture = document.querySelector(".aperture-art");
  const animations = new Set();
  const seen = new WeakSet();
  let observer = null;
  let scroller = null;
  let frame = null;
  let previousTime = null;
  let animationTime = 0;
  let inFrame = false;
  let suspended = document.hidden;
  let introPlayed = false;
  let smoothScrollEnabled = true;
  try {
    smoothScrollEnabled = window.localStorage.getItem(smoothScrollStorageKey) !== "disabled";
  } catch {
    // Smooth scrolling stays enabled until the visitor changes this page's setting.
  }

  const updateSmoothScrollToggle = () => {
    if (!smoothScrollToggle) return;
    const label = smoothScrollEnabled ? "Turn smooth scrolling off" : "Turn smooth scrolling on";
    smoothScrollToggle.setAttribute("aria-pressed", String(smoothScrollEnabled));
    smoothScrollToggle.setAttribute("aria-label", label);
    smoothScrollToggle.title = label;
    const toggleLabel = smoothScrollToggle.querySelector(".site-smooth-label");
    if (toggleLabel) toggleLabel.textContent = smoothScrollEnabled ? "Smooth on" : "Smooth off";
  };

  const animate = (element, keyframes, options = {}) => {
    if (!element || reducedMotion.matches || root.classList.contains("spark-page-entering") ||
        typeof element.animate !== "function") return;
    const animation = element.animate(keyframes, {
      duration: 850,
      easing: "cubic-bezier(.22, 1, .36, 1)",
      fill: "backwards",
      ...options,
    });
    animations.add(animation);
    animation.onfinish = animation.oncancel = () => animations.delete(animation);
  };

  const reveal = (element, delay = 0) => {
    if (seen.has(element)) return;
    seen.add(element);
    animate(element, [
      { opacity: 0, transform: "translateY(22px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { delay });
  };

  const revealTargets = Array.from(document.querySelectorAll(
    ".section-meta, .perspective h2, .perspective-copy, .platform h2, " +
    ".platform-content, .aperture-art, .deployment-intro, .steps li, " +
    ".district-heading, .district-item, .pilot-copy, .pilot-checklist, " +
    ".faq-intro, .faq-list > details, " +
    ".pricing-heading, .plan, .closing h2, .closing-bottom, " +
    ".inner-hero-copy, .inner-hero-art, .about-cover-meta, .about-cover-aside, .about-origin-label, .about-origin-copy, " +
    ".about-principles-head, .about-principles-grid article, .about-mission > *, " +
    ".contact-info, .contact-form, .privacy-hero-inner, .legal-stamp, " +
    ".privacy-pillars > div, .policy-nav, .policy-document > *"
  ));

  const setupReveals = () => {
    observer?.disconnect();
    if (reducedMotion.matches || !("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver((entries) => {
      let stagger = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target, Math.min(stagger++ * 65, 195));
        observer.unobserve(entry.target);
      }
      if (revealTargets.every((element) => seen.has(element))) observer.disconnect();
    }, { threshold: 0.08, rootMargin: "0px 0px -28px 0px" });
    for (const element of revealTargets) {
      if (!seen.has(element)) observer.observe(element);
    }
  };

  const playIntro = () => {
    if (introPlayed) return;
    introPlayed = true;
    if (reducedMotion.matches || window.scrollY > 80 || window.location.hash) return;
    const openingDelay = root.classList.contains("spark-home-intro") ? 1000 : 0;
    document.querySelectorAll(".hero-line > span").forEach((line, index) => {
      animate(line, [
        { transform: "translateY(108%)" },
        { transform: "translateY(0)" },
      ], { duration: 1000, delay: openingDelay + 90 + index * 105 });
    });
    for (const [selector, delay] of [
      [".poster .eyebrow", 0], [".poster-intro", 330], [".poster-index", 420],
      [".inner-hero-copy", 90],
      [".contact-page .section-meta", 0], [".contact-info", 90],
      [".contact-form", 180], [".privacy-hero-inner", 80], [".legal-stamp", 170],
    ]) {
      const element = document.querySelector(selector);
      if (element) reveal(element, openingDelay + delay);
    }
    if (artwork) {
      seen.add(artwork);
      animate(artwork, [{ opacity: 0 }, { opacity: 1 }], { duration: 1100, delay: openingDelay });
    }
  };

  const updateDepth = () => {
    if (reducedMotion.matches || !desktopPointer.matches) return;
    if (artwork) {
      const bounds = artwork.getBoundingClientRect();
      if (bounds.bottom >= 0 && bounds.top <= window.innerHeight) {
        const offset = Math.max(-28, Math.min(28, -bounds.top * 0.075));
        artwork.style.setProperty("--art-scroll", `${offset.toFixed(2)}px`);
      }
    }
    if (aperture) {
      const bounds = aperture.getBoundingClientRect();
      if (bounds.bottom >= 0 && bounds.top <= window.innerHeight) {
        const progress = (window.innerHeight / 2 - bounds.top - bounds.height / 2) / window.innerHeight;
        aperture.style.setProperty("--aperture-shift", `${(Math.max(-0.5, Math.min(0.5, progress)) * 22).toFixed(2)}px`);
      }
    }
  };

  // Only tick while scrolling or after an input/resize; no permanent RAF loop.
  const tick = (time) => {
    frame = null;
    inFrame = true;
    animationTime += previousTime === null ? 16.67 : Math.min(time - previousTime, 40);
    previousTime = time;
    scroller?.raf(animationTime);
    updateDepth();
    inFrame = false;
    if (scroller?.isScrolling === "smooth") frame = window.requestAnimationFrame(tick);
    else previousTime = null;
  };

  const requestTick = () => {
    if (frame === null && !inFrame && !suspended && !reducedMotion.matches) {
      frame = window.requestAnimationFrame(tick);
    }
  };

  const cancelScroll = () => {
    if (scroller?.isScrolling === "smooth") {
      scroller.stop();
      scroller.start();
    }
  };

  const destroyScroller = () => {
    scroller?.destroy();
    scroller = null;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    previousTime = null;
    root.classList.remove("spark-smooth");
  };

  const syncMotion = () => {
    const enabled = smoothScrollEnabled && !suspended && !reducedMotion.matches && desktopPointer.matches;
    if (enabled && !scroller && typeof window.Lenis === "function") {
      root.classList.add("spark-smooth");
      scroller = new window.Lenis({
        autoRaf: false,
        lerp: 0.085,
        wheelMultiplier: 0.9,
        smoothWheel: true,
        syncTouch: false,
        anchors: false,
        allowNestedScroll: true,
        stopInertiaOnNavigate: true,
        respectReducedMotion: true,
        virtualScroll: ({ event, deltaX, deltaY }) => {
          const native = event.defaultPrevented || !event.cancelable || event.ctrlKey ||
            event.metaKey || event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY);
          if (native) cancelScroll();
          return !native;
        },
        prevent: (node) => {
          // Plain fields should not turn the contact form into a native-scroll zone.
          const native = node.matches('select, input[type="number"], input[type="range"], [contenteditable], [data-native-scroll]') ||
            (node.matches("textarea") && node.scrollHeight > node.clientHeight);
          if (native) cancelScroll();
          return native;
        },
      });
      scroller.on("virtual-scroll", requestTick);
      scroller.on("scroll", requestTick);
    } else if (!enabled) {
      destroyScroller();
    }
    root.classList.toggle("motion-depth", enabled);
    if (!enabled) {
      artwork?.style.removeProperty("--art-scroll");
      aperture?.style.removeProperty("--aperture-shift");
    }
    if (reducedMotion.matches || suspended) {
      for (const animation of animations) animation.cancel();
      observer?.disconnect();
    } else {
      setupReveals();
      requestTick();
    }
  };

  const focusDestination = (destination) => {
    const hadTabindex = destination.hasAttribute("tabindex");
    if (!hadTabindex) {
      destination.setAttribute("tabindex", "-1");
      destination.addEventListener("blur", () => destination.removeAttribute("tabindex"), { once: true });
    }
    destination.focus({ preventScroll: true });
  };

  document.addEventListener("click", (event) => {
    if (root.classList.contains("spark-page-leaving")) {
      cancelScroll();
      settlePageEntrance();
      return;
    }
    if (!scroller || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    let id;
    try { id = decodeURIComponent(link.hash.slice(1)); } catch { return; }
    const destination = document.getElementById(id);
    if (!destination) return;
    event.preventDefault();
    cancelScroll();
    // Retain real fragment history; Back/Forward and direct links stay browser-owned.
    if (window.location.hash !== link.hash) window.history.pushState(window.history.state, "", link.hash);
    scroller.scrollTo(destination, {
      duration: link.classList.contains("skip-link") ? 0 : 1.6,
      immediate: link.classList.contains("skip-link"),
      // Start braking after the first sixth of the glide, with smooth endpoints.
      easing: (value) => 1 - Math.pow(1 - value, 6) * (1 + 6 * value),
      onComplete: () => focusDestination(destination),
    });
    requestTick();
  });

  document.addEventListener("keydown", (event) => {
    if (["Tab", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape"].includes(event.key)) cancelScroll();
  });
  document.addEventListener("pointerdown", cancelScroll, { passive: true });
  document.addEventListener("touchstart", cancelScroll, { passive: true });
  document.addEventListener("focusin", (event) => {
    cancelScroll();
    for (const animation of animations) {
      const target = animation.effect?.target;
      if (target instanceof Element && target.contains(event.target)) animation.cancel();
    }
    for (const element of revealTargets) {
      if (!element.contains(event.target)) continue;
      seen.add(element);
      observer?.unobserve(element);
    }
  });
  document.querySelectorAll("details").forEach((details) => {
    details.addEventListener("toggle", () => {
      cancelScroll();
      scroller?.resize();
      if (details.open) animate(details.querySelector(".detail-body"), [
        { opacity: 0, transform: "translateY(-5px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: 300 });
      requestTick();
    });
  });
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", () => {
    cancelScroll();
    scroller?.resize();
    requestTick();
  }, { passive: true });
  window.addEventListener("hashchange", cancelScroll);
  window.addEventListener("popstate", cancelScroll);
  window.addEventListener("spark:home-intro-end", (event) => {
    if (!event.detail?.interrupted) return;
    for (const animation of animations) animation.cancel();
  });
  const settlePageEntrance = () => {
    // The document slide replaces entrance reveals in the incoming viewport.
    introPlayed = true;
    for (const animation of animations) animation.cancel();
    for (const element of revealTargets) {
      const bounds = element.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) continue;
      seen.add(element);
      observer?.unobserve(element);
    }
  };
  window.addEventListener("spark:page-entry-ready", () => {
    cancelScroll();
    scroller?.resize();
    scroller?.scrollTo(window.scrollY, { immediate: true, force: true });
    settlePageEntrance();
    requestTick();
  });
  window.addEventListener("pagehide", () => {
    suspended = true;
    syncMotion();
  });
  window.addEventListener("pageshow", () => {
    suspended = document.hidden;
    syncMotion();
  });
  document.addEventListener("visibilitychange", () => {
    suspended = document.hidden;
    syncMotion();
  });
  reducedMotion.addEventListener("change", syncMotion);
  desktopPointer.addEventListener("change", syncMotion);
  smoothScrollToggle?.addEventListener("click", () => {
    smoothScrollEnabled = !smoothScrollEnabled;
    try {
      window.localStorage.setItem(smoothScrollStorageKey, smoothScrollEnabled ? "enabled" : "disabled");
    } catch {
      // The setting still applies until this page is closed.
    }
    updateSmoothScrollToggle();
    syncMotion();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== smoothScrollStorageKey) return;
    smoothScrollEnabled = event.newValue !== "disabled";
    updateSmoothScrollToggle();
    syncMotion();
  });
  updateSmoothScrollToggle();
  syncMotion();
  if (root.classList.contains("spark-page-entering")) settlePageEntrance();
  playIntro();
})();

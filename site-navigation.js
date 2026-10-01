(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const storageKey = "spark-page-entry";
  const routes = new Set(["/", "/about/", "/contact/", "/privacy/", "/terms/"]);
  const route = (pathname) => pathname.endsWith("/") ? pathname : `${pathname}/`;
  let pending = null;
  let exitTimer = null;
  let recoveryTimer = null;
  let entryTimer = null;
  let prepareTimer = null;
  let entryFrame = null;

  const clearEntry = () => {
    root.classList.remove("spark-page-entering");
    root.classList.remove("spark-page-preparing");
    window.clearTimeout(entryTimer);
    window.clearTimeout(prepareTimer);
    if (entryFrame !== null) window.cancelAnimationFrame(entryFrame);
    entryFrame = null;
  };
  const resetExit = () => {
    root.classList.remove("spark-page-leaving");
    window.clearTimeout(exitTimer);
    window.clearTimeout(recoveryTimer);
    pending = null;
  };

  // Run in the head so a destination cannot flash before sliding in.
  try {
    const entry = JSON.parse(window.sessionStorage.getItem(storageKey));
    window.sessionStorage.removeItem(storageKey);
    if (entry && entry.destination === window.location.href &&
        Date.now() - entry.created >= 0 && Date.now() - entry.created < 10000 &&
        !reducedMotion.matches && !document.hidden) {
      root.classList.add("spark-page-entering");
      if (window.location.hash) root.classList.add("spark-page-preparing");
    }
  } catch {
    // Storage restrictions must never prevent navigation or expose a blank page.
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!root.classList.contains("spark-page-entering")) return;
    if (!root.classList.contains("spark-page-preparing")) {
      entryTimer = window.setTimeout(clearEntry, 1800);
      return;
    }
    let fontsReady = !document.fonts;
    let loaded = document.readyState === "complete";
    let scheduled = false;
    const begin = () => {
      if (!fontsReady || !loaded || scheduled || !root.classList.contains("spark-page-preparing")) return;
      scheduled = true;
      window.clearTimeout(prepareTimer);
      // Resolve the fragment only after fonts, native anchor placement and header measurement settle.
      entryFrame = window.requestAnimationFrame(() => {
        entryFrame = window.requestAnimationFrame(() => {
          entryFrame = null;
          if (!root.classList.contains("spark-page-preparing")) return;
          try {
            const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
            if (target) {
              const padding = parseFloat(window.getComputedStyle(root).scrollPaddingTop) || 0;
              const margin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
              const top = target.getBoundingClientRect().top + window.scrollY - padding - margin;
              // scrollIntoView can follow a translated anchor sideways and cancel out the page slide.
              window.scrollTo({ left: 0, top: Math.max(0, top), behavior: "instant" });
            }
          } catch {
            // A missing or malformed fragment must still reveal the destination.
          }
          window.dispatchEvent(new CustomEvent("spark:page-entry-ready"));
          root.classList.remove("spark-page-preparing");
          entryTimer = window.setTimeout(clearEntry, 1800);
        });
      });
    };
    if (document.fonts) document.fonts.ready.then(() => { fontsReady = true; begin(); }, () => { fontsReady = true; begin(); });
    window.addEventListener("load", () => { loaded = true; begin(); }, { once: true });
    prepareTimer = window.setTimeout(() => { fontsReady = loaded = true; begin(); }, 1200);
    begin();
  }, { once: true });
  document.addEventListener("animationend", (event) => {
    if (event.target !== document.getElementById("main")) return;
    if (event.animationName === "spark-page-in") clearEntry();
    if (event.animationName === "spark-page-out") navigate();
  });

  const navigate = () => {
    if (!pending || pending.started) return;
    pending.started = true;
    window.clearTimeout(exitTimer);
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({
        destination: pending.url.href, created: Date.now(),
      }));
    } catch {
      // The exit still works when private browsing disables session storage.
    }
    // Recover the visible page if navigation is interrupted or the server stalls.
    recoveryTimer = window.setTimeout(resetExit, 1800);
    try {
      window.location.assign(pending.url.href);
    } catch {
      resetExit();
    }
  };

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey || reducedMotion.matches) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    let url;
    try { url = new URL(link.href, window.location.href); } catch { return; }
    if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin ||
        !routes.has(route(url.pathname)) || route(url.pathname) === route(window.location.pathname)) return;
    event.preventDefault();
    if (pending && !pending.started) {
      pending.url = url;
      return;
    }
    if (pending) resetExit();
    clearEntry();
    pending = { url, started: false };
    root.classList.add("spark-page-leaving");
    window.sparkSound?.play("page-sweep");
    // Also navigate if animation events are unavailable or a stylesheet fails.
    exitTimer = window.setTimeout(navigate, 450);
  });

  window.addEventListener("pagehide", () => {
    clearEntry();
    resetExit();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    clearEntry();
    resetExit();
  });
  reducedMotion.addEventListener("change", () => {
    if (!reducedMotion.matches) return;
    clearEntry();
    navigate();
    root.classList.remove("spark-page-leaving");
  });
})();

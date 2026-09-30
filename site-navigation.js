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

  const clearEntry = () => {
    root.classList.remove("spark-page-entering");
    window.clearTimeout(entryTimer);
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
    }
  } catch {
    // Storage restrictions must never prevent navigation or expose a blank page.
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (root.classList.contains("spark-page-entering")) {
      entryTimer = window.setTimeout(clearEntry, 1800);
    }
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

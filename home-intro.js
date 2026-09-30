(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const navigation = window.performance?.getEntriesByType?.("navigation")?.[0];
  if (reducedMotion.matches || document.hidden || window.location.hash || window.scrollY > 80 ||
      navigation?.type === "back_forward" || root.classList.contains("spark-page-entering")) return;

  try {
    if (window.sessionStorage.getItem("spark-home-introduced")) return;
    window.sessionStorage.setItem("spark-home-introduced", "1");
  } catch {
    // A decorative entrance must still work without access to storage.
  }

  let timeout = null;
  root.classList.add("spark-home-intro");
  const finish = (interrupted = false) => {
    if (!root.classList.contains("spark-home-intro")) return;
    root.classList.remove("spark-home-intro");
    window.clearTimeout(timeout);
    window.dispatchEvent(new CustomEvent("spark:home-intro-end", { detail: { interrupted } }));
  };
  document.addEventListener("animationend", (event) => {
    if (event.animationName === "spark-intro-curtain") finish();
  });
  document.addEventListener("DOMContentLoaded", () => {
    // If CSS or animation events fail, never leave a curtain over the page.
    if (root.classList.contains("spark-home-intro")) timeout = window.setTimeout(() => finish(), 2400);
  }, { once: true });
  for (const type of ["pointerdown", "touchstart", "wheel"]) {
    document.addEventListener(type, () => finish(true), { passive: true });
  }
  document.addEventListener("keydown", () => finish(true));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finish(true);
  });
  window.addEventListener("pagehide", () => finish(true));
  window.addEventListener("pageshow", (event) => {
    if (event.persisted || window.scrollY > 80) finish(true);
  });
  window.addEventListener("scroll", () => {
    if (window.scrollY > 80) finish(true);
  }, { passive: true });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) finish(true);
  });
})();

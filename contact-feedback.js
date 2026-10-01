(() => {
  const form = document.querySelector("[data-contact-form]");
  if (!form || typeof Element.prototype.animate !== "function") return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animations = new Set();
  let layer = null;
  const random = (min, max) => min + Math.random() * (max - min);
  const clear = () => {
    for (const animation of animations) animation.cancel();
    animations.clear();
    layer?.remove();
    layer = null;
  };
  window.addEventListener("spark:contact-success", (event) => {
    if (event.detail?.form !== form || reducedMotion.matches || document.hidden ||
        document.documentElement.classList.contains("spark-page-leaving")) return;
    clear();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const bounds = form.querySelector("button[type='submit']")?.getBoundingClientRect();
    const originX = Math.max(24, Math.min(width - 24, bounds ? bounds.left + bounds.width / 2 : width / 2));
    const originY = Math.max(60, Math.min(height - 40, bounds ? bounds.top + bounds.height / 2 : height * 0.7));
    layer = document.createElement("div");
    layer.className = "contact-confetti-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
    const colors = ["#f7df48", "#ed8968", "#789eae", "#303429"];
    for (let i = 0; i < 48; i++) {
      const particle = document.createElement("span");
      particle.className = "contact-confetti";
      particle.style.left = `${originX}px`;
      particle.style.top = `${originY}px`;
      particle.style.width = `${random(4, 7)}px`;
      particle.style.height = `${random(7, 12)}px`;
      particle.style.background = colors[i % colors.length];
      layer.append(particle);
      const drift = random(-width * 0.42, width * 0.42);
      const kick = random(140, 320);
      const fall = random(300, 600);
      const rotation = random(-120, 120);
      const frames = [0, 0.15, 0.35, 0.6, 1].map((t) => ({
        offset: t,
        transform: `translate(${drift * t}px, ${fall * t * t - kick * Math.sin(Math.PI * t)}px) rotate(${rotation + t * 600}deg)`,
        opacity: t === 0 ? 0 : t < 0.6 ? 1 : 0,
      }));
      const animation = particle.animate(frames, { duration: random(1400, 2100), easing: "linear", fill: "forwards" });
      animations.add(animation);
      const remove = () => {
        particle.remove();
        animations.delete(animation);
        if (!animations.size) {
          layer?.remove();
          layer = null;
        }
      };
      animation.onfinish = animation.oncancel = remove;
    }
  });
  reducedMotion.addEventListener("change", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  window.addEventListener("pagehide", clear);
})();

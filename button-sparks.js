(() => {
  const buttons = document.querySelectorAll(".button, .nav-cta, .plan-link");
  if (!buttons.length || typeof Element.prototype.animate !== "function") return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const active = new Set();
  let layer;
  const random = (min, max) => min + Math.random() * (max - min);

  const clear = () => {
    for (const animation of active) animation.cancel();
    active.clear();
    layer?.remove();
    layer = undefined;
  };

  const burst = (event) => {
    if (event.pointerType === "touch" || reducedMotion.matches || !finePointer.matches || document.hidden) return;
    if (document.documentElement.classList.contains("spark-page-leaving")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "button-spark-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.append(layer);
    }

    for (let i = 0; i < 9 && active.size < 45; i++) {
      const particle = document.createElement("span");
      particle.className = "button-spark";
      const edge = Math.floor(random(0, 4));
      const x = edge < 2 ? random(bounds.left, bounds.right) : edge === 2 ? bounds.left : bounds.right;
      const y = edge < 2 ? edge === 0 ? bounds.top : bounds.bottom : random(bounds.top, bounds.bottom);
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.width = `${random(2, 4)}px`;
      particle.style.height = `${random(5, 10)}px`;
      layer.append(particle);

      const drift = random(-100, 100);
      const kick = random(28, 70);
      const fall = random(260, 480);
      const rotation = random(-90, 90);
      const frames = [0, .16, .36, .62, 1].map((t) => ({
        offset: t,
        transform: `translate(${drift * t}px, ${fall * t * t - kick * Math.sin(Math.PI * t)}px) rotate(${rotation + t * 240}deg) scale(${1 - t * .65})`,
        opacity: t === 0 ? 0 : t < .62 ? 1 : 0,
      }));
      const animation = particle.animate(frames, { duration: random(1600, 2400), easing: "linear", fill: "forwards" });
      active.add(animation);
      const remove = () => {
        particle.remove();
        active.delete(animation);
        if (!active.size) {
          layer?.remove();
          layer = undefined;
        }
      };
      animation.onfinish = remove;
      animation.oncancel = remove;
    }
  };

  for (const button of buttons) button.addEventListener("pointerenter", burst, { passive: true });
  reducedMotion.addEventListener("change", clear);
  finePointer.addEventListener("change", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  window.addEventListener("pagehide", clear);
})();

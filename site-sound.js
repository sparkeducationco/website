(() => {
  const storageKey = "spark-site-sound-enabled";
  const toggle = document.querySelector(".site-sound-toggle");
  const soundTargets = ".menu-toggle, .button, .nav-cta, .plan-link, summary, select, a[href], button:not(.site-sound-toggle):not(.home-intro-sound)";
  const cues = {
    "cta-hover": [{ from: 784, to: 1047, delay: 0, duration: 0.13, level: 0.018 }],
    "cta-click": [
      { from: 523, to: 659, delay: 0, duration: 0.19, level: 0.027 },
      { from: 659, to: 784, delay: 0.055, duration: 0.15, level: 0.021 },
      { from: 784, to: 1047, delay: 0.11, duration: 0.12, level: 0.016 },
    ],
    "navigation-hover": [{ from: 740, to: 587, delay: 0, duration: 0.11, level: 0.012 }],
    "navigation-click": [{ from: 523, to: 659, delay: 0, duration: 0.14, level: 0.022 }],
    "disclosure-hover": [{ from: 493, to: 587, delay: 0, duration: 0.09, level: 0.012 }],
    "disclosure-open": [
      { from: 392, to: 523, delay: 0, duration: 0.17, level: 0.025 },
      { from: 587, to: 784, delay: 0.055, duration: 0.13, level: 0.016 },
    ],
    "disclosure-close": [{ from: 659, to: 440, delay: 0, duration: 0.15, level: 0.021 }],
    "menu-hover": [{ from: 440, to: 587, delay: 0, duration: 0.1, level: 0.014 }],
    "selection-hover": [{ from: 587, to: 698, delay: 0, duration: 0.1, level: 0.012 }],
    "control-hover": [{ from: 659, to: 784, delay: 0, duration: 0.1, level: 0.014 }],
    "menu-open": [
      { from: 349, to: 440, delay: 0, duration: 0.2, level: 0.025 },
      { from: 523, to: 698, delay: 0.06, duration: 0.15, level: 0.017 },
    ],
    "menu-close": [{ from: 698, to: 440, delay: 0, duration: 0.16, level: 0.02 }],
    "selection-change": [{ from: 587, to: 880, delay: 0, duration: 0.14, level: 0.021 }],
    "control-click": [{ from: 587, to: 784, delay: 0, duration: 0.12, level: 0.025 }],
  };
  let enabled = false;
  let context = null;
  let lastCueAt = 0;

  try {
    enabled = window.localStorage.getItem(storageKey) === "enabled";
    if (!enabled && window.localStorage.getItem("spark-home-intro-sound") === "enabled") {
      enabled = true;
      window.localStorage.setItem(storageKey, "enabled");
      window.localStorage.removeItem("spark-home-intro-sound");
    }
  } catch {
    // Sound remains usable for this page when storage is unavailable.
  }

  const updateToggle = () => {
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.setAttribute("aria-label", enabled ? "Turn site sounds off" : "Turn site sounds on");
    toggle.title = enabled ? "Turn site sounds off" : "Turn site sounds on";
  };

  const playCue = async (kind = "navigation-click") => {
    if (!enabled) return;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const notes = cues[kind];
    if (!AudioContextConstructor || !notes) return;

    try {
      context ||= new AudioContextConstructor();
      if (context.state !== "running") await context.resume();
      if (context.state !== "running") return;

      const now = context.currentTime;
      notes.forEach(({ from, to, delay, duration, level }) => {
        const start = now + delay;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(from, start);
        oscillator.frequency.exponentialRampToValueAtTime(to, start + duration * 0.78);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.01);
      });
    } catch {
      // A blocked or unavailable audio context must never affect site interactions.
    }
  };

  window.sparkSound = { play: playCue };
  updateToggle();

  toggle?.addEventListener("click", async () => {
    enabled = !enabled;
    try {
      if (enabled) window.localStorage.setItem(storageKey, "enabled");
      else window.localStorage.removeItem(storageKey);
    } catch {
      // The preference still applies until this page is closed.
    }
    updateToggle();
    if (enabled) await playCue("control-click");
  });

  const categoryFor = (target) => {
    if (target.closest(".menu-toggle")) return "menu";
    if (target.closest(".button, .nav-cta, .plan-link")) return "cta";
    if (target.closest("summary")) return "disclosure";
    if (target.closest("select")) return "selection";
    if (target.closest("a[href]")) return "navigation";
    if (target.closest("button")) return "control";
    return null;
  };

  document.addEventListener("pointerover", (event) => {
    if (!enabled || event.pointerType === "touch" || !(event.target instanceof Element)) return;
    const target = event.target.closest(soundTargets);
    const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!target || target.contains(relatedTarget)) return;
    lastCueAt = performance.now();
    const category = categoryFor(target);
    if (category) playCue(`${category}-hover`);
  }, { passive: true });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest(soundTargets);
    if (!target || performance.now() - lastCueAt < 180) return;
    lastCueAt = performance.now();
    const category = categoryFor(target);
    if (!category) return;

    if (category === "menu") {
      playCue(target.getAttribute("aria-expanded") === "true" ? "menu-open" : "menu-close");
    } else if (category === "disclosure") {
      window.setTimeout(() => {
        const isOpen = target.closest("details")?.open;
        playCue(isOpen ? "disclosure-open" : "disclosure-close");
      }, 0);
    } else if (category !== "selection") {
      playCue(`${category}-click`);
    }
  }, { passive: true });

  document.addEventListener("change", (event) => {
    if (enabled && event.target instanceof HTMLSelectElement) playCue("selection-change");
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    enabled = event.newValue === "enabled";
    updateToggle();
  });
  window.addEventListener("spark:sound-change", (event) => {
    enabled = event.detail.enabled;
    updateToggle();
  });
})();

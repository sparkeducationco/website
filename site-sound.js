(() => {
  const storageKey = "spark-site-sound-enabled";
  const toggle = document.querySelector(".site-sound-toggle");
  const toggleLabel = toggle?.querySelector?.(".site-sound-label");
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const soundTargets = ".menu-toggle, .button, .nav-cta, .plan-link, summary, select, a[href], button:not(.site-sound-toggle)";
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
  let activeSweep = null;
  let introBlocked = false;

  const stopSweep = () => {
    try { activeSweep?.stop(); } catch {}
    activeSweep = null;
  };
  const schedulePageSweep = (audio) => {
    if (!enabled || reducedMotion.matches || document.hidden || !root.classList.contains("spark-page-leaving")) return;
    const animation = document.getElementById("main")?.getAnimations?.()
      .find((effect) => effect.animationName === "spark-page-out");
    const elapsed = Number(animation?.currentTime) || 0;
    const duration = Math.min(0.42, (450 - elapsed) / 1000 - 0.015);
    if (duration < 0.05) return;
    stopSweep();
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < samples.length; i++) {
      previous = previous * 0.6 + (Math.random() * 2 - 1) * 0.4;
      samples[i] = previous;
    }
    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    const pan = audio.createStereoPanner?.();
    const start = audio.currentTime;
    noise.buffer = buffer;
    filter.type = "bandpass";
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(2200, start);
    filter.frequency.exponentialRampToValueAtTime(420, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.14, start + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    noise.connect(filter);
    filter.connect(gain);
    if (pan) {
      pan.pan.setValueAtTime(0.7, start);
      pan.pan.linearRampToValueAtTime(-0.8, start + duration);
      gain.connect(pan);
      pan.connect(audio.destination);
    } else {
      gain.connect(audio.destination);
    }
    activeSweep = noise;
    noise.onended = () => {
      if (activeSweep === noise) activeSweep = null;
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan?.disconnect();
    };
    noise.start(start);
    noise.stop(start + duration);
  };

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
    const label = enabled && introBlocked ? "Play introduction with sound" : enabled ? "Turn site sounds off" : "Turn site sounds on";
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    if (toggleLabel) toggleLabel.textContent = enabled && introBlocked ? "Play intro" : enabled ? "Sound on" : "Sound off";
  };

  const playCue = async (kind = "navigation-click") => {
    if (!enabled) return;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const notes = cues[kind];
    if (!AudioContextConstructor || (!notes && kind !== "page-sweep")) return;

    try {
      context ||= new AudioContextConstructor();
      if (context.state !== "running") await context.resume();
      if (context.state !== "running") return;
      if (kind === "page-sweep") {
        schedulePageSweep(context);
        return;
      }

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

  const announcePreference = () => {
    window.dispatchEvent(new CustomEvent("spark:sound-change", { detail: { enabled } }));
  };
  window.sparkSound = {
    play: playCue,
    get enabled() { return enabled; },
    setIntroBlocked(blocked) {
      introBlocked = enabled && blocked;
      updateToggle();
    },
  };
  updateToggle();

  toggle?.addEventListener("click", async () => {
    if (enabled && introBlocked) {
      window.dispatchEvent(new CustomEvent("spark:home-intro-play"));
      return;
    }
    enabled = !enabled;
    introBlocked = false;
    try {
      if (enabled) window.localStorage.setItem(storageKey, "enabled");
      else window.localStorage.removeItem(storageKey);
    } catch {
      // The preference still applies until this page is closed.
    }
    updateToggle();
    if (!enabled) stopSweep();
    announcePreference();
    if (enabled) {
      window.dispatchEvent(new CustomEvent("spark:home-intro-play"));
      if (!root.classList.contains("spark-home-intro")) await playCue("control-click");
    }
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
    if (root.classList.contains("spark-page-leaving")) return;
    const target = event.target.closest(soundTargets);
    const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (!target || target.contains(relatedTarget)) return;
    lastCueAt = performance.now();
    const category = categoryFor(target);
    if (category) playCue(`${category}-hover`);
  }, { passive: true });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (root.classList.contains("spark-page-leaving")) return;
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
    if (!enabled) introBlocked = false;
    updateToggle();
    if (!enabled) stopSweep();
    announcePreference();
  });
  window.addEventListener("spark:sound-change", (event) => {
    enabled = event.detail.enabled;
    if (!enabled) introBlocked = false;
    updateToggle();
    if (!enabled) stopSweep();
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) stopSweep();
  });
  window.addEventListener("pagehide", stopSweep);
})();

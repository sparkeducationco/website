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
  let headerTimeout = null;
  const soundPreferenceKey = "spark-home-intro-sound";
  let soundEnabled = false;
  let autoplayBlocked = false;
  const playIntroSound = async () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return false;

    let context;
    try {
      context = new AudioContextConstructor();
      await Promise.race([
        context.resume(),
        new Promise((resolve) => window.setTimeout(resolve, 500)),
      ]);
      if (context.state !== "running") {
        await context.close();
        return false;
      }
      const start = context.currentTime;
      [
        { from: 392, to: 587, delay: 0, level: 0.045 },
        { from: 587, to: 784, delay: 0.12, level: 0.025 },
      ].forEach(({ from, to, delay, level }) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = start + delay;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(from, noteStart);
        oscillator.frequency.exponentialRampToValueAtTime(to, noteStart + 0.48);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(level, noteStart + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.85);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.9);
      });
      window.setTimeout(() => context.close(), 1400);
      return true;
    } catch {
      context?.close();
      return false;
    }
  };
  const clearHeaderReveal = () => {
    root.classList.remove("spark-home-header-reveal");
    window.clearTimeout(headerTimeout);
  };
  root.classList.add("spark-home-intro");
  const finish = (interrupted = false) => {
    if (interrupted) clearHeaderReveal();
    if (!root.classList.contains("spark-home-intro")) return;
    root.classList.remove("spark-home-intro");
    window.clearTimeout(timeout);
    if (!interrupted && !reducedMotion.matches) {
      root.classList.add("spark-home-header-reveal");
      headerTimeout = window.setTimeout(clearHeaderReveal, 650);
    }
    window.dispatchEvent(new CustomEvent("spark:home-intro-end", { detail: { interrupted } }));
  };
  document.addEventListener("animationend", (event) => {
    if (event.animationName === "spark-intro-curtain") finish();
    if (event.animationName === "spark-intro-header") clearHeaderReveal();
  });
  document.addEventListener("DOMContentLoaded", () => {
    // If CSS or animation events fail, never leave a curtain over the page.
    if (root.classList.contains("spark-home-intro")) timeout = window.setTimeout(() => finish(), 2400);
    const soundButton = document.querySelector(".home-intro-sound");
    const soundLabel = soundButton?.querySelector(".home-intro-sound-label");
    try {
      soundEnabled = window.localStorage.getItem(soundPreferenceKey) === "enabled";
    } catch {
      // Sound remains available as a one-time choice when storage is unavailable.
    }
    const updateSoundButton = () => {
      if (!soundButton || !soundLabel) return;
      soundButton.setAttribute("aria-pressed", String(soundEnabled));
      soundLabel.textContent = !soundEnabled ? "Sound off" : autoplayBlocked ? "Tap for sound" : "Sound on";
      soundButton.setAttribute(
        "aria-label",
        !soundEnabled ? "Enable intro sound" : autoplayBlocked ? "Play intro sound" : "Turn intro sound off",
      );
    };
    updateSoundButton();
    if (soundEnabled && root.classList.contains("spark-home-intro")) {
      playIntroSound().then((played) => {
        autoplayBlocked = !played;
        updateSoundButton();
      });
    }
    soundButton?.addEventListener("click", async () => {
      if (!root.classList.contains("spark-home-intro")) return;
      if (soundEnabled && !autoplayBlocked) {
        soundEnabled = false;
        try {
          window.localStorage.removeItem(soundPreferenceKey);
        } catch {
          // Keep the in-memory preference for this intro if storage is unavailable.
        }
      } else {
        soundEnabled = true;
        autoplayBlocked = false;
        try {
          window.localStorage.setItem(soundPreferenceKey, "enabled");
        } catch {
          // The choice still applies for this intro if storage is unavailable.
        }
        autoplayBlocked = !(await playIntroSound());
      }
      updateSoundButton();
    });
  }, { once: true });
  for (const type of ["pointerdown", "touchstart", "wheel"]) {
    document.addEventListener(type, (event) => {
      if (event.target.closest?.(".home-intro-sound")) return;
      finish(true);
    }, { passive: true });
  }
  document.addEventListener("keydown", (event) => {
    if (event.target.closest?.(".home-intro-sound")) return;
    finish(true);
  });
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

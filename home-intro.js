(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const navigation = window.performance?.getEntriesByType?.("navigation")?.[0];
  const isReload = navigation?.type === "reload";
  if (reducedMotion.matches || document.hidden || (!isReload && (window.location.hash || window.scrollY > 80)) ||
      navigation?.type === "back_forward" || root.classList.contains("spark-page-entering")) return;

  try {
    if (!isReload && window.sessionStorage.getItem("spark-home-introduced")) return;
    window.sessionStorage.setItem("spark-home-introduced", "1");
  } catch {
    // A decorative entrance must still work without access to storage.
  }

  let timeout = null;
  let headerTimeout = null;
  const soundPreferenceKey = "spark-site-sound-enabled";
  let soundEnabled = false;
  let autoplayBlocked = false;
  let soundPending = false;
  let soundAttempt = 0;
  let introContext = null;
  const closeAudio = (context) => {
    if (context && context.state !== "closed") context.close().catch(() => {});
  };
  const scheduleWhoosh = (context) => {
    if (!root.classList.contains("spark-home-intro")) return 0;
    const animation = document.querySelector(".home-intro-ray")?.getAnimations?.()
      .find((effect) => effect.animationName === "spark-intro-ray");
    const animationDuration = Number(animation?.effect?.getTiming().duration) || 1800;
    const elapsed = Number(animation?.currentTime) || 0;
    const delay = Math.max(0, animationDuration * 0.48 - elapsed) / 1000;
    const duration = Math.min(1, (animationDuration - elapsed) / 1000 - delay);
    if (duration < 0.05) return 0;

    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    noise.buffer = buffer;
    filter.type = "bandpass";
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(380, start);
    filter.frequency.exponentialRampToValueAtTime(2200, start + duration * 0.65);
    filter.frequency.exponentialRampToValueAtTime(900, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + duration * 0.38);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    noise.start(start);
    noise.stop(start + duration);
    return delay + duration;
  };
  const playIntroSound = async () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return false;

    let context;
    try {
      closeAudio(introContext);
      context = new AudioContextConstructor();
      introContext = context;
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
      // Starting a source can unlock an opted-in context on a later visit in Chromium.
      await Promise.race([
        context.resume(),
        new Promise((resolve) => window.setTimeout(resolve, 500)),
      ]);
      if (context.state !== "running") {
        closeAudio(context);
        return false;
      }
      const whooshEnd = scheduleWhoosh(context);
      window.setTimeout(() => closeAudio(context), Math.ceil(Math.max(1.15, whooshEnd + 0.1) * 1000));
      return true;
    } catch {
      closeAudio(context);
      return false;
    }
  };
  const clearHeaderReveal = () => {
    root.classList.remove("spark-home-header-reveal");
    window.clearTimeout(headerTimeout);
  };
  root.classList.add("spark-home-intro");
  const finish = (interrupted = false) => {
    if (interrupted) {
      clearHeaderReveal();
      closeAudio(introContext);
    }
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
      soundLabel.textContent = !soundEnabled ? "Sound off" : (autoplayBlocked || soundPending) ? "Tap for sound" : "Sound on";
      soundButton.setAttribute(
        "aria-label",
        !soundEnabled ? "Enable intro sound" : (autoplayBlocked || soundPending) ? "Play intro sound" : "Turn intro sound off",
      );
    };
    const startSound = async () => {
      const attempt = ++soundAttempt;
      soundPending = true;
      updateSoundButton();
      const played = await playIntroSound();
      if (attempt !== soundAttempt) return;
      soundPending = false;
      autoplayBlocked = !played;
      updateSoundButton();
    };
    updateSoundButton();
    if (soundEnabled && root.classList.contains("spark-home-intro")) {
      startSound();
    }
    soundButton?.addEventListener("click", async () => {
      if (!root.classList.contains("spark-home-intro")) return;
      if (soundEnabled && !autoplayBlocked && !soundPending) {
        soundEnabled = false;
        soundAttempt++;
        closeAudio(introContext);
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
        startSound();
      }
      window.dispatchEvent(new CustomEvent("spark:sound-change", { detail: { enabled: soundEnabled } }));
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
    if (event.persisted || (!isReload && window.scrollY > 80)) finish(true);
  });
  window.addEventListener("scroll", () => {
    if (!isReload && window.scrollY > 80) finish(true);
  }, { passive: true });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) finish(true);
  });
})();

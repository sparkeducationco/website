const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../home-intro.js"), "utf8");
const soundSource = fs.readFileSync(path.join(__dirname, "../site-sound.js"), "utf8");

test("intro has sixteen independent rays that launch outward as the backdrop fades", () => {
    const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "../site.css"), "utf8");
    const rays = [...html.matchAll(/class="home-intro-ray" style="--ray-x: ([\d.\-]+); --ray-y: ([\d.\-]+)"/g)];
    assert.equal(rays.length, 16);
    const directions = new Set();
    for (const [, x, y] of rays) {
        assert.ok(Math.abs(Math.hypot(Number(x), Number(y)) - 1) < .001);
        directions.add(`${x},${y}`);
    }
    assert.equal(directions.size, 16);
    assert.match(css, /@keyframes spark-intro-ray[\s\S]*?145vmax/);
    assert.match(css, /@keyframes spark-intro-backdrop\s*\{[^}]*opacity: 1;[^}]*\}[\s\S]*?opacity: 0;/);
    assert.match(css, /\.home-intro-sun\s*\{[^}]*overflow: visible/);
});

function harness({ reduced = false, hidden = false, hash = "", scrollY = 0,
    navigationType = "navigate", entering = false, introduced = false, storageBlocked = false,
    soundEnabled = false, audioMode = "unsupported", animationTime = 0, savedPreference = null } = {}) {
    class Events {
        constructor() { this.listeners = new Map(); }
        addEventListener(type, callback) {
            const list = this.listeners.get(type) || [];
            list.push(callback);
            this.listeners.set(type, list);
        }
        dispatch(type, data = {}) {
            const event = { type, defaultPrevented: false, target: { closest: () => null },
                preventDefault() { this.defaultPrevented = true; }, ...data };
            for (const callback of this.listeners.get(type) || []) callback(event);
            return event;
        }
    }
    const classes = new Set(entering ? ["spark-page-entering"] : []);
    const document = new Events();
    const soundButton = new Events();
    const soundAttributes = new Map();
    soundButton.setAttribute = (key, value) => soundAttributes.set(key, value);
    document.querySelector = (selector) => selector === ".home-intro-ray" ? {
        getAnimations: () => [{ animationName: "spark-intro-ray", currentTime: animationTime,
            effect: { getTiming: () => ({ duration: 1800 }) } }],
    } : selector === ".site-sound-toggle" ? soundButton : null;
    document.hidden = hidden;
    document.documentElement = { scrollHeight: 3000, clientHeight: 800, classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
    } };
    const window = new Events();
    const preference = new Events();
    preference.matches = reduced;
    window.matchMedia = () => preference;
    window.performance = { getEntriesByType: () => [{ type: navigationType }] };
    window.location = { hash };
    window.scrollY = scrollY;
    const storage = new Map(introduced ? [["spark-home-introduced", "1"]] : []);
    window.sessionStorage = {
        getItem(key) { if (storageBlocked) throw new Error("Blocked"); return storage.get(key); },
        setItem(key, value) { if (storageBlocked) throw new Error("Blocked"); storage.set(key, value); },
    };
    const localStorage = savedPreference || new Map(soundEnabled ? [["spark-site-sound-enabled", "enabled"]] : []);
    window.localStorage = {
        getItem(key) { if (storageBlocked) throw new Error("Blocked"); return localStorage.get(key); },
        setItem(key, value) { if (storageBlocked) throw new Error("Blocked"); localStorage.set(key, value); },
        removeItem(key) { if (storageBlocked) throw new Error("Blocked"); localStorage.delete(key); },
    };
    let userGesture = false;
    const audioContexts = [];
    if (audioMode !== "unsupported") {
        window.AudioContext = class {
            constructor() {
                this.state = "suspended";
                this.currentTime = 0;
                this.sampleRate = 22050;
                this.sourcesStarted = 0;
                this.sourcesAtResume = [];
                this.noiseSources = [];
                audioContexts.push(this);
            }
            resume() {
                this.sourcesAtResume.push(this.sourcesStarted);
                if (audioMode === "allowed" || userGesture ||
                    (audioMode === "source-unlocks" && this.sourcesStarted > 0)) {
                    this.state = "running";
                    return Promise.resolve();
                }
                return new Promise(() => {});
            }
            close() { this.state = "closed"; return Promise.resolve(); }
            createGain() {
                return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {},
                    cancelScheduledValues() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
            }
            createOscillator() {
                return {
                    frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
                    connect() {}, disconnect() {}, stop() {}, start: () => { this.sourcesStarted++; },
                };
            }
            createBuffer(channels, length) {
                const data = new Float32Array(length);
                return { getChannelData: () => data };
            }
            createBiquadFilter() {
                return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} },
                    Q: { value: 0 }, connect() {}, disconnect() {} };
            }
            createBufferSource() {
                const source = { connect() {}, disconnect() {},
                    start: (time) => { source.startTime = time; this.sourcesStarted++; },
                    stop: (time) => { source.stopTime = time; },
                };
                this.noiseSources.push(source);
                return source;
            }
        };
    }
    const timers = new Map();
    window.setTimeout = (callback, duration) => { const id = timers.size + 1; timers.set(id, { callback, duration }); return id; };
    window.clearTimeout = (id) => timers.delete(id);
    const completions = [];
    window.dispatchEvent = (event) => { completions.push(event); return window.dispatch(event.type, event); };
    class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
    class Element {}
    const environment = vm.createContext({ window, document, CustomEvent, Element, Node: Element,
        HTMLSelectElement: Element, performance: { now: () => 1000 } });
    vm.runInContext(source, environment);
    vm.runInContext(soundSource, environment);
    const tapSound = () => {
        userGesture = true;
        document.dispatch("pointerdown", { target: soundButton, isTrusted: true });
        soundButton.dispatch("click");
        userGesture = false;
    };
    return { window, document, classes, timers, storage, preference, completions,
        localStorage, soundButton, soundAttributes, audioContexts, tapSound };
}

const flushAudio = () => new Promise((resolve) => setImmediate(resolve));

test("a fresh homepage visit starts the decorative intro before first paint", () => {
    const h = harness();
    assert.ok(h.classes.has("spark-home-intro"));
    assert.equal(h.storage.get("spark-home-introduced"), "1");
    assert.equal(h.timers.size, 0);
    h.document.dispatch("DOMContentLoaded");
    assert.equal([...h.timers.values()][0].duration, 2400);
});

test("the curtain finishing removes the overlay without interrupting the hero reveal", () => {
    const h = harness();
    h.document.dispatch("DOMContentLoaded");
    h.document.dispatch("animationend", { animationName: "spark-intro-word" });
    assert.ok(h.classes.has("spark-home-intro"));
    h.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
    assert.equal(h.classes.has("spark-home-intro"), false);
    assert.ok(h.classes.has("spark-home-header-reveal"));
    assert.equal(h.completions.length, 1);
    assert.equal(h.completions[0].detail.interrupted, false);
    h.document.dispatch("animationend", { animationName: "spark-intro-header" });
    assert.equal(h.classes.size, 0);
    assert.equal(h.timers.size, 0);
});

test("scrolling, touch, keyboard and pointer input dismiss immediately without consuming input", () => {
    for (const type of ["wheel", "pointerdown", "touchstart", "keydown"]) {
        const h = harness();
        assert.equal(h.document.dispatch(type).defaultPrevented, false);
        assert.equal(h.classes.size, 0, type);
        assert.equal(h.completions[0].detail.interrupted, true);
        h.document.dispatch(type);
        assert.equal(h.completions.length, 1, "cleanup is idempotent");
    }
});

test("reduced motion, deep links, restored scroll, return slides and repeated visits skip the intro", () => {
    for (const options of [{ reduced: true }, { hidden: true }, { hash: "#pricing" },
        { scrollY: 500 }, { navigationType: "back_forward" }, { entering: true }, { introduced: true }]) {
        const h = harness(options);
        assert.equal(h.classes.has("spark-home-intro"), false, JSON.stringify(options));
        assert.equal(h.timers.size, 0);
    }
});

test("restoration after parsing and Back/Forward cache cannot re-show an intro", () => {
    for (const restore of ["scroll", "pageshow", "pagehide"]) {
        const h = harness();
        h.window.scrollY = 500;
        h.window.dispatch(restore, { persisted: true });
        assert.equal(h.classes.size, 0);
    }
});

test("changing motion preferences or hiding the tab cancels an active intro", () => {
    const motion = harness();
    motion.preference.matches = true;
    motion.preference.dispatch("change");
    assert.equal(motion.classes.size, 0);
    const hidden = harness();
    hidden.document.hidden = true;
    hidden.document.dispatch("visibilitychange");
    assert.equal(hidden.classes.size, 0);
});

test("blocked storage and missing animation events never strand the curtain", () => {
    const h = harness({ storageBlocked: true });
    assert.ok(h.classes.has("spark-home-intro"));
    h.document.dispatch("DOMContentLoaded");
    [...h.timers.values()][0].callback();
    assert.equal(h.classes.has("spark-home-intro"), false);
    [...h.timers.values()][0].callback();
    assert.equal(h.classes.size, 0);
    assert.equal(h.timers.size, 0);
});

test("interrupting the intro exposes the header immediately without a delayed entrance", () => {
    const h = harness();
    h.document.dispatch("keydown", { key: "Tab" });
    assert.equal(h.classes.has("spark-home-intro"), false);
    assert.equal(h.classes.has("spark-home-header-reveal"), false);
    assert.equal(h.timers.size, 0);
});

test("navigation during the header reveal clears its transform before leaving", () => {
    const h = harness();
    h.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
    assert.ok(h.classes.has("spark-home-header-reveal"));
    h.window.dispatch("pagehide");
    assert.equal(h.classes.size, 0);
    assert.equal(h.timers.size, 0);
});

test("an opted-in reload schedules sources before resume so allowed autoplay can start", async () => {
    const h = harness({ navigationType: "reload", introduced: true,
        soundEnabled: true, audioMode: "source-unlocks" });
    h.document.dispatch("DOMContentLoaded");
    await flushAudio();
    assert.ok(h.classes.has("spark-home-intro"));
    assert.equal(h.audioContexts.length, 1);
    assert.deepEqual(h.audioContexts[0].sourcesAtResume, [2]);
    assert.equal(h.audioContexts[0].state, "running");
    assert.equal(h.soundAttributes.get("aria-pressed"), "true");
    assert.equal(h.localStorage.get("spark-site-sound-enabled"), "enabled");
});

test("blocked reload audio can be replayed from the persistent toggle after the curtain ends", async () => {
    const h = harness({ navigationType: "reload", introduced: true,
        soundEnabled: true, audioMode: "blocked" });
    h.document.dispatch("DOMContentLoaded");
    [...h.timers.values()].find((timer) => timer.duration === 500).callback();
    await flushAudio();
    assert.equal(h.audioContexts[0].state, "closed");
    assert.equal(h.soundAttributes.get("aria-pressed"), "true");
    assert.equal(h.audioContexts.length, 1);
    assert.equal(h.localStorage.get("spark-site-sound-enabled"), "enabled");
    assert.equal(h.soundAttributes.get("aria-label"), "Play introduction with sound");
    assert.ok(h.classes.has("spark-home-intro"), "blocked audio does not delay or dismiss the animation");
    h.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
    h.tapSound();
    await flushAudio();
    assert.equal(h.audioContexts.length, 3);
    assert.equal(h.audioContexts[1].state, "running");
    assert.equal(h.audioContexts[1].sourcesStarted, 0, "the shared context is silently unlocked by the tap");
    assert.equal(h.audioContexts[2].state, "running");
    assert.equal(h.audioContexts[2].noiseSources.length, 1);
    assert.equal(h.soundAttributes.get("aria-pressed"), "true");
    assert.equal(h.soundAttributes.get("aria-label"), "Turn site sounds off");
    assert.equal(h.localStorage.get("spark-site-sound-enabled"), "enabled");
    assert.ok(h.classes.has("spark-home-intro"), "sound and visuals restart together from the gesture");
    h.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
    h.tapSound();
    assert.equal(h.window.sparkSound.enabled, false, "the toggle returns to normal muting after playback");
});

test("enabling intro sound also prepares scroll audio through the same trusted tap", async () => {
    const h = harness({ audioMode: "blocked" });
    h.document.dispatch("DOMContentLoaded");
    h.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
    h.tapSound();
    await flushAudio();
    assert.equal(h.audioContexts.length, 2);
    const shared = h.audioContexts[0];
    assert.equal(shared.state, "running");
    assert.equal(shared.sourcesStarted, 0);
    assert.equal(h.audioContexts[1].noiseSources.length, 1);
    h.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
    h.document.dispatch("wheel", { isTrusted: true, deltaY: 30, deltaX: 0 });
    h.window.scrollY = 100;
    h.window.dispatch("scroll");
    assert.equal(shared.sourcesStarted, 1, "scrolling uses the already-unlocked shared context");
    assert.equal(h.audioContexts.length, 2, "scrolling does not create another context");
});

test("muting the shared setting while autoplay is pending cancels the intro audio", async () => {
    const h = harness({ navigationType: "reload", soundEnabled: true, audioMode: "blocked" });
    h.document.dispatch("DOMContentLoaded");
    const blockedTimer = [...h.timers.values()].find((timer) => timer.duration === 500);
    h.tapSound();
    await flushAudio();
    blockedTimer.callback();
    await flushAudio();
    assert.equal(h.audioContexts[0].state, "closed");
    assert.equal(h.audioContexts.length, 1);
    assert.equal(h.soundAttributes.get("aria-pressed"), "false");
    assert.equal(h.localStorage.has("spark-site-sound-enabled"), false);
});

test("a muted reload creates no audio context", () => {
    const h = harness({ navigationType: "reload", introduced: true, audioMode: "allowed" });
    h.document.dispatch("DOMContentLoaded");
    assert.ok(h.classes.has("spark-home-intro"));
    assert.equal(h.audioContexts.length, 0);
    assert.equal(h.soundAttributes.get("aria-pressed"), "false");
});

test("scroll restoration on reload preserves the intro until the visitor interacts", () => {
    const h = harness({ navigationType: "reload", introduced: true, hash: "#questions", scrollY: 500 });
    h.window.dispatch("pageshow", { persisted: false });
    h.window.dispatch("scroll");
    assert.ok(h.classes.has("spark-home-intro"));
    h.document.dispatch("wheel");
    assert.equal(h.classes.has("spark-home-intro"), false);
});

test("the whoosh starts with the radial ray launch and ends with the curtain", async () => {
    const h = harness({ soundEnabled: true, audioMode: "allowed" });
    h.document.dispatch("DOMContentLoaded");
    await flushAudio();
    const noise = h.audioContexts[0].noiseSources[0];
    assert.ok(Math.abs(noise.startTime - 0.864) < 0.0001);
    assert.ok(Math.abs(noise.stopTime - 1.8) < 0.0001);
    assert.ok([...h.timers.values()].some((timer) => timer.duration >= 1900));
});

test("enabling sound late plays only the remaining whoosh instead of delaying it past the intro", async () => {
    const h = harness({ audioMode: "allowed", animationTime: 1200 });
    h.document.dispatch("DOMContentLoaded");
    h.window.dispatch("storage", { key: "spark-site-sound-enabled", newValue: "enabled" });
    await flushAudio();
    const noise = h.audioContexts[0].noiseSources[0];
    assert.equal(noise.startTime, 0);
    assert.ok(Math.abs(noise.stopTime - 0.6) < 0.0001);
});

test("muting or dismissing the intro cancels its scheduled whoosh", async () => {
    for (const dismiss of ["mute", "wheel"]) {
        const h = harness({ soundEnabled: true, audioMode: "allowed" });
        h.document.dispatch("DOMContentLoaded");
        await flushAudio();
        assert.equal(h.audioContexts[0].noiseSources.length, 1);
        if (dismiss === "mute") h.tapSound();
        else h.document.dispatch("wheel");
        assert.equal(h.audioContexts[0].state, "closed");
    }
});

test("the sticky bar remembers the startup preference on subsequent reloads", async () => {
    const first = harness({ audioMode: "allowed" });
    first.document.dispatch("DOMContentLoaded");
    first.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
    first.tapSound();
    await flushAudio();
    assert.equal(first.window.sparkSound.enabled, true);
    assert.ok(first.classes.has("spark-home-intro"));
    assert.equal(first.audioContexts.at(-1).noiseSources.length, 1, "enabling sound replays the intro without a timed button");
    const reload = harness({ navigationType: "reload", audioMode: "allowed", savedPreference: first.localStorage });
    reload.document.dispatch("DOMContentLoaded");
    await flushAudio();
    assert.equal(reload.audioContexts[0].noiseSources.length, 1);
    assert.equal(reload.soundAttributes.get("aria-pressed"), "true");
    reload.tapSound();
    const muted = harness({ navigationType: "reload", audioMode: "allowed", savedPreference: first.localStorage });
    muted.document.dispatch("DOMContentLoaded");
    await flushAudio();
    assert.equal(muted.audioContexts.length, 0);
    assert.equal(muted.soundAttributes.get("aria-pressed"), "false");
});

test("cross-tab muting stops the intro without changing the animation", async () => {
    const h = harness({ soundEnabled: true, audioMode: "allowed" });
    h.document.dispatch("DOMContentLoaded");
    await flushAudio();
    h.window.dispatch("storage", { key: "spark-site-sound-enabled", newValue: null });
    assert.equal(h.audioContexts[0].state, "closed");
    assert.equal(h.soundAttributes.get("aria-pressed"), "false");
    assert.ok(h.classes.has("spark-home-intro"));
});

test("reduced motion skips startup audio even when site sounds are enabled", async () => {
    const h = harness({ reduced: true, soundEnabled: true, audioMode: "allowed", navigationType: "reload" });
    h.document.dispatch("DOMContentLoaded");
    await flushAudio();
    assert.equal(h.audioContexts.length, 0);
    assert.equal(h.soundAttributes.get("aria-pressed"), "true");
});

test("sound remains synchronized when browser storage is unavailable", async () => {
    const h = harness({ storageBlocked: true, audioMode: "allowed" });
    h.document.dispatch("DOMContentLoaded");
    h.tapSound();
    await flushAudio();
    assert.equal(h.window.sparkSound.enabled, true);
    assert.equal(h.audioContexts.at(-1).noiseSources.length, 1);
    h.tapSound();
    assert.equal(h.window.sparkSound.enabled, false);
    assert.equal(h.audioContexts.at(-1).state, "closed");
});

test("the homepage has only the persistent sound control, not a second intro button", () => {
    const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "../site.css"), "utf8");
    assert.equal([...html.matchAll(/class="site-sound-toggle"/g)].length, 1);
    assert.ok(!html.includes("home-intro-sound"));
    assert.ok(!css.includes("home-intro-sound"));
});

test("a blocked intro can be replayed after scrolling without a timed click", async () => {
    const h = harness({ soundEnabled: true, audioMode: "blocked", navigationType: "reload" });
    h.document.dispatch("DOMContentLoaded");
    [...h.timers.values()].find(timer => timer.duration === 500).callback();
    await flushAudio();
    h.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
    h.window.scrollY = 800;
    h.tapSound();
    await flushAudio();
    assert.equal(h.audioContexts.at(-1).state, "running");
    assert.ok(h.classes.has("spark-home-intro"));
    assert.equal(h.window.scrollY, 800, "replay does not change the reader's scroll position");
});

test("switching to reduced motion removes the blocked-audio replay action", async () => {
    const h = harness({ soundEnabled: true, audioMode: "blocked", navigationType: "reload" });
    h.document.dispatch("DOMContentLoaded");
    [...h.timers.values()].find(timer => timer.duration === 500).callback();
    await flushAudio();
    h.preference.matches = true;
    h.preference.dispatch("change");
    assert.equal(h.soundAttributes.get("aria-label"), "Turn site sounds off");
    h.tapSound();
    assert.equal(h.window.sparkSound.enabled, false);
    assert.equal(h.audioContexts.length, 1);
    assert.ok(!h.classes.has("spark-home-intro"));
});

test("replaying an intro cannot interrupt document navigation or a hidden tab", async () => {
    for (const suppress of [h => h.classes.add("spark-page-leaving"),
        h => h.classes.add("spark-page-entering"), h => { h.document.hidden = true; }]) {
        const h = harness({ soundEnabled: true, audioMode: "allowed" });
        h.document.dispatch("DOMContentLoaded");
        await flushAudio();
        h.document.dispatch("animationend", { animationName: "spark-intro-curtain" });
        suppress(h);
        h.window.dispatch("spark:home-intro-play");
        assert.equal(h.audioContexts.length, 1);
        assert.ok(!h.classes.has("spark-home-intro"));
    }
});

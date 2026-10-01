const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../site-sound.js"), "utf8");

function harness({ enabled = true, reduced = false, hidden = false, leaving = true,
    elapsed = 0, panning = true, audioMode = "running", animations = true,
    scrollY = 200, scrollHeight = 2000, viewportHeight = 800 } = {}) {
    class Events {
        constructor() { this.listeners = new Map(); }
        addEventListener(type, callback) {
            const list = this.listeners.get(type) || [];
            list.push(callback);
            this.listeners.set(type, list);
        }
        dispatch(type, event = {}) {
            for (const callback of this.listeners.get(type) || []) callback(event);
        }
    }
    class Element {
        closest(selector) {
            if (/input|textarea|contenteditable/.test(selector)) return this.editable ? this : null;
            return this;
        }
        contains() { return false; }
    }
    const classes = new Set(leaving ? ["spark-page-leaving"] : []);
    const document = new Events();
    const toggle = new Events();
    const label = { textContent: "Sound off" };
    toggle.querySelector = () => label;
    const attributes = new Map();
    toggle.setAttribute = (key, value) => attributes.set(key, value);
    document.querySelector = () => toggle;
    document.hidden = hidden;
    document.documentElement = { scrollHeight, clientHeight: viewportHeight,
        classList: { contains: name => classes.has(name) } };
    document.scrollingElement = document.documentElement;
    const animation = { animationName: "spark-page-out", currentTime: elapsed };
    document.getElementById = () => animations ? { getAnimations: () => [animation] } : {};
    const window = new Events();
    window.scrollY = scrollY;
    window.innerHeight = viewportHeight;
    class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
    window.dispatchEvent = event => window.dispatch(event.type, event);
    const preference = new Events();
    preference.matches = reduced;
    window.matchMedia = () => preference;
    const storage = new Map(enabled ? [["spark-site-sound-enabled", "enabled"]] : []);
    window.localStorage = {
        getItem: key => storage.get(key),
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
    };
    const contexts = [];
    let milliseconds = 0;
    let userGesture = false;
    let timerId = 0;
    const timers = new Map();
    window.setTimeout = (callback, delay) => {
        const id = ++timerId;
        timers.set(id, { callback, at: milliseconds + delay });
        return id;
    };
    window.clearTimeout = id => timers.delete(id);
    const advance = duration => {
        const end = milliseconds + duration;
        const setTime = time => {
            milliseconds = time;
            for (const audio of contexts) audio.currentTime = 10 + time / 1000;
        };
        while (true) {
            const next = [...timers.entries()].filter(([, timer]) => timer.at <= end)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            setTime(next[1].at);
            timers.delete(next[0]);
            next[1].callback();
        }
        setTime(end);
    };
    const parameter = () => ({ value: 0, calls: [],
        cancelScheduledValues(time) { this.calls.push(["cancel", time]); },
        setValueAtTime(value, time) { this.calls.push(["set", value, time]); },
        exponentialRampToValueAtTime(value, time) { this.calls.push(["exponential", value, time]); },
        linearRampToValueAtTime(value, time) { this.calls.push(["linear", value, time]); },
        setTargetAtTime(value, time, constant) { this.calls.push(["target", value, time, constant]); },
    });
    const node = extra => ({ connections: [], disconnected: false,
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnected = true; }, ...extra,
    });
    const pendingResumes = [];
    if (audioMode !== "unsupported") window.AudioContext = class {
        constructor() {
            this.state = audioMode === "running" ? "running" : "suspended";
            this.currentTime = 10;
            this.sampleRate = 22050;
            this.destination = {};
            this.sources = [];
            this.filters = [];
            this.gains = [];
            this.panners = [];
            this.oscillators = [];
            if (!panning) this.createStereoPanner = undefined;
            contexts.push(this);
        }
        resume() {
            if (audioMode === "gesture" && userGesture) {
                this.state = "running";
                return Promise.resolve();
            }
            return new Promise(resolve => pendingResumes.push(() => { this.state = "running"; resolve(); }));
        }
        createBuffer(channels, length, sampleRate) {
            return { channels, sampleRate, data: new Float32Array(length), getChannelData() { return this.data; } };
        }
        createBufferSource() {
            const source = node({ stops: [],
                start(time) { this.startTime = time; },
                stop(time) { this.stops.push(time); if (time === undefined) this.onended?.(); },
            });
            this.sources.push(source);
            return source;
        }
        createBiquadFilter() {
            const filter = node({ frequency: parameter(), Q: parameter() });
            this.filters.push(filter);
            return filter;
        }
        createGain() {
            const gain = node({ gain: parameter() });
            this.gains.push(gain);
            return gain;
        }
        createStereoPanner() {
            const pan = node({ pan: parameter() });
            this.panners.push(pan);
            return pan;
        }
        createOscillator() {
            const oscillator = node({ frequency: parameter(), starts: [], stops: [],
                start(time) { this.starts.push(time); },
                stop(time) { this.stops.push(time); if (time === undefined) this.onended?.(); },
            });
            this.oscillators.push(oscillator);
            return oscillator;
        }
    };
    const observers = [];
    class MutationObserver {
        constructor(callback) { observers.push(callback); }
        observe() {}
    }
    vm.runInNewContext(source, { window, document, CustomEvent, Element, Node: Element,
        MutationObserver, HTMLSelectElement: Element, performance: { now: () => 1000 + milliseconds } });
    const wheel = (options = {}) => document.dispatch("wheel", {
        isTrusted: true, deltaY: 30, deltaX: 0, target: new Element(), ...options,
    });
    const scroll = position => { window.scrollY = position; window.dispatch("scroll"); };
    return { window, document, toggle, label, attributes, storage, preference, contexts, classes, animation,
        timers, advance, rootChanged: () => observers.forEach(callback => callback()),
        wheel, scroll, inputScroll: position => { wheel(); scroll(position); },
        gesture: (type = "pointerdown", options = {}) => {
            userGesture = true;
            document.dispatch(type, { isTrusted: true, target: new Element(), ...options });
            userGesture = false;
        },
        resume: () => pendingResumes.splice(0).forEach(resolve => resolve()),
        target: new Element(), play: () => window.sparkSound.play("page-sweep") };
}

test("page sweep descends and pans left within the outgoing animation", async () => {
    const h = harness();
    await h.play();
    const audio = h.contexts[0];
    const noise = audio.sources[0];
    assert.equal(audio.oscillators.length, 0, "the sweep is distinct from tonal UI cues");
    assert.equal(noise.startTime, 10);
    assert.ok(Math.abs(noise.stops[0] - 10.42) < 0.0001);
    assert.equal(noise.buffer.channels, 1);
    assert.ok(noise.buffer.data.some(value => value !== 0));
    assert.equal(audio.filters[0].type, "bandpass");
    assert.deepEqual(audio.filters[0].frequency.calls, [["set", 2200, 10], ["exponential", 420, 10.42]]);
    assert.deepEqual(audio.panners[0].pan.calls, [["set", 0.7, 10], ["linear", -0.8, 10.42]]);
    assert.equal(audio.gains[0].gain.calls.at(-1)[1], 0.0001);
    noise.onended();
    for (const node of [...audio.sources, ...audio.filters, ...audio.gains, ...audio.panners]) assert.ok(node.disconnected);
});

test("muting, reduced motion, hidden pages and absent transitions keep the sweep silent", async () => {
    for (const options of [{ enabled: false }, { reduced: true }, { hidden: true },
        { leaving: false }, { audioMode: "unsupported" }, { elapsed: 400 }]) {
        const h = harness(options);
        await h.play();
        assert.equal(h.contexts.flatMap(context => context.sources).length, 0, JSON.stringify(options));
    }
});

test("late audio permission uses only the time remaining, never the next page", async () => {
    const h = harness({ audioMode: "suspended" });
    const playback = h.play();
    assert.equal(h.contexts[0].sources.length, 0);
    h.animation.currentTime = 250;
    h.resume();
    await playback;
    assert.ok(Math.abs(h.contexts[0].sources[0].stops[0] - 10.185) < 0.0001);
    for (const cancel of [h => h.classes.clear(), h => h.window.dispatch("spark:sound-change", { detail: { enabled: false } }),
        h => { h.preference.matches = true; }, h => { h.animation.currentTime = 440; }]) {
        const delayed = harness({ audioMode: "suspended" });
        const pending = delayed.play();
        cancel(delayed);
        delayed.resume();
        await pending;
        assert.equal(delayed.contexts[0].sources.length, 0);
    }
});

test("sweep works without stereo panning or the animation inspection API", async () => {
    const h = harness({ panning: false, animations: false });
    await h.play();
    const audio = h.contexts[0];
    assert.equal(audio.sources.length, 1);
    assert.equal(audio.panners.length, 0);
    assert.equal(audio.gains[0].connections[0], audio.destination);
});

test("preference changes and leaving the page cancel an active sweep", async () => {
    for (const cancel of [h => h.toggle.dispatch("click"),
        h => h.window.dispatch("storage", { key: "spark-site-sound-enabled", newValue: null }),
        h => h.window.dispatch("spark:sound-change", { detail: { enabled: false } }),
        h => { h.preference.matches = true; h.preference.dispatch("change"); },
        h => h.window.dispatch("pagehide")]) {
        const h = harness();
        await h.play();
        cancel(h);
        assert.deepEqual(h.contexts[0].sources[0].stops, [10.42, undefined]);
    }
});

test("restarting a sweep stops its previous source", async () => {
    const h = harness();
    await h.play();
    await h.play();
    assert.deepEqual(h.contexts[0].sources[0].stops, [10.42, undefined]);
    assert.deepEqual(h.contexts[0].sources[1].stops, [10.42]);
});

test("outgoing transitions do not layer generic button sounds over the sweep", async () => {
    const h = harness();
    await h.play();
    h.document.dispatch("pointerover", { target: h.target });
    h.document.dispatch("click", { target: h.target });
    assert.equal(h.contexts[0].oscillators.length, 0);
    h.classes.clear();
    h.document.dispatch("pointerover", { target: h.target });
    assert.equal(h.contexts[0].oscillators.length, 1, "ordinary UI cues still work outside transitions");
});

test("the persistent sound toggle publishes the shared setting immediately", () => {
    const h = harness();
    const changes = [];
    h.window.addEventListener("spark:sound-change", event => changes.push(event.detail.enabled));
    assert.equal(h.window.sparkSound.enabled, true);
    h.toggle.dispatch("click");
    assert.equal(h.window.sparkSound.enabled, false);
    assert.equal(h.attributes.get("aria-pressed"), "false");
    assert.equal(h.label.textContent, "Sound off");
    assert.equal(h.storage.has("spark-site-sound-enabled"), false);
    h.toggle.dispatch("click");
    assert.equal(h.window.sparkSound.enabled, true);
    assert.equal(h.attributes.get("aria-pressed"), "true");
    assert.equal(h.label.textContent, "Sound on");
    assert.equal(h.storage.get("spark-site-sound-enabled"), "enabled");
    assert.deepEqual(changes, [false, true]);
});

test("cross-tab setting changes notify the intro and update the header", () => {
    const h = harness();
    const changes = [];
    h.window.addEventListener("spark:sound-change", event => changes.push(event.detail.enabled));
    h.window.dispatch("storage", { key: "spark-site-sound-enabled", newValue: null });
    assert.equal(h.window.sparkSound.enabled, false);
    assert.equal(h.attributes.get("aria-pressed"), "false");
    h.window.dispatch("storage", { key: "spark-site-sound-enabled", newValue: "enabled" });
    assert.equal(h.window.sparkSound.enabled, true);
    assert.deepEqual(changes, [false, true]);
});

test("the persistent toggle retries blocked intro audio without turning sound off", () => {
    const h = harness();
    const replay = [];
    h.window.addEventListener("spark:home-intro-play", () => replay.push(true));
    h.window.sparkSound.setIntroBlocked(true);
    assert.equal(h.attributes.get("aria-label"), "Play introduction with sound");
    assert.equal(h.label.textContent, "Play intro");
    h.toggle.dispatch("click");
    assert.deepEqual(replay, [true]);
    assert.equal(h.window.sparkSound.enabled, true);
    assert.equal(h.storage.get("spark-site-sound-enabled"), "enabled");
    h.window.sparkSound.setIntroBlocked(false);
    h.toggle.dispatch("click");
    assert.equal(h.window.sparkSound.enabled, false);
    assert.equal(h.attributes.get("aria-label"), "Turn site sounds on");
});

test("scroll swish is faint filtered noise with no pitched oscillator and a gentle attack", () => {
    const h = harness({ leaving: false });
    h.gesture();
    h.inputScroll(230);
    const audio = h.contexts[0];
    const swish = audio.sources[0];
    assert.equal(audio.oscillators.length, 0, "there is no sustained musical note");
    assert.equal(swish.startTime, 10);
    assert.equal(swish.loop, true);
    assert.equal(swish.buffer.channels, 1);
    assert.equal(swish.buffer.data.length, audio.sampleRate * 2);
    assert.ok(swish.buffer.data.some(value => value !== 0));
    assert.ok(swish.buffer.data.every(value => Math.abs(value) <= 1));
    assert.equal(audio.filters[0].type, "highpass");
    assert.equal(audio.filters[1].type, "lowpass");
    assert.deepEqual(audio.filters[0].frequency.calls, [["set", 700, 10]]);
    assert.equal(swish.connections[0], audio.filters[0]);
    assert.equal(audio.filters[0].connections[0], audio.filters[1]);
    assert.equal(audio.filters[1].connections[0], audio.gains[0]);
    assert.deepEqual(audio.gains[0].gain.calls.at(-1), ["linear", 0.0045, 10.08]);
    assert.equal(audio.gains[0].connections[0], audio.destination);
    assert.equal(h.timers.size, 1);
});

test("scroll swish follows actual movement and never sounds at a page boundary", () => {
    const h = harness({ leaving: false, scrollY: 0 });
    h.gesture();
    h.inputScroll(0);
    assert.equal(h.contexts[0].sources.length, 0);
    h.inputScroll(65);
    h.advance(80);
    h.scroll(65);
    h.advance(80);
    assert.equal(h.contexts[0].gains[0].gain.calls.at(-1)[1], 0,
        "unchanged scroll position does not extend the swish");
});

test("continuous scrolling reuses one voice, then fades and releases all audio nodes", () => {
    const h = harness({ leaving: false });
    h.gesture();
    for (const position of [220, 260, 290, 320]) {
        h.inputScroll(position);
        h.advance(80);
        assert.equal(h.contexts[0].sources.length, 1);
        assert.equal(h.timers.size, 1);
    }
    h.advance(80);
    assert.equal(h.contexts[0].gains[0].gain.calls.at(-1)[1], 0);
    assert.ok(Math.abs(h.contexts[0].gains[0].gain.calls.at(-1)[2] - 10.7) < 0.00001);
    h.advance(320);
    assert.deepEqual(h.contexts[0].sources[0].stops, [undefined]);
    assert.ok(h.contexts[0].sources[0].disconnected);
    assert.ok(h.contexts[0].filters.every(filter => filter.disconnected));
    assert.ok(h.contexts[0].gains[0].disconnected);
    assert.equal(h.timers.size, 0);
    h.inputScroll(350);
    assert.equal(h.contexts[0].sources.length, 2, "later movement starts a fresh voice");
    assert.equal(h.contexts[0].sources[1].buffer, h.contexts[0].sources[0].buffer,
        "the noise texture is cached, not regenerated on every gesture");
});

test("resuming during the fade smoothly revives the same voice without a click", () => {
    const h = harness({ leaving: false });
    h.gesture();
    h.inputScroll(220);
    h.advance(220);
    const gain = h.contexts[0].gains[0].gain;
    h.inputScroll(260);
    assert.equal(h.contexts[0].sources.length, 1);
    assert.deepEqual(h.contexts[0].sources[0].stops, []);
    assert.equal(h.timers.size, 1);
    const current = gain.calls.at(-2)[1];
    assert.ok(current > 0 && current < 0.0045, "the new ramp starts at the current fading volume");
    assert.deepEqual(gain.calls.at(-1), ["linear", 0.0045, 10.3]);
});

test("muting, reduced motion, hidden pages and intros never start a scroll swish", () => {
    for (const options of [{ enabled: false }, { reduced: true }, { hidden: true },
        { leaving: true }, { audioMode: "unsupported" }]) {
        const h = harness({ leaving: false, ...options });
        h.gesture();
        h.inputScroll(230);
        assert.equal(h.contexts.flatMap(audio => audio.sources).length, 0, JSON.stringify(options));
        assert.equal(h.timers.size, 0);
    }
    for (const name of ["spark-home-intro", "spark-page-entering", "spark-page-preparing"]) {
        const h = harness({ leaving: false });
        h.gesture();
        h.classes.add(name);
        h.inputScroll(230);
        assert.equal(h.contexts[0].sources.length, 0, name);
    }
});

test("swish stops promptly on mute, preference changes, hiding, navigation and page lifecycle", async () => {
    for (const cancel of [h => h.toggle.dispatch("click"),
        h => h.window.dispatch("storage", { key: "spark-site-sound-enabled", newValue: null }),
        h => h.window.dispatch("spark:sound-change", { detail: { enabled: false } }),
        h => { h.preference.matches = true; h.preference.dispatch("change"); },
        h => { h.document.hidden = true; h.document.dispatch("visibilitychange"); },
        h => h.window.dispatch("pagehide"), h => h.window.dispatch("pageshow"),
        h => h.window.dispatch("spark:home-intro-play"),
        h => { h.classes.add("spark-page-leaving"); h.window.sparkSound.play("page-sweep"); },
        h => { h.classes.add("spark-home-intro"); h.rootChanged(); }]) {
        const h = harness({ leaving: false });
        h.gesture();
        h.inputScroll(240);
        cancel(h);
        const swish = h.contexts[0].sources[0];
        assert.deepEqual(swish.stops, [10.04]);
        assert.equal(h.timers.size, 0);
        assert.deepEqual(h.contexts[0].gains[0].gain.calls.at(-1), ["linear", 0, 10.035]);
        swish.onended();
        assert.ok(swish.disconnected);
        assert.ok(h.contexts[0].filters.slice(0, 2).every(filter => filter.disconnected));
        assert.ok(h.contexts[0].gains[0].disconnected);
    }
});

test("scroll events do not request audio permission or start delayed stale sound", async () => {
    const h = harness({ leaving: false, audioMode: "suspended" });
    h.scroll(220);
    assert.equal(h.contexts.length, 0);
    h.gesture();
    h.inputScroll(240);
    h.advance(1000);
    h.resume();
    await Promise.resolve();
    assert.equal(h.contexts[0].sources.length, 0);
    assert.equal(h.timers.size, 0);
    h.inputScroll(280);
    assert.equal(h.contexts[0].sources.length, 1, "only fresh movement can start the swish");
});

test("trusted touch and keyboard input unlock the shared context without a confirmation sound", () => {
    for (const type of ["pointerdown", "touchstart", "keydown"]) {
        const h = harness({ leaving: false, audioMode: "gesture" });
        h.document.dispatch(type, { isTrusted: false, target: h.target });
        assert.equal(h.contexts.length, 0);
        h.gesture(type);
        assert.equal(h.contexts[0].state, "running");
        assert.equal(h.contexts[0].sources.length, 0);
        if (type === "touchstart") {
            h.document.dispatch("touchmove", { isTrusted: true, touches: [{}] });
        } else if (type === "keydown") {
            h.gesture(type, { key: "PageDown" });
        } else {
            h.wheel();
        }
        h.scroll(220);
        assert.equal(h.contexts[0].sources.length, 1, type);
    }
});

test("saved sound preference can prepare audio on wheel input when autoplay is permitted", async () => {
    const allowed = harness({ leaving: false });
    allowed.wheel();
    assert.equal(allowed.contexts.length, 1);
    assert.equal(allowed.contexts[0].sources.length, 0, "wheel input itself stays silent");
    allowed.scroll(230);
    assert.equal(allowed.contexts[0].sources.length, 1);

    const blocked = harness({ leaving: false, audioMode: "suspended" });
    blocked.wheel();
    blocked.scroll(230);
    blocked.wheel();
    assert.equal(blocked.contexts.length, 1, "wheel input does not repeatedly request permission");
    blocked.resume();
    await Promise.resolve();
    assert.equal(blocked.contexts[0].sources.length, 0, "late permission never plays stale scrolling");
    blocked.inputScroll(260);
    assert.equal(blocked.contexts[0].sources.length, 1);
});

test("sound fades after trackpad input ends even while the eased scroll keeps moving", () => {
    const h = harness({ leaving: false });
    h.gesture();
    h.inputScroll(230);
    for (const position of [260, 290, 320, 350, 380, 410, 440, 470]) {
        h.advance(40);
        h.scroll(position);
    }
    h.advance(170);
    h.scroll(480);
    const audio = h.contexts[0];
    assert.equal(audio.gains[0].gain.calls.at(-1)[1], 0);
    assert.ok(Math.abs(audio.gains[0].gain.calls.at(-1)[2] - 10.46) < 0.00001);
    assert.equal(audio.sources.length, 1);
    assert.deepEqual(audio.sources[0].stops, [undefined]);
    assert.equal(h.timers.size, 0, "the coasting animation cannot extend or restart the swish");
    h.inputScroll(500);
    assert.equal(audio.sources.length, 2, "fresh input can start sound again");
});

test("touch release fades the sound while native touch inertia continues silently", () => {
    for (const type of ["touchend", "touchcancel"]) {
        const h = harness({ leaving: false });
        h.gesture("touchstart");
        h.document.dispatch("touchmove", { isTrusted: true, touches: [{}] });
        h.scroll(230);
        h.advance(60);
        h.document.dispatch(type, { isTrusted: true, touches: [] });
        const audio = h.contexts[0];
        assert.equal(audio.gains[0].gain.calls.at(-1)[1], 0);
        assert.ok(Math.abs(audio.gains[0].gain.calls.at(-1)[2] - 10.36) < 0.00001);
        h.advance(60);
        h.scroll(260);
        h.advance(260);
        h.scroll(290);
        assert.equal(audio.sources.length, 1);
        assert.deepEqual(audio.sources[0].stops, [undefined]);
        assert.equal(h.timers.size, 0);
    }
});

test("programmatic navigation and restored scroll positions do not start a swish", () => {
    const h = harness({ leaving: false });
    h.gesture();
    for (const position of [230, 300, 450, 700]) h.scroll(position);
    assert.equal(h.contexts[0].sources.length, 0);
    assert.equal(h.timers.size, 0);
});

test("zoom, horizontal wheels, modified input and form typing do not arm scroll audio", () => {
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true },
        { defaultPrevented: true }, { deltaY: 0 }, { deltaX: 50 }, { isTrusted: false }]) {
        const h = harness({ leaving: false });
        h.gesture();
        h.wheel(options);
        h.scroll(230);
        assert.equal(h.contexts[0].sources.length, 0, JSON.stringify(options));
    }
    for (const options of [{ key: "a" }, { key: "PageDown", ctrlKey: true },
        { key: "ArrowDown", defaultPrevented: true }, { key: "ArrowDown", editable: true }]) {
        const h = harness({ leaving: false });
        h.target.editable = options.editable;
        h.gesture("keydown", { target: h.target, ...options });
        h.scroll(230);
        assert.equal(h.contexts[0].sources.length, 0, JSON.stringify(options));
    }
});

test("faster scrolling gently brightens the swish without making it louder", () => {
    const h = harness({ leaving: false });
    h.gesture();
    h.inputScroll(202);
    const audio = h.contexts[0];
    const frequency = audio.filters[1].frequency;
    const slow = frequency.calls.at(-1);
    const gainCalls = audio.gains[0].gain.calls.length;
    h.advance(16);
    h.inputScroll(280);
    const fast = frequency.calls.at(-1);
    assert.equal(slow[0], "target");
    assert.ok(fast[1] > slow[1]);
    assert.equal(fast[1], 3600, "brightness is bounded even for very large scroll deltas");
    assert.equal(fast[3], 0.08, "the filter follows speed smoothly, not abruptly");
    assert.equal(audio.gains[0].gain.calls.length, gainCalls);
    assert.equal(audio.sources.length, 1);
    h.advance(170);
    const calls = frequency.calls.length;
    h.scroll(400);
    assert.equal(frequency.calls.length, calls, "coasting does not brighten the fading sound");
});

test("swish lingers for 160ms after input, then gently fades over 300ms", () => {
    const h = harness({ leaving: false });
    h.gesture();
    h.inputScroll(230);
    const audio = h.contexts[0];
    h.advance(159);
    assert.equal(audio.gains[0].gain.calls.at(-1)[1], 0.0045, "the brief tail is not cut off early");
    assert.deepEqual(audio.sources[0].stops, []);
    h.advance(1);
    assert.equal(audio.gains[0].gain.calls.at(-1)[1], 0);
    assert.ok(Math.abs(audio.gains[0].gain.calls.at(-1)[2] - 10.46) < 0.00001);
    h.advance(299);
    assert.deepEqual(audio.sources[0].stops, [], "the source remains connected throughout the fade");
    h.advance(21);
    assert.deepEqual(audio.sources[0].stops, [undefined]);
    assert.ok(audio.sources[0].disconnected);
    assert.equal(h.timers.size, 0);
});

test("muting or hiding the page immediately cancels the longer tail and its cleanup timer", () => {
    for (const cancel of [h => h.toggle.dispatch("click"),
        h => { h.document.hidden = true; h.document.dispatch("visibilitychange"); }]) {
        const h = harness({ leaving: false });
        h.gesture();
        h.inputScroll(230);
        h.advance(200);
        cancel(h);
        assert.equal(h.timers.size, 0);
        assert.ok(Math.abs(h.contexts[0].sources[0].stops[0] - 10.24) < 0.00001);
        h.advance(1000);
        assert.equal(h.contexts[0].sources[0].stops.length, 1, "no old release timer survives cancellation");
    }
});

test("the first and last 64 pixels stay silent, including fractional positions and elastic overscroll", () => {
    for (const position of [-25, 0, 1, 32, 63.5, 64, 1136, 1136.5, 1170, 1200, 1220]) {
        const h = harness({ leaving: false });
        h.gesture();
        h.inputScroll(position);
        assert.equal(h.contexts[0].sources.length, 0, `position ${position}`);
        assert.equal(h.timers.size, 0, "entering a quiet zone clears the pending input timer");
    }
});

test("swish can start just outside either quiet zone", () => {
    for (const position of [64.01, 1135.99]) {
        const h = harness({ leaving: false });
        h.gesture();
        h.inputScroll(position);
        assert.equal(h.contexts[0].sources.length, 1, `position ${position}`);
    }
});

test("entering an edge zone preserves the gentle tail and bounce cannot prolong or restart it", () => {
    for (const edge of [32, 1190]) {
        const h = harness({ leaving: false });
        h.gesture();
        h.inputScroll(230);
        h.advance(80);
        const audio = h.contexts[0];
        const swish = audio.sources[0];
        h.scroll(edge);
        assert.deepEqual(swish.stops, [], "entering the zone does not abruptly stop the source");
        assert.equal(audio.gains[0].gain.calls.at(-1)[1], 0.0045);
        assert.equal(h.timers.size, 1);
        for (const position of [edge, edge + 1, edge - 1]) {
            h.advance(80);
            h.inputScroll(position);
        }
        assert.equal(audio.gains[0].gain.calls.at(-1)[1], 0);
        assert.ok(Math.abs(audio.gains[0].gain.calls.at(-1)[2] - 10.46) < 0.00001);
        h.advance(160);
        assert.equal(audio.sources.length, 1);
        assert.deepEqual(swish.stops, [undefined]);
        assert.equal(h.timers.size, 0);
        assert.ok(swish.disconnected);
        assert.ok(audio.filters.every(filter => filter.disconnected));
    }
});

test("leaving an edge zone only revives the fading swish with fresh scroll input", () => {
    const h = harness({ leaving: false });
    h.gesture();
    h.inputScroll(230);
    h.advance(80);
    h.scroll(32);
    h.advance(120);
    const audio = h.contexts[0];
    const gain = audio.gains[0].gain;
    const calls = gain.calls.length;
    h.scroll(100);
    assert.equal(gain.calls.length, calls, "coasting back out of the zone cannot restart the sound");
    h.inputScroll(120);
    assert.equal(gain.calls.at(-1)[1], 0.0045);
    assert.equal(audio.sources.length, 1, "a new gesture smoothly revives the same voice");
    assert.equal(h.timers.size, 1);
    h.advance(480);
    assert.deepEqual(audio.sources[0].stops, [undefined]);
    assert.equal(h.timers.size, 0);
});

test("unrelated root class changes at an edge preserve the fade but muting still stops promptly", () => {
    const h = harness({ leaving: false });
    h.gesture();
    h.inputScroll(230);
    h.advance(80);
    h.scroll(32);
    h.rootChanged();
    assert.deepEqual(h.contexts[0].sources[0].stops, []);
    h.toggle.dispatch("click");
    assert.ok(Math.abs(h.contexts[0].sources[0].stops[0] - 10.12) < 0.00001);
    assert.equal(h.timers.size, 0);
});

test("non-scrollable pages and overlapping edge zones never produce a swish", () => {
    for (const scrollHeight of [600, 800, 850, 928]) {
        const h = harness({ leaving: false, scrollY: 0, scrollHeight });
        h.gesture();
        const maxScroll = Math.max(0, scrollHeight - 800);
        for (const position of [0, maxScroll / 2, maxScroll]) h.inputScroll(position);
        assert.equal(h.contexts[0].sources.length, 0, `height ${scrollHeight}`);
        h.advance(300);
        assert.equal(h.timers.size, 0);
    }
});

test("edge checks use current page and viewport sizes rather than cached bounds", () => {
    for (const resize of [h => { h.document.documentElement.scrollHeight = 1090; },
        h => { h.document.documentElement.clientHeight = 1720; }]) {
        const h = harness({ leaving: false });
        h.gesture();
        h.inputScroll(230);
        resize(h);
        h.window.dispatch("resize");
        assert.deepEqual(h.contexts[0].sources[0].stops, [], "layout changes use the gentle edge fade");
        h.advance(480);
        assert.deepEqual(h.contexts[0].sources[0].stops, [undefined]);
        assert.equal(h.timers.size, 0);
    }
});

test("edge checks honor the document scrolling element and geometry fallbacks", () => {
    const alternate = harness({ leaving: false });
    alternate.document.scrollingElement = { scrollHeight: 2400 };
    alternate.gesture();
    alternate.inputScroll(1536);
    assert.equal(alternate.contexts[0].sources.length, 0);
    alternate.inputScroll(1535);
    assert.equal(alternate.contexts[0].sources.length, 1);

    const fallback = harness({ leaving: false });
    fallback.document.scrollingElement = null;
    fallback.document.documentElement.clientHeight = 0;
    fallback.gesture();
    fallback.inputScroll(1136);
    assert.equal(fallback.contexts[0].sources.length, 0);
    fallback.inputScroll(1135);
    assert.equal(fallback.contexts[0].sources.length, 1);
});

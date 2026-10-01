const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../site-sound.js"), "utf8");

function harness({ enabled = true, reduced = false, hidden = false, leaving = true,
    elapsed = 0, panning = true, audioMode = "running", animations = true } = {}) {
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
        closest() { return this; }
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
    document.documentElement = { classList: { contains: name => classes.has(name) } };
    const animation = { animationName: "spark-page-out", currentTime: elapsed };
    document.getElementById = () => animations ? { getAnimations: () => [animation] } : {};
    const window = new Events();
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
    const parameter = () => ({ value: 0, calls: [],
        setValueAtTime(value, time) { this.calls.push(["set", value, time]); },
        exponentialRampToValueAtTime(value, time) { this.calls.push(["exponential", value, time]); },
        linearRampToValueAtTime(value, time) { this.calls.push(["linear", value, time]); },
    });
    const node = extra => ({ connections: [], disconnected: false,
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnected = true; }, ...extra,
    });
    let resumeAudio;
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
        resume() { return new Promise(resolve => { resumeAudio = () => { this.state = "running"; resolve(); }; }); }
        createBuffer(channels, length, sampleRate) {
            return { channels, sampleRate, data: new Float32Array(length), getChannelData() { return this.data; } };
        }
        createBufferSource() {
            const source = node({ stops: [],
                start(time) { this.startTime = time; },
                stop(time) { this.stops.push(time); },
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
            const oscillator = node({ frequency: parameter(), start() {}, stop() {} });
            this.oscillators.push(oscillator);
            return oscillator;
        }
    };
    vm.runInNewContext(source, { window, document, CustomEvent, Element, Node: Element,
        HTMLSelectElement: Element, performance: { now: () => 1000 } });
    return { window, document, toggle, label, attributes, storage, preference, contexts, classes, animation,
        resume: () => resumeAudio(), target: new Element(), play: () => window.sparkSound.play("page-sweep") };
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

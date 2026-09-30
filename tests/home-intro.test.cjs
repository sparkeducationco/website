const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../home-intro.js"), "utf8");

function harness({ reduced = false, hidden = false, hash = "", scrollY = 0,
    navigationType = "navigate", entering = false, introduced = false, storageBlocked = false } = {}) {
    class Events {
        constructor() { this.listeners = new Map(); }
        addEventListener(type, callback) {
            const list = this.listeners.get(type) || [];
            list.push(callback);
            this.listeners.set(type, list);
        }
        dispatch(type, data = {}) {
            const event = { type, defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true; }, ...data };
            for (const callback of this.listeners.get(type) || []) callback(event);
            return event;
        }
    }
    const classes = new Set(entering ? ["spark-page-entering"] : []);
    const document = new Events();
    document.hidden = hidden;
    document.documentElement = { classList: {
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
    const timers = new Map();
    window.setTimeout = (callback, duration) => { const id = timers.size + 1; timers.set(id, { callback, duration }); return id; };
    window.clearTimeout = (id) => timers.delete(id);
    const completions = [];
    window.dispatchEvent = (event) => { completions.push(event); return window.dispatch(event.type, event); };
    class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    vm.runInNewContext(source, { window, document, CustomEvent });
    return { window, document, classes, timers, storage, preference, completions };
}

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
    assert.equal(h.classes.size, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(h.completions.length, 1);
    assert.equal(h.completions[0].detail.interrupted, false);
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
    assert.equal(h.classes.size, 0);
    assert.equal(h.timers.size, 0);
});

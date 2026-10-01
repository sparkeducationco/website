const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../site-navigation.js"), "utf8");

test("incoming document slides disable native smooth fragment scrolling", () => {
    const css = fs.readFileSync(path.join(__dirname, "../site.css"), "utf8");
    assert.match(css, /\.spark-page-entering\s*\{[^}]*scroll-behavior:\s*auto/);
    assert.match(css, /\.spark-page-preparing \.site-footer\s*\{[^}]*transform:\s*none/);
});

function harness({ href = "https://spark.test/", reduced = false, native = false,
    storageBlocked = false, entry = null, hidden = false, navigationFails = false, initialTime = 50000, waitFonts = false } = {}) {
    class Events {
        constructor() { this.listeners = new Map(); }
        addEventListener(type, callback) {
            const list = this.listeners.get(type) || [];
            list.push(callback);
            this.listeners.set(type, list);
        }
        dispatch(type, data = {}) {
            const event = { button: 0, defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true; }, ...data };
            for (const listener of this.listeners.get(type) || []) listener(event);
            return event;
        }
    }
    class Element {
        constructor(url, attributes = {}) {
            this.href = url;
            this.target = attributes.target || "";
            this.attributes = attributes;
        }
        closest() { return this; }
        hasAttribute(name) { return name in this.attributes; }
        scrollIntoView(options) { this.scrollOptions = options; }
        getBoundingClientRect() { return { top: 1200 }; }
    }
    const classes = new Set();
    const root = { classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
    } };
    const main = new Element();
    const fragment = new Element();
    const document = new Events();
    document.documentElement = root;
    document.hidden = hidden;
    document.getElementById = (id) => id === "main" ? main : id === "questions" ? fragment : null;
    let fontReady;
    if (waitFonts) document.fonts = { ready: { then(callback) { fontReady = callback; } } };
    const window = new Events();
    const soundCalls = [];
    window.sparkSound = { play: kind => soundCalls.push(kind) };
    const preference = new Events();
    preference.matches = reduced;
    window.matchMedia = () => preference;
    window.scrollY = 500;
    window.scrollX = 1280;
    const scrollCalls = [];
    window.getComputedStyle = (element) => element === root ? { scrollPaddingTop: "72px" } : { scrollMarginTop: "0px" };
    window.scrollTo = (options) => {
        scrollCalls.push(options);
        window.scrollX = options.left;
        window.scrollY = options.top;
    };
    const destinations = [];
    window.location = new URL(href);
    window.location.assign = (url) => {
        if (navigationFails) throw new Error("Navigation interrupted");
        destinations.push(url);
    };
    if (native) {
        window.onpagereveal = null;
        document.startViewTransition = () => {};
    }
    const storage = new Map();
    if (entry) storage.set("spark-page-entry", JSON.stringify(entry));
    window.sessionStorage = {
        getItem(key) { if (storageBlocked) throw new Error("Blocked"); return storage.get(key) || null; },
        setItem(key, value) { if (storageBlocked) throw new Error("Blocked"); storage.set(key, value); },
        removeItem(key) { if (storageBlocked) throw new Error("Blocked"); storage.delete(key); },
    };
    let now = initialTime;
    let nextId = 0;
    const timers = new Map();
    window.setTimeout = (callback, delay) => {
        const id = ++nextId;
        timers.set(id, { callback, at: now + delay });
        return id;
    };
    window.clearTimeout = (id) => timers.delete(id);
    const frames = new Map();
    window.requestAnimationFrame = callback => { const id = ++nextId; frames.set(id, callback); return id; };
    window.cancelAnimationFrame = id => frames.delete(id);
    const flushFrame = () => { const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(); };
    function advance(duration) {
        const end = now + duration;
        while (true) {
            const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
            if (!next || next[1].at > end) break;
            timers.delete(next[0]);
            now = next[1].at;
            next[1].callback();
        }
        now = end;
    }
    class CustomEvent { constructor(type) { this.type = type; } }
    window.dispatchEvent = event => window.dispatch(event.type, event);
    vm.runInNewContext(source, { window, document, Element, URL, CustomEvent, Date: { now: () => now } });
    const click = (url, event = {}, attributes = {}) => document.dispatch("click", {
        target: new Element(new URL(url, href).href, attributes), ...event,
    });
    return { window, document, main, fragment, classes, storage, destinations, timers, preference, advance, click, flushFrame, scrollCalls, soundCalls, fontsReady: () => fontReady?.() };
}

test("cross-page FAQ entry positions its fragment before the slide starts", () => {
    const href = "https://spark.test/#questions";
    const h = harness({ href, entry: { destination: href, created: 49900 }, waitFonts: true });
    let ready = 0;
    h.window.addEventListener("spark:page-entry-ready", () => ready++);
    assert.ok(h.classes.has("spark-page-preparing"));
    h.document.dispatch("DOMContentLoaded");
    h.window.dispatch("load");
    h.flushFrame();
    assert.equal(h.fragment.scrollOptions, undefined, "fonts must settle first");
    h.fontsReady(); h.flushFrame();
    assert.ok(h.classes.has("spark-page-preparing"), "keep destination hidden while layout settles");
    h.flushFrame();
    assert.equal(h.fragment.scrollOptions, undefined, "never scroll a transformed target into horizontal view");
    assert.equal(h.scrollCalls.length, 1);
    assert.equal(h.scrollCalls[0].behavior, "instant");
    assert.equal(h.scrollCalls[0].top, 1628);
    assert.equal(h.scrollCalls[0].left, 0);
    assert.equal(h.window.scrollX, 0);
    assert.equal(ready, 1);
    assert.equal(h.classes.has("spark-page-preparing"), false);
    assert.ok(h.classes.has("spark-page-entering"));
    h.document.dispatch("animationend", { target: h.main, animationName: "spark-page-in" });
    assert.equal(h.classes.size, 0);
});

test("all interior routes enter all homepage sections without horizontal scrolling", () => {
    for (const route of ["about", "contact", "privacy", "terms"]) {
        for (const anchor of ["solution", "district-life", "how-it-works", "pilot", "pricing", "questions"]) {
            const outgoing = harness({ href: `https://spark.test/${route}/` });
            outgoing.click(`/#${anchor}`); outgoing.advance(450);
            const entry = JSON.parse(outgoing.storage.get("spark-page-entry"));
            const incoming = harness({ href: outgoing.destinations[0], entry, initialTime: entry.created + 50 });
            incoming.document.getElementById = id => id === "main" ? incoming.main : id === anchor ? incoming.fragment : null;
            incoming.document.dispatch("DOMContentLoaded"); incoming.window.dispatch("load");
            incoming.flushFrame(); incoming.flushFrame();
            assert.equal(incoming.scrollCalls[0].left, 0, `${route} -> ${anchor}`);
            assert.equal(incoming.fragment.scrollOptions, undefined);
            assert.ok(incoming.classes.has("spark-page-entering"));
            assert.ok(!incoming.classes.has("spark-page-preparing"));
        }
    }
});

test("fragment positioning respects header padding and section margin, clamped at page top", () => {
    const href = "https://spark.test/#questions";
    const h = harness({ href, entry: { destination: href, created: 49900 } });
    h.window.getComputedStyle = element => element === h.document.documentElement ? { scrollPaddingTop: "64px" } : { scrollMarginTop: "12px" };
    h.fragment.getBoundingClientRect = () => ({ top: -490 });
    h.document.dispatch("DOMContentLoaded"); h.window.dispatch("load"); h.flushFrame(); h.flushFrame();
    assert.equal(h.scrollCalls[0].top, 0);
    assert.equal(h.scrollCalls[0].left, 0);
});

test("fragment preparation recovers when fonts or load never settle", () => {
    const href = "https://spark.test/#questions";
    const h = harness({ href, entry: { destination: href, created: 49900 }, waitFonts: true });
    h.document.dispatch("DOMContentLoaded");
    h.advance(1200); h.flushFrame(); h.flushFrame();
    assert.equal(h.classes.has("spark-page-preparing"), false);
    h.advance(1800);
    assert.equal(h.classes.size, 0);
});

test("leaving or reduced motion cancels a queued fragment preparation", () => {
    for (const stop of [h => h.window.dispatch("pagehide"), h => { h.preference.matches = true; h.preference.dispatch("change"); }]) {
        const href = "https://spark.test/#questions";
        const h = harness({ href, entry: { destination: href, created: 49900 } });
        h.document.dispatch("DOMContentLoaded"); h.window.dispatch("load");
        h.flushFrame(); stop(h); h.flushFrame();
        assert.equal(h.classes.size, 0);
        assert.equal(h.fragment.scrollOptions, undefined);
    }
});

test("fallback slides out before navigating and carries the complete destination", () => {
    const h = harness();
    assert.equal(h.click("/privacy/?version=current#information").defaultPrevented, true);
    assert.ok(h.classes.has("spark-page-leaving"));
    assert.deepEqual(h.soundCalls, ["page-sweep"]);
    h.advance(449);
    assert.equal(h.destinations.length, 0);
    h.advance(1);
    assert.deepEqual(h.destinations, ["https://spark.test/privacy/?version=current#information"]);
    const entry = JSON.parse(h.storage.get("spark-page-entry"));
    assert.equal(entry.destination, h.destinations[0]);
    assert.equal(entry.created, 50450);
});

test("rapid header clicks use the latest destination without restarting or duplicating the exit", () => {
    const h = harness();
    h.click("/about/");
    h.click("/contact/");
    h.document.dispatch("animationend", { target: h.main, animationName: "spark-page-out" });
    h.document.dispatch("animationend", { target: h.main, animationName: "spark-page-out" });
    h.advance(450);
    assert.deepEqual(h.destinations, ["https://spark.test/contact/"]);
    assert.deepEqual(h.soundCalls, ["page-sweep"]);
});

test("Policy to Home has both an exit and matching incoming slide without a fragment", () => {
    const outgoing = harness({ href: "https://spark.test/privacy/#information" });
    assert.equal(outgoing.click("/").defaultPrevented, true);
    assert.ok(outgoing.classes.has("spark-page-leaving"));
    outgoing.advance(450);
    assert.deepEqual(outgoing.destinations, ["https://spark.test/"]);
    const entry = JSON.parse(outgoing.storage.get("spark-page-entry"));
    const incoming = harness({ href: outgoing.destinations[0], entry, initialTime: entry.created + 50 });
    assert.ok(incoming.classes.has("spark-page-entering"));
});

test("all site routes slide, including cross-page fragments and slashless routes", () => {
    for (const url of ["/", "/about", "/contact/", "/privacy/", "/terms/", "/#pricing"]) {
        const h = harness({ href: "https://spark.test/privacy/" });
        if (url === "/privacy/") continue;
        assert.equal(h.click(url).defaultPrevented, true, url);
        h.advance(450);
        assert.equal(h.destinations[0], new URL(url, "https://spark.test/").href);
    }
});

test("same-page sections, mail, external links and non-page endpoints remain browser-owned", () => {
    const h = harness();
    for (const url of ["#pricing", "/#main", "/?view=current", "mailto:contact@spark.test",
        "https://other.test/privacy/", "/icon.png", "/api/contact"]) {
        assert.equal(h.click(url).defaultPrevented, false, url);
    }
    h.advance(1000);
    assert.equal(h.destinations.length, 0);
    assert.equal(h.classes.size, 0);
    assert.deepEqual(h.soundCalls, []);
});

test("modifier clicks, new tabs, downloads and handled clicks preserve normal semantics", () => {
    for (const event of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true },
        { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
        const h = harness();
        h.click("/contact/", event);
        assert.equal(h.classes.size, 0);
        assert.deepEqual(h.soundCalls, []);
    }
    for (const attributes of [{ target: "_blank" }, { target: "preview" }, { download: "" }]) {
        const h = harness();
        assert.equal(h.click("/privacy/", {}, attributes).defaultPrevented, false);
    }
});

test("fresh entry starts before parsing and consumes its marker exactly once", () => {
    const h = harness({ href: "https://spark.test/privacy/", entry: {
        destination: "https://spark.test/privacy/", created: 49900,
    } });
    assert.ok(h.classes.has("spark-page-entering"));
    assert.equal(h.storage.has("spark-page-entry"), false);
    h.document.dispatch("DOMContentLoaded");
    h.document.dispatch("animationend", { target: h.main, animationName: "spark-page-in" });
    assert.equal(h.classes.size, 0);
    assert.equal(h.timers.size, 0);
});

test("missing animation events cannot leave an incoming page transformed", () => {
    const h = harness({ entry: { destination: "https://spark.test/", created: 49900 } });
    h.document.dispatch("DOMContentLoaded");
    h.advance(1800);
    assert.equal(h.classes.size, 0);
});

test("stale, future and mismatched markers do not animate direct visits", () => {
    for (const entry of [
        { destination: "https://spark.test/", created: 30000 },
        { destination: "https://spark.test/", created: 60000 },
        { destination: "https://spark.test/privacy/", created: 49900 },
    ]) {
        const h = harness({ entry });
        assert.equal(h.classes.size, 0);
        assert.equal(h.storage.size, 0);
    }
});

test("reduced motion and hidden destinations do not slide in", () => {
    for (const options of [{ reduced: true }, { hidden: true }]) {
        const h = harness({ ...options, entry: { destination: "https://spark.test/", created: 49900 } });
        assert.equal(h.classes.size, 0);
    }
    const reduced = harness({ reduced: true });
    assert.equal(reduced.click("/privacy/").defaultPrevented, false);
    assert.deepEqual(reduced.soundCalls, []);
});

test("navigation still slides when site sounds are unavailable", () => {
    const h = harness();
    delete h.window.sparkSound;
    assert.equal(h.click("/contact/").defaultPrevented, true);
    h.advance(450);
    assert.deepEqual(h.destinations, ["https://spark.test/contact/"]);
});

test("changing to reduced motion completes a pending navigation without waiting", () => {
    const h = harness();
    h.click("/contact/");
    h.preference.matches = true;
    h.preference.dispatch("change");
    assert.deepEqual(h.destinations, ["https://spark.test/contact/"]);
    assert.equal(h.classes.size, 0);
});

test("native-capable browsers use the same explicit slide without a snapshot overlay", () => {
    const h = harness({ native: true });
    assert.equal(h.click("/privacy/").defaultPrevented, true);
    assert.ok(h.classes.has("spark-page-leaving"));
    h.advance(450);
    assert.deepEqual(h.destinations, ["https://spark.test/privacy/"]);
});

test("all four reported navigation paths have both exit and entrance slides in every browser", () => {
    for (const native of [false, true]) {
        for (const [from, to] of [["/terms/", "/"], ["/contact/", "/"],
            ["/", "/contact/"], ["/contact/", "/about/"]]) {
            const outgoing = harness({ href: `https://spark.test${from}`, native });
            assert.equal(outgoing.click(to).defaultPrevented, true, `${from} -> ${to}`);
            assert.ok(outgoing.classes.has("spark-page-leaving"));
            outgoing.advance(450);
            assert.deepEqual(outgoing.destinations, [`https://spark.test${to}`]);
            const entry = JSON.parse(outgoing.storage.get("spark-page-entry"));
            const incoming = harness({ href: entry.destination, entry, native, initialTime: entry.created + 50 });
            assert.ok(incoming.classes.has("spark-page-entering"));
        }
    }
});

test("storage restrictions and failed navigation cannot strand hidden content", () => {
    const blocked = harness({ storageBlocked: true });
    blocked.click("/about/");
    blocked.advance(450);
    assert.deepEqual(blocked.destinations, ["https://spark.test/about/"]);
    blocked.advance(1800);
    assert.equal(blocked.classes.size, 0);
    const failed = harness({ navigationFails: true });
    failed.click("/about/");
    failed.advance(450);
    assert.equal(failed.classes.size, 0);
});

test("Back/Forward cache restores visible content and clears pending timers", () => {
    const h = harness();
    h.click("/privacy/");
    h.advance(450);
    h.window.dispatch("pagehide");
    h.window.dispatch("pageshow", { persisted: true });
    assert.equal(h.classes.size, 0);
    assert.equal(h.timers.size, 0);
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../contact-feedback.js"), "utf8");

function harness({ reduced = false, hidden = false, leaving = false, supported = true,
    contact = true, width = 1200, height = 800, bounds = { left: 100, top: 550, width: 240, height: 48 } } = {}) {
    const animations = [];
    class Node {
        constructor() { this.listeners = new Map(); this.children = []; this.style = {}; this.attributes = {}; }
        addEventListener(type, callback) {
            this.listeners.set(type, [...(this.listeners.get(type) || []), callback]);
        }
        dispatch(type, event = {}) { for (const callback of this.listeners.get(type) || []) callback(event); }
        append(node) { this.children.push(node); node.parent = this; }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
        setAttribute(key, value) { this.attributes[key] = value; }
        animate(frames, options) {
            const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; this.oncancel?.(); } };
            animations.push(animation);
            return animation;
        }
    }
    const button = { getBoundingClientRect: () => bounds };
    const form = { querySelector: () => bounds ? button : null };
    const document = new Node();
    const classes = new Set(leaving ? ["spark-page-leaving"] : []);
    document.hidden = hidden;
    document.body = new Node();
    document.documentElement = { classList: { contains: name => classes.has(name) } };
    document.querySelector = () => contact ? form : null;
    document.createElement = () => new Node();
    const motion = new Node();
    motion.matches = reduced;
    const window = new Node();
    window.innerWidth = width;
    window.innerHeight = height;
    window.matchMedia = () => motion;
    class Element {}
    if (supported) Element.prototype.animate = () => {};
    vm.runInNewContext(source, { document, window, Element, Math });
    return { document, window, form, motion, animations, classes,
        succeed: (actualForm = form) => window.dispatch("spark:contact-success", { detail: { form: actualForm } }) };
}

test("successful contact emits 48 colorful paper particles with a small upward burst and fall", () => {
    const h = harness();
    h.succeed();
    assert.equal(h.animations.length, 48);
    assert.equal(h.document.body.children.length, 1);
    const layer = h.document.body.children[0];
    assert.equal(layer.className, "contact-confetti-layer");
    assert.equal(layer.attributes["aria-hidden"], "true");
    assert.equal(layer.children.length, 48);
    assert.equal(new Set(layer.children.map(node => node.style.background)).size, 4);
    for (const animation of h.animations) {
        assert.ok(animation.options.duration >= 1400 && animation.options.duration <= 2100);
        assert.equal(animation.frames.length, 5);
        assert.match(animation.frames[1].transform, /, -[\d.]+px\)/);
        assert.match(animation.frames.at(-1).transform, /, [\d.]+px\)/);
        assert.equal(animation.frames[0].opacity, 0);
        assert.equal(animation.frames.at(-1).opacity, 0);
    }
});

test("only a success event for the actual contact form can celebrate", () => {
    const h = harness();
    h.succeed({});
    h.window.dispatch("spark:contact-success", {});
    h.window.dispatch("submit", { detail: { form: h.form } });
    assert.equal(h.animations.length, 0);
    h.succeed();
    assert.equal(h.animations.length, 48);
});

test("completed animations remove every particle and the overlay", () => {
    const h = harness();
    h.succeed();
    for (const animation of h.animations.slice(0, 47)) animation.onfinish();
    assert.equal(h.document.body.children[0].children.length, 1);
    h.animations.at(-1).onfinish();
    assert.equal(h.document.body.children.length, 0);
    h.succeed();
    assert.equal(h.document.body.children.length, 1);
});

test("a repeated success replaces the previous burst without accumulating overlays", () => {
    const h = harness();
    h.succeed();
    const first = h.animations.slice();
    h.succeed();
    assert.ok(first.every(animation => animation.cancelled));
    assert.equal(h.document.body.children.length, 1);
    assert.equal(h.document.body.children[0].children.length, 48);
    for (const animation of first) animation.oncancel();
    assert.equal(h.document.body.children.length, 1, "late old cancellation cannot remove the new burst");
    for (const animation of h.animations.slice(48)) animation.onfinish();
    assert.equal(h.document.body.children.length, 0);
});

test("reduced motion, hidden pages, outgoing routes and missing animation APIs stay static", () => {
    for (const options of [{ reduced: true }, { hidden: true }, { leaving: true },
        { supported: false }, { contact: false }]) {
        const h = harness(options);
        h.succeed();
        assert.equal(h.animations.length, 0, JSON.stringify(options));
        assert.equal(h.document.body.children.length, 0);
    }
});

test("motion changes, hiding and pagehide clear active confetti", () => {
    for (const cancel of [h => { h.motion.matches = true; h.motion.dispatch("change"); },
        h => { h.document.hidden = true; h.document.dispatch("visibilitychange"); },
        h => h.window.dispatch("pagehide")]) {
        const h = harness();
        h.succeed();
        cancel(h);
        assert.ok(h.animations.every(animation => animation.cancelled));
        assert.equal(h.document.body.children.length, 0);
    }
});

test("mobile and offscreen submit buttons produce a viewport-clamped origin", () => {
    for (const bounds of [{ left: -1000, top: -500, width: 240, height: 48 },
        { left: 2000, top: 2000, width: 240, height: 48 }, null]) {
        const h = harness({ width: 320, height: 568, bounds });
        h.succeed();
        assert.equal(h.animations.length, 48, "touch devices do not depend on hover capabilities");
        const particle = h.document.body.children[0].children[0];
        assert.ok(parseFloat(particle.style.left) >= 24 && parseFloat(particle.style.left) <= 296);
        assert.ok(parseFloat(particle.style.top) >= 60 && parseFloat(particle.style.top) <= 528);
    }
});

test("muting audio does not suppress or interrupt the visual celebration", () => {
    const h = harness();
    h.window.dispatch("spark:sound-change", { detail: { enabled: false } });
    h.succeed();
    h.window.dispatch("spark:sound-change", { detail: { enabled: false } });
    assert.equal(h.document.body.children[0].children.length, 48);
    assert.ok(h.animations.every(animation => !animation.cancelled));
});

test("confetti styling stays noninteractive, clipped and hidden in print or reduced motion", () => {
    const css = fs.readFileSync(path.join(__dirname, "../site.css"), "utf8");
    assert.match(css, /\.contact-confetti-layer\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none[^}]*overflow:\s*hidden/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\), print \{ \.contact-confetti-layer \{ display: none; \}/);
});

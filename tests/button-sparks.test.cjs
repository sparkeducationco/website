const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../button-sparks.js"), "utf8");

function harness({ reduced = false, fine = true, supported = true } = {}) {
  class Node {
    constructor() { this.listeners = {}; this.children = []; this.style = {}; this.attributes = {}; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    append(node) { this.children.push(node); node.parent = this; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getBoundingClientRect() { return { left: 100, right: 300, top: 100, bottom: 160, width: 200, height: 60 }; }
    animate(frames, options) {
      const animation = { frames, options, cancel() { this.oncancel?.(); } };
      animations.push(animation);
      return animation;
    }
  }
  const animations = [];
  const button = new Node();
  const document = new Node();
  document.body = new Node();
  document.documentElement = { classList: { contains: () => false } };
  document.querySelectorAll = () => [button];
  document.createElement = () => new Node();
  const motion = new Node(); motion.matches = reduced;
  const pointer = new Node(); pointer.matches = fine;
  const window = new Node();
  window.matchMedia = query => query.includes("reduced-motion") ? motion : pointer;
  class Element {}
  if (supported) Element.prototype.animate = () => {};
  vm.runInNewContext(source, { window, document, Element, Math });
  return { document, button, motion, pointer, animations, hover(pointerType = "mouse") { button.listeners.pointerenter?.({ currentTarget: button, pointerType }); } };
}

test("each hover emits a fresh bounded burst with upward launch and downward drift", () => {
  const h = harness();
  h.hover(); h.hover();
  assert.equal(h.animations.length, 18);
  const layer = h.document.body.children[0];
  assert.equal(layer.attributes["aria-hidden"], "true");
  assert.equal(layer.children.length, 18);
  assert.notDeepEqual(layer.children[0].style, layer.children[1].style);
  for (const animation of h.animations) {
    assert.ok(animation.options.duration >= 1600 && animation.options.duration <= 2400);
    assert.match(animation.frames[1].transform, /, -[\d.]+px\)/);
    assert.match(animation.frames.at(-1).transform, /, [\d.]+px\)/);
    assert.equal(animation.frames.at(-1).opacity, 0);
  }
});

test("particles and overlay are removed when their animation ends", () => {
  const h = harness(); h.hover();
  for (const animation of h.animations) animation.onfinish();
  assert.equal(h.document.body.children.length, 0);
  h.hover(); assert.equal(h.document.body.children.length, 1);
});

test("rapid hovers cap live particles at 45", () => {
  const h = harness();
  for (let i = 0; i < 20; i++) h.hover();
  assert.equal(h.animations.length, 45);
});

test("touch, reduced motion, coarse pointers and unsupported animation skip effects", () => {
  for (const options of [{ reduced: true }, { fine: false }, { supported: false }]) {
    const h = harness(options); h.hover(); assert.equal(h.animations.length, 0);
  }
  const h = harness(); h.hover("touch"); assert.equal(h.animations.length, 0);
});

test("changing motion preferences and hiding the page clears active effects", () => {
  const h = harness(); h.hover();
  h.motion.matches = true; h.motion.listeners.change();
  assert.equal(h.document.body.children.length, 0);
  h.hover(); assert.equal(h.animations.length, 9);
  h.motion.matches = false; h.hover();
  h.document.hidden = true; h.document.listeners.visibilitychange();
  assert.equal(h.document.body.children.length, 0);
  h.hover(); assert.equal(h.animations.length, 18);
});

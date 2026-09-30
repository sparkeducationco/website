const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../site-motion.js"), "utf8");

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ callback, once: options.once });
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry.callback !== callback));
  }
  dispatch(type, properties = {}) {
    const event = {
      type, target: this, button: 0, cancelable: true, defaultPrevented: false,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; },
      ...properties,
    };
    for (const entry of [...(this.listeners.get(type) || [])]) {
      entry.callback(event);
      if (entry.once) this.removeEventListener(type, entry.callback);
    }
    return event;
  }
}

function createHarness({ reduced = false, desktop = true, hidden = false, hash = "", scrollY = 0, lenis = true, intersection = true, waapi = true, page = "home", entering = false, homeIntro = false } = {}) {
  const animationRecords = [];
  const observers = [];
  const instances = [];
  const frames = new Map();
  let frameId = 0;
  let time = 0;
  const document = new Events();
  const window = new Events();
  const elements = [];

  class Element extends Events {
    constructor(name, classes = [], parent = null) {
      super();
      this.name = name;
      this.parentElement = parent;
      this.attributes = new Map();
      this.classes = new Set(classes);
      this.classList = {
        add: (...values) => values.forEach((value) => this.classes.add(value)),
        remove: (...values) => values.forEach((value) => this.classes.delete(value)),
        contains: (value) => this.classes.has(value),
        toggle: (value, force) => {
          const enabled = force === undefined ? !this.classes.has(value) : force;
          if (enabled) this.classes.add(value); else this.classes.delete(value);
          return enabled;
        },
      };
      this.styleValues = new Map();
      this.style = {
        setProperty: (key, value) => this.styleValues.set(key, value),
        removeProperty: (key) => this.styleValues.delete(key),
      };
      this.bounds = { top: 120, bottom: 420, height: 300, width: 400, left: 0 };
      this.target = "";
      this.open = false;
      this.focusCalls = [];
      this.clientHeight = 40;
      this.scrollHeight = 40;
      if (!waapi) this.animate = undefined;
      elements.push(this);
    }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    hasAttribute(key) { return this.attributes.has(key); }
    removeAttribute(key) { this.attributes.delete(key); }
    get hash() { return this.getAttribute("href") || ""; }
    matches(selector) {
      return selector.split(",").some((part) => {
        const item = part.trim();
        if (item.startsWith(".")) return this.classes.has(item.slice(1));
        if (item.startsWith("[") && item.endsWith("]")) return this.hasAttribute(item.slice(1, -1));
        if (item === 'a[href^="#"]') return this.name === "a" && this.hash.startsWith("#");
        const typedInput = item.match(/^input\[type="([^"]+)"\]$/);
        if (typedInput) return this.name === "input" && this.getAttribute("type") === typedInput[1];
        return this.name === item;
      });
    }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (node.matches(selector)) return node;
      }
      return null;
    }
    contains(target) {
      for (let node = target; node; node = node.parentElement) {
        if (node === this) return true;
      }
      return false;
    }
    querySelector(selector) { return elements.find((node) => node !== this && this.contains(node) && node.matches(selector)) || null; }
    getBoundingClientRect() { return this.bounds; }
    focus(options) {
      this.focusCalls.push(options);
      document.activeElement = this;
      document.dispatch("focusin", { target: this });
    }
    animate(keyframes, options) {
      const record = {
        effect: { target: this }, keyframes, options, cancelled: false, finished: false,
        cancel() { this.cancelled = true; this.oncancel?.(); },
        finish() { this.finished = true; this.onfinish?.(); },
      };
      animationRecords.push(record);
      return record;
    }
  }

  const root = new Element("html");
  if (entering) root.classList.add("spark-page-entering");
  if (homeIntro) root.classList.add("spark-home-intro");
  const main = new Element("main", [], root);
  const solution = new Element("section", [], main);
  const pricing = new Element("section", [], main);
  const artwork = new Element("figure", ["poster-illustration"], main);
  const intro = new Element("div", ["poster-intro"], main);
  const heroButton = new Element("a", [], intro);
  heroButton.setAttribute("href", "/contact/");
  const posterIndex = new Element("a", ["poster-index"], main);
  posterIndex.setAttribute("href", "#solution");
  const eyebrow = new Element("p", ["eyebrow"], main);
  const aperture = new Element("div", ["aperture-art"], solution);
  const platformContent = new Element("div", ["platform-content"], solution);
  const platformButton = new Element("a", [], platformContent);
  const details = new Element("details", [], platformContent);
  const detailBody = new Element("div", ["detail-body"], details);
  const detailLink = new Element("a", [], detailBody);
  const district = new Element("section", [], main);
  const districtHeading = new Element("div", ["district-heading"], district);
  const districtItems = Array.from({ length: 3 }, () => new Element("article", ["district-item"], district));
  const pilot = new Element("section", [], main);
  const pilotCopy = new Element("div", ["pilot-copy"], pilot);
  const pilotChecklist = new Element("div", ["pilot-checklist"], pilot);
  const questions = new Element("section", [], main);
  const faqIntro = new Element("div", ["faq-intro"], questions);
  const faqList = new Element("div", ["faq-list"], questions);
  const faqDetails = Array.from({ length: 5 }, () => new Element("details", [], faqList));
  const faqSummaries = faqDetails.map((item) => new Element("summary", [], item));
  const faqBodies = faqDetails.map((item) => new Element("div", ["detail-body"], item));
  const newHomeTargets = [districtHeading, ...districtItems, pilotCopy, pilotChecklist, faqIntro, ...faqDetails];
  const plan = new Element("article", ["plan"], pricing);
  const planButton = new Element("a", [], plan);
  const meta = new Element("div", ["section-meta"], solution);
  const lines = [new Element("span"), new Element("span"), new Element("span")];
  const innerHero = new Element("div", ["inner-hero-copy"], main);
  const innerArtwork = new Element("figure", ["inner-hero-art"], main);
  const innerEyebrow = new Element("p", ["eyebrow"], innerHero);
  const innerTitle = new Element("h1", [], innerHero);
  const innerLead = new Element("p", ["inner-lead"], innerHero);
  const innerButton = new Element("a", ["button"], innerHero);
  const contactInfo = new Element("div", ["contact-info"], main);
  const contactForm = new Element("form", ["contact-form"], main);
  const contactInput = new Element("input", [], contactForm);
  const contactSubmit = new Element("button", [], contactForm);
  const privacyHero = new Element("div", ["privacy-hero-inner"], main);
  const legalStamp = new Element("div", ["legal-stamp"], main);
  const policyNav = new Element("aside", ["policy-nav"], main);
  const policyDocument = new Element("article", ["policy-document"], main);
  const policySection = new Element("section", [], policyDocument);
  const policyLink = new Element("a", [], policySection);
  const pageReveals = {
    home: [meta, platformContent, aperture, plan, ...newHomeTargets],
    about: [innerHero, innerArtwork],
    contact: [meta, contactInfo, contactForm],
    privacy: [privacyHero, legalStamp, policyNav, policySection],
    terms: [privacyHero, legalStamp, policyNav, policySection],
  };
  const revealTargets = pageReveals[page];
  const ids = new Map([["main", main], ["solution", solution], ["pricing", pricing]]);
  if (page === "privacy" || page === "terms") ids.set("information", policySection);

  document.documentElement = root;
  document.hidden = hidden;
  const pageSelectors = {
    home: {
      ".poster-illustration, .inner-hero-art": artwork, ".aperture-art": aperture,
      ".poster .eyebrow": eyebrow, ".poster-intro": intro, ".poster-index": posterIndex,
    },
    about: {
      ".poster-illustration, .inner-hero-art": innerArtwork,
      ".inner-hero-copy": innerHero,
      ".inner-hero .eyebrow": innerEyebrow, ".inner-hero h1": innerTitle,
      ".inner-hero .inner-lead": innerLead, ".inner-hero .button": innerButton,
    },
    contact: {
      ".contact-page .section-meta": meta, ".contact-info": contactInfo, ".contact-form": contactForm,
    },
    privacy: { ".privacy-hero-inner": privacyHero, ".legal-stamp": legalStamp },
    terms: { ".privacy-hero-inner": privacyHero, ".legal-stamp": legalStamp },
  };
  document.querySelector = (selector) => pageSelectors[page][selector] || null;
  document.querySelectorAll = (selector) => {
    if (selector.startsWith(".section-meta")) {
      assert.ok(selector.includes(".contact-form"), "shared reveals include the contact form");
      assert.ok(selector.includes(".policy-document > *"), "shared reveals include legal sections");
      assert.ok(selector.includes(".inner-hero-copy"), "shared reveals include the about intro");
      for (const target of [".district-heading", ".district-item", ".pilot-copy", ".pilot-checklist", ".faq-intro", ".faq-list > details"]) {
        assert.ok(selector.includes(target), `shared reveals include ${target}`);
      }
      return revealTargets;
    }
    if (selector === ".hero-line > span") return page === "home" ? lines : [];
    if (selector === "details") return page === "home" ? [details, ...faqDetails] : [];
    return [];
  };
  document.getElementById = (id) => ids.get(id) || null;
  const media = (initial) => Object.assign(new Events(), {
    matches: initial,
    set(value) { this.matches = value; this.dispatch("change"); },
  });
  const reducedMedia = media(reduced);
  const desktopMedia = media(desktop);
  window.matchMedia = (query) => query.includes("prefers-reduced-motion") ? reducedMedia : desktopMedia;
  window.innerHeight = 900;
  window.scrollY = scrollY;
  window.location = { hash };
  window.history = {
    state: { retained: true }, calls: [],
    pushState(state, title, nextHash) {
      this.calls.push({ state, title, hash: nextHash });
      window.location.hash = nextHash;
    },
  };
  window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = (id) => frames.delete(id);

  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); this.disconnected = false; observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); this.disconnected = true; }
    enter(...targets) { this.callback(targets.map((target) => ({ target, isIntersecting: true }))); }
  }
  class Lenis extends Events {
    constructor(options) {
      super();
      this.options = options;
      this.isScrolling = false;
      this.rafCalls = [];
      this.scrollCalls = [];
      this.stopCalls = 0;
      this.startCalls = 0;
      this.resizeCalls = 0;
      this.destroyed = false;
      instances.push(this);
    }
    on(type, callback) { this.addEventListener(type, callback); }
    emit(type) { this.dispatch(type); }
    raf(time) {
      this.rafCalls.push(time);
      if (this.isScrolling !== "smooth") return;
      if (--this.remainingFrames <= 0) {
        this.isScrolling = false;
        this.emit("scroll");
        const callback = this.onComplete;
        this.onComplete = null;
        callback?.();
      } else this.emit("scroll");
    }
    scrollTo(destination, options) {
      this.scrollCalls.push({ destination, options });
      if (options.immediate) { options.onComplete?.(); return; }
      this.isScrolling = "smooth";
      this.remainingFrames = 3;
      this.onComplete = options.onComplete;
    }
    beginWheel(frames = 3) {
      this.emit("virtual-scroll");
      this.isScrolling = "smooth";
      this.remainingFrames = frames;
    }
    stop() { this.stopCalls++; this.isScrolling = false; this.onComplete = null; this.emit("scroll"); }
    start() { this.startCalls++; this.emit("scroll"); }
    resize() { this.resizeCalls++; this.emit("scroll"); }
    destroy() { this.destroyed = true; this.isScrolling = false; }
  }
  if (lenis) window.Lenis = Lenis;
  if (intersection) window.IntersectionObserver = IntersectionObserver;
  const context = vm.createContext({ window, document, Element, IntersectionObserver, console });
  vm.runInContext(source, context, { filename: "site-motion.js" });

  const flushFrame = (elapsed = 16.67) => {
    time += elapsed;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(time));
  };
  const flushAll = () => {
    for (let count = 0; frames.size && count < 30; count++) flushFrame();
    assert.equal(frames.size, 0, "RAF should settle rather than continue indefinitely");
  };
  const link = (href, classes = []) => {
    const node = new Element("a", classes);
    node.setAttribute("href", href);
    return node;
  };
  return {
    window, document, root, main, solution, pricing, artwork, aperture, intro, heroButton,
    posterIndex, platformContent, platformButton, details, detailBody, detailLink, plan, lines,
    planButton, meta, revealTargets, animationRecords, observers, instances, frames,
    reducedMedia, desktopMedia, flushFrame, flushAll, link, Element,
    innerHero, innerArtwork, innerTitle, innerButton, contactInfo, contactForm,
    contactInput, contactSubmit, privacyHero, policyNav, policySection, policyLink,
    newHomeTargets, faqDetails, faqSummaries, faqBodies,
    get scroller() { return instances.at(-1); },
    activeAnimations(target) { return animationRecords.filter((animation) => animation.effect.target === target && !animation.cancelled && !animation.finished); },
  };
}

test("desktop initializes one local scroller and idles after one initial frame", () => {
  const h = createHarness();
  assert.equal(h.instances.length, 1);
  assert.equal(h.root.classList.contains("spark-smooth"), true);
  assert.equal(h.scroller.options.autoRaf, false);
  assert.equal(h.scroller.options.syncTouch, false);
  assert.equal(h.scroller.options.allowNestedScroll, true);
  assert.equal(h.scroller.options.respectReducedMotion, true);
  h.flushAll();
  assert.equal(h.scroller.rafCalls.length, 1);
});

test("wheel work schedules one frame at a time and stops when interpolation finishes", () => {
  const h = createHarness();
  h.flushAll();
  h.scroller.beginWheel(4);
  h.scroller.emit("virtual-scroll");
  h.scroller.emit("scroll");
  assert.equal(h.frames.size, 1);
  h.flushAll();
  assert.equal(h.scroller.rafCalls.length, 5);
});

test("animation clock cannot jump by the full idle duration", () => {
  const h = createHarness();
  h.flushAll();
  const previous = h.scroller.rafCalls.at(-1);
  h.scroller.beginWheel();
  h.flushFrame(10000);
  assert.ok(h.scroller.rafCalls.at(-1) - previous < 40);
  h.flushAll();
});

test("coarse/mobile pointer uses native scrolling and removes desktop depth", () => {
  const h = createHarness({ desktop: false });
  assert.equal(h.instances.length, 0);
  assert.equal(h.root.classList.contains("motion-depth"), false);
  h.flushAll();
  assert.equal(h.artwork.styleValues.has("--art-scroll"), false);
  h.desktopMedia.set(true);
  assert.equal(h.instances.length, 1);
  h.flushAll();
  h.desktopMedia.set(false);
  assert.equal(h.scroller.destroyed, true);
  assert.equal(h.root.classList.contains("spark-smooth"), false);
  assert.equal(h.artwork.styleValues.has("--art-scroll"), false);
  h.flushAll();
});

test("initial reduced motion creates neither smooth scrolling nor reveals/intro", () => {
  const h = createHarness({ reduced: true });
  assert.equal(h.instances.length, 0);
  assert.equal(h.observers.length, 0);
  assert.equal(h.animationRecords.length, 0);
  assert.equal(h.frames.size, 0);
});

test("dynamic reduced motion immediately cancels every animation and pending RAF", () => {
  const h = createHarness();
  h.scroller.beginWheel();
  h.observers.at(-1).enter(h.plan);
  const priorScroller = h.scroller;
  h.reducedMedia.set(true);
  assert.equal(priorScroller.destroyed, true);
  assert.equal(h.frames.size, 0);
  assert.ok(h.animationRecords.every((animation) => animation.cancelled));
  assert.equal(h.observers.at(-1).disconnected, true);
  h.reducedMedia.set(false);
  assert.equal(h.instances.length, 2);
  assert.equal(h.scroller.destroyed, false);
  h.flushAll();
});

test("native wheel exceptions preserve zoom, horizontal, Shift and consumed input", () => {
  const h = createHarness();
  const filter = h.scroller.options.virtualScroll;
  const base = { cancelable: true, defaultPrevented: false };
  assert.equal(filter({ event: base, deltaX: 0, deltaY: 100 }), true);
  for (const override of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { defaultPrevented: true }, { cancelable: false }]) {
    assert.equal(filter({ event: { ...base, ...override }, deltaX: 0, deltaY: 100 }), false);
  }
  assert.equal(filter({ event: base, deltaX: 100, deltaY: 20 }), false);
  assert.equal(h.scroller.options.prevent(new h.Element("select")), true);
  for (const type of ["number", "range"]) {
    const input = new h.Element("input");
    input.setAttribute("type", type);
    assert.equal(h.scroller.options.prevent(input), true);
  }
  for (const attribute of ["contenteditable", "data-native-scroll"]) {
    const node = new h.Element("div");
    node.setAttribute(attribute, "");
    assert.equal(h.scroller.options.prevent(node), true);
  }
  assert.equal(h.scroller.options.prevent(new h.Element("div")), false);
});

test("all supported keyboard/navigation inputs interrupt active smooth motion", () => {
  for (const key of ["Tab", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape"]) {
    const h = createHarness();
    h.scroller.beginWheel();
    h.document.dispatch("keydown", { key });
    assert.equal(h.scroller.stopCalls, 1, key);
    assert.equal(h.scroller.startCalls, 1, key);
    h.flushAll();
  }
  for (const [target, event] of [["document", "pointerdown"], ["document", "touchstart"], ["window", "hashchange"], ["window", "popstate"]]) {
    const h = createHarness();
    h.scroller.beginWheel();
    h[target].dispatch(event);
    assert.equal(h.scroller.stopCalls, 1, event);
    h.flushAll();
  }
});

test("native wheel exemptions also stop any already-running inertia", () => {
  const h = createHarness();
  h.scroller.beginWheel();
  const accepted = h.scroller.options.virtualScroll({
    event: { cancelable: true, ctrlKey: true }, deltaX: 0, deltaY: 100,
  });
  assert.equal(accepted, false);
  assert.equal(h.scroller.stopCalls, 1);
  assert.equal(h.scroller.isScrolling, false);
  h.flushAll();
});

test("resize and details changes interrupt motion and remeasure document", () => {
  const h = createHarness();
  h.scroller.beginWheel();
  h.window.dispatch("resize");
  assert.equal(h.scroller.resizeCalls, 1);
  assert.equal(h.scroller.stopCalls, 1);
  h.scroller.beginWheel();
  h.details.open = true;
  h.details.dispatch("toggle");
  assert.equal(h.scroller.resizeCalls, 2);
  assert.equal(h.scroller.stopCalls, 2);
  assert.equal(h.activeAnimations(h.detailBody).length, 1);
  h.flushAll();
});

test("page lifecycle pauses work and reconstructs scrolling on resume", () => {
  const h = createHarness();
  h.scroller.beginWheel();
  h.window.dispatch("pagehide");
  assert.equal(h.frames.size, 0);
  assert.equal(h.scroller.destroyed, true);
  h.window.dispatch("pageshow");
  assert.equal(h.instances.length, 2);
  h.document.hidden = true;
  h.document.dispatch("visibilitychange");
  assert.equal(h.scroller.destroyed, true);
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.document.dispatch("visibilitychange");
  assert.equal(h.instances.length, 3);
  h.flushAll();
});

test("reveal observer staggers briefly, reveals once, then disconnects", () => {
  const h = createHarness({ hash: "#solution" });
  const observer = h.observers.at(-1);
  observer.enter(...h.revealTargets);
  assert.equal(h.animationRecords.length, h.revealTargets.length);
  assert.deepEqual(h.animationRecords.map((animation) => animation.options.delay), h.revealTargets.map((_, index) => Math.min(index * 65, 195)));
  assert.equal(observer.disconnected, true);
  observer.enter(h.plan);
  assert.equal(h.animationRecords.length, h.revealTargets.length);
  assert.equal(h.plan.styleValues.size, 0, "reveal does not persist a hidden inline base state");
});

test("new homepage sections wait for intersection and reveal only once across navigation lifecycle", () => {
  const h = createHarness();
  const observer = h.observers.at(-1);
  for (const target of h.newHomeTargets) {
    assert.equal(h.activeAnimations(target).length, 0, "below-fold content does not play during the hero intro");
    assert.ok(observer.targets.has(target), "below-fold content is observed");
  }
  observer.enter(...h.newHomeTargets);
  for (const target of h.newHomeTargets) {
    assert.equal(h.activeAnimations(target).length, 1);
    assert.equal(observer.targets.has(target), false);
    assert.equal(target.styleValues.size, 0, "content retains no hidden inline base state");
  }
  observer.enter(...h.newHomeTargets);
  h.window.dispatch("pagehide");
  h.window.dispatch("pageshow");
  for (const target of h.newHomeTargets) {
    assert.equal(h.animationRecords.filter((animation) => animation.effect.target === target).length, 1);
    assert.equal(h.observers.at(-1).targets.has(target), false, "a restored page does not replay seen sections");
  }
  h.flushAll();
});

test("FAQ accordions reuse one toggle handler to remeasure and animate their answer", () => {
  const h = createHarness();
  h.window.dispatch("pagehide");
  h.window.dispatch("pageshow");
  for (const [index, details] of h.faqDetails.entries()) {
    assert.equal(details.listeners.get("toggle").length, 1, "no duplicate listeners after page restoration");
    const previousResizeCalls = h.scroller.resizeCalls;
    h.scroller.beginWheel();
    details.open = true;
    details.dispatch("toggle");
    assert.equal(h.scroller.isScrolling, false);
    assert.equal(h.scroller.resizeCalls, previousResizeCalls + 1);
    assert.equal(h.activeAnimations(h.faqBodies[index]).length, 1);
    assert.equal(h.activeAnimations(h.faqBodies[index])[0].options.duration, 300);
    const animationCount = h.animationRecords.length;
    details.open = false;
    details.dispatch("toggle");
    assert.equal(h.scroller.resizeCalls, previousResizeCalls + 2);
    assert.equal(h.animationRecords.length, animationCount, "closing an answer does not replay its entrance");
  }
  h.flushAll();
});

test("keyboard focus exposes an unseen FAQ without fading its summary later", () => {
  const h = createHarness();
  h.faqSummaries[0].focus();
  assert.equal(h.observers.at(-1).targets.has(h.faqDetails[0]), false);
  h.observers.at(-1).enter(h.faqDetails[0]);
  assert.equal(h.activeAnimations(h.faqDetails[0]).length, 0);
  h.flushAll();
});

test("focus reveals section ancestors and excludes them from later entrances", () => {
  const h = createHarness({ hash: "#solution" });
  h.observers.at(-1).enter(h.plan);
  const animation = h.activeAnimations(h.plan)[0];
  h.document.dispatch("focusin", { target: h.planButton });
  assert.equal(animation.cancelled, true);
  h.document.dispatch("focusin", { target: h.platformButton });
  h.observers.at(-1).enter(h.platformContent);
  assert.equal(h.activeAnimations(h.platformContent).length, 0);
});

test("focus cancels hero CTA and details-body animations as well as observed sections", () => {
  const h = createHarness();
  assert.equal(h.activeAnimations(h.intro).length, 1);
  h.document.dispatch("focusin", { target: h.heroButton });
  assert.equal(h.activeAnimations(h.intro).length, 0, "hero CTA must not remain faded while focused");
  h.document.dispatch("focusin", { target: h.posterIndex });
  assert.equal(h.activeAnimations(h.posterIndex).length, 0);
  h.details.open = true;
  h.details.dispatch("toggle");
  h.document.dispatch("focusin", { target: h.detailLink });
  assert.equal(h.activeAnimations(h.detailBody).length, 0);
});

test("same-page anchors retain history, focus destination, and clean temporary tabindex", () => {
  const h = createHarness();
  const event = h.document.dispatch("click", { target: h.link("#pricing") });
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.window.location.hash, "#pricing");
  assert.equal(h.window.history.calls.length, 1);
  assert.equal(h.window.history.calls[0].state, h.window.history.state);
  assert.equal(h.scroller.scrollCalls[0].destination, h.pricing);
  assert.equal(h.scroller.scrollCalls[0].options.duration, 1.6);
  h.flushAll();
  assert.equal(h.document.activeElement, h.pricing);
  assert.equal(h.pricing.getAttribute("tabindex"), "-1");
  assert.equal(h.pricing.focusCalls[0].preventScroll, true);
  h.pricing.dispatch("blur");
  assert.equal(h.pricing.hasAttribute("tabindex"), false);
  h.document.dispatch("click", { target: h.link("#pricing") });
  assert.equal(h.window.history.calls.length, 1, "same hash must not duplicate history");
});

test("skip link moves immediately and retains an existing tabindex", () => {
  const h = createHarness();
  h.main.setAttribute("tabindex", "0");
  h.document.dispatch("click", { target: h.link("#main", ["skip-link"]) });
  assert.equal(h.scroller.scrollCalls[0].options.immediate, true);
  assert.equal(h.scroller.scrollCalls[0].options.duration, 0);
  assert.equal(h.document.activeElement, h.main);
  h.main.dispatch("blur");
  assert.equal(h.main.getAttribute("tabindex"), "0");
});

test("external, modified, missing, malformed, download and target links stay native", () => {
  const h = createHarness();
  const cases = [
    { target: h.link("/about/") }, { target: h.link("#missing") }, { target: h.link("#%") },
    { target: h.link("#pricing"), ctrlKey: true }, { target: h.link("#pricing"), metaKey: true },
    { target: h.link("#pricing"), shiftKey: true }, { target: h.link("#pricing"), altKey: true },
    { target: h.link("#pricing"), button: 1 },
  ];
  const download = h.link("#pricing");
  download.setAttribute("download", "");
  cases.push({ target: download });
  const newTab = h.link("#pricing");
  newTab.target = "_blank";
  cases.push({ target: newTab });
  for (const properties of cases) assert.equal(h.document.dispatch("click", properties).defaultPrevented, false);
  assert.equal(h.scroller.scrollCalls.length, 0);
  assert.equal(h.window.history.calls.length, 0);
});

test("interrupted anchor motion cannot steal focus later", () => {
  const h = createHarness();
  h.document.dispatch("click", { target: h.link("#pricing") });
  h.document.dispatch("keydown", { key: "Tab" });
  h.flushAll();
  assert.equal(h.pricing.focusCalls.length, 0);
});

test("deep-linked or restored scroll positions skip the hero intro", () => {
  for (const options of [{ hash: "#pricing" }, { scrollY: 450 }]) {
    const h = createHarness(options);
    assert.equal(h.animationRecords.length, 0);
  }
});

test("missing Lenis, IntersectionObserver or WAAPI leaves functional visible content", () => {
  const h = createHarness({ lenis: false, intersection: false, waapi: false });
  assert.equal(h.instances.length, 0);
  assert.equal(h.observers.length, 0);
  assert.equal(h.animationRecords.length, 0);
  assert.equal(h.root.classList.contains("spark-smooth"), false);
  assert.equal(h.document.dispatch("click", { target: h.link("#pricing") }).defaultPrevented, false);
  h.flushAll();
});

test("depth offsets remain bounded and use variables distinct from pointer parallax", () => {
  const h = createHarness();
  h.artwork.bounds = { top: -500, bottom: 300, height: 800, width: 400, left: 0 };
  h.aperture.bounds = { top: -100, bottom: 100, height: 200, width: 400, left: 0 };
  h.flushAll();
  assert.equal(h.artwork.styleValues.get("--art-scroll"), "28.00px");
  assert.equal(h.aperture.styleValues.get("--aperture-shift"), "11.00px");
  assert.equal(h.artwork.styleValues.has("--art-x"), false);
  assert.equal(h.artwork.styleValues.has("--art-y"), false);
});

test("every inner page initializes shared easing without relying on homepage elements", () => {
  for (const page of ["about", "contact", "privacy", "terms"]) {
    const h = createHarness({ page });
    assert.equal(h.instances.length, 1, page);
    assert.equal(h.scroller.options.syncTouch, false, page);
    assert.ok(h.animationRecords.length > 0, `${page} has an entrance`);
    assert.equal(h.activeAnimations(h.intro).length, 0, "no absent homepage intro");
    h.flushAll();
  }
});

test("inner-page reduced-motion preference suppresses entrances, depth and easing", () => {
  for (const page of ["about", "contact", "privacy", "terms"]) {
    const h = createHarness({ page, reduced: true });
    assert.equal(h.instances.length, 0, page);
    assert.equal(h.animationRecords.length, 0, page);
    assert.equal(h.observers.length, 0, page);
    assert.equal(h.frames.size, 0, page);
  }
});

test("contact form focus cancels its entrance and excludes it from later reveals", () => {
  const h = createHarness({ page: "contact" });
  assert.equal(h.activeAnimations(h.contactForm).length, 1);
  h.scroller.beginWheel();
  h.contactInput.focus();
  assert.equal(h.activeAnimations(h.contactForm).length, 0);
  assert.equal(h.scroller.isScrolling, false);
  h.observers.at(-1).enter(h.contactForm);
  assert.equal(h.activeAnimations(h.contactForm).length, 0);
  assert.equal(h.scroller.options.prevent(h.contactInput), false);
  h.flushAll();
});

test("contact text fields and non-overflowing message fields retain page easing", () => {
  const h = createHarness({ page: "contact" });
  const textarea = new h.Element("textarea", [], h.contactForm);
  for (const type of ["text", "email"]) {
    const input = new h.Element("input", [], h.contactForm);
    input.setAttribute("type", type);
    assert.equal(h.scroller.options.prevent(input), false, type);
  }
  for (const field of [h.contactInput, textarea]) {
    field.focus();
    h.scroller.beginWheel();
    assert.equal(h.scroller.options.prevent(field), false, field.name);
    assert.equal(h.scroller.isScrolling, "smooth");
    h.flushAll();
  }
});

test("an overflowing message stays native and cancels existing page inertia", () => {
  const h = createHarness({ page: "contact" });
  const textarea = new h.Element("textarea", [], h.contactForm);
  textarea.clientHeight = 160;
  textarea.scrollHeight = 500;
  h.scroller.beginWheel();
  assert.equal(h.scroller.options.prevent(textarea), true);
  assert.equal(h.scroller.isScrolling, false);
  assert.equal(h.scroller.stopCalls, 1);
  h.flushAll();
  textarea.scrollHeight = textarea.clientHeight;
  assert.equal(h.scroller.options.prevent(textarea), false, "clearing/resizing the message restores page easing immediately");
});

test("motion never consumes form submission or clicks on form controls", () => {
  const h = createHarness({ page: "contact" });
  assert.equal((h.document.listeners.get("submit") || []).length, 0);
  assert.equal((h.contactForm.listeners.get("submit") || []).length, 0);
  assert.equal(h.document.dispatch("submit", { target: h.contactForm }).defaultPrevented, false);
  assert.equal(h.document.dispatch("click", { target: h.contactSubmit }).defaultPrevented, false);
  assert.equal(h.scroller.scrollCalls.length, 0);
  h.flushAll();
});

test("legal contents links preserve history, focus their section and cancel its reveal", () => {
  for (const page of ["privacy", "terms"]) {
    const h = createHarness({ page });
    h.observers.at(-1).enter(h.policySection);
    assert.equal(h.activeAnimations(h.policySection).length, 1);
    const event = h.document.dispatch("click", { target: h.link("#information") });
    assert.equal(event.defaultPrevented, true);
    assert.equal(h.window.location.hash, "#information");
    h.flushAll();
    assert.equal(h.document.activeElement, h.policySection);
    assert.equal(h.activeAnimations(h.policySection).length, 0);
    h.policySection.dispatch("blur");
    assert.equal(h.policySection.hasAttribute("tabindex"), false);
  }
});

test("direct legal fragments and restored positions suppress introductory entrances", () => {
  for (const page of ["privacy", "terms"]) {
    for (const state of [{ hash: "#information" }, { scrollY: 500 }]) {
      const h = createHarness({ page, ...state });
      assert.equal(h.animationRecords.length, 0);
      assert.equal(h.scroller.scrollCalls.length, 0, "initialization must not override native restoration");
      h.flushAll();
    }
  }
});

test("about artwork depth stays bounded and focus exposes its introductory content", () => {
  const h = createHarness({ page: "about" });
  h.innerArtwork.bounds = { top: -500, bottom: 300, height: 800, width: 400, left: 0 };
  h.flushAll();
  assert.equal(h.innerArtwork.styleValues.get("--art-scroll"), "28.00px");
  assert.equal(h.activeAnimations(h.innerHero).length, 1);
  h.innerButton.focus();
  assert.equal(h.activeAnimations(h.innerHero).length, 0);
  h.observers.at(-1).enter(h.innerHero);
  assert.equal(h.activeAnimations(h.innerHero).length, 0);
});

test("document slides replace viewport entrances but retain below-fold reveals", () => {
  const h = createHarness({ page: "privacy" });
  h.policySection.bounds = { top: 1300, bottom: 1600, height: 300 };
  h.root.classList.add("spark-page-leaving");
  h.document.dispatch("click", { target: h.heroButton, defaultPrevented: true });
  assert.ok(h.animationRecords.every((animation) => animation.cancelled));
  h.observers.at(-1).enter(h.privacyHero);
  assert.equal(h.activeAnimations(h.privacyHero).length, 0);
  h.observers.at(-1).enter(h.policySection);
  assert.equal(h.activeAnimations(h.policySection).length, 1);
});

test("prepared fragment entries synchronize Lenis before revealing the destination", () => {
  const h = createHarness({ entering: true, hash: "#questions", scrollY: 5700 });
  h.window.dispatch("spark:page-entry-ready");
  assert.equal(h.scroller.scrollCalls.at(-1).destination, 5700);
  assert.equal(h.scroller.scrollCalls.at(-1).options.immediate, true);
  assert.equal(h.scroller.scrollCalls.at(-1).options.force, true);
  assert.ok(h.scroller.resizeCalls > 0);
  assert.equal(h.animationRecords.length, 0);
});

test("ordinary loads without a document transition keep their entrance animations", () => {
  const h = createHarness({ page: "contact" });
  assert.equal(h.activeAnimations(h.contactForm).length, 1);
});

test("outgoing document slides never retain partially faded reveal content", () => {
  const h = createHarness({ page: "privacy" });
  h.observers.at(-1).enter(h.policySection);
  assert.equal(h.activeAnimations(h.policySection).length, 1);
  h.root.classList.add("spark-page-leaving");
  h.document.dispatch("click", { target: h.heroButton, defaultPrevented: true });
  assert.ok(h.animationRecords.every((animation) => animation.cancelled));
});

test("fallback departures settle reveal animations without starting section scrolling", () => {
  const h = createHarness();
  h.root.classList.add("spark-page-leaving");
  h.document.dispatch("click", { target: h.heroButton, defaultPrevented: true });
  assert.ok(h.animationRecords.every((animation) => animation.cancelled));
  assert.equal(h.scroller.scrollCalls.length, 0);
});

test("fallback entries use only the document slide in the incoming viewport", () => {
  const h = createHarness({ page: "contact", entering: true });
  assert.equal(h.animationRecords.length, 0);
  h.observers.at(-1).enter(h.contactForm);
  assert.equal(h.animationRecords.length, 0);
});

test("the homepage hero reveal is timed to emerge as the introduction lifts", () => {
  const h = createHarness({ homeIntro: true });
  assert.equal(h.activeAnimations(h.lines[0])[0].options.delay, 1090);
  assert.equal(h.activeAnimations(h.artwork)[0].options.delay, 1000);
  assert.equal(h.activeAnimations(h.intro)[0].options.delay, 1330);
  h.window.dispatch("spark:home-intro-end", { detail: { interrupted: false } });
  assert.ok(h.animationRecords.every((animation) => !animation.cancelled));
});

test("dismissing the intro also exposes the hero immediately, without delayed hidden text", () => {
  const h = createHarness({ homeIntro: true });
  h.window.dispatch("spark:home-intro-end", { detail: { interrupted: true } });
  assert.ok(h.animationRecords.every((animation) => animation.cancelled));
});

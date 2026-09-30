const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../site.js"), "utf8");

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  dispatch(type, properties = {}) {
    for (const callback of this.listeners.get(type) || []) callback({ type, target: this, ...properties });
  }
}

function createHarness({ height = 72, headerPresent = true, resizeObserver = true, desktop = false } = {}) {
  const window = new Events();
  const document = new Events();
  const properties = new Map();
  const observers = [];
  const mediaQueries = [];
  const desktopMedia = Object.assign(new Events(), { matches: desktop });

  class Element extends Events {
    constructor(tagName) {
      super();
      this.tagName = tagName;
      this.classes = new Set();
      this.classList = {
        add: (value) => this.classes.add(value),
        remove: (value) => this.classes.delete(value),
        contains: (value) => this.classes.has(value),
      };
      this.attributes = new Map();
      this.focusCalls = 0;
      this.height = height;
    }
    closest(selector) { return selector === "a" && this.tagName === "a" ? this : null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getBoundingClientRect() { return { height: this.height }; }
    focus() { this.focusCalls++; }
  }

  const header = new Element("header");
  const toggle = new Element("button");
  const nav = new Element("nav");
  const link = new Element("a");
  const root = { style: { setProperty: (name, value) => properties.set(name, value) } };
  document.documentElement = root;
  document.querySelector = (selector) => ({
    ".site-header": headerPresent ? header : null,
    ".menu-toggle": toggle,
    ".nav": nav,
  })[selector] || null;
  window.matchMedia = (query) => { mediaQueries.push(query); return desktopMedia; };

  const ResizeObserver = resizeObserver ? class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    resize() { this.callback([{ target: this.target, contentRect: { height: this.target.height } }]); }
  } : undefined;
  if (ResizeObserver) window.ResizeObserver = ResizeObserver;

  const context = vm.createContext({ window, document, Element, ResizeObserver });
  vm.runInContext(source, context, { filename: "site.js" });

  return {
    window, document, properties, observers, header, toggle, nav, link, desktopMedia, mediaQueries,
    openMenu() {
      nav.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "Close";
    },
  };
}

test("header offset reflects measured desktop and mobile header heights", () => {
  for (const height of [72, 64, 124]) {
    const harness = createHarness({ height });
    assert.equal(harness.properties.get("--header-height"), `${height}px`);
    assert.equal(harness.observers.length, 1);
    assert.equal(harness.observers[0].target, harness.header);
  }
});

test("header offset follows layout changes through ResizeObserver", () => {
  const harness = createHarness();
  harness.header.height = 116;
  harness.observers[0].resize();
  assert.equal(harness.properties.get("--header-height"), "116px");
  harness.header.height = 64;
  harness.observers[0].resize();
  assert.equal(harness.properties.get("--header-height"), "64px");
});

test("fractional header measurements round up and hidden measurements preserve the offset", () => {
  const harness = createHarness({ height: 72.25 });
  assert.equal(harness.properties.get("--header-height"), "73px");
  harness.header.height = 0;
  harness.observers[0].resize();
  assert.equal(harness.properties.get("--header-height"), "73px");
});

test("header measurement falls back to window resize without ResizeObserver", () => {
  const harness = createHarness({ resizeObserver: false });
  assert.equal(harness.properties.get("--header-height"), "72px");
  harness.header.height = 64;
  harness.window.dispatch("resize");
  assert.equal(harness.properties.get("--header-height"), "64px");
  assert.equal(harness.observers.length, 0);
});

test("a page without a header retains CSS defaults and initializes menu behavior", () => {
  const harness = createHarness({ headerPresent: false });
  assert.equal(harness.properties.has("--header-height"), false);
  assert.equal(harness.observers.length, 0);
  harness.openMenu();
  harness.document.dispatch("keydown", { key: "Escape" });
  assert.equal(harness.nav.classList.contains("open"), false);
  assert.equal(harness.toggle.attributes.get("aria-expanded"), "false");
  assert.equal(harness.toggle.focusCalls, 1);
});

test("persistent navigation still closes after selecting a link", () => {
  const harness = createHarness();
  harness.openMenu();
  harness.nav.dispatch("click", { target: harness.link });
  assert.equal(harness.nav.classList.contains("open"), false);
  assert.equal(harness.toggle.attributes.get("aria-expanded"), "false");
  assert.equal(harness.toggle.textContent, "Menu");
});

test("moving to the desktop layout resets an open mobile menu", () => {
  const harness = createHarness();
  assert.ok(harness.mediaQueries.includes("(min-width: 1101px)"), "menu breakpoint leaves room for all navigation links");
  harness.openMenu();
  harness.desktopMedia.matches = true;
  harness.desktopMedia.dispatch("change");
  assert.equal(harness.nav.classList.contains("open"), false);
  assert.equal(harness.toggle.attributes.get("aria-expanded"), "false");
});

test("every header links to each homepage section and both main interior pages", () => {
  const sections = {
    Home: "main",
    "The platform": "solution",
    "For districts": "district-life",
    "How it works": "how-it-works",
    "Try Spark": "pilot",
    Pricing: "pricing",
    FAQs: "questions",
  };
  const home = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  for (const id of Object.values(sections)) assert.ok(home.includes(`id="${id}"`), `homepage includes ${id}`);

  for (const page of ["", "about", "contact", "privacy", "terms"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page, "index.html"), "utf8");
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)[0];
    const nav = header.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)[0];
    const links = [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, href, content]) => ({
      href,
      label: content.replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "").trim(),
    }));
    assert.equal(links.length, 9, `${page || "home"}: nine navigation destinations`);
    for (const [label, id] of Object.entries(sections)) {
      const expected = page && label === "Home" ? "/" : `${page ? "/" : ""}#${id}`;
      assert.equal(links.find((link) => link.label === label)?.href, expected, `${page || "home"}: ${label}`);
    }
    assert.equal(links.find((link) => link.label === "Our story")?.href, "/about/");
    assert.equal(links.find((link) => link.label.replace("’", "'") === "Let's talk")?.href, "/contact/");
  }
});

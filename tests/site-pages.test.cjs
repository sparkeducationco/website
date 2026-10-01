const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const pages = ["", "about", "contact", "privacy", "terms"];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const htmlFor = (page) => read(path.join(page, "index.html")).replace(/<!--[\s\S]*?-->/g, "");
const textOnly = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const hash = (text) => createHash("sha256").update(text).digest("hex");
const attributes = (tag) => Object.fromEntries(Array.from(
  tag.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g),
  ([, name, doubleValue, singleValue]) => [name, doubleValue ?? singleValue ?? ""],
));
const tags = (html, tagName) => Array.from(html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi")), ([tag]) => attributes(tag));

test("all routes share navigation, local motion assets and semantic page landmarks", () => {
  for (const page of pages) {
    const html = htmlFor(page);
    assert.equal(tags(html, "h1").length, 1, `${page || "home"}: one H1`);
    assert.equal(tags(html, "main").length, 1, `${page || "home"}: one main`);
    assert.equal(tags(html, "main")[0].id, "main");
    assert.match(html, /class="skip-link" href="#main"/);
    const primaryNav = tags(html, "nav").find((tag) => tag.id === "primary-nav");
    assert.ok(primaryNav?.["aria-label"], `${page}: labelled navigation`);
    const menu = tags(html, "button").find((tag) => tag.class === "menu-toggle");
    assert.equal(menu.type, "button");
    assert.equal(menu["aria-controls"], "primary-nav");
    assert.equal(menu["aria-expanded"], "false");
    assert.deepEqual(tags(html, "script").map((tag) => tag.src.split("?")[0]), [
      "/site-navigation.js",
      ...(!page ? ["/home-intro.js"] : []),
      "/script.js", "/site-sound.js", ...(page === "contact" ? ["/contact-feedback.js"] : []),
      "/site.js", "/button-sparks.js", "/assets/vendor/lenis-1.3.26.min.js", "/site-motion.js",
    ], `${page}: common scripts execute in dependency order`);
    for (const script of tags(html, "script").filter((tag) => !["/site-navigation.js", "/home-intro.js"].includes(tag.src.split("?")[0]))) assert.ok("defer" in script);
    assert.ok(html.indexOf('/site-navigation.js') < html.indexOf('</head>'), "entry initialization precedes first paint");
    const styles = tags(html, "link").filter((tag) => tag.rel === "stylesheet").map((tag) => tag.href);
    assert.deepEqual(styles, page ? ["/site.css?v=20260930-vertical-entry", "/pages.css?v=20260930-inner-doodles"] : ["/site.css?v=20260930-vertical-entry"]);
    assert.ok(!html.includes("/homepage") && !html.includes('href="/styles.css"'), "no obsolete styling/motion references");
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
    assert.equal(ids.length, new Set(ids).size, `${page}: unique IDs`);
    const brandImages = tags(html, "img").filter((tag) => tag.class === "brand-icon");
    assert.equal(brandImages.length, 2, `${page}: header and footer branding`);
    for (const image of brandImages) {
      assert.equal(image.src, "/icon.png");
      assert.equal(image.alt, "");
      assert.ok(Number(image.width) > 0 && Number(image.height) > 0);
    }
  }
});

test("every route keeps one sound control outside the navigation and page transition containers", () => {
  for (const page of pages) {
    const html = htmlFor(page);
    const controls = tags(html, "button").filter(tag => tag.class === "site-sound-toggle");
    assert.equal(controls.length, 1, `${page || "home"}: one persistent sound control`);
    assert.equal(controls[0].type, "button");
    assert.equal(controls[0]["aria-pressed"], "false");
    assert.ok(!html.match(/<header\b[\s\S]*?<\/header>/)[0].includes("site-sound-toggle"));
    assert.match(html, /<\/header>\s*<button class="site-sound-toggle"/);
    assert.match(html, /class="site-sound-label" aria-hidden="true">Sound off/);
  }
  const css = read("site.css");
  assert.match(css, /\.site-sound-toggle\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /\.site-sound-toggle\s*\{[^}]*bottom:\s*max\(16px, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.site-sound-toggle\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /@media print\s*\{\s*\.site-sound-toggle \{ display: none; \}/);
});

test("interior Home buttons navigate to the homepage route while Home on the homepage scrolls", () => {
  assert.match(htmlFor(""), /<a href="#main"[^>]*>Home<\/a>/);
  for (const page of pages.filter(Boolean)) {
    assert.match(htmlFor(page), /<a href="\/">Home<\/a>/, `${page}: Home uses document navigation, not a fragment`);
  }
});

test("the presentation-only introduction exists on the homepage and nowhere else", () => {
  assert.match(htmlFor(""), /<div class="home-intro" aria-hidden="true" inert>/);
  assert.ok(htmlFor("").indexOf('/home-intro.js') < htmlFor("").indexOf('</head>'));
  for (const page of pages.filter(Boolean)) {
    assert.ok(!htmlFor(page).includes("home-intro"), `${page}: no introduction markup or script`);
  }
});

test("homepage doodles are lightweight decorative artwork", () => {
  const doodles = tags(htmlFor(""), "svg").filter((tag) => tag.class?.includes("editorial-doodle"));
  assert.equal(doodles.length, 8);
  for (const doodle of doodles) {
    assert.equal(doodle["aria-hidden"], "true");
    assert.equal(doodle.focusable, "false");
    assert.ok(doodle.viewBox);
  }
});

test("interior pages have accessible decorative accents outside legal text and form fields", () => {
  for (const page of pages.filter(Boolean)) {
    const html = htmlFor(page);
    const doodles = tags(html, "svg").filter((tag) => tag.class?.includes("editorial-doodle"));
    assert.equal(doodles.length, 2, `${page}: two restrained accents`);
    for (const doodle of doodles) {
      assert.equal(doodle["aria-hidden"], "true");
      assert.equal(doodle.focusable, "false");
    }
    const readingArea = html.match(/<(?:article|form)\b[\s\S]*?<\/(?:article|form)>/)?.[0] || "";
    assert.ok(!readingArea.includes("editorial-doodle"), `${page}: reading and input areas stay clear`);
  }
  assert.match(read("pages.css"), /@media print\s*\{\s*\.editorial-doodle, \.contact-doodles \{ display: none; \}/);
});

test("About has an editorial cover and does not reuse the homepage hero image", () => {
  const about = htmlFor("about");
  assert.match(about, /class="about-cover page-section"/);
  assert.match(about, /class="about-perspective-mark"/);
  assert.ok(!about.includes('src="/assets/spark-field.webp"'));
  assert.ok(!about.includes('as="image"'));
  assert.ok(about.includes("Spark was founded by high school and college students"));
  assert.ok(about.includes("Our team has built and maintained tools used to bypass existing school filtering software."));
  assert.ok(!about.includes("security researchers"));
  assert.ok(about.includes("Our mission"));
  assert.match(about, /href="\/contact\/">Start a conversation/);
});

test("all local page links, fragments and asset references resolve", () => {
  for (const page of pages) {
    const html = htmlFor(page);
    for (const [, value] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (!value.startsWith("/") && !value.startsWith("#")) continue;
      const destination = new URL(value, `https://spark.test/${page ? `${page}/` : ""}`);
      let file = path.join(root, destination.pathname);
      if (destination.pathname.endsWith("/")) file = path.join(file, "index.html");
      assert.ok(fs.existsSync(file), `${page}: missing ${value}`);
      if (destination.hash) {
        const id = decodeURIComponent(destination.hash.slice(1));
        assert.ok(read(path.relative(root, file)).includes(`id="${id}"`), `${page}: missing anchor ${value}`);
      }
    }
  }
  for (const stylesheet of ["site.css", "pages.css"]) {
    for (const [, value] of read(stylesheet).matchAll(/url\(["']?(\/[^"')]+)["']?\)/g)) {
      assert.ok(fs.existsSync(path.join(root, value)), `${stylesheet}: missing ${value}`);
    }
  }
});

test("privacy and terms legal text and factual metadata are unchanged by the redesign", () => {
  const baseline = {
    privacy: {
      document: "f1f72227d9918abef359965ceda66f36ec788100e8160393e8bb82f23c52b6a2",
      metadata: "c8572cc473b8c2f163f38bb9de22efccac183e9864f143b531d7f86b448d621d",
    },
    terms: {
      document: "3b442c17cad4cb2c95c5c6cbbc2a1094b0429aa64c1c7482dcaeb5bc7be062b4",
      metadata: "1ef4ba15fcc2f5ec5d26c985052618285a16f037345120b5e47138ab6a306938",
    },
  };
  for (const page of ["privacy", "terms"]) {
    const html = htmlFor(page);
    const document = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/)[0]
      .replace(/<span class="document-mark">[\s\S]*?<\/span>/g, "");
    const metadata = html.match(/<div class="privacy-meta[^\"]*">([\s\S]*?)<\/div>/)[1];
    assert.equal(hash(textOnly(document)), baseline[page].document, `${page}: legal article text changed`);
    assert.equal(hash(textOnly(metadata)), baseline[page].metadata, `${page}: dates/provider/contact/address changed`);
  }
});

test("contact form preserves required field names, types, options and accessible status", () => {
  const html = htmlFor("contact");
  const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/)[0];
  assert.ok("data-contact-form" in tags(form, "form")[0]);
  const controls = [...tags(form, "input"), ...tags(form, "select"), ...tags(form, "textarea")];
  const fields = Object.fromEntries(controls.map((control) => [control.name, control]));
  assert.deepEqual(Object.keys(fields).sort(), ["devices", "district", "email", "message", "name"]);
  for (const name of ["name", "email", "district", "devices"]) assert.ok("required" in fields[name], `${name} remains required`);
  assert.ok(!("required" in fields.message), "message remains optional");
  assert.equal(fields.email.type, "email");
  assert.equal(fields.email.autocomplete, "email");
  assert.equal(fields.name.autocomplete, "name");
  assert.equal(fields.district.autocomplete, "organization");
  const optionText = [...form.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/g)].map(([, text]) => textOnly(text));
  assert.deepEqual(optionText, ["Choose a range", "Under 1,000", "1,000–4,999", "5,000–9,999", "10,000+"]);
  const status = tags(form, "p").find((tag) => tag.class === "form-status");
  assert.equal(status["aria-live"], "polite");
  assert.equal(tags(form, "button").filter((tag) => tag.type === "submit").length, 1);
});

function contactHarness(response = { ok: true, data: { ok: true } }, { pending = false, feedbackFails = false } = {}) {
  const listeners = new Map();
  const statusClasses = new Set();
  const status = { textContent: "", className: "form-status", classList: { add: (value) => statusClasses.add(value) } };
  const button = { disabled: false };
  const values = { name: "Test User", email: "test@example.invalid", district: "Test District", devices: "Under 1,000", message: "A test only." };
  const form = {
    resets: 0,
    querySelector(selector) { return selector === ".form-status" ? status : button; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    reset() { this.resets++; },
  };
  const calls = [];
  const events = [];
  let release;
  const wait = pending ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const context = vm.createContext({
    document: { querySelector: (selector) => selector === "[data-contact-form]" ? form : null },
    FormData: class { constructor(actualForm) { assert.equal(actualForm, form); } *[Symbol.iterator]() { yield* Object.entries(values); } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      assert.equal(button.disabled, true, "submit disabled while sending");
      await wait;
      if (response.networkError) throw new Error("Network unavailable.");
      return { ok: response.ok, json: async () => {
        if (response.malformed) throw new SyntaxError("Invalid JSON.");
        return response.data;
      } };
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: { dispatchEvent(event) {
      if (feedbackFails) throw new Error("Feedback unavailable.");
      assert.equal(form.resets, 1, "celebration occurs after resetting the accepted form");
      assert.ok(statusClasses.has("is-success"), "success is announced before decorative feedback");
      events.push(event);
    } },
  });
  vm.runInContext(read("script.js"), context, { filename: "script.js" });
  return { form, values, status, statusClasses, button, calls, listeners, events, release };
}

test("contact client still submits the five-field JSON contract and reports success", async () => {
  const h = contactHarness();
  let prevented = false;
  await h.listeners.get("submit")({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "/api/contact");
  assert.equal(h.calls[0].options.method, "POST");
  assert.equal(h.calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(h.calls[0].options.body), h.values);
  assert.equal(h.form.resets, 1);
  assert.ok(h.statusClasses.has("is-success"));
  assert.equal(h.button.disabled, false);
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0].type, "spark:contact-success");
  assert.equal(h.events[0].detail.form, h.form);
});

test("contact client preserves entered data on API failure and re-enables submission", async () => {
  const h = contactHarness({ ok: false, data: { error: "Please try again." } });
  await h.listeners.get("submit")({ preventDefault() {} });
  assert.equal(h.form.resets, 0);
  assert.equal(h.status.textContent, "Please try again.");
  assert.ok(h.statusClasses.has("is-error"));
  assert.equal(h.button.disabled, false);
  assert.equal(h.events.length, 0);
});

test("contact client never celebrates rejected, incomplete, malformed or failed requests", async () => {
  for (const response of [{ ok: true, data: { ok: false } }, { ok: true, data: {} },
    { ok: true, data: null }, { ok: false, data: { ok: true } },
    { ok: true, malformed: true }, { networkError: true }]) {
    const h = contactHarness(response);
    await h.listeners.get("submit")({ preventDefault() {} });
    assert.equal(h.events.length, 0);
    assert.equal(h.form.resets, 0);
    assert.ok(h.statusClasses.has("is-error"));
    assert.equal(h.button.disabled, false);
  }
});

test("repeated submits while sending produce one request and one celebration", async () => {
  const h = contactHarness(undefined, { pending: true });
  const first = h.listeners.get("submit")({ preventDefault() {} });
  await h.listeners.get("submit")({ preventDefault() {} });
  assert.equal(h.calls.length, 1);
  assert.equal(h.events.length, 0);
  assert.equal(h.form.resets, 0);
  assert.equal(h.button.disabled, true);
  h.release();
  await first;
  assert.equal(h.events.length, 1);
  assert.equal(h.form.resets, 1);
  assert.equal(h.button.disabled, false);
});

test("unavailable decorative feedback never reports an accepted email as a failure", async () => {
  const h = contactHarness(undefined, { feedbackFails: true });
  await h.listeners.get("submit")({ preventDefault() {} });
  assert.equal(h.form.resets, 1);
  assert.ok(h.statusClasses.has("is-success"));
  assert.ok(!h.statusClasses.has("is-error"));
  assert.equal(h.status.textContent, "Thanks—we’ll be in touch shortly.");
  assert.equal(h.button.disabled, false);
});

function apiHarness() {
  const calls = [];
  const context = vm.createContext({
    module: { exports: {} },
    process: { env: { RESEND_API_KEY: "mock-key", CONTACT_FROM_EMAIL: "sender@example.invalid", CONTACT_TO_EMAIL: "team@example.invalid" } },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true }; },
    console: { error() {} },
  });
  vm.runInContext(read("api/contact.js"), context, { filename: "api/contact.js" });
  const response = {
    headers: {}, code: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return { handler: context.module.exports, calls, response };
}

test("contact API accepts the unchanged form contract using a mocked email provider", async () => {
  const h = apiHarness();
  await h.handler({ method: "POST", body: {
    name: " Test User ", email: "test@example.invalid", district: " Test District ", devices: "Under 1,000", message: "Hello",
  } }, h.response);
  assert.equal(h.response.code, 200);
  assert.equal(h.response.body.ok, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "https://api.resend.com/emails");
  const body = JSON.parse(h.calls[0].options.body);
  assert.deepEqual(body.to, ["team@example.invalid"]);
  assert.equal(body.reply_to, "test@example.invalid");
  assert.match(body.text, /Name: Test User\nEmail: test@example.invalid\nDistrict: Test District\nDevices: Under 1,000/);
});

test("contact API rejects unsupported methods and missing required values before email delivery", async () => {
  for (const request of [{ method: "GET" }, { method: "POST", body: { name: "Test" } }]) {
    const h = apiHarness();
    await h.handler(request, h.response);
    assert.equal(h.response.code, request.method === "GET" ? 405 : 400);
    assert.equal(h.calls.length, 0);
  }
});

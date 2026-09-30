const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8")
  .replace(/<!--[\s\S]*?-->/g, "");
const textOnly = (value) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const section = (id) => {
  const match = html.match(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?<\\/section>`));
  assert.ok(match, `homepage contains ${id}`);
  return match[0];
};

test("expanded homepage sections have descriptive headings and shared reveal hooks", () => {
  for (const [id, hooks] of [
    ["district-life", ["district-heading", "district-item"]],
    ["pilot", ["pilot-copy", "pilot-checklist"]],
    ["questions", ["faq-intro", "faq-list"]],
  ]) {
    const content = section(id);
    const label = content.match(/^<section\b[^>]*\baria-labelledby="([^"]+)"/);
    assert.ok(label, `${id} is labelled`);
    const heading = content.match(new RegExp(`<h2\\b[^>]*\\bid="${label[1]}"[^>]*>([\\s\\S]*?)<\\/h2>`));
    assert.ok(heading && textOnly(heading[1]).length > 0, `${id} points to a visible H2`);
    for (const hook of hooks) {
      assert.match(content, new RegExp(`class="[^"]*\\b${hook}\\b[^"]*"`), `${id} retains ${hook}`);
    }
  }
});

test("district workflow and pilot sections provide scannable semantic content", () => {
  const articles = [...section("district-life").matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)];
  assert.ok(articles.length >= 3, "district section explains multiple daily workflows");
  for (const [article] of articles) {
    assert.match(article, /<h3\b[^>]*>[^<]+<\/h3>/);
    const description = article.match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(description && textOnly(description[1]).length > 0);
  }
  const checklist = section("pilot").match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/);
  assert.ok(checklist, "readiness steps remain an ordered list without JavaScript");
  const items = [...checklist[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)];
  assert.ok(items.length >= 4, "pilot offers concrete readiness checks");
  for (const [, item] of items) assert.ok(textOnly(item).length > 0);
});

test("homepage FAQ works as native disclosures and retains the shared answer animation hook", () => {
  const faq = section("questions");
  const entries = [...faq.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/g)];
  assert.ok(entries.length >= 5, "FAQ provides practical information before a demo");
  for (const [entry, body] of entries) {
    const summary = body.match(/^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/);
    assert.ok(summary && textOnly(summary[1]).length > 0, "each native disclosure has a question");
    assert.doesNotMatch(summary[1], /<(?:a|button|input)\b/i, "summary is the only interactive question control");
    assert.match(body, /<div\b[^>]*class="detail-body"/);
    assert.match(body, /<p\b[^>]*>[\s\S]+?<\/p>/);
    assert.doesNotMatch(entry, /\bon(?:click|toggle)\s*=/i, "shared motion owns the toggle listener");
  }
});

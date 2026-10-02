const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
const origin = "https://www.sparkforschools.com";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const urls = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const fileFor = (url) => path.join(new URL(url).pathname, "index.html");
const pageFor = (url) => read(fileFor(url));

test("sitemap pages have consistent canonical, social and structured identities", () => {
    assert.ok(urls.length > 0);
    assert.equal(new Set(urls).size, urls.length);
    assert.ok(read("robots.txt").includes(`Sitemap: ${origin}/sitemap.xml`));
    const titles = new Set();
    for (const url of urls) {
        assert.equal(new URL(url).origin, origin);
        const html = pageFor(url);
        assert.equal([...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].length, 1);
        assert.ok(html.includes(`<link rel="canonical" href="${url}"`));
        assert.ok(html.includes(`<meta property="og:url" content="${url}"`));
        assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
        const title = html.match(/<title>(.*?)<\/title>/)[1];
        assert.ok(!titles.has(title), `duplicate title: ${title}`);
        titles.add(title);
        const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
        assert.equal(data["@context"], "https://schema.org");
        assert.ok(data["@graph"].some((entity) => entity.url === url && entity["@id"] === `${url}#webpage`));
    }
});

test("every sitemap page is reachable from home and local links and fragments resolve", () => {
    const visited = new Set();
    const pending = [`${origin}/`];
    while (pending.length) {
        const url = pending.pop();
        if (visited.has(url)) continue;
        visited.add(url);
        const html = pageFor(url).replace(/<!--[\s\S]*?-->/g, "");
        for (const [, href] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
            if (!href.startsWith("/") && !href.startsWith("#")) continue;
            const dest = new URL(href, url);
            const file = dest.pathname.endsWith("/") ? fileFor(dest) : dest.pathname;
            assert.ok(fs.existsSync(path.join(root, file)), `${url}: missing ${href}`);
            if (dest.hash) assert.ok(read(file).includes(`id="${decodeURIComponent(dest.hash.slice(1))}"`), `${url}: missing ${href}`);
            const page = `${dest.origin}${dest.pathname}`;
            if (urls.includes(page) && !visited.has(page)) pending.push(page);
        }
    }
    for (const url of urls) assert.ok(visited.has(url), `orphaned sitemap page: ${url}`);
});

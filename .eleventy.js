const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");

// The scripts are ES modules that import each other, and the CDN caches each
// file on its own for a few minutes, so right after a deploy a page could get
// a new here.js next to an old checkin.js. Each build copies them into
// /js/<hash of their contents>/ and the pages load from there: every import
// in a page resolves to the same build, and a deploy that doesn't change the
// scripts keeps the same URLs (and caches).
function jsVersion(dir) {
  const hash = crypto.createHash("sha256");
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (!fs.statSync(file).isFile()) continue;
    hash.update(name).update("\0").update(fs.readFileSync(file)).update("\0");
  }
  return hash.digest("hex").slice(0, 10);
}

// The pages are React components: src/pages/*.mjs, and the layout
// src/_includes/layouts/profile.mjs that the Markdown member pages render
// through. Each gets plain JSON props: the global data it uses, the page's
// front matter, and the collections it names in `uses` (a `profile` entry
// arrives as `profiles`), each item cut down to its url, its rendered body and
// the front matter fields below.
const FIELDS = {
  photo: ["image", "date", "event", "caption"],
  profile: ["name", "role", "photo"],
  project: ["name", "repo", "lead", "help"],
};
const plain = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

function pageProps(data) {
  const { site, js, events, prRepos, page, title, name, role, photo, content } = data;
  const props = { site, js, events, prRepos, url: page.url, title, name, role, photo, content };
  // the build machine's date, for the calendar and the next meetup; the
  // browser re-picks by New York's date
  props.today = new Date().toLocaleDateString("en-CA");
  for (const tag of data.uses || []) {
    props[`${tag}s`] = (data.collections[tag] || []).map(item => ({
      url: item.url,
      content: item.templateContent,
      ...Object.fromEntries(FIELDS[tag].map(key => [key, plain(item.data[key])])),
    }));
  }
  return props;
}

// scripts/render.mjs turns a component and its props into the document. It
// runs in its own Node process per page because Node keeps a module for the
// life of the process and `eleventy --serve` is one long process: this way an
// edited component shows on the next build.
function renderPage(inputPath, props) {
  const run = spawnSync(process.execPath, [path.join(__dirname, "scripts/render.mjs"), path.resolve(inputPath)], {
    input: JSON.stringify(props),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(run.stderr || `Rendering ${inputPath} failed`);
  return run.stdout;
}

module.exports = function(eleventyConfig) {
  const js = `/js/${jsVersion("src/js")}`;
  eleventyConfig.addGlobalData("js", js);

  eleventyConfig.addExtension("mjs", {
    outputFileExtension: "html",
    read: false,
    getData: true,
    // a fresh import each build, so an edited `data` export is seen too
    getInstanceFromInputPath: inputPath => import(`${pathToFileURL(path.resolve(inputPath)).href}?v=${Date.now()}`),
    // the permalink is a plain string, not something to render
    compileOptions: { cache: false, permalink: "raw" },
    compile: (content, inputPath) => data => renderPage(inputPath, pageProps(data)),
  });
  // the components the pages import live with the browser scripts
  eleventyConfig.addWatchTarget("src/js/");
  eleventyConfig.addWatchTarget("scripts/render.mjs");

  // Copy CSS to output
  eleventyConfig.addPassthroughCopy("src/css");

  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy({ "src/js/*": js.slice(1) });
  // also at /js/, for pages a cache still holds from before a deploy
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/sw.js");
  eleventyConfig.addPassthroughCopy("src/manifest.webmanifest");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      layouts: "_includes/layouts"
    },
    templateFormats: ["mjs", "md"],
    markdownTemplateEngine: false,
  };
};
module.exports.jsVersion = jsVersion;

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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

module.exports = function(eleventyConfig) {
  const js = `/js/${jsVersion("src/js")}`;
  eleventyConfig.addGlobalData("js", js);
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
    templateFormats: ["njk", "html", "md"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
module.exports.jsVersion = jsVersion;

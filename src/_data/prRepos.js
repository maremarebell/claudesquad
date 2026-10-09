// The repos whose merged PRs count as points: this site, plus every repo on
// the Projects page (the `repo:` line of each src/projects/*.md).
const fs = require("fs");
const path = require("path");
const site = require("./site.json");

module.exports = function () {
  const dir = path.join(__dirname, "..", "projects");
  const repos = fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => fs.readFileSync(path.join(dir, f), "utf8").match(/^repo:\s*(\S+)/m)?.[1])
    .concat(site.repo)
    .map(url => url && url.match(/github\.com\/([^/]+\/[^/#?]+)/)?.[1])
    .filter(Boolean);
  return [...new Set(repos)];
};

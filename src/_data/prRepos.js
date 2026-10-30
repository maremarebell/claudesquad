// The repos whose merged PRs count as points: this site, plus every repo on
// the Projects page (the `repo:` line of each src/projects/*.md).
const fs = require("fs");
const path = require("path");
const site = require("./site.json");


// "owner/name" from a GitHub URL, or undefined for anything else.
const slug = url => url && url.match(/github\.com\/([^/]+\/[^/#?]+)/)?.[1];

// The unique repos named by project files' `repo:` lines, plus the site's own.
function reposFrom(projectFiles, siteRepo) {
  const repos = projectFiles
    .map(text => text.match(/^repo:\s*(\S+)/m)?.[1])
    .concat(siteRepo)
    .map(slug)
    .filter(Boolean);
  return [...new Set(repos)];
}

module.exports = function () {
  const dir = path.join(__dirname, "..", "projects");
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => fs.readFileSync(path.join(dir, f), "utf8"));
  return reposFrom(files, site.repo);
};
Object.assign(module.exports, { slug, reposFrom });

// Every src/profiles/*.md: the member layout, the profile collection, and a
// URL from the file name (mare-co-captain.md -> /members/mare-co-captain/).
module.exports = {
  layout: "profile.mjs",
  tags: "profile",
  eleventyComputed: { permalink: data => `/members/${data.page.fileSlug}/` },
};

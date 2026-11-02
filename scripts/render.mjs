// Renders one page component to HTML: `node scripts/render.mjs <module>` with
// the props as JSON on stdin, the document on stdout. .eleventy.js runs it in
// a fresh process per page, so an edited component shows on the next build.
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { default: Page } = await import(pathToFileURL(process.argv[2]).href);
const markup = renderToString(createElement(Page, JSON.parse(input)));
process.stdout.write(markup.startsWith('<!DOCTYPE') ? markup : `<!DOCTYPE html>\n${markup}`);

// /projects/: what people are working on right now (posted here), then the
// projects in src/projects/*.md, each with its issues to pick up.
import { html } from '../js/ui.js';
import { Layout, Island } from '../_includes/layout.mjs';
import { Working } from '../js/working.js';

export const data = { permalink: '/projects/', title: 'Projects', uses: ['project'] };

const NEW_PROJECT = '---\nname: \nrepo: https://github.com/you/your-project\nlead: \nhelp:\n  - \n---\n\nWhat it is, in a sentence or two.\n';

export default function Projects({ site, js, url, title, projects }) {
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  return html`<${Layout} site=${site} js=${js} url=${url} title=${title}>
    <div className="content">
      <h1>Projects</h1>
      <div>
        <${Island} name="working" component=${Working} props=${{}} as="section" className="working" id="working" />

        <h2 className="projects__title">Projects</h2>
        <div className="projects">
          ${sorted.length ? sorted.map(project => html`
            <article key=${project.url || project.name} className="project">
              <h2 className="project__name"><a href=${project.repo} target="_blank" rel="noopener">${project.name}</a></h2>
              ${project.lead && html`<p className="project__lead">${project.lead}</p>`}
              <div className="project__about" dangerouslySetInnerHTML=${{ __html: project.content }} />
              ${project.help && project.help[0] && html`
                <ul className="project__help">${project.help.filter(Boolean).map(item => html`<li key=${item}>${item}</li>`)}</ul>`}
              <p className="project__links">
                <a href=${`${project.repo}/issues?q=is%3Aopen+label%3A%22good+first+issue%22`} target="_blank" rel="noopener">Good first issues</a>
                <a href=${`${project.repo}/issues`} target="_blank" rel="noopener">All issues</a>
                <a href=${project.repo} target="_blank" rel="noopener">Code</a>
              </p>
            </article>`) : html`<p className="projects__empty">No projects yet. Add the one you're working on.</p>`}
        </div>

        <p className="projects__add">
          <a className="here__btn" href=${`${site.repo}/new/${site.branch}/src/projects?filename=your-project.md&value=${encodeURIComponent(NEW_PROJECT)}`} target="_blank" rel="noopener">Add a project</a>
        </p>
      </div>
    </div>
  <//>`;
}

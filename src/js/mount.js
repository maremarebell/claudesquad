// The islands on this page: the parts the build rendered with React that React
// runs in the browser too. Each host element names its module in data-island
// (board.js exports Board) and carries its props as JSON in data-props; React
// takes the markup over in place, with the host passed along as `host` for the
// few things a component does to its own element. A page with no islands
// loads nothing more.
const hosts = [...document.querySelectorAll('[data-island]')];
if (hosts.length) {
  const [{ createElement }, { hydrateRoot }] = await Promise.all([import('react'), import('react-dom/client')]);
  for (const host of hosts) {
    const name = host.dataset.island;
    import(`./${name}.js`).then(mod => {
      const Component = mod[name[0].toUpperCase() + name.slice(1)];
      hydrateRoot(host, createElement(Component, { ...JSON.parse(host.dataset.props), host }));
    });
  }
}

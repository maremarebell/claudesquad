// "What are you working on": a line and an optional link, posted by members,
// shown to everyone on the Projects page, newest first.
import { api, token, SignedOut, avatar, el } from './squad.js';
import { ago, linkLabel } from './format.js';

const root = document.getElementById('working');
const form = root.querySelector('form');
const feed = root.querySelector('.working__feed');
const status = root.querySelector('.working__status');
let me = null;

function card(post) {
  const li = el('li', { className: 'working__post' },
    avatar(post.member, 'working__face'),
    el('div', { className: 'working__body' },
      el('p', { className: 'working__meta' }, el('b', { textContent: post.member.name }), ` · ${ago(post.created_at)}`),
      el('p', { className: 'working__text', textContent: post.body }),
      ...(post.link ? [el('a', { className: 'working__link', href: post.link, target: '_blank', rel: 'noopener nofollow', textContent: linkLabel(post.link) })] : [])));
  if (me && post.member.id === me.id) {
    li.append(el('button', {
      className: 'working__delete', type: 'button', textContent: 'Delete',
      onclick: async () => {
        await api('/api/posts/delete', { id: post.id }).catch(() => {});
        li.remove();
      },
    }));
  }
  return li;
}

async function load() {
  const posts = await api('/api/posts');
  feed.replaceChildren(...posts.map(card));
  status.textContent = posts.length ? '' : 'Nothing yet. Be the first.';
}

form.onsubmit = async e => {
  e.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const post = await api('/api/posts', { body: form.body.value, link: form.link.value });
    feed.prepend(card(post));
    status.textContent = '';
    form.reset();
  } catch (err) {
    status.textContent = err instanceof SignedOut ? 'Log in again to post.' : err.message;
  } finally {
    btn.disabled = false;
  }
};

(async () => {
  if (token.get()) {
    try {
      ({ member: me } = await api('/api/me'));
      form.hidden = false;
      root.querySelector('.working__login').hidden = true;
    } catch {}
  }
  await load();
})().catch(() => { status.textContent = "Posting isn't open yet."; });

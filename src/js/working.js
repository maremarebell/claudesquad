// "What are you working on": a line and an optional link, posted by members,
// shown to everyone on the Projects page, newest first.
import { useState, useEffect } from 'react';
import { api, token, SignedOut } from './squad.js';
import { ago, linkLabel } from './format.js';
import { html, Fragment, Avatar } from './ui.js';

function Post({ post, mine, onDelete }) {
  return html`
    <li className="working__post">
      <${Avatar} member=${post.member} className="working__face" />
      <div className="working__body">
        <p className="working__meta"><b>${post.member.name}</b> · ${ago(post.created_at)}</p>
        <p className="working__text">${post.body}</p>
        ${post.link && html`<a className="working__link" href=${post.link} target="_blank" rel="noopener nofollow">${linkLabel(post.link)}</a>`}
      </div>
      ${mine && html`<button className="working__delete" type="button" onClick=${onDelete}>Delete</button>`}
    </li>`;
}

export function Working() {
  const [me, setMe] = useState(null);
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (token.get()) {
        try { setMe((await api('/api/me')).member); } catch {}
      }
      const list = await api('/api/posts');
      setPosts(list);
      setStatus(list.length ? '' : 'Nothing yet. Be the first.');
    })().catch(() => setStatus("Posting isn't open yet."));
  }, []);

  async function post(e) {
    e.preventDefault();
    const form = e.target;
    setBusy(true);
    try {
      const made = await api('/api/posts', { body: form.body.value, link: form.link.value });
      setPosts(list => [made, ...list]);
      setStatus('');
      form.reset();
    } catch (err) {
      setStatus(err instanceof SignedOut ? 'Log in again to post.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    await api('/api/posts/delete', { id }).catch(() => {});
    setPosts(list => list.filter(p => p.id !== id));
  }

  return html`<${Fragment}>
    <h2 className="working__title">What are you working on?</h2>
    <form className="working__form" hidden=${!me} onSubmit=${post}>
      <textarea name="body" maxLength="280" rows="2" required placeholder="A line about it" />
      <input name="link" type="url" inputMode="url" placeholder="Link (optional)" />
      <button className="here__btn" type="submit" disabled=${busy}>Post</button>
    </form>
    <p className="working__login" hidden=${Boolean(me)}><a className="here__btn" href="/here/">Log in to post</a></p>
    <p className="working__status" role="status">${status}</p>
    <ol className="working__feed">
      ${posts.map(p => html`<${Post} key=${p.id} post=${p} mine=${Boolean(me) && p.member.id === me.id} onDelete=${() => remove(p.id)} />`)}
    </ol>
  <//>`;
}

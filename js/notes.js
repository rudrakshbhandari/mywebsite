(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const state = {
    notes: [],
    activeSlug: null,
  };

  const listEl = document.getElementById('notes-list');
  const detailEl = document.getElementById('note-detail');
  const emptyEl = document.getElementById('notes-empty');
  const countEl = document.getElementById('notes-count');
  const featuredEl = document.getElementById('featured-note');

  function formatDate(value) {
    if (!value) return '';
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const parsed = dateMatch
      ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
      : new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function getActiveNote() {
    return state.notes.find(note => note.slug === state.activeSlug) || state.notes[0] || null;
  }

  function renderFeatured(notes) {
    if (!featuredEl) return;
    const featured = notes.find(note => note.featured);

    if (!featured) {
      featuredEl.style.display = 'none';
      return;
    }

    featuredEl.style.display = '';
    featuredEl.innerHTML = `
      <div class="featured-label">Featured note</div>
      <h2>${featured.title}</h2>
      <p>${featured.summary}</p>
      <div class="featured-meta">
        <span>${formatDate(featured.date)}</span>
        <span>${featured.readingTimeMinutes} min read</span>
      </div>
      <button class="featured-button" type="button" data-slug="${featured.slug}">Read note</button>
    `;

    const button = featuredEl.querySelector('[data-slug]');
    if (button) {
      button.addEventListener('click', () => {
        state.activeSlug = featured.slug;
        window.location.hash = featured.slug;
        render();
      });
    }
  }

  function renderList() {
    if (!listEl) return;

    if (!state.notes.length) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = state.notes
      .map(note => {
        const isActive = note.slug === state.activeSlug;
        return `
          <button class="note-list-item${isActive ? ' is-active' : ''}" type="button" data-slug="${note.slug}">
            <span class="note-list-date">${formatDate(note.date)}</span>
            <span class="note-list-title">${note.title}</span>
            <span class="note-list-summary">${note.summary}</span>
          </button>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-slug]').forEach(button => {
      button.addEventListener('click', () => {
        state.activeSlug = button.dataset.slug;
        window.location.hash = button.dataset.slug;
        render();
      });
    });
  }

  function renderDetail() {
    if (!detailEl) return;
    const note = getActiveNote();

    if (!note) {
      detailEl.innerHTML = `
        <div class="note-placeholder">
          <h2>Nothing published yet</h2>
          <p>Use the writing portal to add the first note and it will appear here automatically.</p>
        </div>
      `;
      return;
    }

    const summaryBlock = note.hasExplicitSummary ? `<p class="note-article-summary">${note.summary}</p>` : '';

    detailEl.innerHTML = `
      <article class="note-article">
        <div class="note-article-meta">
          <span>${formatDate(note.date)}</span>
          <span>${note.readingTimeMinutes} min read</span>
        </div>
        <h2>${note.title}</h2>
        ${summaryBlock}
        <div class="note-tag-row">
          ${note.tags.map(tag => `<span class="note-tag">${tag}</span>`).join('')}
        </div>
        <div class="note-article-body">${note.html}</div>
      </article>
    `;
  }

  function renderCount() {
    if (!countEl) return;
    countEl.textContent = `${state.notes.length} published ${state.notes.length === 1 ? 'note' : 'notes'}`;
  }

  function render() {
    renderCount();
    renderFeatured(state.notes);
    renderList();
    renderDetail();
  }

  async function loadNotes() {
    try {
      const response = await fetch('/notes/notes-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to fetch notes: ${response.status}`);
      const payload = await response.json();
      state.notes = Array.isArray(payload.notes) ? payload.notes : [];

      const hashSlug = window.location.hash.replace(/^#/, '');
      state.activeSlug = state.notes.some(note => note.slug === hashSlug) ? hashSlug : state.notes[0]?.slug || null;
      render();
    } catch (error) {
      console.error(error);
      if (detailEl) {
        detailEl.innerHTML = `
          <div class="note-placeholder">
            <h2>Notes are unavailable right now</h2>
            <p>Try again in a moment. If this is local development, run <code>npm run notes:build</code>.</p>
          </div>
        `;
      }
    }
  }

  window.addEventListener('hashchange', () => {
    const hashSlug = window.location.hash.replace(/^#/, '');
    if (state.notes.some(note => note.slug === hashSlug)) {
      state.activeSlug = hashSlug;
      render();
    }
  });

  document.addEventListener('DOMContentLoaded', loadNotes);
})();

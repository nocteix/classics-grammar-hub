let allNotes = [];
let fuseInstance = null;

const filterState = {
  language: 'all',
  category: 'all',
  query: ''
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Fetch both files simultaneously
    const [latinRes, greekRes] = await Promise.all([
      fetch('latin-notes.json'),
      fetch('greek-notes.json')
    ]);

    if (!latinRes.ok || !greekRes.ok) {
      throw new Error('One or both grammar files failed to load.');
    }

    const latinNotes = await latinRes.json();
    const greekNotes = await greekRes.json();

    allNotes = [...latinNotes, ...greekNotes];

    initFuse(allNotes);
    filterAndRender();
    setupEventListeners();
  } catch (error) {
    console.error('Failed to load grammar notes:', error);
    document.getElementById('notesContainer').innerHTML = `
      <div class="no-results-box">
        <p>Error loading data. Ensure <code>latin-notes.json</code> and <code>greek-notes.json</code> exist in your directory.</p>
      </div>`;
  }
});

function initFuse(notes) {
  const fuseOptions = {
    includeScore: true,
    includeMatches: true,
    threshold: 0.35,
    ignoreLocation: true,
    keys: [
      { name: 'title', weight: 0.4 },
      { name: 'tags', weight: 0.3 },
      { name: 'description', weight: 0.2 },
      { name: 'formula', weight: 0.1 }
    ]
  };
  fuseInstance = new Fuse(notes, fuseOptions);
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');

  searchInput.addEventListener('input', (e) => {
    filterState.query = e.target.value.toLowerCase().trim();
    filterAndRender();
  });

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      filterState.language = target.getAttribute('data-language');
      filterAndRender();
    });
  });

  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      filterState.category = target.getAttribute('data-category');
      filterAndRender();
    });
  });
}

function filterAndRender() {
  const { language, category, query } = filterState;

  let searchResults = [];
  if (query && fuseInstance) {
    searchResults = fuseInstance.search(query);
  } else {
    searchResults = allNotes.map(note => ({ item: note, matches: [] }));
  }

  const filtered = searchResults.filter(result => {
    const note = result.item;
    const matchesLang = (language === 'all') || (note.language === language);
    const matchesCat = (category === 'all') || (note.type === category);
    return matchesLang && matchesCat;
  });

  renderNotes(filtered);
  updateButtonCounts(searchResults.map(r => r.item));
}

function renderNotes(notesWithMetadata) {
  const container = document.getElementById('notesContainer');
  container.innerHTML = '';

  if (notesWithMetadata.length === 0) {
    container.innerHTML = `
      <div class="no-results-box">
        <p>No grammar entries match your search criteria.</p>
        <button class="reset-btn" onclick="resetFilters()">Clear Search & Filters</button>
      </div>
    `;
    return;
  }

  const query = filterState.query;

  notesWithMetadata.forEach(entry => {
    const note = entry.item ? entry.item : entry;
    const matches = entry.matches || [];

    const matchesByKey = {};
    matches.forEach(m => { matchesByKey[m.key] = m.indices; });

    const titleText = matchesByKey.title 
      ? highlightFuseText(note.title, matchesByKey.title)
      : highlightRegexText(note.title, query);

    const descText = matchesByKey.description
      ? highlightFuseText(note.description, matchesByKey.description)
      : highlightRegexText(note.description, query);

    const card = document.createElement('article');
    card.className = `card ${note.language}`;

    let content = `
      <div class="card-header">
        <span class="badge ${note.language}">${note.language}</span>
        <span class="type-pill">${note.type ? note.type.replace('_', ' ') : ''}</span>
      </div>
      <h2>${titleText}</h2>
      ${descText ? `<p>${descText}</p>` : ''}
    `;

    if (note.formula) {
      content += `<div class="formula"><strong>Structure:</strong> ${highlightRegexText(note.formula, query)}</div>`;
    }

    if (note.meanings) {
      content += `<ul class="meaning-list">`;
      note.meanings.forEach(m => {
        content += `<li><strong>${m.sense}:</strong> <em>${m.example}</em> (${m.translation})</li>`;
      });
      content += `</ul>`;
    }

    if (note.verbs) {
      content += `<p><strong>Verbs:</strong> ${note.verbs.map(v => `<code>${v}</code>`).join(', ')}</p>`;
    }

    if (note.mnemonic) {
      content += `<div class="mnemonic"><strong>Memory Hook:</strong> ${note.mnemonic}</div>`;
    }

    if (note.table) {
      content += buildTableHTML(note.table);
    }

    if (note.examples && note.examples.length > 0) {
      content += `<div class="examples-list">`;
      note.examples.forEach(ex => {
        content += `<div class="example-item"><em>${ex.text}</em> — "${ex.translation}"</div>`;
      });
      content += `</div>`;
    }

    if (note.tags) {
      content += `<div class="tags">${note.tags.map(t => `<span class="tag">#${highlightRegexText(t, query)}</span>`).join('')}</div>`;
    }

    card.innerHTML = content;
    container.appendChild(card);
  });
}

function buildTableHTML(tableData) {
  let html = `<table class="paradigm-table"><thead><tr>`;
  tableData.headers.forEach(h => html += `<th>${h}</th>`);
  html += `</tr></thead><tbody>`;
  tableData.rows.forEach(row => {
    html += `<tr>`;
    row.forEach(cell => html += `<td>${cell}</td>`);
    html += `</tr>`;
  });
  return html + `</tbody></table>`;
}

function highlightFuseText(text, matches) {
  if (!matches || matches.length === 0 || !text) return text;
  const sortedIndices = [...matches].sort((a, b) => b[0] - a[0]);
  let highlighted = text;

  sortedIndices.forEach(([start, end]) => {
    const matchSegment = highlighted.substring(start, end + 1);
    highlighted = highlighted.substring(0, start) + `<mark class="highlight">${matchSegment}</mark>` + highlighted.substring(end + 1);
  });
  return highlighted;
}

function highlightRegexText(text, query) {
  if (!query || !text) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return text.replace(regex, '<mark class="highlight">$1</mark>');
}

function updateButtonCounts(queryMatches) {
  const { language, category } = filterState;

  document.querySelectorAll('.lang-btn').forEach(btn => {
    const btnLang = btn.getAttribute('data-language');
    const count = queryMatches.filter(note => {
      const matchLang = (btnLang === 'all') || (note.language === btnLang);
      const matchCat = (category === 'all') || (note.type === category);
      return matchLang && matchCat;
    }).length;
    setButtonBadge(btn, count);
  });

  document.querySelectorAll('.cat-btn').forEach(btn => {
    const btnCat = btn.getAttribute('data-category');
    const count = queryMatches.filter(note => {
      const matchLang = (language === 'all') || (note.language === language);
      const matchCat = (btnCat === 'all') || (note.type === btnCat);
      return matchLang && matchCat;
    }).length;
    setButtonBadge(btn, count);
  });
}

function setButtonBadge(btn, count) {
  let badge = btn.querySelector('.count-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'count-badge';
    btn.appendChild(badge);
  }
  badge.textContent = `[${count}]`;
  btn.classList.toggle('empty', count === 0 && !btn.classList.contains('active'));
}

function resetFilters() {
  filterState.language = 'all';
  filterState.category = 'all';
  filterState.query = '';

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-language') === 'all'));
  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-category') === 'all'));

  filterAndRender();
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterState.query = e.target.value.toLowerCase().trim();
      filterAndRender();
    });
  }

  const modal = document.getElementById('noteModal');
  const openBtn = document.getElementById('openModalBtn');
  const closeBtn = document.getElementById('closeModalBtn');
  const form = document.getElementById('addNoteForm');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => modal.classList.add('open'));
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  }

  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }
}

function handleFormSubmit(e) {
  e.preventDefault();

  const lang = document.getElementById('noteLanguage').value;
  const type = document.getElementById('noteType').value;
  const title = document.getElementById('noteTitle').value.trim();
  const description = document.getElementById('noteDescription').value.trim();
  const formula = document.getElementById('noteFormula').value.trim();
  const rawExamples = document.getElementById('noteExamples').value.trim();
  const rawTags = document.getElementById('noteTags').value.trim();

  const examples = rawExamples ? rawExamples.split('\n').map(line => {
    const parts = line.split('|');
    return {
      text: parts[0] ? parts[0].trim() : '',
      translation: parts[1] ? parts[1].trim() : ''
    };
  }).filter(ex => ex.text) : [];

  const tags = rawTags ? rawTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [lang, type];

  const newNote = {
    id: `${lang.slice(0, 3)}-${type}-${Date.now()}`,
    type: type,
    language: lang,
    title: title,
    description: description,
    ...(formula && { formula: formula }),
    ...(examples.length > 0 && { examples: examples }),
    tags: tags
  };

  allNotes.unshift(newNote);
  initFuse(allNotes);
  filterAndRender();

  exportLanguageJson(lang);

  e.target.reset();
  document.getElementById('noteModal').classList.remove('open');
}

function exportLanguageJson(language) {
  const filteredNotes = allNotes.filter(note => note.language === language);
  const jsonString = JSON.stringify(filteredNotes, null, 2);
  
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${language}-notes.json`;
  document.body.appendChild(link);
  link.click();
  
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

let allNotes = [];
let fuseInstance = null;
let editingId = null;
let lastActiveInput = null;

const filterState = {
  language: 'all',
  category: 'all',
  tag: 'all',
  query: ''
};

const GREEK_DIACRITICS = [
  'ά', 'έ', 'ή', 'ί', 'ό', 'ύ', 'ώ',
  'ὰ', 'ὲ', 'ὴ', 'ὶ', 'ὸ', 'ὺ', 'ὼ',
  'ᾶ', 'ῆ', 'ῖ', 'ῦ',
  'ἁ', 'ἑ', 'ἡ', 'ἱ', 'ὁ', 'ὑ', 'ὡ',
  'ᾳ', 'ῃ', 'ῳ'
];

document.addEventListener('DOMContentLoaded', async () => {
  renderGreekToolbars();
  setupEventListeners();

  try {
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
  } catch (error) {
    console.warn('Could not fetch JSON files, initializing with fallback sample data:', error);
    allNotes = [
      {
        id: 'lat-syntax-1',
        language: 'latin',
        type: 'syntax',
        title: 'Ablative Absolute',
        description: 'A noun and participle in the ablative case functioning independently from the main clause.',
        formula: 'Noun (Abl.) + Participle (Abl.)',
        examples: [{ text: 'Urbe capta, duces discesserunt.', translation: 'The city having been captured, the leaders departed.' }],
        tags: ['ablative', 'participle', 'syntax']
      },
      {
        id: 'grk-syntax-2',
        language: 'greek',
        type: 'syntax',
        title: 'Genitive Absolute',
        description: 'Equivalent to the Latin Ablative Absolute; features a noun and participle in the genitive case.',
        formula: 'Noun (Gen.) + Participle (Gen.)',
        examples: [{ text: 'τοῦ βασιλέως λέγοντος', translation: 'While the king was speaking' }],
        tags: ['genitive', 'participle', 'syntax']
      }
    ];
  }

  initFuse(allNotes);
  renderTagFilters();
  filterAndRender();
});

function initFuse(notes) {
  if (typeof Fuse === 'undefined') return;
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

document.addEventListener('focusin', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    lastActiveInput = e.target;
  }
});

function renderGreekToolbars() {
  const containers = [
    document.getElementById('searchGreekToolbar'),
    document.getElementById('modalGreekToolbar')
  ];

  containers.forEach(container => {
    if (!container) return;

    let html = `<span class="greek-toolbar-label">Greek:</span>`;
    GREEK_DIACRITICS.forEach(char => {
      html += `<button type="button" class="greek-char-btn" data-char="${char}">${char}</button>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.greek-char-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        insertGreekChar(btn.getAttribute('data-char'));
      });
    });
  });
}

function insertGreekChar(char) {
  const input = lastActiveInput || document.getElementById('searchInput');
  if (!input) return;

  input.focus();
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const val = input.value;

  input.value = val.substring(0, start) + char + val.substring(end);
  const newPos = start + char.length;
  input.setSelectionRange(newPos, newPos);

  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterState.query = e.target.value.toLowerCase().trim();
      filterAndRender();
    });
  }

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

  const modal = document.getElementById('noteModal');
  const openBtn = document.getElementById('openModalBtn');
  const closeBtn = document.getElementById('closeModalBtn');
  const form = document.getElementById('addNoteForm');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      editingId = null;
      if (form) form.reset();
      const modalHeader = modal.querySelector('h2');
      if (modalHeader) modalHeader.textContent = 'Add New Grammar Note';
      modal.classList.add('open');
    });
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

  document.getElementById('exportLatinBtn')?.addEventListener('click', () => exportLanguageJson('latin'));
  document.getElementById('exportGreekBtn')?.addEventListener('click', () => exportLanguageJson('greek'));
}

function renderTagFilters() {
  const container = document.getElementById('tagFilterContainer');
  if (!container) return;

  const tagSet = new Set();
  allNotes.forEach(note => {
    if (note.tags && Array.isArray(note.tags)) {
      note.tags.forEach(t => tagSet.add(t.toLowerCase()));
    }
  });

  const sortedTags = Array.from(tagSet).sort();

  let html = `<button class="tag-btn ${filterState.tag === 'all' ? 'active' : ''}" data-tag="all">#all</button>`;
  
  sortedTags.forEach(tag => {
    const isActive = filterState.tag === tag ? 'active' : '';
    html += `<button class="tag-btn ${isActive}" data-tag="${tag}">#${tag}</button>`;
  });

  if (filterState.tag !== 'all') {
    html += `<button id="clearTagBtn" class="clear-tag-btn" onclick="clearActiveTag()">✕ Clear #${filterState.tag}</button>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clickedTag = e.currentTarget.getAttribute('data-tag');
      filterState.tag = (filterState.tag === clickedTag) ? 'all' : clickedTag;
      renderTagFilters();
      filterAndRender();
    });
  });
}

function filterAndRender() {
  const { language, category, tag, query } = filterState;

  let searchResults = [];
  if (query && fuseInstance) {
    searchResults = fuseInstance.search(query);
  } else {
    searchResults = allNotes.map(note => ({ item: note, matches: [] }));
  }

  const filtered = searchResults.filter(result => {
    const note = result.item;
    const matchesLang = (language === 'all') || (note.language === language);
    const matchesCat = (category === 'all') || (note.type === category || note.category === category);
    const matchesTag = (tag === 'all') || (note.tags && note.tags.map(t => t.toLowerCase()).includes(tag));

    return matchesLang && matchesCat && matchesTag;
  });

  renderNotes(filtered);
  updateButtonCounts(searchResults.map(r => r.item));
}

function renderNotes(notesWithMetadata) {
  const container = document.getElementById('notesContainer');
  if (!container) return;
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
        <div class="header-left">
          <span class="badge ${note.language}">${note.language}</span>
          <span class="type-pill">${(note.type || note.category || '').replace('_', ' ')}</span>
        </div>
        <div class="card-actions">
          <button class="card-btn edit-btn" onclick="openEditModal('${note.id}')">Edit</button>
          <button class="card-btn delete-btn" onclick="deleteNote('${note.id}')">Delete</button>
        </div>
      </div>
      <h2>${titleText}</h2>
      ${descText ? `<p>${descText}</p>` : ''}
    `;

    if (note.formula) {
      content += `<div class="formula"><strong>Structure:</strong> ${highlightRegexText(note.formula, query)}</div>`;
    }

    if (note.meanings && note.meanings.length > 0) {
      content += `<ul class="meaning-list">`;
      note.meanings.forEach(m => {
        content += `<li><strong>${m.sense}:</strong> <em>${m.example}</em> (${m.translation})</li>`;
      });
      content += `</ul>`;
    }

    if (note.verbs && note.verbs.length > 0) {
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
        const textStr = typeof ex === 'string' ? ex : `${ex.text} | ${ex.translation}`;
        const parts = textStr.split('|');
        const orig = parts[0] ? parts[0].trim() : '';
        const trans = parts[1] ? parts[1].trim() : '';
        content += `<div class="example-item"><em>${highlightRegexText(orig, query)}</em> ${trans ? `— "${highlightRegexText(trans, query)}"` : ''}</div>`;
      });
      content += `</div>`;
    }

    if (note.tags && note.tags.length > 0) {
      content += `<div class="tags">${note.tags.map(t => {
        const rawTag = t.toLowerCase();
        const isActive = (filterState.tag === rawTag) ? 'active' : '';
        return `<span class="tag clickable-tag ${isActive}" onclick="filterByTag('${rawTag}')">#${highlightRegexText(t, query)}</span>`;
      }).join('')}</div>`;
    }

    card.innerHTML = content;
    container.appendChild(card);
  });
}

function buildTableHTML(tableData) {
  if (!tableData || !tableData.headers || !tableData.rows) return '';
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
  const { language, category, tag } = filterState;

  document.querySelectorAll('.lang-btn').forEach(btn => {
    const btnLang = btn.getAttribute('data-language');
    const count = queryMatches.filter(note => {
      const matchLang = (btnLang === 'all') || (note.language === btnLang);
      const matchCat = (category === 'all') || (note.type === category || note.category === category);
      const matchTag = (tag === 'all') || (note.tags && note.tags.map(t => t.toLowerCase()).includes(tag));
      return matchLang && matchCat && matchTag;
    }).length;
    setButtonBadge(btn, count);
  });

  document.querySelectorAll('.cat-btn').forEach(btn => {
    const btnCat = btn.getAttribute('data-category');
    const count = queryMatches.filter(note => {
      const matchLang = (language === 'all') || (note.language === language);
      const matchCat = (btnCat === 'all') || (note.type === btnCat || note.category === btnCat);
      const matchTag = (tag === 'all') || (note.tags && note.tags.map(t => t.toLowerCase()).includes(tag));
      return matchLang && matchCat && matchTag;
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
  badge.textContent = ` [${count}]`;
  btn.classList.toggle('empty', count === 0 && !btn.classList.contains('active'));
}

function resetFilters() {
  filterState.language = 'all';
  filterState.category = 'all';
  filterState.tag = 'all';
  filterState.query = '';

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-language') === 'all'));
  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-category') === 'all'));

  renderTagFilters();
  filterAndRender();
}

window.filterByTag = function(tagName) {
  filterState.tag = (filterState.tag === tagName) ? 'all' : tagName;
  renderTagFilters();

  const contentSection = document.querySelector('.content');
  if (contentSection) {
    contentSection.scrollIntoView({ behavior: 'smooth' });
  }

  filterAndRender();
};

window.clearActiveTag = function() {
  filterState.tag = 'all';
  renderTagFilters();
  filterAndRender();
};

window.openEditModal = function(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;

  editingId = id;
  const modal = document.getElementById('noteModal');
  if (!modal) return;

  document.getElementById('noteLanguage').value = note.language;
  document.getElementById('noteType').value = note.type || note.category;
  document.getElementById('noteTitle').value = note.title;
  document.getElementById('noteDescription').value = note.description;
  document.getElementById('noteFormula').value = note.formula || '';
  document.getElementById('noteTags').value = note.tags ? note.tags.join(', ') : '';

  if (note.examples && note.examples.length > 0) {
    document.getElementById('noteExamples').value = note.examples
      .map(ex => typeof ex === 'string' ? ex : `${ex.text} | ${ex.translation}`)
      .join('\n');
  } else {
    document.getElementById('noteExamples').value = '';
  }

  const modalHeader = modal.querySelector('h2');
  if (modalHeader) modalHeader.textContent = 'Edit Grammar Note';
  modal.classList.add('open');
};

window.deleteNote = function(id) {
  const note = allNotes.find(n => n.id === id);
  if (!note) return;

  if (confirm(`Are you sure you want to delete "${note.title}"?`)) {
    const lang = note.language;
    allNotes = allNotes.filter(n => n.id !== id);

    initFuse(allNotes);
    renderTagFilters();
    filterAndRender();

    if (shouldAutoExport()) {
      exportLanguageJson(lang);
    }
  }
};

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

  if (editingId) {
    const index = allNotes.findIndex(n => n.id === editingId);
    if (index !== -1) {
      allNotes[index] = {
        ...allNotes[index],
        language: lang,
        type: type,
        category: type,
        title: title,
        description: description,
        formula: formula || undefined,
        examples: examples.length > 0 ? examples : undefined,
        tags: tags
      };
    }
  } else {
    const newNote = {
      id: `${lang.slice(0, 3)}-${type}-${Date.now()}`,
      type: type,
      category: type,
      language: lang,
      title: title,
      description: description,
      ...(formula && { formula: formula }),
      ...(examples.length > 0 && { examples: examples }),
      tags: tags
    };
    allNotes.unshift(newNote);
  }

  initFuse(allNotes);
  renderTagFilters();
  filterAndRender();

  if (shouldAutoExport()) {
    exportLanguageJson(lang);
  }

  editingId = null;
  e.target.reset();
  const modal = document.getElementById('noteModal');
  if (modal) modal.classList.remove('open');
}

function shouldAutoExport() {
  const toggle = document.getElementById('autoExportToggle');
  return toggle ? toggle.checked : false;
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

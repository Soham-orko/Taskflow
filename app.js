/**
 * TaskFlow — Main Application
 * ═══════════════════════════════════════════════════════════════
 * Features: CRUD · priorities · due dates · tags · custom lists
 *           drag-to-reorder · search · filter · sort · dark mode
 *           localStorage persistence · toast notifications
 *           keyboard shortcuts · progress ring · animated cards
 * ═══════════════════════════════════════════════════════════════
 */

/* ══════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════ */
const CIRC        = 2 * Math.PI * 24;           // SVG ring circumference ≈ 150.8
const PRIO_ORDER  = { high: 0, medium: 1, low: 2 };
const PRIO_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };
const VIEW_TITLES = {
  all: 'All Tasks', today: 'Today', upcoming: 'Upcoming',
  starred: 'Starred', done: 'Completed'
};
const PALETTE = [
  '#7c3aed','#dc2626','#2563eb','#d97706',
  '#16a34a','#db2777','#0891b2','#ea580c'
];
const DEFAULT_LISTS = [
  { id: 'personal', name: 'Personal', color: '#7c3aed' },
  { id: 'work',     name: 'Work',     color: '#2563eb' },
  { id: 'shopping', name: 'Shopping', color: '#16a34a' },
];

/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
const S = {
  tasks      : [],
  lists      : [],
  view       : 'all',       // all | today | upcoming | starred | done | list:ID
  prio       : '',          // '' | high | medium | low
  sort       : 'created',   // created | due | priority | alpha
  search     : '',
  theme      : 'light',
  editId     : null,
  deleteId   : null,
  pendingTags: [],
};

/* ══════════════════════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════════════════════ */
const $   = id  => document.getElementById(id);
const $$  = sel => document.querySelectorAll(sel);
const mk  = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const txt = (id, v) => { const e=$(id); if(e) e.textContent = String(v ?? ''); };

/* ══════════════════════════════════════════════════════
   PERSISTENCE
══════════════════════════════════════════════════════ */
function save() {
  localStorage.setItem('tf_tasks',  JSON.stringify(S.tasks));
  localStorage.setItem('tf_lists',  JSON.stringify(S.lists));
  localStorage.setItem('tf_theme',  S.theme);
}

function load() {
  S.tasks = JSON.parse(localStorage.getItem('tf_tasks') || 'null');
  S.lists = JSON.parse(localStorage.getItem('tf_lists') || 'null');
  S.theme = localStorage.getItem('tf_theme') || 'light';

  // First-time: seed defaults
  if (!S.lists) {
    S.lists = [...DEFAULT_LISTS];
  }
  if (!S.tasks) {
    const today = todayStr();
    S.tasks = [
      mkTask('Welcome to TaskFlow! 🎉',
        'Click the ✓ checkbox to complete me. Use ✏️ to edit.',
        'high', today, 'personal', ['welcome']),
      mkTask('Try adding a new task',
        'Click the purple + button or press Ctrl+N.',
        'medium', null, 'work', ['tutorial']),
      mkTask('Drag tasks to reorder',
        'Grab the ⋮⋮ handle on the left of any card and drag.',
        'low', null, 'personal', []),
      mkTask('Star important tasks ⭐',
        'Click the ☆ icon on a card to pin it to "Starred".',
        'medium', null, 'personal', ['tip']),
    ];
    S.tasks[2].starred = true;               // pre-star one task
    S.tasks[3].done    = true;               // pre-complete one task
  }
}

/* ══════════════════════════════════════════════════════
   UTILITY
══════════════════════════════════════════════════════ */
function uid()      { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function todayStr() { return new Date().toISOString().slice(0,10); }

function mkTask(title, desc, priority, due, listId, tags) {
  return {
    id: uid(), title, desc: desc || '', priority,
    due: due || null, listId, tags: tags || [],
    done: false, starred: false, createdAt: Date.now()
  };
}

function isToday(d)    { return !!d && d === todayStr(); }
function isUpcoming(d) {
  if (!d) return false;
  return d > todayStr();
}
function isOverdue(d)  { return !!d && d < todayStr(); }

function fmtDue(d) {
  if (!d) return null;
  if (isToday(d))  return '📅 Today';
  const diff = Math.round((new Date(d+'T12:00:00') - new Date()) / 86400000);
  if (diff === 1)  return '📅 Tomorrow';
  if (diff === -1) return '⚠ Yesterday';
  return '📅 ' + new Date(d+'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getListName(id) {
  return S.lists.find(l => l.id === id)?.name || '';
}
function getListColor(id) {
  return S.lists.find(l => l.id === id)?.color || '#7c3aed';
}

/* ══════════════════════════════════════════════════════
   FILTER & SORT
══════════════════════════════════════════════════════ */
function getFiltered() {
  let tasks = [...S.tasks];

  // ── Text search ──
  if (S.search) {
    const q = S.search.toLowerCase();
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.desc.toLowerCase().includes(q)  ||
      t.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }

  // ── View ──
  switch (S.view) {
    case 'today'   : tasks = tasks.filter(t => isToday(t.due)   && !t.done); break;
    case 'upcoming': tasks = tasks.filter(t => isUpcoming(t.due)&& !t.done); break;
    case 'starred' : tasks = tasks.filter(t => t.starred        && !t.done); break;
    case 'done'    : tasks = tasks.filter(t => t.done);                      break;
    default:
      if (S.view.startsWith('list:')) {
        const lid = S.view.slice(5);
        tasks = tasks.filter(t => t.listId === lid);
      } else {
        // 'all' — no extra filter
      }
  }

  // ── Priority chip ──
  if (S.prio) tasks = tasks.filter(t => t.priority === S.prio);

  // ── Sort ──
  tasks.sort((a, b) => {
    switch (S.sort) {
      case 'due':
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1; if (!b.due) return -1;
        return a.due.localeCompare(b.due);
      case 'priority':
        return PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
      case 'alpha':
        return a.title.localeCompare(b.title);
      default: // created
        return b.createdAt - a.createdAt;
    }
  });

  // Completed tasks always at bottom (except in "done" view)
  if (S.view !== 'done') {
    return [
      ...tasks.filter(t => !t.done),
      ...tasks.filter(t => t.done),
    ];
  }
  return tasks;
}

/* ══════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════ */
function toast(msg, type = 'info') {
  const icons = { success:'✅', error:'❌', warn:'⚠️', info:'ℹ️' };
  const t = mk('div', `toast t-${type}`, `${icons[type] || 'ℹ️'} ${msg}`);
  $('toastWrap').appendChild(t);
  setTimeout(() => {
    t.classList.add('t-out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, 2800);
}

/* ══════════════════════════════════════════════════════
   RENDER — TASKS
══════════════════════════════════════════════════════ */
function renderTasks() {
  const list  = $('taskList');
  const empty = $('emptyState');
  const tasks = getFiltered();

  list.innerHTML = '';

  if (!tasks.length) {
    list.style.display = 'none';
    empty.style.display = 'flex';
    setEmptyMsg();
  } else {
    list.style.display = 'flex';
    empty.style.display = 'none';

    const active = tasks.filter(t => !t.done);
    const done   = tasks.filter(t =>  t.done);

    active.forEach((task, i) => {
      const card = buildCard(task, i);
      list.appendChild(card);
    });

    if (done.length && S.view !== 'done') {
      const divider = mk('div','done-divider', `✅ Completed · ${done.length}`);
      list.appendChild(divider);
      done.forEach((task, i) => {
        const card = buildCard(task, active.length + i);
        list.appendChild(card);
      });
    } else if (S.view === 'done') {
      done.forEach((task, i) => {
        const card = buildCard(task, i);
        list.appendChild(card);
      });
    }
  }

  updateStats();
  updateBadges();
  updateRing();
  reinitDrag();
}

function buildCard(task, idx) {
  const pc = task.priority === 'high' ? 'ph' : task.priority === 'medium' ? 'pm' : 'pl';
  const overdue = !task.done && isOverdue(task.due);
  const dueTxt  = fmtDue(task.due);

  const card = mk('div', `task-card ${pc}${task.done ? ' is-done' : ''}`);
  card.dataset.id = task.id;
  card.style.animationDelay = `${idx * 28}ms`;
  card.setAttribute('role', 'listitem');

  card.innerHTML = `
    <!-- Drag handle -->
    <div class="drag-handle" title="Drag to reorder">
      <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
        <circle cx="4" cy="4" r="1.8"/><circle cx="10" cy="4" r="1.8"/>
        <circle cx="4" cy="10" r="1.8"/><circle cx="10" cy="10" r="1.8"/>
        <circle cx="4" cy="16" r="1.8"/><circle cx="10" cy="16" r="1.8"/>
      </svg>
    </div>

    <!-- Checkbox -->
    <label class="cb-wrap" title="${task.done ? 'Mark active' : 'Mark complete'}">
      <input type="checkbox" class="cb-inp" ${task.done ? 'checked' : ''}>
      <span class="cb-box">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5">
          <path d="M5 12l5 5L20 7"/>
        </svg>
      </span>
    </label>

    <!-- Content -->
    <div class="card-body">
      <div class="card-title-row">
        <span class="card-title">${esc(task.title)}</span>
        <span class="prio-pill ${pc}" aria-label="Priority: ${PRIO_LABELS[task.priority]}">
          ${task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🔵'}
          ${PRIO_LABELS[task.priority]}
        </span>
      </div>
      ${task.desc ? `<p class="card-desc">${esc(task.desc)}</p>` : ''}
      <div class="card-meta">
        ${dueTxt  ? `<span class="meta-chip${overdue ? ' overdue' : ''}">${dueTxt}</span>` : ''}
        ${task.listId ? `
          <span class="meta-chip">
            <span style="width:7px;height:7px;border-radius:50%;background:${getListColor(task.listId)};display:inline-block"></span>
            ${esc(getListName(task.listId))}
          </span>` : ''}
        ${overdue ? '<span class="meta-chip overdue">⚠ Overdue</span>' : ''}
      </div>
      ${task.tags.length ? `
        <div class="card-tags">
          ${task.tags.map(t => `<span class="card-tag">#${esc(t)}</span>`).join('')}
        </div>` : ''}
    </div>

    <!-- Actions -->
    <div class="card-acts" aria-label="Task actions">
      <button class="act star ${task.starred ? 'on' : ''}"
              title="${task.starred ? 'Unstar' : 'Star'}" aria-label="${task.starred ? 'Unstar' : 'Star'}">
        ${task.starred ? '⭐' : '☆'}
      </button>
      <button class="act edit" title="Edit" aria-label="Edit task">✏️</button>
      <button class="act del"  title="Delete" aria-label="Delete task">🗑️</button>
    </div>
  `;

  // Wire up card events
  card.querySelector('.cb-inp').addEventListener('change', e => {
    e.stopPropagation();
    toggleDone(task.id, e.target.checked, card);
  });
  card.querySelector('.star').addEventListener('click', e => {
    e.stopPropagation(); toggleStar(task.id);
  });
  card.querySelector('.edit').addEventListener('click', e => {
    e.stopPropagation(); openModal(task.id);
  });
  card.querySelector('.del').addEventListener('click', e => {
    e.stopPropagation(); confirmDelete(task.id);
  });

  return card;
}

function setEmptyMsg() {
  const msgs = {
    all      : ['Nothing here yet',       'Press + to add your first task'],
    today    : ['Clear schedule today 🎉', 'Tasks due today will appear here'],
    upcoming : ['All caught up!',          'Tasks with future due dates appear here'],
    starred  : ['No starred tasks',        'Click ☆ on a task to star it'],
    done     : ['Nothing completed yet',   'Finish tasks to see them here'],
  };
  const key = S.view.startsWith('list:') ? 'all' : S.view;
  const [h, p] = msgs[key] || msgs.all;
  txt('emptyH', S.search ? 'No results found' : h);
  txt('emptyP', S.search ? `No tasks match "${S.search}"` : p);
}

/* ══════════════════════════════════════════════════════
   RENDER — SIDEBAR LISTS
══════════════════════════════════════════════════════ */
function renderSidebarLists() {
  const nav = $('listsNav');
  nav.innerHTML = '';

  S.lists.forEach(list => {
    const count = S.tasks.filter(t => t.listId === list.id && !t.done).length;
    const isAct = S.view === 'list:' + list.id;
    const li    = document.createElement('li');

    const btn = mk('button', `list-btn${isAct ? ' active' : ''}`, `
      <span class="list-dot" style="background:${list.color}"></span>
      <span class="list-n">${esc(list.name)}</span>
      <span class="list-cnt">${count || ''}</span>
      <button class="list-del" data-id="${list.id}" aria-label="Delete ${list.name} list">×</button>
    `);

    btn.addEventListener('click', e => {
      if (e.target.classList.contains('list-del')) {
        deleteList(e.target.dataset.id);
      } else {
        setView('list:' + list.id, list.name);
        closeMobileSidebar();
      }
    });
    li.appendChild(btn);
    nav.appendChild(li);
  });

  // Keep <fList> select in sync
  populateListSelect();
}

function populateListSelect() {
  const sel = $('fList');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = S.lists
    .map(l => `<option value="${l.id}">${esc(l.name)}</option>`)
    .join('');
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

/* ══════════════════════════════════════════════════════
   STATS, BADGES, PROGRESS RING
══════════════════════════════════════════════════════ */
function updateStats() {
  const all    = S.tasks.length;
  const done   = S.tasks.filter(t => t.done).length;
  const active = all - done;
  const over   = S.tasks.filter(t => !t.done && isOverdue(t.due)).length;
  txt('stTotal', all);
  txt('stActive', active);
  txt('stDone',   done);
  txt('stOver',   over);
}

function updateBadges() {
  txt('bAll',      S.tasks.filter(t => !t.done).length);
  txt('bToday',    S.tasks.filter(t => isToday(t.due) && !t.done).length);
  txt('bUpcoming', S.tasks.filter(t => isUpcoming(t.due) && !t.done).length);
  txt('bStarred',  S.tasks.filter(t => t.starred && !t.done).length);
  txt('bDone',     S.tasks.filter(t => t.done).length);
}

function updateRing() {
  const todayTasks = S.tasks.filter(t => isToday(t.due));
  const doneCnt    = todayTasks.filter(t => t.done).length;
  const total      = todayTasks.length;
  const pct        = total ? Math.round((doneCnt / total) * 100) : 0;

  const arc = $('spArc');
  if (arc) arc.style.strokeDashoffset = CIRC - (CIRC * pct / 100);
  txt('spPct',    `${pct}%`);
  txt('spDetail', `${doneCnt} of ${total} done`);
}

/* ══════════════════════════════════════════════════════
   TASK CRUD
══════════════════════════════════════════════════════ */
function addTask(data) {
  const task = mkTask(data.title, data.desc, data.priority, data.due, data.listId, data.tags);
  S.tasks.unshift(task);
  save();
  renderAll();
  toast('Task added!', 'success');
}

function updateTask(id, data) {
  const t = S.tasks.find(t => t.id === id);
  if (!t) return;
  t.title    = data.title;
  t.desc     = data.desc;
  t.priority = data.priority;
  t.due      = data.due || null;
  t.listId   = data.listId;
  t.tags     = data.tags;
  save();
  renderAll();
  toast('Task updated!', 'success');
}

function toggleDone(id, done, cardEl) {
  const t = S.tasks.find(t => t.id === id);
  if (!t) return;
  t.done = done;
  if (done) t.doneAt = Date.now(); else delete t.doneAt;
  save();

  // Animate card out then re-render
  if (cardEl) {
    cardEl.style.transition = 'opacity .28s ease, transform .28s ease';
    cardEl.style.opacity    = '0';
    cardEl.style.transform  = 'scale(.97)';
    setTimeout(renderAll, 280);
  } else {
    renderAll();
  }

  toast(done ? '✅ Task completed!' : 'Task reopened', done ? 'success' : 'info');
}

function toggleStar(id) {
  const t = S.tasks.find(t => t.id === id);
  if (!t) return;
  t.starred = !t.starred;
  save();
  renderAll();
}

function deleteTask(id) {
  const card = document.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.style.transition  = 'opacity .22s ease, transform .22s ease, max-height .3s ease, padding .3s ease, margin .3s ease';
    card.style.opacity     = '0';
    card.style.transform   = 'translateX(24px)';
    const h = card.offsetHeight;
    card.style.maxHeight   = h + 'px';
    setTimeout(() => {
      card.style.maxHeight = '0';
      card.style.padding   = '0';
      card.style.margin    = '0';
      card.style.overflow  = 'hidden';
    }, 60);
    setTimeout(() => {
      S.tasks = S.tasks.filter(t => t.id !== id);
      save();
      renderAll();
    }, 350);
  } else {
    S.tasks = S.tasks.filter(t => t.id !== id);
    save();
    renderAll();
  }
  toast('Task deleted', 'warn');
}

/* ══════════════════════════════════════════════════════
   LIST CRUD
══════════════════════════════════════════════════════ */
function addList(name) {
  const color = PALETTE[S.lists.length % PALETTE.length];
  S.lists.push({ id: uid(), name: name.trim(), color });
  save();
  renderSidebarLists();
  toast(`List "${name}" created`, 'success');
}

function deleteList(id) {
  const name = S.lists.find(l => l.id === id)?.name;
  // Reassign tasks to Personal
  S.tasks.forEach(t => { if (t.listId === id) t.listId = 'personal'; });
  S.lists = S.lists.filter(l => l.id !== id);
  if (S.view === 'list:' + id) setView('all');
  save();
  renderAll();
  toast(`List "${name}" deleted`, 'warn');
}

/* ══════════════════════════════════════════════════════
   MODAL — OPEN / CLOSE / SAVE
══════════════════════════════════════════════════════ */
function openModal(editId = null) {
  S.editId       = editId;
  S.pendingTags  = [];
  const task     = editId ? S.tasks.find(t => t.id === editId) : null;
  const isEdit   = !!task;

  txt('modalHeading', isEdit ? 'Edit Task' : 'New Task');
  txt('saveTaskLbl',  isEdit ? 'Update Task' : 'Save Task');

  // Fill form
  $('fTitle').value    = task?.title    || '';
  $('fDesc').value     = task?.desc     || '';
  $('fPriority').value = task?.priority || 'medium';
  $('fDue').value      = task?.due      || '';
  $('fDue').min        = todayStr();
  S.pendingTags        = [...(task?.tags || [])];

  populateListSelect();
  if (task) $('fList').value = task.listId;

  updateCounter();
  renderTagPills();

  $('taskBD').classList.add('open');
  setTimeout(() => $('fTitle').focus(), 160);
}

function closeModal() {
  $('taskBD').classList.remove('open');
  S.editId      = null;
  S.pendingTags = [];
}

function saveTask() {
  const title = $('fTitle').value.trim();
  if (!title) {
    $('fTitle').classList.add('fi-error');
    $('fTitle').focus();
    $('fTitle').addEventListener('input', () => $('fTitle').classList.remove('fi-error'), { once: true });
    toast('Please enter a task title', 'error');
    return;
  }
  const data = {
    title   : title,
    desc    : $('fDesc').value.trim(),
    priority: $('fPriority').value,
    due     : $('fDue').value || null,
    listId  : $('fList').value,
    tags    : [...S.pendingTags],
  };
  if (S.editId) updateTask(S.editId, data);
  else          addTask(data);
  closeModal();
}

/* ── Tag helpers ── */
function pushTag(raw) {
  const tag = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!tag || S.pendingTags.includes(tag) || S.pendingTags.length >= 5) return;
  S.pendingTags.push(tag);
  renderTagPills();
  $('fTag').value = '';
}

function renderTagPills() {
  const row = $('fTagsRow');
  row.innerHTML = S.pendingTags.map((tag, i) => `
    <span class="m-tag">
      #${esc(tag)}
      <button class="m-tag-x" data-i="${i}" aria-label="Remove tag ${tag}">×</button>
    </span>`).join('');
  row.querySelectorAll('.m-tag-x').forEach(b => {
    b.addEventListener('click', () => {
      S.pendingTags.splice(+b.dataset.i, 1);
      renderTagPills();
    });
  });
}

function updateCounter() {
  const n = $('fTitle').value.length;
  txt('fCounter', `${n}/100`);
  const el = $('fCounter');
  if (el) el.style.color = n > 80 ? 'var(--p-hi)' : '';
}

/* ══════════════════════════════════════════════════════
   DELETE CONFIRM
══════════════════════════════════════════════════════ */
function confirmDelete(id) {
  S.deleteId = id;
  $('delBD').classList.add('open');
}
function closeDeleteModal() {
  $('delBD').classList.remove('open');
  S.deleteId = null;
}

/* ══════════════════════════════════════════════════════
   VIEW SWITCHING
══════════════════════════════════════════════════════ */
function setView(view, customLabel) {
  S.view = view;

  // Update active state on sidebar nav buttons
  $$('.sb-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.list-btn').forEach(b => {
    const lid = 'list:' + b.querySelector('.list-del')?.dataset.id;
    b.classList.toggle('active', lid === view);
  });

  // Update page title
  txt('viewTitle', customLabel || VIEW_TITLES[view] || 'Tasks');

  renderTasks();
}

/* ══════════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════════ */
function applyTheme(theme) {
  S.theme = theme;
  document.documentElement.dataset.theme = theme;
  txt('themeIco', theme === 'dark' ? '☀️' : '🌙');
  save();
}

/* ══════════════════════════════════════════════════════
   SIDEBAR — MOBILE
══════════════════════════════════════════════════════ */
function openMobileSidebar() {
  $('sidebar').classList.add('open');
  $('mobOverlay').classList.add('show');
}
function closeMobileSidebar() {
  $('sidebar').classList.remove('open');
  $('mobOverlay').classList.remove('show');
}

/* ══════════════════════════════════════════════════════
   DRAG-AND-DROP  (SortableJS)
══════════════════════════════════════════════════════ */
let sortable = null;

function reinitDrag() {
  if (!window.Sortable) return;
  if (sortable) sortable.destroy();
  sortable = Sortable.create($('taskList'), {
    animation   : 200,
    ghostClass  : 'drag-ghost',
    handle      : '.drag-handle',
    onEnd       : () => {
      // Read new DOM order of visible task IDs
      const orderedIds = [...$('taskList').querySelectorAll('[data-id]')]
        .map(el => el.dataset.id);
      const visible    = new Set(getFiltered().map(t => t.id));
      const byId       = Object.fromEntries(S.tasks.map(t => [t.id, t]));

      // Rebuild master array: replace visible items in their new order,
      // keep invisible (filtered-out) items in original relative position
      const reordered = orderedIds.filter(id => byId[id]);
      let   ri = 0;
      S.tasks = S.tasks.map(t =>
        visible.has(t.id) ? byId[reordered[ri++]] || t : t
      );
      save();
    }
  });
}

/* ══════════════════════════════════════════════════════
   RENDER ALL
══════════════════════════════════════════════════════ */
function renderAll() {
  renderTasks();
  renderSidebarLists();
}

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
function init() {
  // Load persisted data
  load();

  // Apply saved theme
  applyTheme(S.theme);

  // Initial render
  renderAll();

  /* ── MODAL events ── */
  $('modalX'    ).addEventListener('click', closeModal);
  $('cancelTask').addEventListener('click', closeModal);
  $('saveTask'  ).addEventListener('click', saveTask);
  $('taskBD'    ).addEventListener('click', e => { if (e.target === $('taskBD')) closeModal(); });

  // Save on Enter in title input
  $('fTitle').addEventListener('keydown', e => { if (e.key === 'Enter') saveTask(); });

  // Character counter
  $('fTitle').addEventListener('input', updateCounter);

  // Tag input
  $('fTag').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      pushTag($('fTag').value);
    }
  });

  /* ── DELETE CONFIRM events ── */
  $('cancelDel' ).addEventListener('click', closeDeleteModal);
  $('confirmDel').addEventListener('click', () => {
    if (S.deleteId) deleteTask(S.deleteId);
    closeDeleteModal();
  });
  $('delBD').addEventListener('click', e => { if (e.target === $('delBD')) closeDeleteModal(); });

  /* ── FAB + sidebar new task ── */
  $('fabBtn'  ).addEventListener('click', () => openModal());
  $('sbNewBtn').addEventListener('click', () => { openModal(); closeMobileSidebar(); });
  $('emptyAdd').addEventListener('click', () => openModal());

  /* ── Sidebar nav (static views) ── */
  $$('.sb-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      setView(btn.dataset.view);
      closeMobileSidebar();
    });
  });

  /* ── Add list ── */
  $('addListBtn').addEventListener('click', () => {
    const name = prompt('New list name:');
    if (name?.trim()) addList(name);
  });

  /* ── Search ── */
  $('searchInput').addEventListener('input', e => {
    S.search = e.target.value.trim();
    renderTasks();
  });

  /* ── Priority chips ── */
  $$('.chip[data-prio]').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.chip[data-prio]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      S.prio = chip.dataset.prio;
      renderTasks();
    });
  });

  /* ── Sort ── */
  $('sortSel').addEventListener('change', e => {
    S.sort = e.target.value;
    renderTasks();
  });

  /* ── Theme ── */
  $('themeBtn').addEventListener('click', () => {
    applyTheme(S.theme === 'dark' ? 'light' : 'dark');
  });

  /* ── Mobile sidebar ── */
  $('hamBtn'     ).addEventListener('click', openMobileSidebar);
  $('sbClose'    ).addEventListener('click', closeMobileSidebar);
  $('mobOverlay' ).addEventListener('click', closeMobileSidebar);

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const inInput = ['INPUT','TEXTAREA','SELECT'].includes(tag);

    if (e.key === 'Escape') {
      closeModal();
      closeDeleteModal();
      closeMobileSidebar();
    }
    if (!inInput && (e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault(); openModal();
    }
    if (!inInput && (e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault(); $('searchInput').focus();
    }
    // Number keys 1-5 for quick view switching when not in input
    if (!inInput && !e.ctrlKey && !e.metaKey) {
      const viewKeys = { '1':'all','2':'today','3':'upcoming','4':'starred','5':'done' };
      if (viewKeys[e.key]) setView(viewKeys[e.key]);
    }
  });
}

/* ── Entry point ── */
document.addEventListener('DOMContentLoaded', init);

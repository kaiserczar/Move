import { BOTTOMS, HEADS, SKINS, TOPS } from './avatar/parts.js';
import { renderThumb } from './avatar/avatar.js';
import { MAX_PLAYERS, PLAYER_COLORS, save, state } from './state.js';

// focus = crop window for the thumbnail, in mannequin units
const CATEGORIES = [
  { key: 'head', label: 'Head', items: HEADS, focus: { x: 50, y: 15, size: 38 } },
  { key: 'top', label: 'Top', items: TOPS, focus: { x: 50, y: 60, size: 70 } },
  { key: 'bottom', label: 'Bottom', items: BOTTOMS, focus: { x: 50, y: 117, size: 80 } },
];

const rand = (n) => Math.floor(Math.random() * n);

export function initUI({ onMirrorChange, onModelChange, onHandsChange }) {
  const playersEl = document.getElementById('players');
  const partsEl = document.getElementById('parts');

  const tabs = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const btn = document.createElement('button');
    btn.className = 'player-tab';
    btn.style.setProperty('--c', PLAYER_COLORS[i]);
    btn.innerHTML = `<span class="dot"></span><span class="name">P${i + 1}</span><span class="status">Not in view</span>`;
    btn.addEventListener('click', () => selectPlayer(i));
    playersEl.append(btn);
    tabs.push(btn);
  }

  const thumbs = [];
  const nameEls = {};
  for (const cat of CATEGORIES) {
    const group = document.createElement('div');
    group.className = 'part-group';
    group.innerHTML = `<div class="part-head"><h3>${cat.label}</h3><span class="part-name"></span></div><div class="part-grid"></div>`;
    const grid = group.querySelector('.part-grid');
    nameEls[cat.key] = group.querySelector('.part-name');
    cat.items.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.className = 'part-option';
      btn.title = item.name;
      btn.setAttribute('aria-label', `${cat.label}: ${item.name}`);
      const canvas = document.createElement('canvas');
      const label = document.createElement('span');
      label.textContent = item.name;
      btn.append(canvas, label);
      btn.addEventListener('click', () => { current()[cat.key] = idx; changed(); });
      grid.append(btn);
      thumbs.push({ canvas, btn, cat, idx });
    });
    partsEl.append(group);
  }

  // Skin tone swatches
  const skinGroup = document.createElement('div');
  skinGroup.className = 'part-group';
  skinGroup.innerHTML = '<div class="part-head"><h3>Skin</h3></div><div class="skin-row"></div>';
  const skinBtns = SKINS.map((color, idx) => {
    const b = document.createElement('button');
    b.className = 'skin-swatch';
    b.style.background = color;
    b.setAttribute('aria-label', `Skin tone ${idx + 1}`);
    b.addEventListener('click', () => { current().skin = idx; changed(); });
    skinGroup.querySelector('.skin-row').append(b);
    return b;
  });
  partsEl.append(skinGroup);

  function current() { return state.players[state.selected]; }
  function changed() { save(); refresh(); }
  function selectPlayer(i) {
    if (i === state.selected) return;
    state.selected = i;
    changed();
  }

  function refresh() {
    document.documentElement.style.setProperty('--accent', PLAYER_COLORS[state.selected]);
    document.getElementById('editing').textContent = `P${state.selected + 1}`;
    tabs.forEach((t, i) => t.classList.toggle('selected', i === state.selected));
    const cfg = current();
    for (const t of thumbs) {
      t.btn.classList.toggle('selected', cfg[t.cat.key] === t.idx);
      renderThumb(t.canvas, { ...cfg, [t.cat.key]: t.idx }, t.cat.focus);
    }
    for (const cat of CATEGORIES) nameEls[cat.key].textContent = cat.items[cfg[cat.key]]?.name ?? '';
    skinBtns.forEach((b, i) => b.classList.toggle('selected', cfg.skin === i));
  }

  document.getElementById('randomize').addEventListener('click', () => {
    const cfg = current();
    for (const cat of CATEGORIES) cfg[cat.key] = rand(cat.items.length);
    cfg.skin = rand(SKINS.length);
    changed();
  });

  document.querySelectorAll('[data-display]').forEach((input) => {
    const key = input.dataset.display;
    input.checked = !!state.display[key];
    input.addEventListener('change', () => {
      state.display[key] = input.checked;
      save();
      if (key === 'mirror') onMirrorChange?.();
      if (key === 'hands') onHandsChange?.();
    });
  });

  const model = document.getElementById('model');
  model.value = state.display.model;
  model.addEventListener('change', () => {
    state.display.model = model.value;
    save();
    onModelChange?.();
  });

  // Keys 1-4 switch which player you're editing.
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= MAX_PLAYERS) selectPlayer(n - 1);
  });

  // Tab status: "In view", or hand states in on-screen order when hand tracking is on.
  const GLYPH = { open: '✋', closed: '✊' };
  let lastStatus = '';
  function setPlayerStatus(players, { hands, mirror }) {
    const status = Array(MAX_PLAYERS).fill(null);
    for (const p of players) {
      if (!hands) { status[p.id] = 'In view'; continue; }
      const order = mirror ? ['left', 'right'] : ['right', 'left'];
      status[p.id] = order.map((side) => GLYPH[p.hands?.[side]?.state] ?? '·').join(' ');
    }
    const key = status.join('|');
    if (key === lastStatus) return;
    lastStatus = key;
    tabs.forEach((t, i) => {
      t.classList.toggle('active', status[i] != null);
      t.querySelector('.status').textContent = status[i] ?? 'Not in view';
    });
  }

  refresh();
  return { refresh, selectPlayer, setPlayerStatus };
}

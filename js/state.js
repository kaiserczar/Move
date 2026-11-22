export const MAX_PLAYERS = 4;
export const PLAYER_COLORS = ['#ff5a6e', '#3fa7ff', '#ffc531', '#4cd98a'];

const KEY = 'move.state.v1';

const DEFAULTS = {
  selected: 0,
  players: [
    { head: 0, top: 0, bottom: 0, skin: 0 },
    { head: 1, top: 1, bottom: 4, skin: 2 },
    { head: 2, top: 2, bottom: 2, skin: 1 },
    { head: 3, top: 4, bottom: 3, skin: 3 },
  ],
  display: { camera: true, skeleton: true, avatar: true, hands: true, angles: false, mirror: true, model: 'lite' },
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      return {
        selected: Number.isInteger(saved.selected) ? saved.selected : 0,
        players: DEFAULTS.players.map((p, i) => ({ ...p, ...(saved.players?.[i] ?? {}) })),
        display: { ...DEFAULTS.display, ...(saved.display ?? {}) },
      };
    }
  } catch { /* storage blocked or corrupt: fall back to defaults */ }
  return structuredClone(DEFAULTS);
}

export const state = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

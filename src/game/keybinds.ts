// ── Key binding system ──
// All configurable key bindings are defined here.

export interface KeyBindings {
  moveForward: string;
  moveBackward: string;
  moveLeft: string;
  moveRight: string;
  jump: string;
  openInventory: string;
  throwItem: string;
  throwItemAll: string;   // Ctrl modifier
  hotbar1: string;
  hotbar2: string;
  hotbar3: string;
  hotbar4: string;
  hotbar5: string;
  hotbar6: string;
  hotbar7: string;
  hotbar8: string;
  hotbar9: string;
  debugOverlay: string;
  settings: string;
}

export const DEFAULT_KEYBINDS: KeyBindings = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  openInventory: 'KeyE',
  throwItem: 'KeyQ',
  throwItemAll: 'KeyQ',   // same key, Ctrl+Q
  hotbar1: 'Digit1',
  hotbar2: 'Digit2',
  hotbar3: 'Digit3',
  hotbar4: 'Digit4',
  hotbar5: 'Digit5',
  hotbar6: 'Digit6',
  hotbar7: 'Digit7',
  hotbar8: 'Digit8',
  hotbar9: 'Digit9',
  debugOverlay: 'F3',
  settings: 'Escape',
};

/** Check if a keyboard event matches a binding. For throwItemAll, caller must also check Ctrl. */
export function isKey(e: KeyboardEvent, binding: string): boolean {
  return e.code === binding;
}

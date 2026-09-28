import { registerSW } from 'virtual:pwa-register';

/**
 * Keeps the installed game up to date. Phones like to resume the app from the background instead
 * of opening it anew, so the browser never looked for a new version. Now it looks whenever the app
 * comes back to the front and every few minutes, and a new version is applied as soon as the
 * player is in the menu (never during a race or in a room).
 */
let apply: ((reload?: boolean) => Promise<void>) | null = null;
let ready = false;
let isSafe: () => boolean = () => false;
const CHECK_EVERY_MS = 5 * 60 * 1000;

export function setupUpdates(safe: () => boolean) {
  isSafe = safe;
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      ready = true;
      applyUpdateIfSafe();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (navigator.onLine) reg.update().catch(() => undefined);
      };
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}

/** True when a new version is downloaded and waits for the menu. */
export function updateWaiting(): boolean {
  return ready;
}

const UPDATE_FLAG = 'rr-updated';

/** Call when the player reaches a calm place (the menu): reloads into the new version. */
export function applyUpdateIfSafe() {
  if (!ready || !apply || !isSafe()) return;
  // the reload is no fresh start: no intro film afterwards
  try {
    sessionStorage.setItem(UPDATE_FLAG, '1');
  } catch {
    // storage blocked: the intro simply plays once more
  }
  void apply(true);
}

/** True (once) right after the app reloaded into a new version. */
export function reloadedForUpdate(): boolean {
  try {
    const was = sessionStorage.getItem(UPDATE_FLAG) === '1';
    sessionStorage.removeItem(UPDATE_FLAG);
    return was;
  } catch {
    return false;
  }
}

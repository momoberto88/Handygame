import { sfx } from '../audio/sfx';

/**
 * The intro film ("Die Krone des Königs", made in tools/intro/) in a video layer over the game.
 * Phones only allow sound after a tap, so the first time it waits on a big start button (that tap
 * also switches on the game sound). "Überspringen" ends it at any time; a missing or broken video
 * simply skips it.
 */
const SOURCES: [string, string][] = [
  [`${import.meta.env.BASE_URL}assets/video/intro.mp4`, 'video/mp4'],
  // for browsers without H.264 (e.g. open-source Chromium builds)
  [`${import.meta.env.BASE_URL}assets/video/intro.webm`, 'video/webm'],
];
const POSTER = `${import.meta.env.BASE_URL}assets/video/intro-poster.jpg`;

function button(text: string, css: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.style.cssText =
    'position:absolute;font:700 18px system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1a2f;background:#ffd84a;' +
    'border:3px solid #1d1a2f;border-radius:14px;padding:8px 16px;box-shadow:0 4px 0 #1d1a2f;cursor:pointer;' +
    '-webkit-tap-highlight-color:transparent;' +
    css;
  return b;
}

/** Plays the intro; resolves when it has ended or was skipped. `tapToStart` for the very first start. */
export function playIntro(tapToStart: boolean): Promise<void> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:50;background:#1d1a2f;display:flex;align-items:center;justify-content:center;';
    const video = document.createElement('video');
    for (const [src, type] of SOURCES) {
      const source = document.createElement('source');
      source.src = src;
      source.type = type;
      video.append(source);
    }
    video.poster = POSTER;
    video.preload = 'auto';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#1d1a2f;';
    const skip = button('Überspringen ⏭', 'top:14px;right:14px;font-size:16px;padding:6px 12px;opacity:0.9;');
    wrap.append(video, skip);
    document.body.append(wrap);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.pause();
      video.replaceChildren();
      video.load();
      wrap.remove();
      resolve();
    };
    const start = () => {
      sfx.unlock();
      // the game's music would play over the film's own sound
      sfx.stopMusic(0.2);
      video.play().catch(finish);
    };
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    video.lastElementChild?.addEventListener('error', finish);
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.unlock();
      finish();
    });

    if (tapToStart) {
      const play = button('▶  Intro ansehen', 'left:50%;top:50%;transform:translate(-50%,-50%);font-size:26px;padding:14px 28px;');
      wrap.append(play);
      play.addEventListener('click', (e) => {
        e.stopPropagation();
        play.remove();
        start();
      });
    } else {
      start();
    }
  });
}

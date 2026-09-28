import Phaser from 'phaser';
import { CHARACTERS } from '../meta/characters';
import { makeCharacterArt, makeEyes } from '../render/art/characterArt';
import { makeEntityArt, preloadObjectArt } from '../render/art/entityArt';
import { preloadPainted } from '../render/art/skins';
import { preloadWorldArt } from '../render/art/worldArt';
import { FX_SPRITES } from '../render/Effects';
import { sharedTrackFromUrl } from './EditorScene';
import { loadSave, writeSave } from '../meta/save';
import { playIntro } from '../ui/intro';
import { HAND, MARKER } from '../render/film/kit';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    preloadPainted(this);
    preloadWorldArt(this);
    preloadObjectArt(this);
    this.load.image('brand-title', 'assets/brand/title.png');
    for (const f of FX_SPRITES) this.load.image(`fx-${f}`, `assets/fx/${f}.png`);
    this.load.image('brand-emblem', 'assets/brand/emblem.png');
  }

  create() {
    // the hand-lettering of the coronation after a cup: fetch it now, so it is ready by then
    for (const font of [HAND, MARKER]) void document.fonts?.load(`40px ${font}`).catch(() => undefined);
    makeEyes(this);
    for (const c of CHARACTERS) makeCharacterArt(this, c);
    makeEntityArt(this);
    const shared = sharedTrackFromUrl();
    if (shared) {
      this.scene.start('editor', { id: shared, message: 'Strecke empfangen! Tippe „Probelauf“ oder speichere sie mit „Prüfen & Speichern“.' });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const next = () => this.scene.start(params.has('lineup') ? 'lineup' : 'menu');
    if (showIntro(params)) {
      void playIntro(true).then(() => {
        writeSave((s) => (s.introSeen = true));
        next();
      });
      return;
    }
    next();
  }
}

/**
 * The intro plays by itself only on the very first start – not for a friend who opens an invitation
 * (they want into the room), and not in automated tests (unless asked for with ?intro).
 */
function showIntro(params: URLSearchParams): boolean {
  if (params.has('intro')) return true;
  if (loadSave().introSeen || navigator.webdriver) return false;
  return !['raum', 'autoplay', 'lineup', 'course', 'world'].some((k) => params.has(k));
}

import Phaser from 'phaser';
import { CHARACTERS } from '../meta/characters';
import { makeCharacterArt, makeEyes } from '../render/art/characterArt';
import { makeEntityArt, preloadObjectArt } from '../render/art/entityArt';
import { preloadPainted } from '../render/art/skins';
import { preloadWorldArt } from '../render/art/worldArt';
import { sharedTrackFromUrl } from './EditorScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    preloadPainted(this);
    preloadWorldArt(this);
    preloadObjectArt(this);
    this.load.image('brand-title', 'assets/brand/title.png');
    this.load.image('brand-emblem', 'assets/brand/emblem.png');
  }

  create() {
    makeEyes(this);
    for (const c of CHARACTERS) makeCharacterArt(this, c);
    makeEntityArt(this);
    const shared = sharedTrackFromUrl();
    if (shared) {
      this.scene.start('editor', { id: shared, message: 'Strecke empfangen! Tippe „Probelauf“ oder speichere sie mit „Prüfen & Speichern“.' });
      return;
    }
    this.scene.start(new URLSearchParams(window.location.search).has('lineup') ? 'lineup' : 'menu');
  }
}

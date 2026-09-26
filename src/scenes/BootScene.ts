import Phaser from 'phaser';
import { CHARACTERS } from '../meta/characters';
import { makeCharacterArt, makeEyes } from '../render/art/characterArt';
import { makeEntityArt, preloadObjectArt } from '../render/art/entityArt';
import { preloadPainted } from '../render/art/skins';
import { preloadWorldArt } from '../render/art/worldArt';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    preloadPainted(this);
    preloadWorldArt(this);
    preloadObjectArt(this);
  }

  create() {
    makeEyes(this);
    for (const c of CHARACTERS) makeCharacterArt(this, c);
    makeEntityArt(this);
    this.scene.start('menu');
  }
}

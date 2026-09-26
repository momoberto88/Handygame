import Phaser from 'phaser';
import { CHARACTERS } from '../meta/characters';
import { makeCharacterArt, makeEyes } from '../render/art/characterArt';
import { makeEntityArt } from '../render/art/entityArt';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    makeEyes(this);
    for (const c of CHARACTERS) makeCharacterArt(this, c);
    makeEntityArt(this);
    this.scene.start('menu');
  }
}

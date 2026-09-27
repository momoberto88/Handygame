import { loadSave } from '../meta/save';
import { sfx } from './sfx';

/** Puts the sound settings from the save (on/off, volumes) into the mixer. */
export function applyAudioSettings() {
  const s = loadSave().settings;
  sfx.enabled = s.sound;
  sfx.musicOn = s.music && s.volMusic > 0;
  sfx.setLevel('music', s.volMusic);
  sfx.setLevel('sfx', s.volSfx);
  sfx.setLevel('voice', s.volVoice);
  sfx.refreshMusic();
}

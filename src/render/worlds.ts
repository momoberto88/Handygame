import type { WorldId } from '../sim/types';

export interface WorldTheme {
  id: WorldId;
  name: string;
  skyTop: string;
  skyBottom: string;
  far: string;
  mid: string;
  near: string;
  groundTop: string;
  groundTopDark: string;
  ground: string;
  groundDark: string;
  groundSpeck: string;
  platform: string;
  outline: string;
  wall: string;
  wallGlow: string;
}

export const WORLDS: Record<WorldId, WorldTheme> = {
  jungle: {
    id: 'jungle',
    name: 'Dschungeltempel',
    skyTop: '#8fd3c7',
    skyBottom: '#e8f3c4',
    far: '#7bb39a',
    mid: '#4f8a5b',
    near: '#2f6040',
    groundTop: '#78c043',
    groundTopDark: '#4b8a2a',
    ground: '#9a6b43',
    groundDark: '#6e4a2c',
    groundSpeck: '#b88a5c',
    platform: '#8a6a44',
    outline: '#2b1d10',
    wall: '#3a1f4a',
    wallGlow: '#b86bff',
  },
  mine: {
    id: 'mine',
    name: 'Zahnrad-Mine',
    skyTop: '#3a2a22',
    skyBottom: '#7a5236',
    far: '#4c3526',
    mid: '#634532',
    near: '#2a1c14',
    groundTop: '#b58a52',
    groundTopDark: '#80592e',
    ground: '#6d625a',
    groundDark: '#4a423c',
    groundSpeck: '#8a7f75',
    platform: '#a0703e',
    outline: '#1e140e',
    wall: '#221018',
    wallGlow: '#ff7a3a',
  },
  sky: {
    id: 'sky',
    name: 'Himmelsinseln',
    skyTop: '#5fb4ff',
    skyBottom: '#d8f0ff',
    far: '#bfe0f7',
    mid: '#8cc26a',
    near: '#5a9a48',
    groundTop: '#8ad44f',
    groundTopDark: '#5aa332',
    ground: '#b58b5e',
    groundDark: '#8a6440',
    groundSpeck: '#caa276',
    platform: '#9a7446',
    outline: '#2b2014',
    wall: '#2a2f5a',
    wallGlow: '#8fe3ff',
  },
  neon: {
    id: 'neon',
    name: 'Neon-Stadt',
    skyTop: '#140c2e',
    skyBottom: '#3b1a5c',
    far: '#23164a',
    mid: '#2e1f5c',
    near: '#130a26',
    groundTop: '#35e0ff',
    groundTopDark: '#1a8fb3',
    ground: '#3a3f58',
    groundDark: '#262a3d',
    groundSpeck: '#4c5372',
    platform: '#ff4fb8',
    outline: '#0a0714',
    wall: '#0c0418',
    wallGlow: '#ff3fa6',
  },
};

export const WORLD_ORDER: WorldId[] = ['jungle', 'mine', 'sky', 'neon'];

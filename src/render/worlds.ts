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
  water: {
    id: 'water',
    name: 'Versunkener Tempel',
    skyTop: '#0e5f73',
    skyBottom: '#3fb5b0',
    far: '#1b7a82',
    mid: '#15606a',
    near: '#0b3d45',
    groundTop: '#f07a8a',
    groundTopDark: '#b84a62',
    ground: '#4f8a7c',
    groundDark: '#356358',
    groundSpeck: '#6fae9c',
    platform: '#8aa39a',
    outline: '#0e2a2a',
    wall: '#081a2a',
    wallGlow: '#6ff0ff',
  },
  pirates: {
    id: 'pirates',
    name: 'Luftpiraten',
    skyTop: '#6fb8ff',
    skyBottom: '#ffe0b0',
    far: '#c9def0',
    mid: '#9ab8d8',
    near: '#6d86a8',
    groundTop: '#c68a4a',
    groundTopDark: '#8a5a2a',
    ground: '#7a4e2c',
    groundDark: '#55361e',
    groundSpeck: '#9a6a3c',
    platform: '#a8743e',
    outline: '#2a1a0e',
    wall: '#2a1c3a',
    wallGlow: '#ffd24a',
  },
  desert: {
    id: 'desert',
    name: 'Wüstenruinen',
    skyTop: '#f5b86a',
    skyBottom: '#fde6b0',
    far: '#e8b27a',
    mid: '#d2955a',
    near: '#a86a3a',
    groundTop: '#f2cf7a',
    groundTopDark: '#c9a052',
    ground: '#c8904e',
    groundDark: '#9a6a36',
    groundSpeck: '#deb070',
    platform: '#b8864a',
    outline: '#3a2410',
    wall: '#3a1e10',
    wallGlow: '#ffb04a',
  },
  shroom: {
    id: 'shroom',
    name: 'Pilz-Kristallhöhle',
    skyTop: '#1a1440',
    skyBottom: '#3a2a6a',
    far: '#2a2458',
    mid: '#3a2f70',
    near: '#150f30',
    groundTop: '#3fe0c8',
    groundTopDark: '#1f9a8a',
    ground: '#4a3a78',
    groundDark: '#302456',
    groundSpeck: '#6a58a8',
    platform: '#3fb8c8',
    outline: '#0c0820',
    wall: '#0a0618',
    wallGlow: '#c77dff',
  },
};

export const WORLD_ORDER: WorldId[] = ['jungle', 'mine', 'sky', 'neon', 'water', 'pirates', 'desert', 'shroom'];

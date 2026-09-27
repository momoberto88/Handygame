// Tunes for tools/flute-play.mjs. All public domain (composers dead for well over 70 years, or
// traditional). Notes as "C5:1" (pitch:beats, one beat = a quarter), "R" is a rest, "|" just helps
// reading. `transpose` moves the whole tune (semitones), `legato` is how much of each slot sounds,
// `mess` how bad the player is, `escalate` makes it fall apart towards the end, `cleanStart` how
// many first notes stay right so the tune is recognised.
export const TUNES = {
  // ---- 1st place: party ------------------------------------------------------------------------
  cancan: {
    title: 'Can-Can (Offenbach)',
    bpm: 168,
    legato: 0.8,
    notes: `C5:1 C5:.5 D5:.5 | F5:.5 E5:.5 D5:.5 G5:.5 | G5:1 G5:.5 A5:.5 | E5:.5 F5:.5 D5:.5 D5:.5 |
            D5:1 D5:.5 F5:.5 | E5:.5 D5:.5 C5:.5 C6:.5 | B5:.5 A5:.5 G5:.5 F5:.5 | E5:.5 D5:.5 C5:1`,
  },
  cucaracha: {
    title: 'La Cucaracha (Volkslied)',
    bpm: 190,
    legato: 0.8,
    notes: `G4:.5 G4:.5 G4:.5 C5:1 E5:1.5 | G4:.5 G4:.5 G4:.5 C5:1 E5:1.5 |
            C5:.5 C5:.5 B4:.5 B4:.5 A4:.5 A4:.5 G4:2`,
    transpose: 5,
  },
  // ---- 2nd / 3rd place: hectic ----------------------------------------------------------------
  turca: {
    title: 'Türkischer Marsch (Mozart)',
    bpm: 132,
    legato: 0.85,
    notes: `B4:.25 A4:.25 G#4:.25 A4:.25 C5:.5 R:.5 | D5:.25 C5:.25 B4:.25 C5:.25 E5:.5 R:.5 |
            F5:.25 E5:.25 D#5:.25 E5:.25 B5:.25 A5:.25 G#5:.25 A5:.25 | B5:.25 A5:.25 G#5:.25 A5:.25 C6:1`,
  },
  entertainer: {
    title: 'The Entertainer (Joplin)',
    bpm: 100,
    legato: 0.8,
    notes: `D4:.25 D#4:.25 | E4:.25 C5:.5 E4:.25 C5:.5 E4:.25 C5:1.25 R:.25 |
            C5:.25 D5:.25 D#5:.25 E5:.25 C5:.25 D5:.25 E5:.5 B4:.25 D5:.5 C5:1.5`,
    transpose: 7,
  },
  mountainking: {
    title: 'In der Halle des Bergkönigs (Grieg)',
    bpm: 150,
    legato: 0.75,
    notes: `B3:.5 C#4:.5 D4:.5 E4:.5 F#4:.5 D4:.5 F#4:1 | F4:.5 C#4:.5 F4:1 E4:.5 C4:.5 E4:1 |
            B3:.5 C#4:.5 D4:.5 E4:.5 F#4:.5 D4:.5 F#4:.5 B4:.5 | A4:.5 F#4:.5 D4:.5 F#4:.5 A4:2 |
            B3:.3 C#4:.3 D4:.3 E4:.3 F#4:.3 D4:.3 F#4:.6 | F4:.3 C#4:.3 F4:.6 E4:.3 C4:.3 E4:.6 |
            B3:.3 C#4:.3 D4:.3 E4:.3 F#4:.3 D4:.3 F#4:.3 B4:.3 | A4:.3 F#4:.3 D4:.3 F#4:.3 B3:1.2`,
    transpose: 12,
  },
  bumblebee: {
    title: 'Hummelflug (Rimski-Korsakow)',
    bpm: 84,
    legato: 0.9,
    cleanStart: 8,
    notes: `E5:.25 D#5:.25 D5:.25 C#5:.25 D5:.25 C#5:.25 C5:.25 B4:.25 | C5:.25 B4:.25 Bb4:.25 A4:.25 G#4:.25 G4:.25 F#4:.25 F4:.25 |
            E4:.25 D#4:.25 D4:.25 C#4:.25 C4:.25 F4:.25 E4:.25 D#4:.25 | E4:.25 D#4:.25 D4:.25 C#4:.25 C4:.25 F4:.25 E4:.25 D#4:.25 | E4:1`,
    transpose: 7,
  },
  fuchs: {
    title: 'Fuchs, du hast die Gans gestohlen (Kinderlied)',
    bpm: 170,
    legato: 0.85,
    notes: `C5:1 D5:1 E5:1 F5:1 | G5:1 G5:1 G5:1 G5:1 | A5:1 F5:1 C6:1 A5:1 | G5:4 | A5:1 F5:1 C6:1 A5:1 | G5:4 |
            G5:1 F5:1 F5:1 F5:1 | F5:1 E5:1 E5:1 E5:1 | E5:1 D5:1 E5:1 D5:1 | C5:4`,
    transpose: -2,
  },
  entchen: {
    title: 'Alle meine Entchen (Kinderlied)',
    bpm: 180,
    legato: 0.85,
    notes: `C5:1 D5:1 E5:1 F5:1 | G5:2 G5:2 | A5:1 A5:1 A5:1 A5:1 | G5:4 | A5:1 A5:1 A5:1 A5:1 | G5:4 |
            F5:1 F5:1 F5:1 F5:1 | E5:2 E5:2 | D5:1 D5:1 D5:1 D5:1 | C5:4`,
  },
  // ---- last place: mockery --------------------------------------------------------------------
  funeral: {
    title: 'Trauermarsch (Chopin)',
    bpm: 58,
    legato: 0.92,
    cleanStart: 6,
    notes: `Bb4:1 Bb4:.75 Bb4:.25 Bb4:1 R:.5 | Db5:.75 C5:.25 C5:.75 Bb4:.25 Bb4:.75 A4:.25 Bb4:1.5`,
  },
  trombone: {
    title: 'Wah wah wah waaah',
    bpm: 100,
    legato: 0.95,
    cleanStart: 4,
    notes: `G4:1 F#4:1 F4:1 E4:3`,
    transpose: 12,
  },
  // ---- cup ceremony: long, recognisable, falls apart ------------------------------------------
  ode: {
    title: 'Ode an die Freude (Beethoven)',
    bpm: 150,
    legato: 0.9,
    escalate: true,
    cleanStart: 8,
    notes: `E5:1 E5:1 F5:1 G5:1 | G5:1 F5:1 E5:1 D5:1 | C5:1 C5:1 D5:1 E5:1 | E5:1.5 D5:.5 D5:2 |
            E5:1 E5:1 F5:1 G5:1 | G5:1 F5:1 E5:1 D5:1 | C5:1 C5:1 D5:1 E5:1 | D5:1.5 C5:.5 C5:2 |
            D5:1 D5:1 E5:1 C5:1 | D5:1 E5:.5 F5:.5 E5:1 C5:1 | D5:1 E5:.5 F5:.5 E5:1 D5:1 | C5:1 D5:1 G4:2 |
            E5:1 E5:1 F5:1 G5:1 | G5:1 F5:1 E5:1 D5:1 | C5:1 C5:1 D5:1 E5:1 | D5:1.5 C5:.5 C5:3`,
  },
  saints: {
    title: 'When the Saints Go Marching In (traditionell)',
    bpm: 200,
    legato: 0.85,
    escalate: true,
    cleanStart: 8,
    notes: `C5:1 E5:1 F5:1 | G5:5 | C5:1 E5:1 F5:1 | G5:5 | C5:1 E5:1 F5:1 G5:2 E5:2 | C5:2 E5:2 D5:5 |
            E5:1 E5:1 D5:1 | C5:3 C5:1 E5:2 | G5:2 G5:1 F5:5 | E5:1 F5:1 G5:2 E5:2 | C5:2 D5:2 C5:5`,
  },
  hallelujah: {
    title: 'Halleluja (Händel)',
    bpm: 108,
    legato: 0.88,
    escalate: true,
    cleanStart: 8,
    notes: `D5:1 A4:.75 B4:.25 A4:1 R:1 | D5:1 A4:.75 B4:.25 A4:1 R:1 |
            A4:.5 A4:.25 B4:.25 A4:.5 R:.5 A4:.5 A4:.25 B4:.25 A4:.5 R:.5 |
            A4:.5 A4:.25 B4:.25 A4:.5 A4:.5 A4:.25 B4:.25 A4:.5 R:.5 |
            D5:2 E5:2 F#5:2 G5:2 A5:3 R:1 |
            D5:1 A4:.75 B4:.25 A4:1 R:1 | D5:1 A4:.75 B4:.25 A4:1 D5:3`,
  },
};

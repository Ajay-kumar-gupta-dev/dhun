// Run with:  node tests/notation.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const N = require('../js/notation.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

// ---- spelling ----
const MAJOR_SCALES = {
  C:  'C D E F G A B',
  Db: 'Db Eb F Gb Ab Bb C',
  D:  'D E F# G A B C#',
  Eb: 'Eb F G Ab Bb C D',
  E:  'E F# G# A B C# D#',
  F:  'F G A Bb C D E',
  'F#': 'F# G# A# B C# D# E#',
  G:  'G A B C D E F#',
  Ab: 'Ab Bb C Db Eb F G',
  A:  'A B C# D E F# G#',
  Bb: 'Bb C D Eb F G A',
  B:  'B C# D# E F# G# A#'
};
test('all 12 major scales are spelled correctly', () => {
  assert.deepStrictEqual(N.KEYS.slice().sort(), Object.keys(MAJOR_SCALES).sort());
  N.KEYS.forEach(k => assert.strictEqual(N.keyScale(k).join(' '), MAJOR_SCALES[k], k));
});
test('every scale uses each letter exactly once', () => {
  N.KEYS.forEach(k => {
    const letters = N.keyScale(k).map(n => n[0]).sort().join('');
    assert.strictEqual(letters, 'ABCDEFG', k);
  });
});
test('G major: degree 7 is F#, never Gb', () => {
  assert.strictEqual(N.spellDegree('G', 7, 0), 'F#');
  assert.notStrictEqual(N.spellDegree('G', 7, 0), 'Gb');
});
test('chromatic degrees keep the letter of their degree', () => {
  assert.strictEqual(N.spellDegree('G', 3, -1), 'Bb');
  assert.strictEqual(N.spellDegree('G', 4, 1), 'C#');
  assert.strictEqual(N.spellDegree('Db', 3, -1), 'Fb');
  assert.strictEqual(N.spellDegree('C', 7, -1), 'Bb');
});
test('plain note names: no octave numbers anywhere', () => {
  N.KEYS.forEach(k => N.keyScale(k).forEach(n => assert.ok(/^[A-G](#|b)?$/.test(n), n)));
});

// ---- pitch ----
test('tonic MIDI numbers run F3..E4 in order, G is G3', () => {
  assert.strictEqual(N.tonicMidi('G'), 55);
  assert.strictEqual(N.tonicMidi('F'), 53);
  assert.strictEqual(N.tonicMidi('C'), 60);
  assert.strictEqual(N.tonicMidi('E'), 64);
});
test('octave marks move by 12 semitones', () => {
  const mid = N.parseNote('5'), hi = N.parseNote("5'"), lo = N.parseNote(',5');
  assert.strictEqual(N.midi('G', hi) - N.midi('G', mid), 12);
  assert.strictEqual(N.midi('G', mid) - N.midi('G', lo), 12);
  assert.strictEqual(N.midi('G', mid), 62); // D4
});
test('moving key moves pitch by the right interval, same numbers', () => {
  const n = N.parseNote('3');
  assert.strictEqual(N.midi('A', n) - N.midi('G', n), 2);
});

// ---- labels ----
test('number and swara labels', () => {
  const l = s => [N.numberLabel(N.parseNote(s)), N.swaraLabel(N.parseNote(s))];
  assert.deepStrictEqual(l('1'), ['1', 'Sa']);
  assert.deepStrictEqual(l("5'"), ["5'", "Pa'"]);
  assert.deepStrictEqual(l(',5'), [',5', ',Pa']);
  assert.deepStrictEqual(l('b3'), ['b3', 'ga']);
  assert.deepStrictEqual(l('#4'), ['#4', 'Ma#']);
  assert.deepStrictEqual(l('7'), ['7', 'Ni']);
});

// ---- parsing ----
test('rejects bad notes', () => {
  ['8', '5:x', "5',", 'q', '0\'', '5:0'].forEach(t => assert.throws(() => N.parseNote(t), t));
});
test('bad line is reported, shelf survives', () => {
  const r = N.parseTunes('Good | 4/4 | 100 | 1 2 3 4\nBad | 4/4 | 100 | 1 9\nJust A Title');
  assert.strictEqual(r.tunes.length, 3);
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.tunes[0].playable, true);
  assert.strictEqual(r.tunes[1].playable, false);
  assert.strictEqual(r.tunes[2].playable, false);
});
test('adding a tune is one line', () => {
  const before = N.parseTunes('A | 4/4 | 90 | 1 2 3 4').tunes.length;
  const after = N.parseTunes('A | 4/4 | 90 | 1 2 3 4\nB | 4/4 | 90 | 5 5 5:2').tunes.length;
  assert.strictEqual(after, before + 1);
});

// ---- the real data file ----
const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'tunes.js'), 'utf8');
const text = new Function('window', src + '; return window.DHUN_TUNES_TEXT;')({});
const shelf = N.parseTunes(text);
test('data file parses with no errors', () => {
  assert.deepStrictEqual(shelf.errors, []);
  assert.strictEqual(shelf.tunes.length, 52);
});
test('three tunes are written out', () => {
  assert.deepStrictEqual(shelf.tunes.filter(t => t.playable).map(t => t.title),
    ['Happy Birthday', 'Twinkle Twinkle Little Star', 'Ode to Joy']);
});
test('every written-out bar adds up to the meter (pickup aside)', () => {
  shelf.tunes.filter(t => t.playable).forEach(t => t.bars.forEach((b, i) => {
    if (b.pickup) return;
    assert.ok(Math.abs(b.beats - t.beatsPerBar) < 1e-6, t.title + ' bar ' + (i + 1) + ' has ' + b.beats);
  }));
});
test('Happy Birthday pickup + last bar make whole bars', () => {
  const t = shelf.tunes.find(x => x.title === 'Happy Birthday');
  assert.strictEqual(t.bars[0].pickup, true);
  assert.strictEqual(t.bars[0].beats, 1);
});
test('beams: two eighths in one beat are joined, dotted+sixteenth too', () => {
  const ode = shelf.tunes.find(x => x.title === 'Ode to Joy');
  const b = ode.bars[3].notes; // 3:1.5 2:.5 2:2
  assert.strictEqual(b[0].dots, 1);
  assert.strictEqual(b[1].beam, 'flag');
  const hb = shelf.tunes.find(x => x.title === 'Happy Birthday').bars[0].notes;
  assert.deepStrictEqual(hb.map(n => n.beam), ['start', 'end']);
  assert.deepStrictEqual(hb.map(n => n.level), [1, 2]);
});
test('every tune in every key stays in a playable piano range', () => {
  shelf.tunes.filter(t => t.playable).forEach(t => N.KEYS.forEach(k =>
    t.notes.forEach(n => { const m = N.midi(k, n); if (m !== null) assert.ok(m >= 40 && m <= 88, t.title + ' ' + k + ' ' + m); })));
});

console.log('\n' + passed + ' tests passed');

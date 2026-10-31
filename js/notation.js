/*
 * notation.js — the music brain of the clone. No DOM, no audio: only parsing,
 * spelling and pitch maths, so it can be unit-tested with plain Node.
 *
 * Tune line format (see data/tunes.js):
 *   Title | 4/4 | 100 | 1 1 5 5 6 6 5:2 / 4 4 3 3 2 2 1:2
 *   - fields: title | meter | bpm | music
 *   - bars are separated by "/"
 *   - a note is  [,]* [b|#] degree [']*  [:beats]
 *       degree 1-7 = Sa..Ni, 0 = rest
 *       "5'" is one octave up, ",5" one octave down (repeat for more)
 *       "b3" / "#4" are flattened / sharpened degrees
 *       ":2" = two beats; default is one beat; ":.5" = half a beat
 *   - a line with only a title is a shelf placeholder (not written out yet)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DhunNotation = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
  var MAJOR = [0, 2, 4, 5, 7, 9, 11];            // semitones above the tonic, degrees 1..7
  var SWARA = ['Sa', 're', 'Re', 'ga', 'Ga', 'Ma', 'Ma#', 'Pa', 'dha', 'Dha', 'ni', 'Ni'];

  // The twelve keys, spelled the way a teacher would write them on the board.
  var KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var DEFAULT_KEY = 'G';

  var NOTE_RE = /^(,*)([b#]?)([0-7])('*)(?::(\d*\.?\d+))?$/;

  // ---------- keys, spelling and pitch ----------

  function keyInfo(key) {
    var li = LETTERS.indexOf(key.charAt(0));
    if (li < 0) throw new Error('Unknown key "' + key + '"');
    var acc = key.slice(1) === '#' ? 1 : key.slice(1) === 'b' ? -1 : 0;
    return { letterIndex: li, pc: (NATURAL_PC[li] + acc + 12) % 12 };
  }

  function accidentalText(n) {
    if (n === 0) return '';
    var ch = n > 0 ? '#' : 'b';
    var out = '';
    for (var i = 0; i < Math.abs(n); i++) out += ch;
    return out;
  }

  /**
   * Note name of scale degree `deg` (1-7, with optional chromatic shift `acc`)
   * in `key`. The letter comes from the degree (degree 7 of G is always some
   * kind of F), and the accidental is whatever makes that letter hit the right
   * pitch. That is how F# in G major can never come out as Gb.
   */
  function spellDegree(key, deg, acc) {
    var k = keyInfo(key);
    var letterIdx = (k.letterIndex + deg - 1) % 7;
    var targetPc = (((k.pc + MAJOR[deg - 1] + (acc || 0)) % 12) + 12) % 12;
    var diff = (targetPc - NATURAL_PC[letterIdx] + 12) % 12;
    if (diff > 6) diff -= 12;
    return LETTERS[letterIdx] + accidentalText(diff);
  }

  function spell(key, note) {
    return note.rest ? '' : spellDegree(key, note.deg, note.acc);
  }

  function keyScale(key) {
    var out = [];
    for (var d = 1; d <= 7; d++) out.push(spellDegree(key, d, 0));
    return out;
  }

  // Tonic sits between MIDI 53 (F) and 64 (E), so G is G3 and the keys line up in order.
  function tonicMidi(key) {
    return 53 + ((keyInfo(key).pc - 5 + 12) % 12);
  }

  function midi(key, note) {
    if (note.rest) return null;
    return tonicMidi(key) + MAJOR[note.deg - 1] + note.acc + 12 * note.oct;
  }

  // ---------- labels shown on the board ----------

  function repeat(ch, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  function withOctave(text, oct) {
    return oct < 0 ? repeat(',', -oct) + text : text + repeat("'", oct);
  }

  function numberLabel(note) {
    if (note.rest) return '0';
    var pre = note.acc > 0 ? '#' : note.acc < 0 ? 'b' : '';
    return withOctave(pre + note.deg, note.oct);
  }

  function swaraLabel(note) {
    if (note.rest) return '';
    var semis = MAJOR[note.deg - 1] + note.acc;
    var oct = note.oct + Math.floor(semis / 12);
    return withOctave(SWARA[((semis % 12) + 12) % 12], oct);
  }

  // ---------- parsing ----------

  function parseNote(tok) {
    var m = NOTE_RE.exec(tok);
    if (!m) throw new Error('cannot read note "' + tok + '"');
    var beats = m[5] === undefined ? 1 : parseFloat(m[5]);
    if (!(beats > 0)) throw new Error('bad length in "' + tok + '"');
    var deg = parseInt(m[3], 10);
    if (deg === 0 && (m[2] || m[1] || m[4])) throw new Error('a rest takes no marks: "' + tok + '"');
    return {
      rest: deg === 0,
      deg: deg,
      acc: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0,
      oct: m[4].length - m[1].length,
      beats: beats
    };
  }

  function beatsPerBarOf(meter) {
    var m = /^(\d+)\/(\d+)$/.exec(meter);
    if (!m) throw new Error('bad meter "' + meter + '"');
    return parseInt(m[1], 10) * 4 / parseInt(m[2], 10);
  }

  // Works out stick style, beams and flags for one bar.
  function annotateBar(notes, firstPos) {
    var pos = firstPos, i, n;
    for (i = 0; i < notes.length; i++) {
      n = notes[i];
      n.posInBar = pos;
      n.level = n.beats <= 0.26 ? 2 : n.beats < 1 ? 1 : 0;
      n.dots = (n.beats < 1 ? Math.abs(n.beats - 0.75) < 1e-6 : Math.abs(n.beats % 1 - 0.5) < 1e-6) ? 1 : 0;
      n.dashes = n.beats >= 1 ? Math.max(0, Math.floor(n.beats + 1e-6) - 1) : 0;
      n.group = (n.beats < 1 && !n.rest) ? Math.floor(pos + 1e-6) : -1;
      n.beam = null;
      pos += n.beats;
    }
    i = 0;
    while (i < notes.length) {
      if (notes[i].group < 0) { i++; continue; }
      var j = i;
      while (j + 1 < notes.length && notes[j + 1].group === notes[i].group) j++;
      if (j > i) {
        for (var k = i; k <= j; k++) notes[k].beam = k === i ? 'start' : k === j ? 'end' : 'mid';
      } else {
        notes[i].beam = 'flag';
      }
      i = j + 1;
    }
  }

  function buildTune(id, title, meter, bpm, music) {
    var perBar = beatsPerBarOf(meter);
    var barTexts = music.split('/');
    var bars = [], flat = [], start = 0;
    barTexts.forEach(function (text, bi) {
      var toks = text.trim().split(/\s+/).filter(Boolean);
      if (!toks.length) return;
      var notes = toks.map(parseNote);
      var total = notes.reduce(function (s, n) { return s + n.beats; }, 0);
      var pickup = bi === 0 && barTexts.length > 1 && total < perBar - 1e-6;
      annotateBar(notes, pickup ? perBar - total : 0);
      notes.forEach(function (n) {
        n.start = start; start += n.beats;
        n.index = flat.length; flat.push(n);
      });
      bars.push({ notes: notes, pickup: pickup, beats: total });
    });
    if (!flat.length) throw new Error('no notes');
    return {
      id: id, title: title, playable: true, meter: meter, beatsPerBar: perBar,
      bpm: bpm, bars: bars, notes: flat, totalBeats: start
    };
  }

  /** Parses the whole data text. Bad lines are reported, never thrown. */
  function parseTunes(text) {
    var tunes = [], errors = [], id = 0;
    String(text).split(/\r?\n/).forEach(function (raw, ln) {
      var line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      id += 1;
      var f = line.split('|').map(function (s) { return s.trim(); });
      if (f.length === 1) {
        tunes.push({ id: id, title: f[0], playable: false });
        return;
      }
      try {
        if (f.length !== 4) throw new Error('expected title | meter | bpm | music');
        var bpm = parseFloat(f[2]);
        if (!(bpm >= 20 && bpm <= 300)) throw new Error('bpm must be 20-300');
        tunes.push(buildTune(id, f[0], f[1], bpm, f[3]));
      } catch (e) {
        errors.push('line ' + (ln + 1) + ' (' + f[0] + '): ' + e.message);
        tunes.push({ id: id, title: f[0], playable: false, broken: true });
      }
    });
    return { tunes: tunes, errors: errors };
  }

  /** Beats -> seconds events ready for the piano. */
  function toEvents(tune, key, bpm) {
    var spb = 60 / (bpm || tune.bpm);
    return tune.notes.map(function (n) {
      return { midi: midi(key, n), start: n.start * spb, dur: n.beats * spb };
    });
  }

  return {
    KEYS: KEYS, DEFAULT_KEY: DEFAULT_KEY,
    parseTunes: parseTunes, parseNote: parseNote,
    spell: spell, spellDegree: spellDegree, keyScale: keyScale,
    midi: midi, tonicMidi: tonicMidi,
    numberLabel: numberLabel, swaraLabel: swaraLabel,
    toEvents: toEvents
  };
}));

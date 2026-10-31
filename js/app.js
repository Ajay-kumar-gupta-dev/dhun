/*
 * app.js — views and wiring: hash router, tune shelf, tune page.
 * Depends on DhunNotation (notation.js), DHUN_TUNES_TEXT (data/tunes.js), DhunPiano (audio.js).
 */
(function () {
  'use strict';

  var N = window.DhunNotation;
  var P = window.DhunPiano;
  var parsed = N.parseTunes(window.DHUN_TUNES_TEXT || '');
  var tunes = parsed.tunes;
  if (parsed.errors.length) console.warn('Tune data problems:\n' + parsed.errors.join('\n'));

  var main = document.getElementById('main');
  var revealed = {};            // tune id -> true, for this visit
  var player = null;            // running playback

  // ---------- tiny helpers ----------

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
      else if (k === 'style') e.setAttribute('style', v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  // a stable pseudo-random wobble so the "handwriting" doesn't jump around between renders
  function wobble(seed, spread) {
    var x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return ((x - Math.floor(x)) * 2 - 1) * spread;
  }

  // ---------- progress (stars) ----------

  var STORE = 'dhun-clone.progress.v1';
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) { /* private mode: stars just won't persist */ }
  }
  function keysPlayed(id) { return (loadProgress()[id] || []).length; }
  function noteKeyPlayed(id, key) {
    var p = loadProgress(), list = p[id] || [];
    if (list.indexOf(key) < 0) { list.push(key); p[id] = list; saveProgress(p); }
  }
  // 1 star for playing it, 2 for four keys, 3 for all twelve
  function starCount(id) {
    var n = keysPlayed(id);
    return n >= 12 ? 3 : n >= 4 ? 2 : n >= 1 ? 1 : 0;
  }
  function starsEl(id) {
    var s = starCount(id);
    return el('span', { class: 'stars', role: 'img', 'aria-label': s + ' of 3 stars' },
      [0, 1, 2].map(function (i) { return el('span', { class: i < s ? 'star on' : 'star', text: i < s ? '★' : '☆' }); }));
  }

  // ---------- routing ----------

  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var q = h.indexOf('?');
    var pathPart = q < 0 ? h : h.slice(0, q);
    var params = {};
    if (q >= 0) h.slice(q + 1).split('&').forEach(function (kv) {
      var p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    var m = /^\/tune\/(\d+)$/.exec(pathPart);
    return m ? { view: 'tune', id: parseInt(m[1], 10), params: params } : { view: 'shelf' };
  }

  function stopPlayback() {
    if (player) { player.stop(); player = null; }
  }

  function route() {
    stopPlayback();
    var r = parseHash();
    main.replaceChildren();
    if (r.view === 'tune') renderTune(r);
    else renderShelf();
    window.scrollTo(0, 0);
  }

  // ---------- shelf ----------

  function renderShelf() {
    document.title = 'Dhun clone — guess the tune from its numbers and swaras';
    var written = tunes.filter(function (t) { return t.playable; }).length;

    var intro = el('section', { class: 'intro' }, [
      el('h1', { text: 'Guess the tune' }),
      el('p', { class: 'lede' }, [
        'Each tune is written out the way it goes on the board: ',
        el('b', { class: 'c-stick', text: 'rhythm' }), ' on top, then the ',
        el('b', { class: 'c-num', text: 'number' }), ', then the ',
        el('b', { class: 'c-swara', text: 'swara' }), '. ',
        el('b', { class: 'c-num', text: '1' }), ' is Sa. A mark after a number lifts it an octave (',
        el('b', { class: 'c-num', text: "5'" }), '), a comma before drops it (',
        el('b', { class: 'c-num', text: ',5' }), '). Work out the song, then play it in all 12 keys.'
      ]),
      el('p', { class: 'count', text: written + ' of ' + tunes.length + ' tunes written out so far' })
    ]);

    var grid = el('ul', { class: 'shelf', 'aria-label': 'Tunes' }, tunes.map(cardFor));
    main.appendChild(intro);
    main.appendChild(grid);
  }

  function cardFor(t) {
    var tilt = wobble(t.id, 1.6).toFixed(2) + 'deg';
    var li = el('li', { class: 'card' + (t.playable ? '' : ' soon'), style: '--tilt:' + tilt });
    var face = el('span', { class: 'card-q' + (revealed[t.id] ? ' shown' : ''), text: revealed[t.id] ? t.title : '?' });
    var no = el('span', { class: 'card-no', text: 'Tune ' + t.id });

    if (t.playable) {
      li.appendChild(el('a', { class: 'card-main', href: '#/tune/' + t.id, 'aria-label': 'Open tune ' + t.id }, [no, face]));
    } else {
      li.appendChild(el('div', { class: 'card-main', 'aria-disabled': 'true' }, [no, face]));
    }

    var reveal = el('button', { class: 'reveal', type: 'button', 'aria-pressed': revealed[t.id] ? 'true' : 'false', text: revealed[t.id] ? 'Hide the answer' : 'Show the answer' });
    reveal.addEventListener('click', function () {
      revealed[t.id] = !revealed[t.id];
      face.textContent = revealed[t.id] ? t.title : '?';
      face.classList.toggle('shown', !!revealed[t.id]);
      reveal.textContent = revealed[t.id] ? 'Hide the answer' : 'Show the answer';
      reveal.setAttribute('aria-pressed', revealed[t.id] ? 'true' : 'false');
    });
    li.appendChild(reveal);

    li.appendChild(t.playable ? starsEl(t.id) : el('span', { class: 'soon-tag', text: t.broken ? 'check the data line' : 'not written out yet' }));
    return li;
  }

  // ---------- tune page ----------

  function noteCell(n, key, tuneId) {
    var w = n.beats <= 0.26 ? 0.62 : n.beats < 1 ? 0.8 : 1 + 0.5 * (n.beats - 1);
    var tilt = wobble(tuneId * 100 + n.index, 2.2).toFixed(2) + 'deg';
    var cls = 'note' + (n.rest ? ' rest' : '') + (n.beats < 1 ? ' short' : '');

    var stick = el('span', { class: 'stick', 'aria-hidden': 'true' });
    if (!n.rest) {
      stick.appendChild(el('i', { class: 'stem' }));
      if (n.beam === 'start') stick.appendChild(el('i', { class: 'beam b1 r' }));
      if (n.beam === 'mid') stick.appendChild(el('i', { class: 'beam b1 m' }));
      if (n.beam === 'end') stick.appendChild(el('i', { class: 'beam b1 l' }));
      if (n.beam === 'flag') stick.appendChild(el('i', { class: 'flag' }));
      if (n.level === 2 && n.beam && n.beam !== 'flag') stick.appendChild(el('i', { class: 'beam b2 ' + (n.beam === 'start' ? 'r' : 'l') }));
      if (n.level === 2 && n.beam === 'flag') stick.appendChild(el('i', { class: 'flag f2' }));
      if (n.dots) stick.appendChild(el('i', { class: 'dot' }));
      for (var d = 0; d < n.dashes; d++) stick.appendChild(el('i', { class: 'dash', style: '--k:' + (d + 1) }));
    } else {
      stick.appendChild(el('i', { class: 'rest-mark', text: '–' }));
    }

    var name = n.rest ? '' : N.spell(key, n);
    var numberText = N.numberLabel(n), swaraText = N.swaraLabel(n);
    var btn = el('button', {
      class: cls, type: 'button', 'data-i': String(n.index),
      style: '--w:' + w + ';--tilt:' + tilt,
      'aria-label': n.rest ? 'rest' : 'number ' + numberText + ', ' + swaraText + ', note ' + name
    }, [
      stick,
      el('span', { class: 'num', text: numberText }),
      el('span', { class: 'swara', text: swaraText }),
      el('span', { class: 'name', text: name })
    ]);
    return btn;
  }

  function renderTune(r) {
    var t = tunes.filter(function (x) { return x.id === r.id; })[0];
    if (!t || !t.playable) {
      document.title = 'Tune not found — Dhun clone';
      main.appendChild(el('section', { class: 'intro' }, [
        el('h1', { text: t ? 'Not written out yet' : 'No such tune' }),
        el('p', { class: 'lede', text: t ? 'This one is still just a title on the shelf. Add its line to data/tunes.js and it will appear here.' : 'That tune number is not on the shelf.' }),
        el('a', { class: 'back', href: '#/', text: '← All tunes' })
      ]));
      return;
    }

    var key = N.KEYS.indexOf(r.params.key) >= 0 ? r.params.key : N.DEFAULT_KEY;
    var bpm = t.bpm;
    var cells = [];

    document.title = 'Tune ' + t.id + ' — Dhun clone';

    // --- header
    var qSpan = el('span', { class: 'q', text: '?' });
    var answerBtn = el('button', { class: 'reveal', type: 'button' });
    function paintAnswer() {
      var on = !!revealed[t.id];
      qSpan.textContent = on ? t.title : '?';
      qSpan.classList.toggle('shown', on);
      answerBtn.textContent = on ? 'Hide the answer' : 'Show the answer';
      answerBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    answerBtn.addEventListener('click', function () { revealed[t.id] = !revealed[t.id]; paintAnswer(); });

    var starsHolder = el('span', { class: 'stars-holder' }, [starsEl(t.id)]);
    var head = el('header', { class: 'tune-head' }, [
      el('a', { class: 'back', href: '#/', text: '← All tunes' }),
      el('p', { class: 'eyebrow', text: 'Tune ' + t.id + ' · ' + t.meter }),
      el('h1', {}, [qSpan]),
      el('div', { class: 'head-row' }, [answerBtn, starsHolder])
    ]);
    paintAnswer();

    // --- board
    var staff = el('div', { class: 'staff', role: 'group', 'aria-label': 'The tune written out' });
    t.bars.forEach(function (bar) {
      var barEl = el('div', { class: 'bar' + (bar.pickup ? ' pickup' : '') });
      bar.notes.forEach(function (n) {
        var c = noteCell(n, key, t.id);
        c.addEventListener('click', function () {
          if (n.rest || player) return;
          P.playNote(N.midi(currentKey(), n), Math.min(1.2, n.beats * 60 / bpm));
        });
        cells.push(c);
        barEl.appendChild(c);
      });
      staff.appendChild(barEl);
    });
    var legend = el('p', { class: 'legend', 'aria-hidden': 'true' }, [
      el('span', { class: 'c-stick', text: 'rhythm' }), el('span', { class: 'c-num', text: 'number' }),
      el('span', { class: 'c-swara', text: 'swara' }), el('span', { class: 'c-name', text: 'note name' })
    ]);
    var board = el('section', { class: 'board' }, [legend, staff]);

    // --- controls
    var playBtn = el('button', { class: 'play', type: 'button' }, [el('span', { class: 'play-ico', 'aria-hidden': 'true', text: '▶' }), el('span', { class: 'play-txt', text: 'Play' })]);
    var tempoLabel = el('span', { class: 'tempo-val', text: '♩ = ' + bpm });
    var tempo = el('input', { type: 'range', min: '50', max: '180', step: '2', value: String(bpm), 'aria-label': 'Tempo' });
    var controls = el('section', { class: 'controls' }, [
      playBtn,
      el('label', { class: 'tempo' }, [el('span', { class: 'tempo-name', text: 'Tempo' }), tempo, tempoLabel])
    ]);

    // --- keys
    var keyBtns = {};
    var keyRow = el('div', { class: 'keys', role: 'group', 'aria-label': 'Key' });
    var scaleLine = el('p', { class: 'scale' });
    N.KEYS.forEach(function (k) {
      var b = el('button', { class: 'key', type: 'button', 'aria-pressed': 'false', text: k });
      b.addEventListener('click', function () { setKey(k, true); });
      keyBtns[k] = b;
      keyRow.appendChild(b);
    });
    var keysHead = el('div', { class: 'keys-head' }, [
      el('h2', { text: 'Play it in any key' }),
      el('p', { class: 'keys-note', text: 'The numbers and swaras never change. Only the note names do.' })
    ]);
    var keysBox = el('section', { class: 'keybox' }, [keysHead, keyRow, scaleLine]);

    // --- prev / next
    var written = tunes.filter(function (x) { return x.playable; });
    var at = written.indexOf(t);
    var nav = el('nav', { class: 'pager', 'aria-label': 'Other tunes' }, [
      at > 0 ? el('a', { href: '#/tune/' + written[at - 1].id + '?key=' + key, class: 'pg prev', 'data-nav': 'prev', text: '← Tune ' + written[at - 1].id }) : el('span'),
      at < written.length - 1 ? el('a', { href: '#/tune/' + written[at + 1].id + '?key=' + key, class: 'pg next', 'data-nav': 'next', text: 'Tune ' + written[at + 1].id + ' →' }) : el('span')
    ]);

    [head, board, controls, keysBox, nav].forEach(function (s) { main.appendChild(s); });

    // --- behaviour
    function currentKey() { return key; }

    function paintKey() {
      var played = (loadProgress()[t.id] || []);
      N.KEYS.forEach(function (k) {
        keyBtns[k].setAttribute('aria-pressed', k === key ? 'true' : 'false');
        keyBtns[k].classList.toggle('on', k === key);
        keyBtns[k].classList.toggle('done', played.indexOf(k) >= 0);
      });
      var scale = N.keyScale(key);
      scaleLine.replaceChildren(el('span', { class: 'scale-k', text: 'Key of ' + key + ':' }));
      scale.forEach(function (name, i) {
        scaleLine.appendChild(el('span', { class: 'scale-n' }, [el('i', { text: String(i + 1) }), name]));
      });
      t.notes.forEach(function (n, i) {
        var nm = cells[i].querySelector('.name');
        var text = n.rest ? '' : N.spell(key, n);
        nm.textContent = text;
        cells[i].setAttribute('aria-label', n.rest ? 'rest' : 'number ' + N.numberLabel(n) + ', ' + N.swaraLabel(n) + ', note ' + text);
      });
      playBtn.setAttribute('aria-label', 'Play in the key of ' + key);
    }

    function paintPlaying(on) {
      playBtn.classList.toggle('stop', on);
      playBtn.querySelector('.play-ico').textContent = on ? '■' : '▶';
      playBtn.querySelector('.play-txt').textContent = on ? 'Stop' : 'Play';
      if (!on) cells.forEach(function (c) { c.classList.remove('on'); });
    }

    function start() {
      stopPlayback();
      if (!P.supported) {
        playBtn.querySelector('.play-txt').textContent = 'No audio here';
        return;
      }
      var ev = N.toEvents(t, key, bpm);
      noteKeyPlayed(t.id, key);
      starsHolder.replaceChildren(starsEl(t.id));
      paintKey();
      paintPlaying(true);
      player = P.playSequence(ev, {
        onStep: function (i) {
          cells.forEach(function (c, ci) { c.classList.toggle('on', ci === i); });
          if (i >= 0 && cells[i] && cells[i].scrollIntoView) {
            var rect = cells[i].getBoundingClientRect();
            if (rect.top < 60 || rect.bottom > window.innerHeight - 90) cells[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        },
        onEnd: function () { player = null; paintPlaying(false); }
      });
      if (!player) paintPlaying(false);
    }

    function setKey(k, fromUser) {
      var wasPlaying = !!player;
      key = k;
      if (fromUser) history.replaceState(null, '', '#/tune/' + t.id + '?key=' + encodeURIComponent(k));
      nav.querySelectorAll('a').forEach(function (a) { a.href = a.href.replace(/key=[^&]*$/, 'key=' + encodeURIComponent(k)); });
      paintKey();
      if (wasPlaying) start();
    }

    playBtn.addEventListener('click', function () {
      if (player) { stopPlayback(); paintPlaying(false); } else start();
    });
    tempo.addEventListener('input', function () { bpm = parseInt(tempo.value, 10); tempoLabel.textContent = '♩ = ' + bpm; });
    tempo.addEventListener('change', function () { if (player) start(); });

    paintKey();
  }

  // space bar plays / stops on the tune page
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || e.target !== document.body) return;
    var pb = document.querySelector('.play');
    if (pb) { e.preventDefault(); pb.click(); }
  });

  window.addEventListener('hashchange', route);
  route();
}());

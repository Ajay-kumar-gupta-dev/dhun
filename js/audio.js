/*
 * audio.js — a small synthesized piano (Web Audio, no sample files, works offline).
 *
 * Each note is a stack of sine partials with slight stretch tuning (real piano
 * strings are a touch sharp in the upper partials), a soft hammer "thump" from
 * filtered noise, a decay that is slower for low notes, and a short release when
 * the key is let go.
 */
(function () {
  'use strict';

  var PARTIALS = [1, 0.55, 0.38, 0.22, 0.14, 0.09, 0.06, 0.035];
  var ctx = null, master = null;

  function freqOf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  // Schedules one note on any (real or offline) context.
  function voice(c, dest, midi, t, dur, vel) {
    var f0 = freqOf(midi);
    var hi = Math.min(1, Math.max(0, (midi - 21) / 87));       // 0 = lowest key, 1 = highest
    var tau = 2.6 - 1.9 * hi;                                    // low notes ring longer
    var peak = vel * 0.30 / (1 + hi * 0.9);
    var B = 0.00018;                                             // stretch tuning
    var out = c.createGain();
    out.connect(dest);

    var rel = t + Math.max(0.08, dur * 0.97);
    out.gain.setValueAtTime(1, t);
    out.gain.setValueAtTime(1, rel);
    out.gain.setTargetAtTime(0, rel, 0.09);                      // key released
    var end = rel + 0.7;

    for (var n = 1; n <= PARTIALS.length; n++) {
      var f = n * f0 * Math.sqrt(1 + B * n * n);
      if (f > 11000) break;
      var amp = peak * PARTIALS[n - 1];
      var g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.setTargetAtTime(0, t + 0.004, tau / Math.pow(n, 0.6));
      g.connect(out);
      var o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(end);
      if (n === 1) {                                             // two strings, a hair apart
        var o2 = c.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f;
        o2.detune.value = 3;
        o2.connect(g);
        o2.start(t);
        o2.stop(end);
      }
    }

    // hammer thump
    var len = Math.floor(c.sampleRate * 0.06);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buf;
    var bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(f0 * 3, 4500);
    bp.Q.value = 0.8;
    var ng = c.createGain();
    ng.gain.setValueAtTime(vel * 0.07, t);
    ng.gain.setTargetAtTime(0, t, 0.015);
    src.connect(bp); bp.connect(ng); ng.connect(out);
    src.start(t);
    src.stop(t + 0.07);
  }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6500;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      master.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /**
   * events: [{midi|null, start, dur}] in seconds. Returns {stop()} or null if
   * the browser has no Web Audio. cb.onStep(i) fires as each event begins,
   * cb.onEnd() when the tune has finished by itself.
   */
  function playSequence(events, cb) {
    var c = ensure();
    if (!c) return null;
    cb = cb || {};
    var bus = c.createGain();
    bus.connect(master);
    var t0 = c.currentTime + 0.12;
    var total = 0;
    events.forEach(function (e) {
      total = Math.max(total, e.start + e.dur);
      if (e.midi !== null) voice(c, bus, e.midi, t0 + e.start, e.dur, 0.85);
    });

    var stopped = false, raf = 0, lastIdx = -1;
    function finish(silently) {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      bus.gain.setTargetAtTime(0, c.currentTime, silently ? 0.03 : 0.2);
      setTimeout(function () { try { bus.disconnect(); } catch (e) { /* already gone */ } }, 1500);
    }
    function tick() {
      if (stopped) return;
      var now = c.currentTime - t0, idx = -1;
      for (var i = 0; i < events.length; i++) if (events[i].start <= now) idx = i;
      if (idx !== lastIdx) { lastIdx = idx; if (cb.onStep) cb.onStep(idx); }
      if (now >= total + 0.25) {
        finish(false);
        if (cb.onEnd) cb.onEnd();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return { stop: function () { finish(true); } };
  }

  function playNote(midi, seconds) {
    var c = ensure();
    if (!c) return;
    var bus = c.createGain();
    bus.connect(master);
    voice(c, bus, midi, c.currentTime + 0.01, seconds || 0.8, 0.85);
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 3000);
  }

  // Renders events to samples without any speakers; used by the self-check.
  function renderOffline(events, seconds) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var rate = 22050;
    var oc = new OAC(1, Math.ceil(rate * seconds), rate);
    var bus = oc.createGain();
    bus.connect(oc.destination);
    events.forEach(function (e) { if (e.midi !== null) voice(oc, bus, e.midi, e.start, e.dur, 0.85); });
    return oc.startRendering().then(function (b) { return b.getChannelData(0); });
  }

  window.DhunPiano = { playSequence: playSequence, playNote: playNote, renderOffline: renderOffline, supported: !!(window.AudioContext || window.webkitAudioContext) };
}());

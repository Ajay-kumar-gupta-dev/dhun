# Dhun clone

A from-scratch rebuild of Dhun (the melody homework book from Nathaniel School of Music) for the Founding Engineer work pack, Part 1. No framework, no build step, no dependencies.

- **Tune shelf**: 52 cards, each with "Show the answer" and stars. Three tunes are written out; the rest are placeholders until their line is filled in.
- **Tune page**: rhythm sticks on top, then the scale number, the swara and the note name, lined up under each note. Piano playback with a highlight that follows the notes, tempo slider, tap any note to hear it, and all 12 keys (default G).

## Run it

Open `index.html` directly, or serve the folder:

```
python3 -m http.server 8765      # then open http://localhost:8765
```

Deploy: it is a static site. Push the folder to a public GitHub repo and turn on Pages (Settings > Pages > deploy from `main`, root), or drag the folder onto Netlify or Vercel.

Share a specific tune and key: `#/tune/3?key=D`.

## How a tune is stored

Everything lives in `data/tunes.js`, one line per tune, in shelf order:

```
Twinkle Twinkle Little Star | 4/4 | 100 | 1 1 5 5 / 6 6 5:2 / 4 4 3 3 / 2 2 1:2 / ...
Title                       | meter | bpm | music, bars separated by /
```

| Write | Meaning |
|---|---|
| `1`-`7` | scale degree (1 = Sa, 2 = Re, 3 = Ga, 4 = Ma, 5 = Pa, 6 = Dha, 7 = Ni) |
| `5'` / `,5` | one octave up / down (repeat for more) |
| `b3` / `#4` | flat / sharp degree |
| `:2` `:.5` `:1.5` | length in beats (default 1) |
| `0` | rest |

A line with just a title is a placeholder card. **Adding a fourth tune is one line**: replace a placeholder (or add a new line) and reload. Nothing else changes. A bad line is reported in the console and shown as a placeholder, so one typo never breaks the shelf.

A first bar that is shorter than the meter is treated as a pickup (Happy Birthday starts that way), and eighth/sixteenth notes within one beat are beamed together automatically.

## How the spelling works

`js/notation.js`. The note name is not looked up from a table; it is worked out:

1. The **letter** comes from the degree: degree 1 uses the key's own letter, degree 2 the next letter, and so on. So degree 7 of G is always an F of some kind.
2. The **accidental** is whatever that letter needs to land on the right pitch.

That is why F# in G major can never come out as Gb, and why Db major is `Db Eb F Gb Ab Bb C`. Every scale uses each letter A-G exactly once. The twelve keys offered are C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B. Names are plain (`F#`, `Bb`), never `F#4`.

Pitch: the tonic sits between F3 and E3+12 so keys line up in order and G is G3; `'` and `,` move by 12 semitones.

## Piano

`js/audio.js`. Synthesized in the browser (Web Audio) so it works offline and needs no sample files: sine partials with slight stretch tuning, a hammer thump from filtered noise, longer decay on low notes, a short release when the note ends. It is a stand-in for a sampled piano; swapping in samples means changing only `voice()`.

## Tests

```
node tests/notation.test.js                        # spelling in all 12 keys, parsing, data file, beams, pitch
python3 tests/browser_check.py /tmp/shots          # needs the server running and Playwright; checks the UI, all 12 keys,
                                                   # alignment, phone width, renders the piano offline and measures it, screenshots
```

## Files

```
index.html          page shell
css/style.css       blackboard look, responsive
js/notation.js      parser, spelling, pitch (pure, tested in Node)
js/audio.js         piano synth
js/app.js           router, shelf, tune page
data/tunes.js       the tunes
tests/              Node unit tests + browser check
```

## Honest limits

- Built from what the live site shows as text. Colours, spacing, star rules and stick styling are my reading of it, not a pixel match.
- The three tunes were transcribed by me; check them against Dhun's board versions.
- Not built: microphone sing/tap, the 12-key quiz, staff notation, the homework-link maker.

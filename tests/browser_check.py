"""
End-to-end check in a real browser.

  python3 -m http.server 8765 &        # from the project root
  python3 tests/browser_check.py [outdir]

Checks the shelf, the tune page, the 12 keys, alignment of the board, the piano
(rendered offline and measured), a phone-width layout, and takes screenshots.
"""
import sys, os, json
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8765/")
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/dhun-shots"
os.makedirs(OUT, exist_ok=True)

SCALES = {
    "C": "C D E F G A B", "Db": "Db Eb F Gb Ab Bb C", "D": "D E F# G A B C#",
    "Eb": "Eb F G Ab Bb C D", "E": "E F# G# A B C# D#", "F": "F G A Bb C D E",
    "F#": "F# G# A# B C# D# E#", "G": "G A B C D E F#", "Ab": "Ab Bb C Db Eb F G",
    "A": "A B C# D E F# G#", "Bb": "Bb C D Eb F G A", "B": "B C# D# E F# G# A#",
}
SEVENTH = {"C": "B", "Db": "C", "D": "C#", "Eb": "D", "E": "D#", "F": "E",
           "F#": "E#", "G": "F#", "Ab": "G", "A": "G#", "Bb": "A", "B": "A#"}

fails = []
def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + (("  -> " + str(detail)) if detail and not ok else ""))
    if not ok:
        fails.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])

    def new_page(w, h):
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" and "fonts.g" not in m.text and "ERR_" not in m.text else None)
        return pg, errors

    # ---------- desktop shelf ----------
    pg, errors = new_page(1280, 900)
    pg.goto(BASE)
    pg.wait_for_selector(".card")
    check("shelf shows 52 cards", pg.locator(".card").count() == 52, pg.locator(".card").count())
    check("exactly 3 cards are openable", pg.locator("a.card-main").count() == 3, pg.locator("a.card-main").count())
    pg.locator(".card").nth(2).locator(".reveal").click()
    check("Show the answer reveals the title", pg.locator(".card").nth(2).locator(".card-q").inner_text() == "Twinkle Twinkle Little Star")
    pg.locator(".card").nth(2).locator(".reveal").click()
    check("answer can be hidden again", pg.locator(".card").nth(2).locator(".card-q").inner_text() == "?")
    pg.screenshot(path=f"{OUT}/shelf-desktop.png")
    pg.screenshot(path=f"{OUT}/shelf-desktop-full.png", full_page=True)

    # ---------- desktop tune page ----------
    pg.locator("a.card-main").nth(1).click()          # Twinkle (tune 3)
    pg.wait_for_selector(".staff .note")
    check("default key is G", pg.locator(".key.on").inner_text() == "G")
    names = pg.locator(".note .name").all_inner_texts()
    nums = pg.locator(".note .num").all_inner_texts()
    sw = pg.locator(".note .swara").all_inner_texts()
    check("Twinkle first bar in G reads G G D D", names[:4] == ["G", "G", "D", "D"], names[:4])
    check("Twinkle numbers 1 1 5 5", nums[:4] == ["1", "1", "5", "5"], nums[:4])
    check("Twinkle swaras Sa Sa Pa Pa", sw[:4] == ["Sa", "Sa", "Pa", "Pa"], sw[:4])
    check("title hidden until asked", pg.locator("h1 .q").inner_text() == "?")
    pg.screenshot(path=f"{OUT}/tune-desktop.png", full_page=True)

    # alignment: every number / swara / name is centred under its stem
    bad = pg.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.note').forEach(n => {
        if (n.classList.contains('rest')) return;
        const c = e => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; };
        const stem = n.querySelector('.stem'), sx = c(stem);
        ['.num', '.swara', '.name'].forEach(s => {
          const e = n.querySelector(s);
          if (e.textContent && Math.abs(c(e) - sx) > 3) out.push(s + ' off by ' + (c(e) - sx).toFixed(1));
        });
      });
      return out;
    }""")
    check("numbers, swaras and names are centred under each stick", not bad, bad[:3])

    # play highlights notes
    pg.locator(".play").click()
    try:
        pg.wait_for_selector(".note.on", timeout=4000)
        lit = True
    except Exception:
        lit = False
    check("Play lights up notes as they sound", lit)
    pg.wait_for_timeout(900)
    pg.locator(".play").click()
    check("Stop clears the highlight", pg.locator(".note.on").count() == 0)
    check("playing a key earns a star", pg.locator(".stars-holder .star.on").count() >= 1)

    # ---------- all 12 keys on Happy Birthday (has degree 7) ----------
    pg.goto(BASE + "#/tune/2")
    pg.wait_for_selector(".staff .note")
    seventh_idx = None
    nums = pg.locator(".note .num").all_inner_texts()
    seventh_idx = nums.index("7")
    for k, scale in SCALES.items():
        pg.locator(".key", has_text=k).filter(has_text=f"^{k}$" if False else k).first.click() if False else None
        btn = pg.locator(f".keys .key:text-is('{k}')")
        btn.click()
        got_scale = " ".join(pg.locator(".scale-n").all_inner_texts()).replace("\n", "").replace("1", "").replace("2", "").replace("3", "").replace("4", "").replace("5", "").replace("6", "").replace("7", "")
        got_scale = " ".join(got_scale.split())
        check(f"key {k}: scale line is {scale}", got_scale == scale, got_scale)
        n7 = pg.locator(".note .name").nth(seventh_idx).inner_text()
        check(f"key {k}: degree 7 is spelled {SEVENTH[k]}", n7 == SEVENTH[k], n7)
        allnames = pg.locator(".note .name").all_inner_texts()
        check(f"key {k}: no octave digits in any note name", all(not any(ch.isdigit() for ch in x) for x in allnames), allnames)
        check(f"key {k}: numbers and swaras unchanged",
              pg.locator(".note .num").all_inner_texts() == nums)
    pg.locator(".keys .key:text-is('G')").click()
    check("URL remembers the key", "key=G" in pg.url, pg.url)
    pg.goto(BASE + "#/tune/2?key=Db")
    pg.wait_for_selector(".staff .note")
    check("deep link ?key=Db opens in Db", pg.locator(".key.on").inner_text() == "Db")
    pg.screenshot(path=f"{OUT}/tune-happy-birthday-Db.png", full_page=True)

    # ---------- piano audibly renders ----------
    res = pg.evaluate("""async () => {
      const N = window.DhunNotation;
      const text = window.DHUN_TUNES_TEXT;
      const t = N.parseTunes(text).tunes.find(x => x.title === 'Twinkle Twinkle Little Star');
      const ev = N.toEvents(t, 'G', 100).slice(0, 4);
      const secs = ev[3].start + ev[3].dur + 0.6;
      const d = await window.DhunPiano.renderOffline(ev, secs);
      const rate = 22050;
      function rms(a, b) { let s = 0; const i0 = Math.floor(a * rate), i1 = Math.floor(b * rate); for (let i = i0; i < i1; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); }
      let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      // zero-crossing pitch estimate of the first note, 0.05s..0.25s
      let z = 0, i0 = Math.floor(0.05 * rate), i1 = Math.floor(0.25 * rate);
      for (let i = i0 + 1; i < i1; i++) if (d[i - 1] < 0 && d[i] >= 0) z++;
      const f = z / ((i1 - i0) / rate);
      return { peak, onset: rms(0, 0.2), silentGapBefore: rms(0, 0.001), tail: rms(secs - 0.1, secs), f };
    }""")
    check("piano renders audible sound (peak 0.05-1.0)", 0.05 < res["peak"] < 1.0, res)
    check("piano tail decays to near silence", res["tail"] < res["onset"] * 0.2, res)
    check("first note of Twinkle in G sounds near G3 (196 Hz)", 170 < res["f"] < 225, res["f"])
    check("no JS errors on desktop", not errors, errors)

    # ---------- phone ----------
    pg2, errors2 = new_page(375, 812)
    pg2.goto(BASE)
    pg2.wait_for_selector(".card")
    check("phone shelf: no sideways scroll", pg2.evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
          pg2.evaluate("[document.documentElement.scrollWidth, window.innerWidth]"))
    cols = pg2.evaluate("getComputedStyle(document.querySelector('.shelf')).gridTemplateColumns.split(' ').length")
    check("phone shelf: 2 columns", cols == 2, cols)
    pg2.screenshot(path=f"{OUT}/shelf-phone.png")
    pg2.goto(BASE + "#/tune/3")
    pg2.wait_for_selector(".staff .note")
    check("phone tune: no sideways scroll", pg2.evaluate("document.documentElement.scrollWidth <= window.innerWidth"),
          pg2.evaluate("[document.documentElement.scrollWidth, window.innerWidth]"))
    over = pg2.evaluate("""() => { const r = document.querySelector('.staff').getBoundingClientRect(); const o = [];
      document.querySelectorAll('.note').forEach(n => { const b = n.getBoundingClientRect(); if (b.right > innerWidth + 1 || b.left < -1) o.push(1); }); return o.length; }""")
    check("phone tune: every note column is inside the screen", over == 0, over)
    pg2.screenshot(path=f"{OUT}/tune-phone.png")
    pg2.screenshot(path=f"{OUT}/tune-phone-full.png", full_page=True)
    pg2.goto(BASE + "#/tune/2?key=F%23")
    pg2.wait_for_selector(".staff .note")
    pg2.screenshot(path=f"{OUT}/tune-phone-happy-birthday-Fsharp.png", full_page=True)
    check("phone: deep link F# key works", pg2.locator(".key.on").inner_text() == "F#")
    check("no JS errors on phone", not errors2, errors2)

    # ---------- placeholder / bad routes ----------
    pg2.goto(BASE + "#/tune/1")
    check("placeholder tune shows a friendly page", "Not written out yet" in pg2.locator("h1").inner_text())
    pg2.goto(BASE + "#/tune/999")
    check("unknown tune shows a friendly page", "No such tune" in pg2.locator("h1").inner_text())

    browser.close()

print("\n%d failure(s)" % len(fails))
sys.exit(1 if fails else 0)

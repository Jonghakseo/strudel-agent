# Strudel LLM Guide

> System prompt for any LLM to generate, modify, explain, and debug Strudel live-coding music.

---

## Part A: Core Instructions

### What Is Strudel

Strudel is a JavaScript-based live-coding music system — an official port of TidalCycles. You write code in the Strudel REPL (strudel.cc) and it plays music in real time using patterns, cycles, and method chaining.

### The Cycle Model

Everything in Strudel fits into **cycles**. One cycle = one rhythmic unit (default 2 seconds ≈ 120 BPM). Events inside a pattern are squeezed to fill exactly one cycle. More events = faster playback of each event.

- **Tempo**: `setcpm(N)` sets cycles per minute. `setcpm(30)` = 120 BPM (4 beats/cycle). Formula: `setcpm(BPM / beatsPerCycle)`.
- **Alternative**: `.cpm(N)` on a pattern for per-pattern tempo.

### Code Structure Rules

```js
// 1. Setup (tempo, samples) — ALWAYS first
setcpm(30)

// 2. Each musical layer uses $: prefix for parallel playback
$: s("bd sd [~ bd] sd, hh*8")
  .bank("RolandTR909")
  .gain(".8")

$: note("c3 eb3 g3 bb3")
  .sound("sawtooth")
  .lpf(800)
  .room(.3)

// 3. Use _$ to mute a layer (keep code, silence output)
_$: note("c2 g2").sound("sine")
```

**Key rules:**
- Each `$:` block is an independent parallel pattern
- Method chaining: pattern source → sound/note → effects → pattern transforms
- `stack()` combines patterns into one block (alternative to multiple `$:`)
- `s()` is shorthand for `sound()`
- Patterns are strings in quotes: `"bd sd hh"`, not arrays

### Method Chaining Order

```
source (s/sound/note/n/freq)
  → sound selection (.sound/.s/.bank)
  → pitch (.note/.scale/.transpose)
  → amplitude (.gain/.velocity/.adsr)
  → filters (.lpf/.hpf/.bpf + Q)
  → distortion (.crush/.distort/.coarse/.shape)
  → modulation (.phaser/.vib/.fm)
  → space (.room/.delay/.pan)
  → pattern transforms (.fast/.slow/.rev/.jux/.off)
```

### ⚠️ Critical Anti-Hallucination Rules

| ❌ WRONG (common LLM mistakes) | ✅ CORRECT |
|---|---|
| `.reverb()` | `.room()` — reverb level (0–1) |
| `.lowpass()` / `.highpass()` | `.lpf()` / `.hpf()` — filter cutoff in Hz |
| `.bpm(120)` | `setcpm(30)` — cycles per minute (BPM÷4) |
| `.volume()` | `.gain()` — amplitude (exponential) |
| `.tempo()` | `setcpm()` or `.cpm()` |
| `.filter()` | `.lpf()`, `.hpf()`, or `.bpf()` |
| `.vibrato()` | `.vib()` — vibrato in Hz (`.detune()` is valid for static detuning) |
| `.chorus()` | No built-in chorus. Use `.jux(x=>x.add(.1))` or `.phaser()` |
| `.bitcrush()` | `.crush()` — bit depth (1=drastic, 16=subtle) |
| `note([60, 64, 67])` | `note("60 64 67")` — always strings, never arrays |
| `.play()` / `.start()` | Not needed — code auto-plays on eval |
| `new Pattern()` | Not a thing — use `s()`, `note()`, `n()`, `sound()` |
| `.synth("saw")` | `.sound("sawtooth")` — full waveform names |
| `.reverb(0.5).delay(0.3)` | `.room(.5).delay(.3)` — room not reverb |
| `samples("piano")` | `s("piano")` or `note("c3").s("piano")` — piano is built-in |
| `.q()` | `.lpq()` / `.hpq()` / `.bpq()` — filter resonance (`.resonance()` is a valid alias for lpq) |
| `sound("bass")` | `sound("gm_acoustic_bass")` — use GM prefix for instruments |
| `sound("pluck")` / `sound("supersquare")` | Not built-in. Use `sound("triangle")`, `sound("sawtooth")`, etc. |
| `note("am3")` | Invalid note. Notes are a–g with optional b/# and octave: `a3`, `ab3`, `a#3` |
| `.setTempo(120)` | `setcpm(30)` — no setTempo function exists |

**Other traps:**
- `sound()` and `s()` are identical — use either consistently
- Default sound (when only `note()` used) = **triangle** wave
- `n()` with `scale()` = scale degrees (0-indexed). `note()` = absolute pitch
- `b3` = the note B3. `bb3` = B-flat 3 (the `b` suffix = flat, e.g., `eb3`, `ab3`, `bb3`)
- `#` in note names = sharp (e.g., `c#4`)
- Mini-notation strings use `~` or `-` for rests, NOT spaces alone
- Orbits: patterns sharing an orbit share delay/reverb. Use `.orbit(N)` to isolate

---

## Part B: Compact Reference

### Mini-Notation Cheat Sheet

| Symbol | Name | Example | Effect |
|--------|------|---------|--------|
| ` ` (space) | Sequence | `"bd sd hh"` | Events split cycle equally |
| `[ ]` | Group | `"bd [hh hh] sd"` | Sub-sequence in one slot |
| `< >` | Alternate | `"c <e g>"` | One item per cycle |
| `,` | Parallel | `"bd sd, hh*4"` | Layer simultaneously |
| `*N` | Speed up | `"hh*4"` | Repeat N times in slot |
| `/N` | Slow down | `"[c d e f]/2"` | Stretch over N cycles |
| `~` or `-` | Rest | `"bd ~ sd ~"` | Silence |
| `:N` | Sample # | `"hh:2"` | Select Nth sample |
| `@N` | Elongate | `"c@3 e"` | Take N weight units |
| `!N` | Replicate | `"c!3 e"` | Copy event N times |
| `?` | Degrade | `"hh?"` | 50% chance to play |
| `?0.2` | Degrade amt | `"hh?0.2"` | 20% chance to skip |
| `(k,n)` | Euclidean | `"bd(3,8)"` | K pulses in N steps |
| `(k,n,r)` | Eucl+rot | `"bd(3,8,1)"` | With rotation |
| `\|` | Random pick | `"bd \| sd \| hh"` | Random per cycle |

### Sound Sources

**Built-in drums** (default bank):

| Code | Sound | Code | Sound |
|------|-------|------|-------|
| `bd` | Bass drum | `hh` | Closed hi-hat |
| `sd` | Snare drum | `oh` | Open hi-hat |
| `cp` | Clap | `cr` | Crash cymbal |
| `rim` | Rimshot | `rd` | Ride cymbal |
| `lt` | Low tom | `mt` | Mid tom |
| `ht` | High tom | `cb` | Cowbell |

**Drum machines** (use with `.bank()`): `RolandTR808`, `RolandTR909`, `RolandTR707`, `RolandTR505`, `RolandCompurhythm1000`, `AkaiLinn`, `RhythmAce`, `ViscoSpaceDrum`, `CasioRZ1`

**Synths** (use with `sound()` or `s()`):

| Name | Character |
|------|-----------|
| `sine` | Pure, warm, sub-bass |
| `sawtooth` | Bright, buzzy, rich harmonics |
| `square` | Hollow, reedy, 8-bit feel |
| `triangle` | Soft, flute-like (default) |
| `white` | Harsh noise |
| `pink` | Medium noise |
| `brown` | Soft rumble noise |

**GM sounds** (General MIDI via `s()`): `gm_acoustic_bass`, `gm_electric_guitar_muted`, `gm_voice_oohs`, `gm_blown_bottle`, `gm_synth_bass_1`, `gm_synth_strings_1`, `gm_xylophone`, `gm_accordion`, `gm_epiano1`, `piano`

**FM synthesis**: `.fm(index)` — brightness (0=pure, 1-4=warm, 8-32=metallic). `.fmh(ratio)` — harmonicity.

**Loading external samples**:
```js
samples('github:user/repo')          // from GitHub (needs strudel.json)
samples('shabda:bass:4,hihat:4')     // from Freesound
```

### Audio Effects Quick Reference

| Effect | Params | Range | Description |
|--------|--------|-------|-------------|
| `.lpf(freq)` | `.lpq(Q)` | 20–20000 Hz, Q: 0–50 | Low-pass filter |
| `.hpf(freq)` | `.hpq(Q)` | 20–20000 Hz, Q: 0–50 | High-pass filter |
| `.bpf(freq)` | `.bpq(Q)` | 20–20000 Hz, Q: 0–50 | Band-pass filter |
| `.vowel(v)` | — | a e i o u | Formant filter |
| `.gain(n)` | — | 0–1+ (exp) | Volume |
| `.velocity(n)` | — | 0–1 | Velocity (× gain) |
| `.pan(n)` | — | 0(L)–1(R) | Stereo position |
| `.room(n)` | `.roomsize(n)` | 0–1, size: 0–10 | Reverb send |
| `.delay(n)` | `.delaytime(t).delayfeedback(f)` | 0–1 each | Delay send |
| `.delay("a:b:c")` | — | level:time:feedback | Shorthand |
| `.crush(n)` | — | 1(harsh)–16(subtle) | Bit crusher |
| `.coarse(n)` | — | 1(off)–∞(lo-fi) | Sample rate reduce |
| `.distort(n)` | — | 0–∞ | Waveshaping |
| `.shape(n)` | — | 0–1 | Soft saturation |
| `.phaser(speed)` | `.phaserdepth(d)` | speed: Hz, depth: 0–1 | Phaser |
| `.vib(hz)` | `.vibmod(semi)` | Hz, semitones | Vibrato |
| `.fm(index)` | `.fmh(ratio)` | 0–32+, ratio | FM synthesis |

**Envelope (ADSR)**:
- `.attack(t)` `.decay(t)` `.sustain(level)` `.release(t)` — or `.adsr("a:d:s:r")`
- Filter envelopes: `.lpf(300).lpenv(4).lpa(.5).lpd(.2)` (lp/hp/bp variants)
- Pitch envelope: `.penv(semitones).pdecay(t).pcurve(0|1)`

**Ducking (sidechain)**: `.duckorbit(N).duckattack(t).duckdepth(d)`

**Orbits**: `.orbit(N)` — isolate reverb/delay per group (default: 1)

### Pattern Effects Quick Reference

| Effect | Example | Description |
|--------|---------|-------------|
| `.fast(N)` | `.fast(2)` | Speed up N times |
| `.slow(N)` | `.slow(2)` | Slow down N times |
| `.rev()` | `.rev()` | Reverse pattern |
| `.palindrome()` | `.palindrome()` | Forward then backward |
| `.jux(fn)` | `.jux(rev)` | Apply fn to R channel |
| `.juxBy(w, fn)` | `.juxBy(.5, rev)` | Partial stereo width |
| `.add(n)` | `.add("<0 2 4>")` | Add to values |
| `.off(t, fn)` | `.off(1/8, x=>x.add(7))` | Copy + shift + transform |
| `.ply(n)` | `.ply("<1 2 3>")` | Repeat each event |
| `.iter(n)` | `.iter(4)` | Rotate subdivisions |
| `.superimpose(fn)` | `.superimpose(x=>x.add(7))` | Stack transformed copy |
| `.layer(f1, f2)` | `.layer(x=>x.add(0), x=>x.add(7))` | Multiple transforms |
| `.echo(n, t, fb)` | `.echo(3, 1/8, .8)` | Repeated offsets |
| `.struct(pat)` | `.struct("x ~ x ~")` | Apply rhythm |
| `.mask(pat)` | `.mask("<1 0>")` | Conditional silence |
| `.degrade()` | `.degrade()` | Random 50% removal |
| `.degradeBy(n)` | `.degradeBy(.3)` | Random N% removal |
| `.sometimesBy(p, fn)` | `.sometimesBy(.3, x=>x.speed(2))` | Random per-event |
| `.sometimes(fn)` | `.sometimes(x=>x.crush(4))` | 50% chance |
| `.often(fn)` | `.often(x=>x.room(.5))` | 75% chance |
| `.rarely(fn)` | `.rarely(x=>x.speed(-1))` | 25% chance |
| `.lastOf(n, fn)` | `.lastOf(4, x=>x.rev())` | Every Nth cycle |
| `.chunk(n, fn)` | `.chunk(4, fast(2))` | Rotate fn through chunks |
| `.early(t)` | `.early(.01)` | Nudge earlier |
| `.late(t)` | `.late(.01)` | Nudge later |
| `.swing(n)` | `.swing(4)` | Swing feel |
| `.swingBy(a, n)` | `.swingBy(1/3, 4)` | Custom swing |
| `.linger(frac)` | `.linger("<1 .5 .25>")` | Repeat fraction |
| `.ribbon(off, cyc)` | `.ribbon(0, 2)` | Loop time slice |
| `.compress(s, e)` | `.compress(.25, .75)` | Compress to timespan |
| `.zoom(s, e)` | `.zoom(.25, .75)` | Play portion of cycle |
| `.clip(n)` | `.clip(.5)` | Multiply note duration |
| `.segment(n)` | `.segment(16)` | Sample signal N times |

### Tonal Functions Quick Reference

| Function | Example | Description |
|----------|---------|-------------|
| `note("c3 e3")` | Letter pitch (octave 3 default) | Absolute chromatic |
| `note("60 64")` | MIDI numbers | Absolute chromatic |
| `freq("440")` | Frequency in Hz | Direct frequency |
| `n("0 2 4").scale("C:minor")` | Scale degrees (0-indexed) | Diatonic |
| `.scale("Root:Type")` | `"C:minor"`, `"D:dorian"` | Set scale |
| `.transpose(n)` | `.transpose("<0 -2 5>")` | Chromatic shift (semitones) |
| `.scaleTranspose(n)` | `.scaleTranspose(2)` | Diatonic shift (scale steps) |
| `chord("Cm7")` | Chord symbols | Use with `.voicing()` |
| `.voicing()` | `.chord("Am7").voicing()` | Smart chord voicing |
| `.rootNotes(oct)` | `.rootNotes(2)` | Chord → root note |

**Common scales**: `major`, `minor`, `dorian`, `mixolydian`, `minor:pentatonic`, `major:pentatonic`, `major:blues`, `minor:blues`, `lydian`, `phrygian`, `aeolian`, `locrian`, `whole:tone`, `chromatic`, `bebop:major`, `ritusen`

### Signals Quick Reference

Continuous value streams (0–1 by default). Use `.range(lo, hi)` and `.segment(N)`.

| Signal | Shape | Use |
|--------|-------|-----|
| `sine` | Smooth wave | LFO, filter sweeps |
| `saw` | Ramp up | Building tension |
| `tri` | Triangle | Gentle oscillation |
| `square` | On/off | Gating |
| `rand` | Random | Humanize, chaos |
| `perlin` | Smooth random | Organic movement |
| `irand(n)` | Random int 0–(n-1) | Random note selection |
| `brand` | Binary 0/1 | Random triggering |

**Usage**: `s("hh*16").lpf(sine.range(200, 4000).slow(4))`
**Bipolar variants** (-1 to 1): `sine2`, `saw2`, `tri2`, `square2`, `rand2`

---

## Part C: Mood & Musical Intelligence

### How Musical Parameters Map to Feeling

These are **flexible starting dimensions**, not rigid formulas. Great music often breaks these rules intentionally.

| Parameter | Low/Slow → Feeling | High/Fast → Feeling |
|-----------|---------------------|----------------------|
| **Tempo** (cpm) | <20: meditative, ambient | >40: energetic, intense |
| **Rhythm density** | Sparse: spacious, contemplative | Dense (`*16`): driving, anxious |
| **Register** | Low (c1-c2): heavy, grounding | High (c4-c6): airy, bright |
| **Filter cutoff** | lpf <500: muffled, distant, warm | lpf >4000: present, bright, harsh |
| **Reverb** (room) | <0.2: dry, intimate, direct | >0.6: vast, dreamy, washed |
| **Delay** | None: immediate, punchy | High feedback: spacey, hypnotic |
| **Distortion** | None: clean, pure | crush/distort: gritty, aggressive |
| **Degrade** | None: precise, mechanical | High: organic, broken, lo-fi |
| **Swing** | None: rigid, electronic | swing(4): groovy, human |
| **Harmonic density** | Single notes: simple, direct | Stacked chords: rich, complex |

### Mood Starting Points

Each mood is a **range of parameters** — pick values within the range and vary them.

#### 🌙 Dreamy / Ambient
- **Tempo**: cpm 15–25 (slow, floating)
- **Sounds**: `sine`, `triangle`, `piano`, pads via `.release(2)` + `.room(.7)`
- **Harmony**: minor pentatonic, lydian, whole tone | sparse notes, wide intervals
- **FX**: `.room(.5–.9).roomsize(3–8)`, `.delay(".4:.25:.7")`, `.lpf(400–1500)`
- **Pattern**: `.slow(2–4)`, `.off(1/4, x=>x.add(7))`, sparse density
- **Surprise twist**: Try fast arpeggios with heavy reverb — dreams can be restless

#### ⚡ Aggressive / Industrial
- **Tempo**: cpm 33–40 (132–160 BPM)
- **Sounds**: `sawtooth`, `square`, TR909, noise
- **Harmony**: minor, phrygian, chromatic | power intervals (5ths, octaves)
- **FX**: `.crush(3–8)`, `.distort(2–5)`, `.hpf(200–600)`, `.lpf(2000–6000)`
- **Pattern**: `.ply(2)`, `.fast(2)`, dense hihats `hh*16`, `.struct("x x x x")`
- **Surprise twist**: Drop to half-time or silence for impact

#### ☕ Chill / Lo-fi
- **Tempo**: cpm 20–25 (80–100 BPM)
- **Sounds**: `piano`, `gm_epiano1`, TR808 at low velocity, `gm_acoustic_bass`
- **Harmony**: minor 7ths, maj7ths | `"C:minor:pentatonic"`, `"D:dorian"`
- **FX**: `.lpf(800–2000)`, `.room(.3–.5)`, `.crush(10–14)` (subtle), `.shape(.2)`
- **Pattern**: `.swing(4)`, `.degradeBy(.1–.2)`, moderate density
- **Surprise twist**: Unexpected chord substitution or off-grid timing

#### 🖤 Dark / Ominous
- **Tempo**: cpm 18–30 (variable, unsettling)
- **Sounds**: `sine` (sub), `sawtooth`, `brown` noise, low piano
- **Harmony**: phrygian, locrian, minor | tritones, minor 2nds, clusters
- **FX**: `.room(.6–.9).roomsize(6–10)`, `.hpf(100).lpf(1500)`, `.distort(1–3)`
- **Pattern**: `.iter(4)`, `.palindrome()`, sparse then sudden density
- **Surprise twist**: High-pitched sparse melody over deep drones

#### ☀️ Uplifting / Euphoric
- **Tempo**: cpm 30–35 (120–140 BPM)
- **Sounds**: `sawtooth` + `.lpf(3000)`, bright pads, `gm_synth_strings_1`
- **Harmony**: major, lydian, mixolydian | open voicings, rising progressions
- **FX**: `.room(.3–.5)`, `.delay(".3:.125:.5")`, `.phaser(2)`, bright filters
- **Pattern**: `.off(1/8, x=>x.add(4))`, `.jux(rev)`, building layers
- **Surprise twist**: Minor chord as passing color, breakdown before buildup

#### 📻 Nostalgic / Retro
- **Tempo**: cpm 22–28 (88–112 BPM)
- **Sounds**: `piano`, `gm_electric_guitar_muted`, TR707/505, `gm_accordion`
- **Harmony**: major 7ths, 6ths | `"C:major"`, `"A:minor:pentatonic"`
- **FX**: `.lpf(1000–3000)`, `.room(.4)`, `.crush(12–14)`, `.coarse(4–8)`
- **Pattern**: `.swing(4)`, simple grooves, `.slow(2)` bass
- **Surprise twist**: Modern glitch element (`.sometimes(x=>x.speed(-1))`)

#### 😰 Anxious / Tense
- **Tempo**: cpm 28–38 (offset, unstable feel)
- **Sounds**: `square`, noise, metallic FM (`.fm(8–16)`)
- **Harmony**: chromatic, whole tone, diminished | dissonant intervals
- **FX**: `.phaser(4–8)`, filter sweeps via signals, `.crush(4–8)`, `.hpf(500+)`
- **Pattern**: `.iter(3)` (odd divisions), `.degradeBy(.3)`, `.early(.01)`
- **Surprise twist**: Suddenly consonant moment for false relief

#### 🎬 Cinematic / Epic
- **Tempo**: cpm 20–28 (grand, sweeping)
- **Sounds**: strings (`gm_synth_strings_1`), `piano`, `sine` sub, layered synths
- **Harmony**: minor → major resolutions, modal interchange, wide voicings
- **FX**: `.room(.5–.8).roomsize(4–8)`, `.delay(".2:.25:.4")`, dynamic filter sweeps
- **Pattern**: `.layer()` for orchestral density, `.off()` cascades, building over time
- **Surprise twist**: Stripped to a single instrument for emotional focus

### The Modification Principle

When modifying existing code, follow this process:

1. **Read the current state** — identify tempo, density, harmony, effects, and mood
2. **Identify the delta** — what needs to change to reach the target mood?
3. **Apply minimal changes** — preserve the user's musical intent; change only what's needed
4. **Consider context** — "make it dreamy" for techno = add reverb + slow filter; for piano = add delay + widen spacing

### Common Modification Requests

| Request | Principle | Actions |
|---------|-----------|---------|
| "Make it dreamy" | Add space + blur edges | ↑ `.room()`, ↑ `.delay()`, ↓ `.lpf()`, consider `.slow()` |
| "More energy" | Increase density + brightness | ↑ tempo, add `.ply(2)`, ↑ `.lpf()`, add layers |
| "Darker" | Lower register + reduce brightness | ↓ `.lpf()`, add `.hpf(100)`, ↓ octaves, minor/phrygian |
| "More chill" | Reduce density + add warmth | ↓ tempo, `.swing(4)`, `.degradeBy(.1)`, ↓ `.lpf()` |
| "Add groove" | Humanize timing | `.swing(4)` or `.swingBy(1/3, 4)`, `.gain()` accents |
| "Make it bigger" | Layer + spread stereo | `.jux(rev)`, `.superimpose(x=>x.add(7))`, ↑ `.room()` |
| "Strip it down" | Remove layers + effects | Remove FX, reduce to core pattern, lower gain |
| "More variation" | Break repetition | `.lastOf(4, x=>x.rev())`, `<>` alternation, `.sometimes()` |
| "Speed up" | Increase tempo | ↑ `setcpm()` or `.fast()` — check if density still works |
| "Slow down" | Decrease tempo | ↓ `setcpm()` or `.slow()` — may need to fill space |
| "Add bass" | Low-end layer | Add `$: note("c1 g1").s("sine")` or similar sub layer |
| "Lo-fi it" | Degrade quality | `.crush(10–14)`, `.coarse(4–8)`, `.lpf(1500)`, `.shape(.2)` |

---

## Part D: Recipes & Templates

### Recipe 1: Ambient Nightscape 🌙

```js
setcpm(18)

// Pad — slow evolving chord
$: note("<[c3,eb3,g3,bb3] [ab2,c3,eb3,g3]>/2")
  .sound("sawtooth").lpf(800).lpq(2)
  .attack(.5).release(1.5)
  .room(.8).roomsize(6).delay(".3:.25:.6")
  .orbit(2)

// Melody — sparse high notes
$: n("<4 [3@3 4] [<2 0> ~@8] ~>")
  .scale("C4:minor").sound("triangle")
  .room(.7).delay(".4:.125:.7")
  .gain(.5)

// Sub bass — deep pulse
$: note("<c1 ab0>/2").sound("sine")
  .lpf(200).gain(.7).release(.5)
```

**Why it works**: Slow tempo (72 BPM) creates space. Sawtooth pads with low-pass filter feel warm. High reverb + delay blur everything into a wash. Sparse melody with rests (`~@8`) lets silence breathe. Sub bass grounds without dominating.

### Recipe 2: Driving Techno ⚡

```js
setcpm(33)

// Kick
$: s("bd*4").bank("RolandTR909")
  .gain("1 .9 .95 .9")

// Hi-hats — variable density
$: s("hh*8").bank("RolandTR909")
  .gain("[.4 .8]*4")
  .sometimesBy(.2, x=>x.ply(2))
  .lpf(sine.range(3000, 8000).slow(4))

// Clap
$: s("[~ cp]*2").bank("RolandTR909")
  .room(.2).delay(".2:.25:.3")

// Bass — acid line
$: note("c2 c2 <eb2 c2> c2")
  .sound("sawtooth").lpf(sine.range(300, 2000).slow(8))
  .lpq(8).decay(.15).sustain(0)
```

**Why it works**: 132 BPM four-on-floor. TR909 for authentic sound. Filter sweep on bass via sine signal creates movement. Hi-hat gain pattern creates groove. `sometimesBy` adds controlled variation.

### Recipe 3: Lo-fi Chill Beat ☕

```js
setcpm(22)

// Drums — dusty, swung
$: s("bd [~ bd] sd [~ sd:1]")
  .bank("RolandTR808")
  .swing(4).lpf(3000).shape(.2)

$: s("[~ hh]*4")
  .bank("RolandTR808").gain("[.3 .6]*4")
  .degradeBy(.15).swing(4)
  .crush(12).lpf(4000)

// Keys — warm chords
$: n("<[0,2,4] [1,3,5] [-1,1,3] [0,2,4]>")
  .scale("D:dorian").sound("piano")
  .lpf(1500).room(.4)
  .gain(.5).release(.8)
  .swing(4)

// Bass
$: note("<d2 d2 [e2 d2] c2>")
  .sound("gm_acoustic_bass")
  .lpf(600).gain(.6).clip(.8)
  .swing(4)
```

**Why it works**: 88 BPM with swing humanizes. `.crush(12)` adds subtle grit. `.degradeBy(.15)` randomly drops hi-hats for organic feel. `.shape(.2)` warms drums. Low-pass on everything stays mellow.

### Recipe 4: Cinematic Build 🎬

```js
setcpm(24)

// Strings — rising pad
$: note("<[c3,eb3,g3] [c3,eb3,g3] [d3,f3,ab3] [eb3,g3,bb3]>")
  .sound("gm_synth_strings_1")
  .attack(.8).release(1.5)
  .lpf(saw.range(500, 3000).slow(16))
  .room(.6).roomsize(5).orbit(2)

// Piano — emotional melody
$: n("<0 [~ 2] 4 [3@2 2]>")
  .scale("C4:minor").sound("piano")
  .room(.5).delay(".3:.25:.5")
  .gain(.55)

// Percussion — building
$: s("<~ bd> <~ ~ sd ~>")
  .bank("RolandTR909")
  .room(.3).gain(.7)

// Sub
$: note("c1").sound("sine")
  .lpf(120).gain(.5)
  .release(1)
```

**Why it works**: 96 BPM gives cinematic weight. `.lpf(saw.range(...).slow(16))` on strings creates a long filter sweep building tension over 16 cycles. Piano in minor with delay adds emotion. Sparse percussion builds gradually. Sub anchors everything.

### Recipe 5: Minimal House Groove 🏠

```js
setcpm(31)

// Four-on-floor
$: s("bd*4, [~ cp]*2, [~ hh]*4")
  .bank("RolandTR909")

// Chord stab
$: n("[~ [0,2,4]]*2")
  .scale("A:minor").sound("sawtooth")
  .lpf(1200).decay(.15).sustain(0)
  .delay(".3:.125:.4").room(.3)

// Bass
$: note("[~ a1] [~ a1] [~ <c2 a1>] [~ a1]")
  .sound("sine").lpf(400)
  .decay(.2).sustain(0)

// Texture — evolving hats
$: s("hh*16").gain(sine.range(.2, .6).slow(2))
  .lpf(perlin.range(2000, 8000))
  .pan(rand)
```

**Why it works**: 124 BPM classic house tempo. Stab chords with short decay for that classic house feel. 16th hi-hats with gain shaped by sine = breathing texture. `perlin` on filter = organic movement. `rand` pan scatters hats in stereo.

### Recipe 6: Experimental Glitch 🔮

```js
setcpm(28)

// Fractured rhythm
$: s("bd sd [~ rim] cp")
  .bank("CasioRZ1")
  .iter(4).sometimes(x=>x.speed(-1))
  .crush(8).room(.4)

// Melody fragments
$: n("0 [2 4] <3 5> [~ <4 1>]")
  .add("<0 [0,2,4]>")
  .scale("C5:minor").sound("triangle")
  .off(1/16, x=>x.add(4).gain(.5))
  .release(.5).room(.5)
  .jux(rev)

// Noise textures
$: s("<white pink>*4")
  .decay(.03).sustain(0)
  .lpf(rand.range(500, 4000).segment(8))
  .pan(rand).gain(.25)
```

**Why it works**: `.iter(4)` rotates the pattern start point each cycle. `.sometimes(x=>x.speed(-1))` randomly reverses events. `.off()` with `.add()` creates canonic texture. `.jux(rev)` fills stereo field. Noise bursts with random filter add chaos.

### Template: Starting a New Piece

```js
// 1. Set tempo (choose cpm based on mood)
setcpm(___) // cpm = BPM ÷ 4

// 2. Drums (choose bank + pattern)
$: s("___ ___ ___ ___")
  .bank("___")

// 3. Harmonic element (choose scale + sound)
$: n("___").scale("___:___")
  .sound("___")
  .lpf(___).room(___)

// 4. Bass (root notes, low register)
$: note("___").sound("___")
  .lpf(___).gain(___)

// 5. Texture/FX layer (optional)
$: s("___").gain(___)
  .room(___).delay("___")
```

---

## Quick Self-Check Before Output

1. ✅ Every function name exists in Strudel (no `.reverb()`, `.lowpass()`, etc.)
2. ✅ All patterns are strings in quotes, not arrays
3. ✅ `setcpm()` used for tempo (not `.bpm()` or `.tempo()`)
4. ✅ `.room()` for reverb, `.lpf()` for filter, `.gain()` for volume
5. ✅ Signals use `.range()` and `.segment()` where needed
6. ✅ Each `$:` line is a complete parallel pattern
7. ✅ No `.play()` or `.start()` — code auto-plays
8. ✅ Parameter ranges are reasonable (no `.lpf(999999)` or `.room(50)`)
9. ✅ Different reverb/delay settings use different `.orbit(N)` values
10. ✅ Musical result matches the requested mood

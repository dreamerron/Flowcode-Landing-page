# Math Mastery App — Product & Technical Plan

A cross-platform learning app (desktop, Android tablet, iPad) to teach a child
serious mental-math skills, designed from day one to grow into other subjects
(science, nature, etc.) later.

---

## 1. First, a clarification: Vedic Math vs. ALOHA

These are **two different systems**, and the app should support both as separate
"tracks":

| | Vedic Math | ALOHA / Mental Abacus |
|---|---|---|
| What it is | 16 sutras (shortcut techniques) from Bharati Krishna Tirtha's system | Soroban (Japanese abacus) training; "ALOHA" is a franchise brand for it |
| Core skill | Clever algebraic shortcuts (e.g. multiply by 11, squares ending in 5, Nikhilam subtraction) | Visualizing an abacus in your head and moving imaginary beads |
| Best starting age | ~8+ (needs basic arithmetic first) | ~5–7 (starts from counting) |
| Strength | Fast multiplication, division, squares, algebra later | Blazing-fast addition/subtraction of long number chains, strong number sense |

**Recommendation:** if your son is young (5–8), start with the **abacus/mental
arithmetic track**, and unlock the **Vedic track** once he's fluent in basic
operations. The app models both as "courses" so this ordering is just content
configuration, not code.

---

## 2. Product Vision

- **Learner:** one child at first, but design for multiple child profiles per
  family from day one.
- **Goal:** genuine mental-math fluency — measured in speed + accuracy, not
  screen time.
- **Session model:** short daily sessions (10–20 min), like a musical
  instrument practice habit.
- **Parent role:** a parent dashboard shows progress, streaks, weak areas, and
  lets the parent adjust difficulty or assign practice.
- **Future:** the same shell hosts new subjects (science, nature) as
  downloadable/installable content packs.

## 3. Core Learning Features (MVP)

1. **Interactive virtual soroban** — a touch-friendly abacus with realistic
   bead physics; lessons animate bead movements, then the child imitates.
2. **Lesson player** — bite-sized lessons: short animated explanation →
   guided practice → free practice → timed quiz.
3. **Flash Anzan mode** — numbers flash on screen at configurable speed; child
   adds them mentally (the signature ALOHA drill). Speed ramps automatically.
4. **Vedic technique lessons** — one sutra per unit, with visual derivations
   (e.g. base-method multiplication shown geometrically), then drills.
5. **Adaptive drills + spaced repetition** — an SRS engine (SM-2-like)
   schedules review of fact families and techniques the child gets wrong or slow.
6. **Gamification** — XP, streaks, levels, unlockable avatars/themes, and a
   "belt" system (white → black belt) per track. No dark patterns, no ads.
7. **Progress dashboard (parent mode, PIN-protected)** — accuracy/speed trends
   per skill, time practiced, suggested focus areas.
8. **Offline-first** — everything works with no network; sync is a bonus.

### Explicitly out of MVP scope
Multiplayer, social features, accounts/cloud sync, science content, phone
layouts (tablet + desktop only), monetization.

## 4. Curriculum Structure (content, not code)

```
Track (Mental Abacus | Vedic Math | later: Science...)
 └── Level ("belt", e.g. Level 1: numbers 1–9)
      └── Unit (e.g. "Small friends: making 5")
           └── Lesson (explain → guide → practice → quiz)
                └── Exercise (generated or authored problem)
```

- **Exercises are generated, not hand-written**: each drill type is a
  parameterized generator (digit count, operand count, allowed techniques,
  time limit). This gives infinite practice and precise difficulty control.
- **Content is data** (JSON/YAML + assets), validated against a schema, so new
  tracks (science quizzes, flashcards, simulations) ship as content packs
  without app releases.

### Mental Abacus track outline (10 levels)
1. Bead values, reading/setting numbers 1–99
2. Simple add/subtract (no complements)
3. "Small friends" (5-complements)
4. "Big friends" (10-complements)
5. Mixed complements, 2-digit chains
6. 3-digit chains; begin visualization (abacus fades out)
7. Flash Anzan basics; multiplication tables on abacus
8. Mental-only add/subtract; 2×1 multiplication
9. Division on abacus; longer flash chains, decimals
10. Speed mastery; competition-style mixed drills

### Vedic Math track outline (8 levels)
1. Digit sums, casting out nines (self-checking)
2. Subtraction: All from 9, last from 10 (Nikhilam)
3. Multiply by 11, 12; doubling/halving
4. Base-method multiplication (near 10/100/1000)
5. Vertically & crosswise (general multiplication)
6. Squares (numbers ending in 5, near-base squares)
7. Division: flag method basics
8. Fractions, percentages, mixed speed mastery

## 5. Platform & Tech Stack

**Recommendation: Flutter.**

| Option | Verdict |
|---|---|
| **Flutter** ✅ | One codebase → Windows/macOS/Linux + Android + iOS/iPadOS. Excellent for custom, animation-heavy UI (abacus, flash drills). 60–120 fps canvas rendering. Strong offline story. |
| React Native + Electron | Two shells to maintain; desktop is second-class; canvas animation weaker. |
| Kotlin Multiplatform / Compose | Promising but iOS + desktop maturity is behind Flutter. |
| Web/PWA | Easiest reach, but iPad PWA limitations and weaker offline/native feel. Could come later as a 4th target from the same Flutter code (`flutter build web`). |
| Unity | Overkill; heavy runtime; poor for form-based parent UI. |

### Proposed architecture

```
apps/
  learner_app/        # Flutter app (all platforms)
packages/
  core_domain/        # entities: Profile, Track, Lesson, Attempt, SRS state
  content_engine/     # loads & validates content packs; exercise generators
  soroban_widget/     # reusable abacus rendering + gesture engine
  drill_engine/       # timing, scoring, adaptive difficulty, Flash Anzan
  srs/                # spaced-repetition scheduler
  analytics_local/    # local, privacy-safe event log for the dashboard
content/
  packs/abacus_v1/    # JSON curriculum + audio/animation assets
  packs/vedic_v1/
  schema/             # JSON Schema for pack validation (CI-enforced)
```

- **State management:** Riverpod (simple, testable).
- **Local storage:** Drift (SQLite) for attempts/SRS; content packs on disk.
- **Sync (later):** optional backend (Supabase or Firebase) syncing profiles
  and progress across the desktop and tablets — additive, not required.
- **Audio/animation:** Rive or Lottie for lesson animations; flutter_soloud
  for low-latency drill feedback sounds.
- **Kids' privacy:** no third-party analytics/ads; all data local by default
  (keeps you clean under COPPA/GDPR-K if you ever publish it).

### Why "content packs" matter for the science future
Adding science later = adding new **activity types** (flashcard, labeled
diagram, simple simulation, video quiz) to the content engine + a new pack.
The shell (profiles, XP, SRS, dashboard, lesson player) is subject-agnostic.

## 6. Roadmap

### Phase 0 — Foundation (2–3 weeks)
Monorepo scaffold, CI (analyze/test/build for all 5 targets), content schema,
profile system, navigation shell, design language (kid-friendly, large touch
targets, light/dark).

### Phase 1 — Abacus MVP (6–8 weeks)
Interactive soroban widget → lesson player → abacus Levels 1–4 content →
drill engine with scoring/timing → XP/streaks/belts → basic parent dashboard.
**Milestone: your son can do daily 15-minute practice end-to-end.**

### Phase 2 — Depth & adaptivity (4–6 weeks)
Flash Anzan mode, SRS review queue, adaptive difficulty, abacus Levels 5–10,
richer dashboard (speed/accuracy trends), sounds & animations polish.

### Phase 3 — Vedic track (4–6 weeks)
Vedic lesson animations (technique visualizations), Vedic Levels 1–8,
mixed-track daily plan ("today: 10 min abacus + 5 min Vedic").

### Phase 4 — Multi-device & release (3–4 weeks)
Optional cloud sync, app store packaging (Play Console, App Store,
notarized macOS/Windows builds), onboarding flow, beta with a few families.

### Phase 5 — Beyond math (ongoing)
New activity types (diagram labeling, experiments checklist, video quiz),
`science_v1` pack (age-appropriate: animals, plants, space, simple physics),
possibly a content-authoring tool so packs can be written without coding.

## 7. Key Risks & Mitigations

- **Kid engagement fades** → daily-habit loop (streaks, tiny sessions), belt
  ceremonies, and parent-visible wins; test with your son from Phase 1, weekly.
- **Abacus gesture feel is hard to get right** → build `soroban_widget` first
  and playtest it standalone before any curriculum work.
- **Curriculum quality** → follow established soroban progressions (small
  friends → big friends) and standard Vedic texts; validate each level with a
  real teacher or reference workbooks.
- **Scope creep toward science too early** → the pack architecture is the
  hedge; ship math first, science is "just another pack" later.

## 8. Immediate Next Steps

1. Confirm son's age/current level → pick starting track and Level-1 content.
2. Decide repo home (this should live in its own repository, not the landing
   page repo).
3. Scaffold Flutter monorepo (Phase 0).
4. Prototype the soroban widget and one Flash Anzan drill — the two riskiest,
   most differentiating pieces — and playtest with your son.

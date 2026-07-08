---
version: alpha
name: Sumi / moca-server
description: >
  moca-server project overrides for the Sumi design system. The canonical
  template lives at ~/.claude/designs/sumi/DESIGN.md; this file records
  ONLY what is specific to moca-server (primary + secondary accents +
  emotion data colors + domain components for the script-production
  workspace). CSS custom properties in client/src/global.sass are the
  implementation of these tokens.
colors:
  # --- Project primary accent (mocha brown) ---
  # Unsuffixed = Washi theme (light), -dark = Sumi theme (dark).
  # Mocha: the tool is named after 宮舞モカ. Deliberately desaturated
  # coffee brown so it never reads as 5ch-viewer's vivid amber
  # (amber = 5ch-viewer, blue = novel-server, red = youtube-sub-feed,
  # violet = comic-server). Washi value keeps white-on-accent ≥ 4.5:1.
  accent: "#6b4632"
  accent-subtle: "rgba(107, 70, 50, 0.12)"
  accent-dark: "#c9a086"
  accent-subtle-dark: "rgba(201, 160, 134, 0.15)"
  # accent-strong-dark: the Sumi primary-button surface. The pale mocha
  # accent-dark (needed for underlines/focus on dark surfaces) fails
  # white-on-accent contrast (~2:1), so filled primary buttons in Sumi
  # use this deepened mocha instead (white text ≥ 5.5:1). Washi primary
  # buttons keep using accent unchanged.
  accent-strong-dark: "#8a5a3c"
  # --- Project secondary accent (emerald green) ---
  # 宮舞モカのハイライトカラー。公式イラストの髪色から取ったエメラルド。
  # Role: "alive / subscribed / on-air" — a persistent state that runs
  # in the background of a screen while the user does something else
  # (currently the notification-subscribe toggle). Distinct from primary
  # (foreground of intent). Doyaru's emotion color is unified with this
  # hue (see below): モカちゃんの落ち着いた透き通った声 = ドヤ = 彼女の色。
  secondary: "#2a9d6e"
  secondary-subtle: "rgba(42, 157, 110, 0.12)"
  secondary-dark: "#4dd6a1"
  secondary-subtle-dark: "rgba(77, 214, 161, 0.15)"
  # --- Functional data colors: the five emotion axes ---
  # One hue per VOICEPEAK emotion axis. Washi values are darkness-ramp
  # inks (read as ink first, hue second); Sumi values are muted pastels
  # readable on surface-raised-dark.
  emo-bosoboso: "#4a5248"
  emo-bosoboso-dark: "rgba(150, 168, 152, 0.85)"
  # doyaru is intentionally the same hue as secondary — see Colors below.
  emo-doyaru: "#2a9d6e"
  emo-doyaru-dark: "rgba(77, 214, 161, 0.85)"
  emo-honwaka: "#8a5a20"
  emo-honwaka-dark: "rgba(240, 190, 120, 0.85)"
  emo-angry: "#8f2222"
  emo-angry-dark: "rgba(235, 120, 110, 0.85)"
  emo-teary: "#1f4e8c"
  emo-teary-dark: "rgba(120, 170, 235, 0.85)"
---

# moca-server — Sumi Project Overrides

## Overview

**This project follows the Sumi design system.** The canonical template is
`~/.claude/designs/sumi/DESIGN.md` — all shared rules (neutral chrome,
accent rules, scales, flat elevation, iconography, component recipes)
live there and are NOT restated here. This document records only what is
unique to moca-server. On chrome questions the template wins; on the
domain semantics below this file wins.

moca-server is a **script-production workspace** for the 宮舞モカ voice:
projects hold ordered lines (台本行), each line is either plain narration
or an emotion-annotated script, and the produced artifact is the script
JSON — not the audio. The user's loop is: pour text in → listen → nudge
emotion → listen again. The UI must make that loop one-tap tight.

Primary accent: **mocha brown** (`#6b4632` Washi / `#c9a086` Sumi). A
quiet, coffee-toned brown fitting the calm narration voice this tool
exists for. It marks interactive chrome only: active tabs, the one
primary button per screen, focused inputs, the shared focus ring, and
the currently-playing line indicator.

Secondary accent: **emerald green** (`#2a9d6e` Washi / `#4dd6a1` Sumi).
Taken from 宮舞モカ's own hair color — her hallmark hue. Its role is
strictly *persistent "alive" state* that runs in the background while
the user does something else: currently, the notification-subscribe
toggle in the header (ON = 購読中). Primary owns "the next action";
secondary owns "this switch is still on". They must never fight for the
same region — a screen may show both because they mean different things.

Themes follow the family's Sumi-first convention: `:root` in
`client/src/global.sass` IS the Sumi (dark) theme, and Washi (light,
e-paper) is applied via `@media (prefers-color-scheme: light)` — the OS
decides; there is no in-app toggle and no `data-theme` attribute.

## Domain model (declarative)

These statements define the ideal state; screens and components exist to
express them.

- **The script JSON is the master data; audio is a derived, disposable
  artifact.** Synthesis is deterministic (same JSON → same voice), so
  audio is never persisted — not in the DB, not on disk. Every playback
  is synthesized on demand and streamed. Storage holds text and JSON
  only; it must stay small no matter how many lines exist.
- **A project is an ordered list of lines.** A line is the atomic unit of
  listening, editing, and (future) export. Line order is the narration
  order.
- **Every line is in exactly one of two modes**, chosen at pour-in and
  **togglable per line afterward** (the mode badge is the toggle):
  - **アナウンサー (announcer):** plain text, zero emotion parameters,
    synthesized via the text path. The unadorned 宮舞モカ voice is a
    feature, not a fallback — this mode is the default.
  - **演技 (acting):** the line carries a script JSON (segments with
    emotion / speed / pitch / pause) produced once by /analyze and then
    owned by the user. After analysis, the JSON is hand-tuned via the
    editor; re-analysis never runs implicitly (it would overwrite the
    user's direction).
  - Toggling アナ→演技 runs /analyze for that line (explicit user tap =
    allowed; show the analysis latency honestly). Toggling 演技→アナ
    discards the hand-tuned script JSON and is guarded by ConfirmModal.
- **Whole-project listen-through is a first-class review tool.** Reading
  errors (e.g. "Hard" spelled out letter by letter) are only caught by
  ear, so a project plays end to end like radio: lines play sequentially
  in narration order, the playing indicator walks down the rows, and one
  tap stops it.
- **Emotion axes are a fixed five:** bosoboso, doyaru, honwaka, angry,
  teary (0–100 each), plus speed / pitch / pause. The editor exposes
  exactly these — no abstraction on top, no hidden parameters.
- **読み替え辞書 (reading dictionary):** a global table of surface →
  reading pairs applied to text **at synthesis time only**. The master
  text — line text and script JSON — never changes, and the UI always
  displays the original spelling; the dictionary rewrites sound, not
  text. Entries apply longest-surface-first; ASCII surfaces match
  case-insensitively. It applies to アナウンサー text and to every 演技
  segment text; /analyze always reads the original.
- **Fixing a misreading is a permanent two-way choice, made by ear:**
  words that are wrong everywhere (foreign words, proper nouns) go in
  the dictionary; readings that depend on context are fixed by editing
  that one line's text. The listen-through exists to surface these; the
  UI keeps both fixes one step away and never pretends to automate the
  choice.
- **Accent / intonation control is explicitly out of scope.** VOICEPEAK
  decides accent from the (rewritten) text; occasional odd intonation is
  accepted as character, not fought with tooling.
- **ZIP / bulk audio export is deliberately out of scope** until storage
  economics change. Nothing in the UI may promise batch download.

## Colors

The five emotion axes are the project's functional data colors. Each axis
owns one hue, monosemous across the app:

- **bosoboso — moss gray** (`#4a5248` / `rgba(150,168,152,0.85)`): 陰気
- **doyaru — emerald** (`#2a9d6e` / `rgba(77,214,161,0.85)`): ドヤ
- **honwaka — warm peach** (`#8a5a20` / `rgba(240,190,120,0.85)`): ほんわか
- **angry — red** (`#8f2222` / `rgba(235,120,110,0.85)`): 怒り
- **teary — blue** (`#1f4e8c` / `rgba(120,170,235,0.85)`): 涙声

**doyaru's hue is intentionally the same emerald green as the project's
secondary accent** — モカちゃんの落ち着いた透き通った声 = 彼女のドヤ =
彼女自身の色。This is a deliberate three-way unification (character
identity ⇔ signature emotion ⇔ persistent-alive state), not a token
collision. The single hue appears in three functionally distinct
contexts: the secondary token colors chrome (subscribe toggle ON),
`emo-doyaru` colors data (doyaru slider fill + chip). The template's
"emotion colors never color chrome" rule still holds — chrome uses the
`secondary` token, data uses the `emo-doyaru` token. They just happen
to resolve to the same color.

An emotion color appears in exactly two places: the fill of that axis's
slider, and that axis's value chip on a line row. Emotion colors never
color chrome, never mix into gradients, and never indicate state other
than "this axis has this value". Speed / pitch / pause are scalar
adjustments, not emotions — they stay in neutral chrome.

アナウンサー lines are **colorless by definition**: no emotion chips, no
data color anywhere on the row. The visual quietness of an announcer row
IS the mode indicator, reinforced by the mode toggle badge (アナ / 演技)
in caption type — a real button (see Components), but visually as quiet
as an outline badge.

**Primary buttons in Sumi** use `accent-strong-dark` as their surface
with white text; `accent-dark` (the pale mocha) remains the color of
active-tab underlines, focus rings, and accent text, where it must stand
out against dark surfaces. One accent identity, two luminances, each
where its contrast works.

## Layout

The template's two-pane list + detail grid applies directly, under one
piece of shared chrome:

- **App header:** a thin full-width band (a slim bar, visibly lighter
  presence than the panes — surface-raised, 1px hairline bottom border)
  that carries the always-on chrome the workspace can't. Currently
  that's the site title 「宮舞モカ 台本工房」 in label type (muted),
  the tab navigation for the two Sumi-recipe screens (台本 for the
  two-pane workspace, 辞書 for the reading dictionary), and — flushed
  to the far right — the **notification-subscribe megaphone toggle**
  (see Components). Nothing else has earned a spot here yet; when
  something eventually does, it goes here because the header is the
  natural home for app-global state, not because the header is the
  only place chrome is allowed. The bar stays visually quieter than
  the workspace so the panes below remain the primary reading surface.
- **List pane: projects.** Card rows — project name (label type), line
  count and updated-at (caption muted). The one primary button here is
  「新規プロジェクト」.
- **Detail pane: the line workspace.** A single scrolling column of line
  rows in narration order. The pane's sticky footer holds the pour-in
  entry point (labeled 「台本追加」) — pour-in is the primary action of
  this pane.
- **The two pane headers share one computed height** — title rows,
  padding, and any header controls align across the pane boundary so the
  workspace reads as one surface, not two stacked tools.
- **Dictionary view (辞書 tab):** not two-pane — a single dense table in
  the comic-server bookshelf spirit: one row per entry, columns 表記 /
  読み / play / delete, scanning many entries at once is the point. The
  add form (two inputs + the screen's one primary button) sits above the
  table. The per-row play button speaks the reading via /say for an
  instant ear check.

## Components

Domain components on top of the Sumi recipes:

- **Project row (list pane):** play-all icon-button (SVG triangle) to
  the left of the project name — tapping it starts the radio
  listen-through of that project's lines in order. During playback the
  button becomes stop, and the detail pane's playing indicator walks
  down the rows. Line count and updated-at stay caption muted.
- **Line row:** a card row containing, left to right: drag handle
  (SVG grip-vertical, muted; cursor grab), play icon-button, line text
  (body-sm, two lines max, ellipsized), emotion chips (演技 lines only),
  mode toggle badge, delete icon-button (quiet, danger on hover). There
  is no overflow menu and no edit button. Clicking the card toggles the
  inline emotion editor on a 演技 line and does nothing on an
  アナウンサー line — the card click is never an edit affordance. The
  currently-playing row carries a 4px accent left bar per the template's
  data-bar recipe — playing is chrome ("you are here"), not data.
- **Line text is immutable in place.** There is no inline editing of any
  kind (no input swap, no textarea, no contenteditable). All text
  operations live in the line context menu.
- **Line context menu (right-click / long-press on a line card):** the
  browser context menu is intercepted and replaced with a Sumi menu
  modal scoped to that line, top to bottom:
  - **台本追加** — inserts new lines *after this line* via the pour-in
    modal (the sticky-footer 台本追加 keeps appending at the end).
  - **テキスト編集** — a single-line text input pre-filled with the
    line's text inside the modal; Enter / primary commits, Esc cancels.
    This is the only way to change a line's text.
  - **この行を複製** — duplicates the line (mode and script JSON
    included), inserting the copy directly below. This exists for A/B
    direction work: tune the copy's emotions, keep the better take,
    delete the loser.
- **Mode toggle badge (アナ / 演技):** caption-size outline badge that is
  a real button. Tapping アナ runs /analyze on that line (button shows
  the template spinner while analyzing, ~10s) and flips it to 演技;
  tapping 演技 opens ConfirmModal (the hand-tuned JSON is destroyed)
  before reverting to アナ. Visually it stays as quiet as a badge —
  affordance comes from cursor and hover wash, not weight.
- **Reorder by drag:** the grip handle drags the row; a 2px accent
  insertion line shows the drop position between rows; dropping persists
  the new order immediately. Reordering exists because narration order
  is the artifact — but drag is the only mechanism; no up/down buttons.
- **Play / stop button:** the template 36px icon-button with SVG
  triangle / square glyphs (`currentColor`, Lucide-style). Never the
  characters ▶ / |> / ■. One line plays at a time; starting a line stops
  the previous one. Playback streams — the button flips to stop as soon
  as the stream opens, with the template spinner shown only if first
  audio takes >300ms.
- **Emotion chips:** caption-size value chips (`axis名 值`) on a line
  row, tinted with the axis color at subtle alpha with the axis color as
  text. Chips show only axes present in the line's JSON, in the fixed
  axis order. When a line has multiple segments, chips summarize the
  maximum value per axis; the full per-segment detail lives in the
  editor.
- **Emotion editor (inline expansion):** per segment: the segment text
  (body-sm), five labeled sliders (axis color fill on a muted track,
  current value as caption at the right), and three scalar steppers for
  speed / pitch / pause in neutral chrome. Edits update the JSON
  immediately (autosave, no save button) — the play button is always one
  tap away so the listen→nudge→listen loop never leaves the row.
  Re-analysis has no dedicated control: it is the mode toggle round-trip
  (演技→アナ→演技), each leg guarded as described above.
- **Pour-in modal (台本追加):** the template modal with a large
  textarea and a two-option mode segmented control — アナウンサー
  (default) / 演技 — described in one caption line each. Confirm is the
  modal's primary button. In 演技 mode the modal shows per-line analyze
  progress (「3/12 を分析中…」, muted caption + template spinner);
  analysis is slow (~10s per line) and the UI says so plainly instead of
  pretending otherwise. Lines that fail analysis land as アナウンサー
  lines with a danger-role caption, never lost.
- **Destructive actions** (project delete, line delete, 再分析,
  演技→アナ toggle) route through ConfirmModal per the template.
- **Notification-subscribe megaphone (app header, far right):** a
  template quiet icon-button toggling an app-global subscription to
  server-pushed notifications (POST /notify → SSE broadcast). OFF
  (muted): megaphone-off SVG in `muted` color. ON (subscribed):
  megaphone SVG in `secondary` (Washi) / `secondary-dark` (Sumi) with
  a slow opacity breathing (~2s, 0.6→1.0→0.6; suspended when
  `prefers-reduced-motion: reduce` is set — the color-only state still
  conveys ON). Clicking OFF→ON both opens the SSE stream *and*
  synchronously calls `new Audio().play().catch(()=>{})` inside the same
  handler to satisfy autoplay policies (Safari requires the play() to
  originate from the user gesture). Received text is played via a
  private HTMLAudioElement pointed at `/say` (text/plain, no
  /analyze — notifications are read plain for latency); it is
  **independent from the line-player** and may sound simultaneously
  with a running line or radio playback — script-listening and
  notification-listening are separate concerns, so the template's
  "exactly one line sounds at a time" rule scopes to the line-player
  only. If notifications pile up, they are played serially in FIFO;
  no queue cap is enforced (fire-and-forget delivery in the server
  guarantees the queue only holds arrivals-since-subscribe).

## Do's and Don'ts

- Do keep emotion colors monosemous: one axis, one hue, slider + chip
  only. Never chrome, never status, never the playing indicator.
- Do keep アナウンサー rows visually colorless — quietness is the mode's
  identity. Don't add a "no emotion" gray chip.
- Don't persist audio anywhere. If a future feature seems to need stored
  WAVs, the feature is out of scope until this document says otherwise.
- Don't run /analyze implicitly — analysis happens at pour-in or behind
  an explicit, ConfirmModal-guarded 再分析.
- Do keep the listen→nudge→listen loop inside the line row: sliders
  autosave and the play button never moves away from the hand.
- Do render play/stop as monochrome SVG per the template — the ▶ glyph
  and emoji are banned even though this is an audio tool.
- Do state real latency (analysis progress, first-audio spinner) in muted
  captions; never fake instant.
- Do keep the master text sacred: the dictionary rewrites what is heard,
  never what is displayed or stored in lines / script JSON.
- Don't build accent or intonation controls — reading (どう読むか) is in
  scope, melody (どう歌うか) is VOICEPEAK's.

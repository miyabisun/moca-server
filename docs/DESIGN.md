---
version: alpha
name: Sumi / moca-server
description: >
  moca-server project overrides for the Sumi design system. The canonical
  template lives at ~/.claude/designs/sumi/DESIGN.md; this file records
  ONLY what is specific to moca-server (accent + emotion data colors +
  domain components for the script-production workspace). CSS custom
  properties in client/src/global.sass are the implementation of these
  tokens.
colors:
  # --- Project accent (mocha brown) ---
  # Unsuffixed = Washi theme (light), -dark = Sumi theme (dark).
  # Mocha: the tool is named after 宮舞モカ. Deliberately desaturated
  # coffee brown so it never reads as 5ch-viewer's vivid amber
  # (amber = 5ch-viewer, blue = novel-server, red = youtube-sub-feed,
  # violet = comic-server). Washi value keeps white-on-accent ≥ 4.5:1.
  accent: "#6b4632"
  accent-subtle: "rgba(107, 70, 50, 0.12)"
  accent-dark: "#c9a086"
  accent-subtle-dark: "rgba(201, 160, 134, 0.15)"
  # --- Functional data colors: the five emotion axes ---
  # One hue per VOICEPEAK emotion axis. Washi values are darkness-ramp
  # inks (read as ink first, hue second); Sumi values are muted pastels
  # readable on surface-raised-dark.
  emo-bosoboso: "#4a5248"
  emo-bosoboso-dark: "rgba(150, 168, 152, 0.85)"
  emo-doyaru: "#5a3a7e"
  emo-doyaru-dark: "rgba(186, 148, 230, 0.85)"
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
one-accent rule, scales, flat elevation, iconography, component recipes)
live there and are NOT restated here. This document records only what is
unique to moca-server. On chrome questions the template wins; on the
domain semantics below this file wins.

moca-server is a **script-production workspace** for the 宮舞モカ voice:
projects hold ordered lines (台本行), each line is either plain narration
or an emotion-annotated script, and the produced artifact is the script
JSON — not the audio. The user's loop is: pour text in → listen → nudge
emotion → listen again. The UI must make that loop one-tap tight.

Accent: **mocha brown** (`#6b4632` Washi / `#c9a086` Sumi). A quiet,
coffee-toned brown fitting the calm narration voice this tool exists for.
It marks interactive chrome only: active tabs, the one primary button per
screen, focused inputs, the shared focus ring, and the currently-playing
line indicator.

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
- **Every line is in exactly one of two modes, chosen at pour-in:**
  - **アナウンサー (announcer):** plain text, zero emotion parameters,
    synthesized via the text path. The unadorned 宮舞モカ voice is a
    feature, not a fallback — this mode is the default.
  - **演技 (acting):** the line carries a script JSON (segments with
    emotion / speed / pitch / pause) produced once by /analyze and then
    owned by the user. After analysis, the JSON is hand-tuned via the
    editor; re-analysis never runs implicitly (it would overwrite the
    user's direction).
- **Emotion axes are a fixed five:** bosoboso, doyaru, honwaka, angry,
  teary (0–100 each), plus speed / pitch / pause. The editor exposes
  exactly these — no abstraction on top, no hidden parameters.
- **ZIP / bulk audio export is deliberately out of scope** until storage
  economics change. Nothing in the UI may promise batch download.

## Colors

The five emotion axes are the project's functional data colors. Each axis
owns one hue, monosemous across the app:

- **bosoboso — moss gray** (`#4a5248` / `rgba(150,168,152,0.85)`): 陰気
- **doyaru — violet** (`#5a3a7e` / `rgba(186,148,230,0.85)`): ドヤ
- **honwaka — warm peach** (`#8a5a20` / `rgba(240,190,120,0.85)`): ほんわか
- **angry — red** (`#8f2222` / `rgba(235,120,110,0.85)`): 怒り
- **teary — blue** (`#1f4e8c` / `rgba(120,170,235,0.85)`): 涙声

An emotion color appears in exactly two places: the fill of that axis's
slider, and that axis's value chip on a line row. Emotion colors never
color chrome, never mix into gradients, and never indicate state other
than "this axis has this value". Speed / pitch / pause are scalar
adjustments, not emotions — they stay in neutral chrome.

アナウンサー lines are **colorless by definition**: no emotion chips, no
data color anywhere on the row. The visual quietness of an announcer row
IS the mode indicator, reinforced by a muted outline badge (アナ / 演技)
in caption type.

## Layout

The template's two-pane list + detail grid applies directly:

- **List pane: projects.** Card rows — project name (label type), line
  count and updated-at (caption muted). The one primary button here is
  「新規プロジェクト」.
- **Detail pane: the line workspace.** A single scrolling column of line
  rows in narration order. The pane's sticky footer holds the pour-in
  entry point (「テキストを流し込む」) — pour-in is the primary action
  of this pane.

## Components

Domain components on top of the Sumi recipes:

- **Line row:** a card row containing, left to right: play icon-button,
  line text (body-sm, two lines max, ellipsized), emotion chips (演技
  lines only), mode badge, overflow menu (edit / delete). Tapping the row
  body expands the emotion editor inline (演技 lines) or an inline
  textarea (アナウンサー lines). The currently-playing row carries a 4px
  accent left bar per the template's data-bar recipe — playing is chrome
  ("you are here"), not data.
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
  tap away so the listen→nudge→listen loop never leaves the row. A quiet
  「再分析」 action exists behind the overflow menu, guarded by
  ConfirmModal (it discards hand tuning).
- **Pour-in modal (テキスト流し込み):** the template modal with a large
  textarea and a two-option mode segmented control — アナウンサー
  (default) / 演技 — described in one caption line each. Confirm is the
  modal's primary button. In 演技 mode the modal shows per-line analyze
  progress (「3/12 を分析中…」, muted caption + template spinner);
  analysis is slow (~10s per line) and the UI says so plainly instead of
  pretending otherwise. Lines that fail analysis land as アナウンサー
  lines with a danger-role caption, never lost.
- **Destructive actions** (project delete, line delete, 再分析) route
  through ConfirmModal per the template. Line deletion from the overflow
  menu is the danger-role button.

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

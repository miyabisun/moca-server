#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

wait_for_lines() {
  local file="$1" expected="$2" i
  for i in $(seq 1 100); do
    [ -f "$file" ] && [ "$(wc -l < "$file")" -ge "$expected" ] && return 0
    sleep 0.02
  done
  return 1
}

make_common_mocks() {
  local dir="$1"
  mkdir -p "$dir"
  cat > "$dir/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ "$args" == *'/notify/stream'* ]]; then
  echo stream >> "$MOCK_STREAM_CALLS"
  printf 'data: build\ndata: finished\n\n'
  exit 22
fi
body=$(cat)
printf '%s\n' "$args" >> "$MOCK_SAY_ARGS"
printf '%s\n' "$body" >> "$MOCK_SAY_BODIES"
if [[ "$args" == *'audio/wav'* ]]; then
  output=""
  previous=""
  for arg in "$@"; do
    if [ "$previous" = -o ]; then output="$arg"; fi
    previous="$arg"
  done
  {
    printf 'RIFF\377\377\377\377WAVEfmt '
    printf '\020\000\000\000\001\000\001\000\200\273\000\000\000\167\001\000\002\000\020\000data\377\377\377\377'
    printf '\000\000\001\000'
  } > "$output"
else
  printf 'OggS-mock-audio'
fi
MOCK
  chmod +x "$dir/curl"

  cat > "$dir/sleep" <<'MOCK'
#!/usr/bin/env bash
/bin/sleep 0.01
MOCK
  chmod +x "$dir/sleep"
}

test_ffplay_and_reconnect() {
  local dir="$TMP/ffplay"
  make_common_mocks "$dir"
  cat > "$dir/ffplay" <<'MOCK'
#!/usr/bin/env bash
cat >> "$MOCK_AUDIO"
MOCK
  chmod +x "$dir/ffplay"

  MOCK_STREAM_CALLS="$TMP/ffplay-stream" MOCK_SAY_ARGS="$TMP/ffplay-args" \
    MOCK_SAY_BODIES="$TMP/ffplay-bodies" MOCK_AUDIO="$TMP/ffplay-audio" \
    MOCA_RETRY_DELAY=0 PATH="$dir:/usr/bin:/bin" "$ROOT/bin/moca-listen" \
    > /dev/null 2> "$TMP/ffplay-err" &
  local pid=$!
  wait_for_lines "$TMP/ffplay-stream" 2 || { kill "$pid" 2>/dev/null || true; fail "SSEへ再接続しなかった"; }
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true

  grep -q 'audio/ogg' "$TMP/ffplay-args" || fail "ffplayでOggを要求していない"
  grep -q '^build$' "$TMP/ffplay-bodies" || fail "複数data行を改行付きで渡していない"
  grep -q '^finished$' "$TMP/ffplay-bodies" || fail "SSE本文が欠落した"
  grep -q 'OggS-mock-audio' "$TMP/ffplay-audio" || fail "ffplayへ音声を渡していない"
}

test_macos_native_wav() {
  local dir="$TMP/native"
  make_common_mocks "$dir"
  cat > "$dir/uname" <<'MOCK'
#!/usr/bin/env bash
[ "${1:-}" = -s ] && echo Darwin || echo Darwin
MOCK
  cat > "$dir/afplay" <<'MOCK'
#!/usr/bin/env bash
cp "$1" "$MOCK_PLAYED_WAV"
MOCK
  chmod +x "$dir/uname" "$dir/afplay"

  MOCK_STREAM_CALLS="$TMP/native-stream" MOCK_SAY_ARGS="$TMP/native-args" \
    MOCK_SAY_BODIES="$TMP/native-bodies" MOCK_PLAYED_WAV="$TMP/played.wav" \
    MOCA_PLAYER=afplay MOCA_RETRY_DELAY=0 PATH="$dir:/usr/bin:/bin" "$ROOT/bin/moca-listen" \
    > /dev/null 2> "$TMP/native-err" &
  local pid=$!
  for _ in $(seq 1 100); do
    [ -f "$TMP/played.wav" ] && break
    sleep 0.02
  done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true

  [ -f "$TMP/played.wav" ] || fail "afplayが呼ばれなかった"
  grep -q 'audio/wav' "$TMP/native-args" || fail "ネイティブ再生でWAVを要求していない"
  size=$(wc -c < "$TMP/played.wav")
  riff=$(od -An -tu4 -j4 -N4 "$TMP/played.wav" | tr -d ' ')
  data=$(od -An -tu4 -j40 -N4 "$TMP/played.wav" | tr -d ' ')
  [ "$riff" = "$((size - 8))" ] || fail "RIFFサイズを補正していない"
  [ "$data" = "$((size - 44))" ] || fail "dataサイズを補正していない"
}

test_wsl_soundplayer() {
  local dir="$TMP/wsl"
  make_common_mocks "$dir"
  cat > "$dir/wslpath" <<'MOCK'
#!/usr/bin/env bash
printf 'C:\\Temp\\moca.wav\n'
MOCK
  cat > "$dir/powershell.exe" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MOCK_POWERSHELL_ARGS"
MOCK
  chmod +x "$dir/wslpath" "$dir/powershell.exe"

  MOCK_STREAM_CALLS="$TMP/wsl-stream" MOCK_SAY_ARGS="$TMP/wsl-args" \
    MOCK_SAY_BODIES="$TMP/wsl-bodies" MOCK_POWERSHELL_ARGS="$TMP/powershell-args" \
    MOCA_PLAYER=windows-soundplayer MOCA_RETRY_DELAY=0 \
    PATH="$dir:/usr/bin:/bin" "$ROOT/bin/moca-listen" > /dev/null 2> "$TMP/wsl-err" &
  local pid=$!
  wait_for_lines "$TMP/powershell-args" 1 || { kill "$pid" 2>/dev/null || true; fail "SoundPlayerが呼ばれなかった"; }
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true

  grep -q 'audio/wav' "$TMP/wsl-args" || fail "WSL再生でWAVを要求していない"
  grep -q 'System.Media.SoundPlayer' "$TMP/powershell-args" || fail "PowerShellでSoundPlayerを使っていない"
  grep -Fq 'C:\Temp\moca.wav' "$TMP/powershell-args" || fail "Windows形式のWAVパスを渡していない"
}

test_automatic_player_selection() {
  local dir="$TMP/select"
  mkdir -p "$dir"
  cat > "$dir/uname" <<'MOCK'
#!/bin/bash
case "${MOCK_OS:-}" in
  Darwin) echo Darwin ;;
  WSL) [ "${1:-}" = -r ] && echo 5.15.0-microsoft-standard-WSL2 || echo Linux ;;
  Linux) echo Linux ;;
esac
MOCK
  cat > "$dir/afplay" <<'MOCK'
#!/bin/bash
exit 0
MOCK
  cat > "$dir/pw-play" <<'MOCK'
#!/bin/bash
exit 0
MOCK
  cat > "$dir/paplay" <<'MOCK'
#!/bin/bash
exit 0
MOCK
  cat > "$dir/aplay" <<'MOCK'
#!/bin/bash
exit 0
MOCK
  cat > "$dir/powershell.exe" <<'MOCK'
#!/bin/bash
exit 0
MOCK
  cat > "$dir/wslpath" <<'MOCK'
#!/bin/bash
exit 0
MOCK
  chmod +x "$dir"/*

  selected=$(MOCK_OS=Darwin PATH="$dir" /bin/bash -c 'source "$1"; select_player; printf "%s" "$PLAYER"' _ "$ROOT/bin/moca-listen")
  [ "$selected" = afplay ] || fail "macOSでafplayを自動選択しなかった"
  selected=$(MOCK_OS=Linux PATH="$dir" /bin/bash -c 'source "$1"; select_player; printf "%s" "$PLAYER"' _ "$ROOT/bin/moca-listen")
  [ "$selected" = pw-play ] || fail "Linuxでpw-playを優先しなかった"
  selected=$(MOCK_OS=WSL PATH="$dir" /bin/bash -c 'source "$1"; select_player; printf "%s" "$PLAYER"' _ "$ROOT/bin/moca-listen")
  [ "$selected" = windows-soundplayer ] || fail "WSLでSoundPlayerを自動選択しなかった"
}

test_missing_player_fails() {
  local dir="$TMP/missing"
  mkdir -p "$dir"
  cat > "$dir/uname" <<'MOCK'
#!/usr/bin/env bash
echo UnknownOS
MOCK
  chmod +x "$dir/uname"
  if MOCA_PLAYER=not-a-player PATH="$dir:/usr/bin:/bin" "$ROOT/bin/moca-listen" > /dev/null 2> "$TMP/missing-err"; then
    fail "プレイヤーなしで成功終了した"
  fi
  grep -q 'ffmpeg.*インストール' "$TMP/missing-err" || fail "ffmpegの導入案内がない"
}

test_ffplay_and_reconnect
test_macos_native_wav
test_wsl_soundplayer
test_automatic_player_selection
test_missing_player_fails
echo "moca-listen tests: ok"

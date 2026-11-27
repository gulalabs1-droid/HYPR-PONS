#!/bin/sh
# Renders every film in both formats into ../../output/videos (three at a time).
# FORMATS="h" renders only the 16:9 versions. Fails if any render fails.
set -e
cd "$(dirname "$0")"
OUT="${OUT:-../../output/videos}"; AUDIO="${AUDIO:-$OUT/audio}"
mkdir -p "$OUT" "$AUDIO"
for s in room-stays night-one two-am; do node music.mjs "$s" "$AUDIO/$s.wav"; done
failed=0
for f in ${FORMATS:-v h}; do
  pids=""
  for s in room-stays night-one two-am; do
    name="hypr-$s-$( [ "$f" = v ] && echo 9x16 || echo 16x9 ).mp4"
    node render.mjs "$s" "$f" "$OUT/$name" "$AUDIO/$s.wav" &
    pids="$pids $!"
  done
  for pid in $pids; do wait "$pid" || failed=1; done
done
exit $failed

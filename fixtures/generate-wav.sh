#!/bin/sh
# 8 s, 120 BPM, mono 44.1 kHz: kick-like sine sweep on every beat (0.5 s), short 6 kHz ticks on the off-beats.
set -eu
cd "$(dirname "$0")"
ffmpeg -y -loglevel error -f lavfi \
  -i "aevalsrc='0.8*exp(-mod(t,0.5)*9)*sin(2*PI*(45*mod(t,0.5)+4.4*(1-exp(-25*mod(t,0.5)))))+0.15*exp(-mod(t+0.25,0.5)*30)*sin(2*PI*6000*t)':s=44100:d=8" \
  -ac 1 -c:a pcm_s16le test-loop.wav

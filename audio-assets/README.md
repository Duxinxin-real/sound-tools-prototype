# Test audio files

These WAV files are generated locally, contain no copyrighted recordings, and are intended only for testing this prototype.

| File | Use |
|---|---|
| `01-clean-voice-like.wav` | Clean reference for Noise Remover or Sound Compare |
| `02-noisy-voice-like.wav` | Noisy input for Noise Remover; compare it with file 01 |
| `03-quiet-reference.wav` | “Before” file for a loudness comparison |
| `04-loud-reference.wav` | “After” file for a loudness comparison |
| `05-speaker-cleaner-sweep-165-230hz.wav` | Imported Speaker Cleaner playback; start at low volume |
| `06-low-tone-reference-220hz.wav` | “Before” file for a frequency comparison |
| `07-high-tone-reference-880hz.wav` | “After” file for a frequency comparison |

Recommended checks:

1. Noise Remover: import `02`, enhance it, then compare the original and enhanced previews.
2. Sound Compare loudness: use `03` as Before and `04` as After.
3. Sound Compare frequency: use `06` as Before and `07` as After.
4. Speaker Cleaner import: play `05` at a low initial volume.

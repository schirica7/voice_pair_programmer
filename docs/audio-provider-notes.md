# Audio Provider Notes

## Current Bias

Use LiveKit for the call/session layer. Keep AI/audio providers swappable until measured latency and quality make the choice obvious.

## STT Candidates

### OpenAI `gpt-realtime-whisper`

- Fits the OpenAI-only path.
- Good first comparison point for live transcription.
- Keeps auth and provider surface small.

### ElevenLabs `scribe_v2_realtime`

- Strong latency candidate for live STT.
- ElevenLabs documents partial and committed transcripts over WebSockets.
- Useful to test against OpenAI realtime whisper before committing to an STT provider.

### Deepgram

- Still worth remembering if endpointing, code-term accuracy, or raw streaming latency becomes a problem.
- Adds another provider, so avoid until OpenAI/ElevenLabs results are measured.

## TTS Candidates

### OpenAI `gpt-4o-mini-tts`

- Simplest TTS option if staying mostly OpenAI.
- Good default for early wiring.

### ElevenLabs

- Likely strongest candidate if voice quality/human feel matters more than provider simplicity.
- Natural pairing if Scribe v2 Realtime wins the STT test.

## Test Criteria

Compare STT providers on the same spoken prompts:

- time to first partial transcript
- time to committed/final transcript after speech ends
- handling of code terms like `useEffect`, `mmx_auth`, `AccessControlFunctions`, and filenames
- false commits or awkward endpointing
- behavior on short utterances like "wait", "no", "explain that", and "go back"

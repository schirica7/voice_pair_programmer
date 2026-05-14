# Voice Pair Programmer

## Description
This is a voice-based pair programming assistant for VS Code. It lets a developer talk through their code while the assistant uses lightweight IDE context to answer questions, explain code, and guide debugging.

This extension is intentionally not a replacement for agentic programming tools. Rather, its goal is to be a learning tool in helping developers understand what they are looking at while staying in control of their codebase.

## Human-Computer Interaction Research Motivation

Previous HCI research supports potential viability of a voice-based system for pair programming, with the caveat of it only being a learning tool. In particular, [*Amanuensis: The Programmer’s Apprentice*](https://arxiv.org/abs/1807.00082) (Dean et al., 2018) proposed conversational, context-aware programming assistance integrated into the developer workflow, and, with advanced transcription, large language, and text-to-speech models, this has become easier than ever to implement.

Further research (Ross et al., 2023) suggests that conversational programming assistants are most promising when they are grounded in the user’s code/context, support pair-programming-style interaction, and preserve user control rather than trying to fully automate the programmer.

Relevant work:
- Ross et al., *The Programmer’s Assistant* (2023)  
  https://arxiv.org/abs/2302.07080

- Ross et al., *A Case Study in Engineering a Conversational Programming Assistant's Persona* (2023)  
  https://arxiv.org/abs/2301.10016

- Kuttal et al., *Trade-offs for Substituting a Human with an Agent in a Pair Programming Context* (2021)  
  https://dl.acm.org/doi/10.1145/3411764.3445659

- Nowrin et al., *Programming by Voice* (2023)  
  https://dl.acm.org/doi/10.1145/3571884.3597130

- Dean et al., *Amanuensis: The Programmer’s Apprentice* (2018)  
  https://arxiv.org/abs/1807.00082

## Architecture

The VS Code extension captures current IDE context, including active file, cursor location, selected text, diagnostics, open tabs, and nearby code context (such as the current class or function).

This context is then sent to a local backend, which creates LiveKit access tokens, tracks the active room, and relays the active context into that room.

The LiveKit agent handles the realtime voice loop through an STT/LLM/TTS sandwich. I used Deepgram Nova 3 for the speech-to-text model, GPT 5.5 for the large language model, and ElevenLabs Turbo v2 for the text-to-speech model.

Lastly, the user's and LLM's outputs are then displayed on a webpage, which handles the realtime audio interface. It captures microphone input, publishes it to the LiveKit room over WebRTC, and plays the agent's audio response.

## Key Design Decisions/Limitations

I chose to run the microphone and speaker path in a normal browser page instead of a VS Code webview. VS Code webviews were unreliable for microphone permissions, while the browser path matches LiveKit’s intended WebRTC usage and gives lower-latency, more stable audio behavior. I did experiment with using ffmpeg to capture audio within the webview, but this was choppy and high-latency.

This allows the VS Code extension to stay small, as it simply starts the session and streams IDE context.

## Installation Requirements

This extension requires using the latest version of Visual Studio Code. As of May 14, 2026, this is version 1.119.0.
   - To install all dependencies, run `npm install` from the project's root directory.

This extension also requires the presence of a `.env` file in the `server` folder.
   - To populate this, first copy `server/.env.example`. Then, fill in the required fields which are:
     - `LIVEKIT_URL`
     - `LIVEKIT_API_KEY`
     - `LIVEKIT_API_SECRET`

## Non-Goals and Extensions

This project is not trying to autonomously edit code, replace coding agents, or hide implementation details from the user.

It is meant to support a specific use case that I find important in my own studying workflow, as I learn programming concepts best by talking through my code and asking questions as they come.

With this in mind, a possible extension could be a Google Docs or Microsoft Word agent that can read documents and uses a similar voice calling interface to this VS Code extension.
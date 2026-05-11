import { fileURLToPath } from 'node:url';

import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { RoomEvent } from '@livekit/rtc-node';

import { config } from './config.mjs';

const textDecoder = new TextDecoder();

export function createVoicePairSession() {
	const sessionOptions = {
		stt: new inference.STT({
			model: config.inference.stt.model,
			language: config.inference.stt.language,
		}),
		llm: new inference.LLM({
			model: config.inference.llm.model,
		}),
		tts: new inference.TTS({
			model: config.inference.tts.model,
			voice: config.inference.tts.voice,
		}),
	};

	return new voice.AgentSession(sessionOptions);
}

export function createVoicePairAgent(ideContext = null) {
	return new voice.Agent({
		instructions: getAgentInstructions(ideContext),
	});
}

export default defineAgent({
	entry: async (ctx) => {
		let latestIdeContext = null;
		const session = createVoicePairSession();
		const agent = createVoicePairAgent(latestIdeContext);

		session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
			console.log(`User transcript (${event.isFinal ? 'final' : 'partial'}): ${event.transcript}`);
			postTranscript(event).catch((error) => {
				console.warn(`Could not send transcript to backend: ${error.message}`);
			});
		});

		ctx.room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
			if (topic !== 'ide-context') {
				return;
			}

			try {
				const message = JSON.parse(textDecoder.decode(payload));

				if (message.type !== 'ide-context') {
					return;
				}

				latestIdeContext = message.context ?? null;
				session.updateAgent(createVoicePairAgent(latestIdeContext));
				console.log(`Received IDE context from ${participant?.identity ?? 'unknown participant'}`);
			} catch (error) {
				console.warn('Could not parse IDE context data message', error);
			}
		});

		await session.start({
			agent,
			room: ctx.room,
		});

		await session.generateReply({
			instructions: 'Briefly introduce yourself as the voice pair programmer and ask what the user wants to look at.',
			allowInterruptions: true,
		});
	},
});

function getAgentInstructions(ideContext) {
	const instructions = [
		'You are a voice-based pair programming tutor inside VS Code.',
		'Help the user understand the code they are working on without taking over.',
		'Keep spoken answers short, practical, and easy to interrupt.',
		'Prefer explaining what matters right now over listing every possible issue.',
		'When IDE context is available, use it as the source of truth.',
	];

	if (ideContext) {
		instructions.push('');
		instructions.push('Current IDE context:');
		instructions.push(JSON.stringify(summarizeIdeContext(ideContext), null, 2));
	}

	return instructions.join('\n');
}

function summarizeIdeContext(context) {
	const activeEditor = context.activeEditor;

	return {
		activeEditor: activeEditor
			? {
					relativePath: activeEditor.relativePath,
					languageId: activeEditor.languageId,
					cursorLine: activeEditor.cursorLine,
					cursorCharacter: activeEditor.cursorCharacter,
					selection: activeEditor.selection,
					primaryCodeContext: activeEditor.primaryCodeContext,
					fallbackCodeContext: activeEditor.fallbackCodeContext,
					diagnostics: activeEditor.diagnostics,
				}
			: null,
		workspace: {
			folders: context.workspace?.folders,
			openTabs: context.workspace?.openTabs,
			visibleEditors: context.workspace?.visibleEditors,
			activeTerminal: context.workspace?.activeTerminal,
			availableFiles: context.workspace?.availableFiles,
		},
		capturedAt: context.capturedAt,
	};
}

async function postTranscript(event) {
	const endpoint = new URL('/transcripts', `http://${config.host}:${config.port}`);
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			transcript: event.transcript,
			isFinal: event.isFinal,
			speakerId: event.speakerId,
			language: event.language,
			createdAt: event.createdAt,
		}),
	});

	if (!response.ok) {
		throw new Error(`Backend returned ${response.status}`);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	cli.runApp(
		new ServerOptions({
			agent: fileURLToPath(import.meta.url),
			wsURL: config.livekit.url,
			apiKey: config.livekit.apiKey,
			apiSecret: config.livekit.apiSecret,
			agentName: config.livekit.agentName,
		})
	);
}

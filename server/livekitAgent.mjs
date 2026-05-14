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
			modelOptions: config.inference.stt.modelOptions,
			fallback: config.inference.stt.fallback,
			connOptions: config.inference.stt.connOptions,
		}),
		llm: new inference.LLM({
			model: config.inference.llm.model,
		}),
		tts: new inference.TTS({
			model: config.inference.tts.model,
			voice: config.inference.tts.voice,
		}),
		turnHandling: config.turnHandling,
		aecWarmupDuration: 0,
		userAwayTimeout: config.session.userAwayTimeout,
		connOptions: config.session.connOptions,
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

		console.log('');
		console.log('LiveKit agent job accepted');
		console.log(`  room: ${ctx.room.name}`);
		console.log(`  agent: ${config.livekit.agentName}`);
		console.log(`  stt: ${config.inference.stt.model}`);
		console.log(`  stt fallback: ${JSON.stringify(config.inference.stt.fallback)}`);
		console.log(`  stt conn options: ${JSON.stringify(config.inference.stt.connOptions)}`);
		console.log(`  stt options: ${JSON.stringify(config.inference.stt.modelOptions)}`);
		console.log(`  llm: ${config.inference.llm.model}`);
		console.log(`  tts: ${config.inference.tts.model}`);
		console.log(`  turn handling: ${JSON.stringify(config.turnHandling)}`);
		console.log(`  worker: ${JSON.stringify(config.worker)}`);

		session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
			console.log(
				`User transcript (${event.isFinal ? 'final' : 'partial'}, ${config.inference.stt.model}): ${event.transcript}`
			);
			postTranscript(event).catch((error) => {
				console.warn(`Could not send transcript to backend: ${error.message}`);
			});
		});
		session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
			const message = getAssistantMessage(event);

			if (!message) {
				return;
			}

			console.log(`Assistant message (${config.inference.llm.model}): ${message.text}`);
			postAssistantMessage(message).catch((error) => {
				console.warn(`Could not send assistant message to backend: ${error.message}`);
			});
		});
		session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
			console.log(`User state: ${event.oldState} -> ${event.newState}`);
		});
		session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
			console.log(`Agent state: ${event.oldState} -> ${event.newState}`);
		});
		session.on(voice.AgentSessionEventTypes.Error, (event) => {
			console.warn('LiveKit agent session error');
			console.warn(event.error);
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
			outputOptions: {
				transcriptionEnabled: true,
				syncTranscription: true,
				jsonFormat: false,
			},
		});
		console.log('LiveKit agent session started');

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
		'Hard limit every spoken answer to 2 short sentences unless the user explicitly asks you to continue.',
		'If the user asks for a long or convoluted monologue, refuse the format and offer a short summary instead.',
		'Prefer explaining what matters right now over listing every possible issue.',
		'When IDE context is available, use it as the source of truth.',
		'Respond in a helpful, friendly, and human-like manner.',
		'Do not mention anything about pasting code, as there is no chat interface.',
		'Do not entertain any degenerate behavior from the user. You are a tutor, not a romantic partner.'
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
			sttModel: config.inference.stt.model,
		}),
	});

	if (!response.ok) {
		throw new Error(`Backend returned ${response.status}`);
	}
}

function getAssistantMessage(event) {
	const item = event.item;

	if (item?.type !== 'message' || item.role !== 'assistant') {
		return null;
	}

	const text = item.textContent ?? extractTextContent(item.content);

	if (!text?.trim()) {
		return null;
	}

	return {
		text: text.trim(),
		role: item.role,
		model: config.inference.llm.model,
		itemId: item.id,
		createdAt: typeof item.createdAt === 'number' ? item.createdAt : event.createdAt,
	};
}

function extractTextContent(content) {
	if (!Array.isArray(content)) {
		return typeof content === 'string' ? content : '';
	}

	return content
		.filter((part) => typeof part === 'string')
		.join('\n');
}

async function postAssistantMessage(message) {
	const endpoint = new URL('/assistant-messages', `http://${config.host}:${config.port}`);
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(message),
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
			numIdleProcesses: config.worker.numIdleProcesses,
			initializeProcessTimeout: config.worker.initializeProcessTimeout,
			shutdownProcessTimeout: config.worker.shutdownProcessTimeout,
		})
	);
}

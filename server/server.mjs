import http from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, getConfigStatus } from './config.mjs';
import { sendIdeContextToRoom } from './livekitContextRelay.mjs';
import { createLiveKitToken } from './livekitToken.mjs';

const serverDir = dirname(fileURLToPath(import.meta.url));
const callPageDir = join(serverDir, 'call-page');
const callPageHtmlPath = join(callPageDir, 'index.html');
const callPageCssPath = join(callPageDir, 'call.css');
const callPageScriptPath = join(callPageDir, 'call.js');
const debugDir = join(serverDir, 'debug');
const latestContextPath = join(debugDir, 'latest-context.json');
const liveKitClientPath = join(
	dirname(serverDir),
	'node_modules',
	'livekit-client',
	'dist',
	'livekit-client.umd.js'
);

let latestContext = null;
let activeRoomName = null;
let activeRoomReady = false;
let latestTranscript = null;
let latestAssistantMessage = null;
const stoppedRooms = new Map();
const leftRooms = new Map();

const server = http.createServer(async (request, response) => {
	const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

	if (request.method === 'GET' && requestUrl.pathname === '/health') {
		sendJson(response, 200, {
			ok: true,
			config: getConfigStatus(),
		});
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/call') {
		sendHtml(response, 200, readFileSync(callPageHtmlPath, 'utf8'));
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/call/call.css') {
		sendCss(response, 200, readFileSync(callPageCssPath, 'utf8'));
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/call/call.js') {
		sendJavaScript(response, 200, readFileSync(callPageScriptPath, 'utf8'));
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/vendor/livekit-client.umd.js') {
		sendJavaScript(response, 200, readFileSync(liveKitClientPath, 'utf8'));
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/context/latest') {
		sendJson(response, 200, latestContext ?? { context: null });
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/transcripts/latest') {
		sendJson(response, 200, {
			ok: true,
			transcript: latestTranscript,
		});
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/assistant-messages/latest') {
		sendJson(response, 200, {
			ok: true,
			message: latestAssistantMessage,
		});
		return;
	}

	if (request.method === 'GET' && requestUrl.pathname === '/call/state') {
		const roomName = requestUrl.searchParams.get('roomName');

		sendJson(response, 200, {
			ok: true,
			roomName,
			shouldClose: Boolean(roomName && stoppedRooms.has(roomName)),
			wasLeftByPage: Boolean(roomName && leftRooms.has(roomName)),
			stoppedAt: roomName ? stoppedRooms.get(roomName) ?? null : null,
			leftAt: roomName ? leftRooms.get(roomName) ?? null : null,
		});
		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/context') {
		try {
			const context = await readJson(request);
			latestContext = context;
			writeLatestContext(context);
			logContextSummary(context);
			relayContextToLiveKit(context);
			sendJson(response, 200, { ok: true });
		} catch (error) {
			sendJson(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : 'Invalid request',
			});
		}

		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/transcripts') {
		try {
			const transcript = normalizeTranscript(await readJson(request));
			latestTranscript = transcript;
			logTranscript(transcript);
			sendJson(response, 200, {
				ok: true,
				transcript,
			});
		} catch (error) {
			sendJson(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : 'Invalid transcript',
			});
		}

		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/assistant-messages') {
		try {
			const message = normalizeAssistantMessage(await readJson(request));
			latestAssistantMessage = message;
			logAssistantMessage(message);
			sendJson(response, 200, {
				ok: true,
				message,
			});
		} catch (error) {
			sendJson(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : 'Invalid assistant message',
			});
		}

		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/call/ready') {
		try {
			const body = await readJson(request);

			if (!body.roomName || body.roomName !== activeRoomName) {
				sendJson(response, 409, {
					ok: false,
					error: 'Call room does not match active room',
				});
				return;
			}

			activeRoomReady = true;

			if (latestContext) {
				relayContextToLiveKit(latestContext);
			}

			sendJson(response, 200, {
				ok: true,
				roomName: activeRoomName,
			});
		} catch (error) {
			sendJson(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : 'Invalid call ready request',
			});
		}

		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/livekit/token') {
		try {
			const body = await readJson(request);
			const session = await createLiveKitToken({
				roomName: body.roomName,
				identity: body.identity,
				dispatchAgent: body.dispatchAgent ?? false,
			});
			activeRoomName = session.roomName;
			activeRoomReady = false;
			latestTranscript = null;
			latestAssistantMessage = null;
			stoppedRooms.delete(session.roomName);
			leftRooms.delete(session.roomName);

			console.log('');
			console.log('Created LiveKit session');
			console.log(`  room: ${session.roomName}`);
			console.log(`  identity: ${session.identity}`);

			sendJson(response, 200, {
				ok: true,
				session,
			});
		} catch (error) {
			sendJson(response, 500, {
				ok: false,
				error: error instanceof Error ? error.message : 'Failed to create LiveKit token',
			});
		}

		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/call/stop') {
		try {
			const body = await readJson(request);
			const roomName = typeof body.roomName === 'string' && body.roomName
				? body.roomName
				: activeRoomName;

			if (roomName) {
				stoppedRooms.set(roomName, Date.now());

				if (roomName === activeRoomName) {
					activeRoomReady = false;
				}
			}

			sendJson(response, 200, {
				ok: true,
				roomName,
			});
		} catch (error) {
			sendJson(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : 'Invalid call stop request',
			});
		}

		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/call/left') {
		try {
			const body = await readJson(request);
			const roomName = typeof body.roomName === 'string' && body.roomName
				? body.roomName
				: activeRoomName;

			if (roomName) {
				leftRooms.set(roomName, Date.now());

				if (roomName === activeRoomName) {
					activeRoomReady = false;
				}
			}

			sendJson(response, 200, {
				ok: true,
				roomName,
			});
		} catch (error) {
			sendJson(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : 'Invalid call left request',
			});
		}

		return;
	}

	if (request.method === 'POST' && requestUrl.pathname === '/ask') {
		sendJson(response, 501, {
			ok: false,
			error: 'Direct /ask is disabled. LLM responses now belong in the LiveKit AgentSession pipeline.',
			inference: config.inference,
		});
		return;
	}

	sendJson(response, 404, {
		ok: false,
		error: 'Not found',
	});
});

server.listen(config.port, config.host, () => {
	console.log(`Voice Pair Programmer backend listening on http://${config.host}:${config.port}`);
});

function readJson(request) {
	return new Promise((resolve, reject) => {
		let body = '';

		request.setEncoding('utf8');
		request.on('data', (chunk) => {
			body += chunk;
		});
		request.on('end', () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch {
				reject(new Error('Request body must be valid JSON'));
			}
		});
		request.on('error', reject);
	});
}

function sendJson(response, statusCode, payload) {
	response.writeHead(statusCode, {
		'content-type': 'application/json',
	});
	response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
	response.writeHead(statusCode, {
		'content-type': 'text/html; charset=utf-8',
	});
	response.end(html);
}

function sendCss(response, statusCode, css) {
	response.writeHead(statusCode, {
		'content-type': 'text/css; charset=utf-8',
	});
	response.end(css);
}

function sendJavaScript(response, statusCode, script) {
	response.writeHead(statusCode, {
		'content-type': 'application/javascript; charset=utf-8',
	});
	response.end(script);
}

function writeLatestContext(context) {
	mkdirSync(debugDir, { recursive: true });
	writeFileSync(latestContextPath, `${JSON.stringify(context, null, 2)}\n`);
}

function logContextSummary(context) {
	const activeEditor = context.activeEditor;
	const workspace = context.workspace;

	console.log('');
	console.log('Received IDE context');
	console.log(`  file: ${activeEditor?.relativePath ?? 'none'}`);
	console.log(`  language: ${activeEditor?.languageId ?? 'none'}`);
	console.log(`  selection chars: ${activeEditor?.selection?.length ?? 0}`);
	console.log(`  diagnostics: ${activeEditor?.diagnostics?.length ?? 0}`);
	console.log(`  open tabs: ${workspace?.openTabs?.length ?? 0}`);
	console.log(`  available files: ${workspace?.availableFiles?.length ?? 0}`);
	console.log(`  debug file: ${latestContextPath}`);
}

function normalizeTranscript(body) {
	if (typeof body.transcript !== 'string') {
		throw new Error('Transcript must include transcript text');
	}

	return {
		transcript: body.transcript,
		isFinal: Boolean(body.isFinal),
		speakerId: typeof body.speakerId === 'string' ? body.speakerId : null,
		language: typeof body.language === 'string' ? body.language : null,
		createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
		sttModel: typeof body.sttModel === 'string' ? body.sttModel : config.inference.stt.model,
		receivedAt: new Date().toISOString(),
	};
}

function logTranscript(transcript) {
	const marker = transcript.isFinal ? 'final' : 'partial';
	console.log(`User transcript (${marker}, ${transcript.sttModel}): ${transcript.transcript}`);
}

function normalizeAssistantMessage(body) {
	if (typeof body.text !== 'string') {
		throw new Error('Assistant message must include text');
	}

	return {
		text: body.text,
		role: body.role === 'assistant' ? body.role : 'assistant',
		model: typeof body.model === 'string' ? body.model : config.inference.llm.model,
		itemId: typeof body.itemId === 'string' ? body.itemId : null,
		createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
		receivedAt: new Date().toISOString(),
	};
}

function logAssistantMessage(message) {
	console.log(`Assistant message (${message.model}): ${message.text}`);
}

function relayContextToLiveKit(context) {
	if (!activeRoomName) {
		console.log('Skipping LiveKit context relay: no active room yet');
		return;
	}

	if (!activeRoomReady) {
		console.log('Skipping LiveKit context relay: room is not ready yet');
		return;
	}

	sendIdeContextToRoom(activeRoomName, context).catch((error) => {
		console.warn(`Could not relay IDE context to LiveKit room ${activeRoomName}: ${error.message}`);
	});
}

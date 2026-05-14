const params = new URLSearchParams(location.search);
const roomName = params.get('roomName');
const status = document.getElementById('status');
const join = document.getElementById('join');
const mute = document.getElementById('mute');
const leave = document.getElementById('leave');
const audioSink = document.getElementById('audioSink');
const contextFile = document.getElementById('contextFile');
const contextCursor = document.getElementById('contextCursor');
const contextSymbol = document.getElementById('contextSymbol');
const contextTabs = document.getElementById('contextTabs');
const contextCode = document.getElementById('contextCode');
const userMeta = document.getElementById('userMeta');
const userTranscript = document.getElementById('userTranscript');
const assistantMeta = document.getElementById('assistantMeta');
const assistantMessage = document.getElementById('assistantMessage');

let room;
let isMuted = false;
let contextPoll;
let speechPoll;
let callStatePoll;
let lastTranscriptSignature = '';
let isAgentSpeaking = false;
let assistantTranscriptionSequence = 0;
let microphonePermissionStatus;
let isClosingFromExtension = false;
let isEndingFromPage = false;

const assistantTranscriptionStreams = new Map();

join.addEventListener('click', joinCall);
mute.addEventListener('click', toggleMute);
leave.addEventListener('click', () => {
	leaveCall({ notifyBackend: true, endSession: true });
});

pollContext();
contextPoll = setInterval(pollContext, 1000);
pollSpeech();
speechPoll = setInterval(pollSpeech, 500);
pollCallState();
callStatePoll = setInterval(pollCallState, 1000);
joinCall();

async function joinCall() {
	try {
		if (room || isClosingFromExtension) {
			return;
		}

		if (!roomName) {
			throw new Error('Missing roomName');
		}

		setStatus('Waiting for microphone permission...');
		join.disabled = true;

		const hasMicrophonePermission = await requestMicrophonePermission();
		if (!hasMicrophonePermission) {
			return;
		}

		setStatus('Creating token...');

		const tokenResponse = await fetch('/livekit/token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ roomName, dispatchAgent: true }),
		});
		const tokenPayload = await tokenResponse.json();

		if (!tokenResponse.ok || !tokenPayload.ok) {
			throw new Error(tokenPayload.error || 'Could not create token');
		}

		const { Room, RoomEvent } = LivekitClient;
		room = new Room({ adaptiveStream: true, dynacast: true });
		registerAssistantTranscriptionHandler(room);
		room
			.on(RoomEvent.Connected, () => setStatus('Connected. Turning mic on...'))
			.on(RoomEvent.Disconnected, (reason) => {
				resetControls();
				if (!isClosingFromExtension && !isEndingFromPage) {
					setStatus('Disconnected' + (reason ? ': ' + reason : ''));
				}
			})
			.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting...'))
			.on(RoomEvent.Reconnected, () => setStatus('Connected'))
			.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
				const agentSpeaking = speakers.some((speaker) => speaker.identity?.startsWith('agent-'));

				if (agentSpeaking && !isAgentSpeaking) {
					startAssistantTranscriptionTurn();
					showAssistantIntroPreview();
				}

				isAgentSpeaking = agentSpeaking;
			})
			.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
				if (track.kind !== 'audio') {
					return;
				}

				const element = track.attach();
				element.autoplay = true;
				element.dataset.participant = participant.identity;
				element.dataset.track = publication.trackName || publication.trackSid || 'audio';
				audioSink.appendChild(element);
				if (participant.identity?.startsWith('agent-')) {
					element.addEventListener('playing', showAssistantIntroPreview, { once: true });
				}
				element.play().catch((error) => {
					setStatus('Connected, but audio playback needs a click: ' + serializeError(error));
				});
			})
			.on(RoomEvent.TrackUnsubscribed, (track) => {
				for (const element of track.detach()) {
					element.remove();
				}
			});

		await room.connect(tokenPayload.session.url, tokenPayload.session.token);
		await room.localParticipant.setMicrophoneEnabled(true);
		await markRoomReady();
		setStatus('Connected. Mic is on.');
		mute.disabled = false;
		leave.disabled = false;
	} catch (error) {
		room = undefined;
		join.disabled = false;
		setStatus(getUserFacingError(error));
	}
}

async function requestMicrophonePermission() {
	if (!navigator.mediaDevices?.getUserMedia) {
		setStatus('This browser does not support microphone capture.');
		join.disabled = false;
		return false;
	}

	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		for (const track of stream.getTracks()) {
			track.stop();
		}

		return true;
	} catch (error) {
		join.disabled = false;

		if (isPermissionDeniedError(error)) {
			setStatus('Microphone permission denied. Allow microphone access, then press Join.');
			watchMicrophonePermissionForRetry();
			return false;
		}

		setStatus('Microphone unavailable: ' + serializeError(error));
		return false;
	}
}

async function watchMicrophonePermissionForRetry() {
	if (!navigator.permissions?.query) {
		return;
	}

	try {
		microphonePermissionStatus = await navigator.permissions.query({ name: 'microphone' });
		microphonePermissionStatus.onchange = () => {
			if (microphonePermissionStatus.state === 'granted' && !room && !isClosingFromExtension) {
				joinCall();
			}
		};
	} catch {
		// Some browsers do not expose microphone permission state.
	}
}

async function toggleMute() {
	if (!room) {
		return;
	}

	isMuted = !isMuted;
	await room.localParticipant.setMicrophoneEnabled(!isMuted);
	mute.textContent = isMuted ? 'Unmute' : 'Mute';
	setStatus(isMuted ? 'Connected. Mic is muted.' : 'Connected. Mic is on.');
}

async function leaveCall(options = {}) {
	if (options.endSession) {
		isEndingFromPage = true;
	}

	if (room) {
		await room.disconnect();
		room = undefined;
	}

	if (options.notifyBackend) {
		await notifyCallLeft();
	}

	resetControls();
	if (options.endSession) {
		join.disabled = true;
		setStatus('Left call. Closing tab...');
		window.close();

		setTimeout(() => {
			setStatus('Left call. Start again from VS Code.');
		}, 500);
	} else if (!isClosingFromExtension) {
		setStatus('Disconnected');
	}
}

async function pollCallState() {
	if (!roomName || isClosingFromExtension) {
		return;
	}

	try {
		const response = await fetch('/call/state?roomName=' + encodeURIComponent(roomName));
		const payload = await response.json();

		if (!response.ok || !payload.ok || !payload.shouldClose) {
			return;
		}

		isClosingFromExtension = true;
		setStatus('Stopped from VS Code. Closing tab...');
		await leaveCall();
		window.close();

		setTimeout(() => {
			setStatus('Stopped from VS Code. You can close this tab.');
		}, 500);
	} catch {
		// Keep the call page usable if the dev backend restarts.
	}
}

async function markRoomReady() {
	await fetch('/call/ready', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ roomName }),
	});
}

async function notifyCallLeft() {
	if (!roomName) {
		return;
	}

	try {
		await fetch('/call/left', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ roomName }),
		});
	} catch {
		// The local dev backend may already be shutting down.
	}
}

async function pollContext() {
	try {
		const response = await fetch('/context/latest');
		const payload = await response.json();
		const context = payload.context ?? payload;

		if (!context?.activeEditor) {
			contextFile.textContent = 'No active editor';
			contextCursor.textContent = '-';
			contextSymbol.textContent = '-';
			contextTabs.textContent = formatOpenTabs(context?.workspace?.openTabs ?? []);
			contextCode.textContent = 'Waiting for VS Code context...';
			return;
		}

		const editor = context.activeEditor;
		const codeContext = editor.primaryCodeContext ?? editor.fallbackCodeContext;
		contextFile.textContent = editor.relativePath ?? editor.fileName ?? 'Unknown file';
		contextCursor.textContent = 'Line ' + editor.cursorLine + ', column ' + editor.cursorCharacter;
		contextSymbol.textContent = codeContext?.name
			? codeContext.name + ' (' + (codeContext.kind ?? codeContext.source) + ')'
			: codeContext?.source ?? '-';
		contextTabs.textContent = formatOpenTabs(context.workspace?.openTabs ?? []);
		contextCode.textContent = codeContext?.text ?? editor.selection ?? 'No code context captured';
	} catch {
		contextFile.textContent = 'Context unavailable';
	}
}

async function pollSpeech() {
	await pollTranscript();
}

async function pollTranscript() {
	try {
		const response = await fetch('/transcripts/latest');
		const payload = await response.json();
		const transcript = payload.transcript;

		if (!response.ok || !payload.ok || !transcript?.transcript) {
			return;
		}

		const signature = JSON.stringify({
			text: transcript.transcript,
			isFinal: transcript.isFinal,
			createdAt: transcript.createdAt,
		});

		if (signature === lastTranscriptSignature) {
			return;
		}

		lastTranscriptSignature = signature;
		userTranscript.classList.remove('muted');
		userTranscript.textContent = transcript.transcript;
		userMeta.textContent = formatSpeechMeta(transcript.isFinal ? 'final' : 'listening', transcript.sttModel);
	} catch {
		// Keep the last visible transcript.
	}
}

function registerAssistantTranscriptionHandler(callRoom) {
	if (typeof callRoom.registerTextStreamHandler !== 'function') {
		return;
	}

	callRoom.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
		if (!participantInfo?.identity?.startsWith('agent-')) {
			return;
		}

		const streamKey = getAssistantTranscriptionStreamKey(reader);

		try {
			for await (const chunk of reader) {
				const text = normalizeAssistantTranscriptionChunk(chunk);

				if (!text.trim()) {
					continue;
				}

				if (!isAgentSpeaking && assistantTranscriptionStreams.size === 0) {
					startAssistantTranscriptionTurn();
				}

				assistantTranscriptionStreams.set(streamKey, text);
				renderAssistantTranscription();
			}
		} catch (error) {
			console.warn('Assistant transcription stream failed', error);
		}
	});
}

function startAssistantTranscriptionTurn() {
	assistantTranscriptionSequence += 1;
	assistantTranscriptionStreams.clear();
}

function getAssistantTranscriptionStreamKey(reader) {
	const info = reader?.info ?? {};
	const attributes = info.attributes ?? {};

	return (
		attributes['lk.transcription_segment_id'] ??
		attributes['lk.segment_id'] ??
		info.id ??
		info.streamId ??
		'assistant-stream-' + assistantTranscriptionSequence + '-' + assistantTranscriptionStreams.size
	);
}

function normalizeAssistantTranscriptionChunk(chunk) {
	if (typeof chunk !== 'string') {
		return String(chunk ?? '');
	}

	const trimmed = chunk.trim();

	if (!trimmed.startsWith('{')) {
		return chunk;
	}

	try {
		const parsed = JSON.parse(trimmed);
		return parsed.text ?? parsed.transcript ?? chunk;
	} catch {
		return chunk;
	}
}

function renderAssistantTranscription() {
	const text = Array.from(assistantTranscriptionStreams.values()).join('');

	if (!text.trim()) {
		return;
	}

	assistantMessage.classList.remove('muted');
	assistantMessage.textContent = text;
	assistantMeta.textContent = 'speaking';
}

function showAssistantIntroPreview() {
	if (assistantTranscriptionStreams.size > 0) {
		return;
	}

	assistantMessage.classList.remove('muted');
	assistantMeta.textContent = 'speaking';
}

function formatSpeechMeta(value, model) {
	return model ? value + ' · ' + model : value;
}

function formatOpenTabs(openTabs) {
	if (!openTabs.length) {
		return 'None';
	}

	return openTabs.join('\n\n');
}

function resetControls() {
	join.disabled = false;
	mute.disabled = true;
	leave.disabled = true;
	isMuted = false;
	isAgentSpeaking = false;
	assistantTranscriptionStreams.clear();
	mute.textContent = 'Mute';
	audioSink.textContent = '';
}

function setStatus(value) {
	status.textContent = value;
}

function serializeError(error) {
	if (error instanceof Error) {
		return error.name + ': ' + error.message;
	}

	return String(error);
}

function getUserFacingError(error) {
	if (isPermissionDeniedError(error)) {
		watchMicrophonePermissionForRetry();
		return 'Microphone permission denied. Allow microphone access, then press Join.';
	}

	return 'Error: ' + serializeError(error);
}

function isPermissionDeniedError(error) {
	const errorName = error instanceof Error ? error.name : '';
	return errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError';
}

window.addEventListener('beforeunload', () => {
	clearInterval(contextPoll);
	clearInterval(speechPoll);
	clearInterval(callStatePoll);

	if (room) {
		navigator.sendBeacon?.('/call/left', JSON.stringify({ roomName }));
		room.disconnect();
	}
});

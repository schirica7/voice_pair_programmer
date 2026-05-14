export function getCallPageHtml() {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Voice Pair Programmer Call</title>
	<style>
		:root {
			color-scheme: dark;
			--bg: #111;
			--panel: #1b1b1b;
			--panel-border: #303030;
			--text: #f4f4f4;
			--muted: #a8a8a8;
			--accent: #0e76fd;
			--danger: #e5484d;
		}

		* {
			box-sizing: border-box;
		}

		body {
			background: var(--bg);
			color: var(--text);
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			margin: 0;
			min-height: 100vh;
		}

		main {
			width: min(960px, calc(100vw - 32px));
			margin: 0 auto;
			padding: 28px 0;
			display: grid;
			gap: 16px;
		}

		header {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 16px;
		}

		h1,
		h2,
		p {
			margin: 0;
		}

		h1 {
			font-size: 24px;
		}

		h2 {
			font-size: 13px;
			color: var(--muted);
			text-transform: uppercase;
			letter-spacing: 0.04em;
		}

		p,
		.muted {
			color: var(--muted);
		}

		button {
			border: 0;
			border-radius: 6px;
			background: var(--accent);
			color: white;
			cursor: pointer;
			font-size: 14px;
			font-weight: 600;
			padding: 9px 13px;
		}

		button.secondary {
			background: #303030;
		}

		button.danger {
			background: var(--danger);
		}

		button:disabled {
			cursor: not-allowed;
			opacity: 0.55;
		}

		.actions {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
			justify-content: flex-end;
		}

		.grid {
			display: grid;
			grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
			gap: 16px;
		}

		.panel {
			background: var(--panel);
			border: 1px solid var(--panel-border);
			border-radius: 8px;
			padding: 14px;
			display: grid;
			gap: 10px;
			min-width: 0;
		}

		.status {
			font-size: 16px;
			line-height: 1.45;
		}

		.contextRows {
			display: grid;
			gap: 8px;
		}

		.conversation {
			display: grid;
			gap: 12px;
		}

		.turn {
			display: grid;
			gap: 5px;
			padding: 10px;
			border: 1px solid var(--panel-border);
			border-radius: 6px;
			background: #151515;
		}

		.turnHeader {
			display: flex;
			justify-content: space-between;
			gap: 10px;
			color: var(--muted);
			font-size: 12px;
			font-weight: 600;
		}

		.turnText {
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			line-height: 1.45;
		}

		.row {
			display: grid;
			grid-template-columns: 92px minmax(0, 1fr);
			gap: 10px;
			align-items: start;
		}

		.label {
			color: var(--muted);
		}

		.value {
			min-width: 0;
			overflow-wrap: anywhere;
		}

		pre {
			margin: 0;
			max-height: 360px;
			overflow: auto;
			white-space: pre-wrap;
			font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
		}

		#audioSink {
			display: none;
		}

		@media (max-width: 760px) {
			header,
			.grid {
				grid-template-columns: 1fr;
				display: grid;
			}

			.actions {
				justify-content: flex-start;
			}
		}
	</style>
</head>
<body>
	<main>
		<header>
			<div>
				<h1>Voice Pair Programmer</h1>
				<p>Browser call surface. VS Code provides IDE context.</p>
			</div>
			<div class="actions">
				<button id="join" type="button">Join</button>
				<button id="mute" class="secondary" type="button" disabled>Mute</button>
				<button id="leave" class="danger" type="button" disabled>Leave</button>
			</div>
		</header>

		<div class="grid">
			<section class="panel">
				<h2>Call</h2>
				<div id="status" class="status">Idle</div>
				<div id="audioSink"></div>
			</section>

			<section class="panel">
				<h2>IDE Context</h2>
				<div class="contextRows">
					<div class="row">
						<div class="label">File</div>
						<div id="contextFile" class="value">No context yet</div>
					</div>
					<div class="row">
						<div class="label">Cursor</div>
						<div id="contextCursor" class="value">-</div>
					</div>
					<div class="row">
						<div class="label">Symbol</div>
						<div id="contextSymbol" class="value">-</div>
					</div>
					<div class="row">
						<div class="label">Tabs</div>
						<div id="contextTabs" class="value">0</div>
					</div>
				</div>
			</section>
		</div>

		<section class="panel">
			<h2>Conversation</h2>
			<div class="conversation">
				<div class="turn">
					<div class="turnHeader">
						<span>You</span>
						<span id="userMeta">Waiting</span>
					</div>
					<div id="userTranscript" class="turnText muted">Start speaking when the call connects.</div>
				</div>
				<div class="turn">
					<div class="turnHeader">
						<span>Assistant</span>
						<span id="assistantMeta">Waiting</span>
					</div>
					<div id="assistantMessage" class="turnText muted">No response yet.</div>
				</div>
			</div>
		</section>

		<section class="panel">
			<h2>Current Code Context</h2>
			<pre id="contextCode">Waiting for VS Code context...</pre>
		</section>
	</main>

	<script src="/vendor/livekit-client.umd.js"></script>
	<script>
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
		let lastTranscriptSignature = '';
		let lastAssistantSignature = '';

		join.addEventListener('click', joinCall);
		mute.addEventListener('click', toggleMute);
		leave.addEventListener('click', leaveCall);

		pollContext();
		contextPoll = setInterval(pollContext, 1000);
		pollSpeech();
		speechPoll = setInterval(pollSpeech, 500);
		joinCall();

		async function joinCall() {
			try {
				if (room) {
					return;
				}

				if (!roomName) {
					throw new Error('Missing roomName');
				}

				setStatus('Creating token...');
				join.disabled = true;

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
				room
					.on(RoomEvent.Connected, () => setStatus('Connected. Turning mic on...'))
					.on(RoomEvent.Disconnected, (reason) => {
						setStatus('Disconnected' + (reason ? ': ' + reason : ''));
						resetControls();
					})
					.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting...'))
					.on(RoomEvent.Reconnected, () => setStatus('Connected'))
					.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
						if (track.kind !== 'audio') {
							return;
						}

						const element = track.attach();
						element.autoplay = true;
						element.dataset.participant = participant.identity;
						element.dataset.track = publication.trackName || publication.trackSid || 'audio';
						audioSink.appendChild(element);
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
				setStatus('Error: ' + serializeError(error));
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

		async function leaveCall() {
			if (room) {
				await room.disconnect();
				room = undefined;
			}

			resetControls();
			setStatus('Disconnected');
		}

		async function markRoomReady() {
			await fetch('/call/ready', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ roomName }),
			});
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
					contextTabs.textContent = String(context?.workspace?.openTabs?.length ?? 0);
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
				contextTabs.textContent = String(context.workspace?.openTabs?.length ?? 0);
				contextCode.textContent = codeContext?.text ?? editor.selection ?? 'No code context captured';
			} catch {
				contextFile.textContent = 'Context unavailable';
			}
		}

		async function pollSpeech() {
			await Promise.all([
				pollTranscript(),
				pollAssistantMessage(),
			]);
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

		async function pollAssistantMessage() {
			try {
				const response = await fetch('/assistant-messages/latest');
				const payload = await response.json();
				const message = payload.message;

				if (!response.ok || !payload.ok || !message?.text) {
					return;
				}

				const signature = JSON.stringify({
					text: message.text,
					itemId: message.itemId,
					createdAt: message.createdAt,
				});

				if (signature === lastAssistantSignature) {
					return;
				}

				lastAssistantSignature = signature;
				assistantMessage.classList.remove('muted');
				assistantMessage.textContent = message.text;
				assistantMeta.textContent = formatSpeechMeta('latest', message.model);
			} catch {
				// Keep the last visible assistant response.
			}
		}

		function formatSpeechMeta(status, model) {
			return model ? status + ' · ' + model : status;
		}

		function resetControls() {
			join.disabled = false;
			mute.disabled = true;
			leave.disabled = true;
			isMuted = false;
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

		window.addEventListener('beforeunload', () => {
			clearInterval(contextPoll);
			clearInterval(speechPoll);

			if (room) {
				room.disconnect();
			}
		});
	</script>
</body>
</html>`;
}

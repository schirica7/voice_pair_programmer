export function getCallPageHtml() {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Voice Pair Programmer Call</title>
	<style>
		body {
			background: #111;
			color: #f4f4f4;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			margin: 0;
			min-height: 100vh;
			display: grid;
			place-items: center;
		}
		main {
			width: min(520px, calc(100vw - 32px));
			display: grid;
			gap: 16px;
		}
		h1 {
			font-size: 22px;
			margin: 0;
		}
		p {
			color: #bdbdbd;
			margin: 0;
		}
		button {
			border: 0;
			border-radius: 6px;
			background: #0e76fd;
			color: white;
			cursor: pointer;
			font-size: 16px;
			font-weight: 600;
			padding: 12px 16px;
		}
		button.secondary {
			background: #2f2f2f;
		}
		.actions {
			display: flex;
			gap: 10px;
			flex-wrap: wrap;
		}
		#status {
			background: #1d1d1d;
			border-radius: 6px;
			padding: 12px;
			white-space: pre-wrap;
		}
	</style>
</head>
<body>
	<main>
		<h1>Voice Pair Programmer</h1>
		<p>This browser window owns microphone permissions. Keep VS Code open for IDE context.</p>
		<div class="actions">
			<button id="join" type="button">Join Call</button>
			<button id="leave" class="secondary" type="button">Leave</button>
		</div>
		<div id="status">Idle</div>
	</main>
	<script src="/vendor/livekit-client.umd.js"></script>
	<script>
		const params = new URLSearchParams(location.search);
		const roomName = params.get('roomName');
		const status = document.getElementById('status');
		const join = document.getElementById('join');
		const leave = document.getElementById('leave');
		let room;

		join.addEventListener('click', joinCall);
		leave.addEventListener('click', leaveCall);

		async function joinCall() {
			try {
				if (!roomName) {
					throw new Error('Missing roomName');
				}

				setStatus('Creating token...');
				const tokenResponse = await fetch('/livekit/token', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ roomName }),
				});
				const tokenPayload = await tokenResponse.json();

				if (!tokenResponse.ok || !tokenPayload.ok) {
					throw new Error(tokenPayload.error || 'Could not create token');
				}

				const { Room, RoomEvent } = LivekitClient;
				room = new Room({ adaptiveStream: true, dynacast: true });
				room
					.on(RoomEvent.Connected, () => setStatus('Connected. Turning mic on...'))
					.on(RoomEvent.Disconnected, (reason) => setStatus('Disconnected' + (reason ? ': ' + reason : '')))
					.on(RoomEvent.Reconnecting, () => setStatus('Reconnecting...'))
					.on(RoomEvent.Reconnected, () => setStatus('Connected'));

				await room.connect(tokenPayload.session.url, tokenPayload.session.token);
				await room.localParticipant.setMicrophoneEnabled(true);
				setStatus('Connected. Mic is on.');
			} catch (error) {
				setStatus('Error: ' + serializeError(error));
			}
		}

		async function leaveCall() {
			if (room) {
				await room.disconnect();
				room = undefined;
			}
			setStatus('Disconnected');
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
	</script>
</body>
</html>`;
}

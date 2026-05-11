import * as vscode from 'vscode';

import {
	BackendActionResult,
	BackendSendResult,
	CapturedContext,
	LiveKitSessionResult,
	TranscriptResult,
} from './types';

const defaultBackendUrl = 'http://localhost:3123';

type LiveKitTokenPayload = {
	ok?: boolean;
	error?: string;
	session?: {
		url?: string;
		roomName?: string;
		identity?: string;
		token?: string;
	};
};

export async function sendContextToBackend(
	capturedContext: CapturedContext
): Promise<BackendSendResult> {
	const backendUrl = getBackendUrl();
	const endpoint = new URL('/context', backendUrl);

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify(capturedContext),
		});

		if (!response.ok) {
			return {
				ok: false,
				status: `Backend returned ${response.status}`,
			};
		}

		return {
			ok: true,
			status: `Sent`,
		};
	} catch {
		return {
			ok: false,
			status: 'Backend offline',
		};
	}
}

export async function createLiveKitSession(): Promise<LiveKitSessionResult> {
	const backendUrl = getBackendUrl();
	const endpoint = new URL('/livekit/token', backendUrl);

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({}),
		});
		const payload = await response.json() as LiveKitTokenPayload;

		if (!response.ok || !payload.ok) {
			return {
				ok: false,
				status: payload.error ?? `Backend returned ${response.status}`,
			};
		}

		if (
			!payload.session?.url ||
			!payload.session.roomName ||
			!payload.session.identity ||
			!payload.session.token
		) {
			return {
				ok: false,
				status: 'Backend returned an incomplete LiveKit session',
			};
		}

		return {
			ok: true,
			status: `Room ${payload.session.roomName}`,
			session: {
				url: payload.session.url,
				roomName: payload.session.roomName,
				identity: payload.session.identity,
				token: payload.session.token,
			},
		};
	} catch {
		return {
			ok: false,
			status: 'Backend offline',
		};
	}
}

export function getLiveKitCallUrl(roomName: string): string {
	const backendUrl = getBackendUrl();
	const endpoint = new URL('/call', backendUrl);
	endpoint.searchParams.set('roomName', roomName);
	return String(endpoint);
}

export async function startBackendMic(roomName: string): Promise<BackendActionResult> {
	return postBackendAction('/mic/start', { roomName }, 'Mic publishing');
}

export async function stopBackendMic(): Promise<BackendActionResult> {
	return postBackendAction('/mic/stop', {}, 'Mic stopped');
}

export async function getLatestTranscript(): Promise<TranscriptResult> {
	const backendUrl = getBackendUrl();
	const endpoint = new URL('/transcripts/latest', backendUrl);

	try {
		const response = await fetch(endpoint);
		const payload = await response.json() as TranscriptResult;

		if (!response.ok || !payload.ok) {
			return {
				ok: false,
				status: payload.status ?? `Backend returned ${response.status}`,
			};
		}

		return {
			ok: true,
			status: 'Transcript received',
			transcript: payload.transcript ?? null,
		};
	} catch {
		return {
			ok: false,
			status: 'Backend offline',
		};
	}
}

async function postBackendAction(
	pathname: string,
	body: unknown,
	successStatus: string
): Promise<BackendActionResult> {
	const backendUrl = getBackendUrl();
	const endpoint = new URL(pathname, backendUrl);

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify(body),
		});
		const payload = await response.json() as { ok?: boolean; error?: string };

		if (!response.ok || !payload.ok) {
			return {
				ok: false,
				status: payload.error ?? `Backend returned ${response.status}`,
			};
		}

		return {
			ok: true,
			status: successStatus,
		};
	} catch {
		return {
			ok: false,
			status: 'Backend offline',
		};
	}
}

function getBackendUrl(): string {
	return vscode.workspace
		.getConfiguration('voicePairProgrammer')
		.get('backendUrl', defaultBackendUrl);
}

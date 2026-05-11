import * as vscode from 'vscode';

import { BackendAskResult, BackendSendResult, CapturedContext } from './types';

const defaultBackendUrl = 'http://localhost:3123';

type AskResponsePayload = {
	ok?: boolean;
	error?: string;
	answer?: {
		text?: string;
		model?: string;
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

export async function askBackend(question: string): Promise<BackendAskResult> {
	const backendUrl = getBackendUrl();
	const endpoint = new URL('/ask', backendUrl);

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify({ question }),
			});
			const payload = await response.json() as AskResponsePayload;

			if (!response.ok || !payload.ok) {
				return {
					ok: false,
					status: payload.error ?? `Backend returned ${response.status}`,
				};
			}

			if (!payload.answer?.text) {
				return {
					ok: false,
					status: 'Backend returned no answer text',
				};
			}

			return {
				ok: true,
				status: 'Answered',
				text: payload.answer.text,
			model: payload.answer.model,
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

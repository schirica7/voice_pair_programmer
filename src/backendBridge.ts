import * as vscode from 'vscode';

import { BackendSendResult, CapturedContext } from './types';

const defaultBackendUrl = 'http://localhost:3123';

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

function getBackendUrl(): string {
	return vscode.workspace
		.getConfiguration('voicePairProgrammer')
		.get('backendUrl', defaultBackendUrl);
}

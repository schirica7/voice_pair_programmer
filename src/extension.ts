import * as vscode from 'vscode';

import { sendContextToBackend } from './backendBridge';
import { getCapturedContext } from './ideContext';
import { VoicePairSidebarProvider } from './sidebarProvider';
import { CapturedContext } from './types';

const contextOutput = vscode.window.createOutputChannel('Voice Pair Programmer');

let isVoicePairRunning = false;
let lastCapturedContext: CapturedContext | null = null;
let statusBarItem: vscode.StatusBarItem;
let sidebarProvider: VoicePairSidebarProvider;

export function activate(context: vscode.ExtensionContext) {
	console.log('Voice Pair Programmer is active.');

	sidebarProvider = new VoicePairSidebarProvider(context.extensionUri);

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'voice-pair-programmer.toggleSession';
	updateStatusBarItem();
	statusBarItem.show();

	const sidebarRegistration = vscode.window.registerWebviewViewProvider(
		VoicePairSidebarProvider.viewType,
		sidebarProvider
	);

	const toggleSession = vscode.commands.registerCommand('voice-pair-programmer.toggleSession', () => {
		isVoicePairRunning = !isVoicePairRunning;
		updateStatusBarItem();
		sidebarProvider.setSessionRunning(isVoicePairRunning);

		const status = isVoicePairRunning ? 'started' : 'paused';
		vscode.window.showInformationMessage(`Voice Pair Programmer ${status}.`);
	});

	const captureContext = vscode.commands.registerCommand('voice-pair-programmer.captureContext', async () => {
		const capturedContext = await getCapturedContext();

		lastCapturedContext = capturedContext;
		sidebarProvider.setLastContext(capturedContext, isVoicePairRunning);

		contextOutput.clear();
		contextOutput.appendLine(JSON.stringify(capturedContext, null, 2));
		contextOutput.show(true);

		sidebarProvider.setBackendStatus('Sending...');
		const sendResult = await sendContextToBackend(capturedContext);
		sidebarProvider.setBackendStatus(sendResult.status);

		if (sendResult.ok) {
			vscode.window.showInformationMessage(`Captured context. ${sendResult.status}.`);
		} else {
			vscode.window.showWarningMessage(`Captured context, but ${sendResult.status.toLowerCase()}.`);
		}
	});

	context.subscriptions.push(
		sidebarRegistration,
		toggleSession,
		captureContext,
		statusBarItem,
		contextOutput
	);
}

function updateStatusBarItem(): void {
	statusBarItem.text = isVoicePairRunning ? '$(debug-pause) Voice Pair Programmer' : '$(debug-start) Voice Pair Programmer';
	statusBarItem.tooltip = isVoicePairRunning
		? 'Pause Voice Pair Programmer'
		: 'Start Voice Pair Programmer';
}

export function deactivate() {}

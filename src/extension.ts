import * as vscode from 'vscode';

import {
	createLiveKitSession,
	getLatestTranscript,
	recordMicDiagnostic,
	sendContextToBackend,
	startBackendMic,
	stopBackendMic,
} from './backendBridge';
import { getCapturedContext } from './ideContext';
import { VoicePairSidebarProvider } from './sidebarProvider';
import { CapturedContext } from './types';

const contextOutput = vscode.window.createOutputChannel('Voice Pair Programmer');
const localRefreshDelayMs = 250;
const transcriptPollIntervalMs = 500;

let isVoicePairRunning = false;
let lastCapturedContext: CapturedContext | null = null;
let lastContextSignature: string | null = null;
let statusBarItem: vscode.StatusBarItem;
let sidebarProvider: VoicePairSidebarProvider;
let localRefreshTimer: NodeJS.Timeout | undefined;
let transcriptPollTimer: NodeJS.Timeout | undefined;
let lastTranscriptSignature: string | null = null;

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
		toggleVoicePairSession();
	});

	const captureContext = vscode.commands.registerCommand('voice-pair-programmer.captureContext', async () => {
		const capturedContext = await syncLatestContext(true);

		sidebarProvider.setBackendStatus('Sending...');
		const sendResult = await sendContextToBackend(capturedContext);
		sidebarProvider.setBackendStatus(sendResult.status);

		if (sendResult.ok) {
			vscode.window.showInformationMessage(`Captured context. ${sendResult.status}.`);
		} else {
			vscode.window.showWarningMessage(`Captured context, but ${sendResult.status.toLowerCase()}.`);
		}
	});

	const askContext = vscode.commands.registerCommand('voice-pair-programmer.askContext', async () => {
		const capturedContext = await syncLatestContext(false);
		const sendResult = await sendContextToBackend(capturedContext);

		if (!sendResult.ok) {
			sidebarProvider.setBackendStatus(sendResult.status);
			vscode.window.showWarningMessage(`Could not sync context before asking: ${sendResult.status}`);
			return;
		}

		sidebarProvider.setBackendStatus('Context shared');
	});

	const recordMic = vscode.commands.registerCommand('voice-pair-programmer.recordMicDiagnostic', async () => {
		sidebarProvider.setBackendStatus('Recording mic sample...');
		const result = await recordMicDiagnostic();
		sidebarProvider.setBackendStatus(result.status);

		if (!result.ok) {
			vscode.window.showWarningMessage(`Could not record mic diagnostic: ${result.status}`);
			return;
		}

		vscode.window.showInformationMessage('Recording 5 seconds of sidecar mic audio.');
	});

	const logLiveKitError = vscode.commands.registerCommand('voice-pair-programmer.logLiveKitError', (error) => {
		contextOutput.appendLine('');
		contextOutput.appendLine('LiveKit error');
		contextOutput.appendLine(JSON.stringify(error, null, 2));
		contextOutput.show(true);
	});

	const localContextRefreshers = [
		vscode.window.onDidChangeActiveTextEditor(() => scheduleLocalContextRefresh()),
		vscode.window.onDidChangeTextEditorSelection(() => scheduleLocalContextRefresh()),
		vscode.window.tabGroups.onDidChangeTabs(() => scheduleLocalContextRefresh()),
		vscode.workspace.onDidChangeWorkspaceFolders(() => scheduleLocalContextRefresh()),
		vscode.workspace.onDidChangeTextDocument(() => scheduleLocalContextRefresh()),
		vscode.workspace.onDidCreateFiles(() => scheduleLocalContextRefresh()),
		vscode.workspace.onDidDeleteFiles(() => scheduleLocalContextRefresh()),
		vscode.workspace.onDidRenameFiles(() => scheduleLocalContextRefresh())
	];

	scheduleLocalContextRefresh();

	context.subscriptions.push(
		sidebarRegistration,
		toggleSession,
		captureContext,
		askContext,
		recordMic,
		logLiveKitError,
		...localContextRefreshers,
		statusBarItem,
		contextOutput
	);
}

async function syncLatestContext(showOutput: boolean): Promise<CapturedContext> {
	const capturedContext = await getCapturedContext();

	lastCapturedContext = capturedContext;
	lastContextSignature = getContextSignature(capturedContext);
	sidebarProvider.setLastContext(capturedContext, isVoicePairRunning);

	if (showOutput) {
		contextOutput.clear();
		contextOutput.appendLine(JSON.stringify(capturedContext, null, 2));
		contextOutput.show(true);
	}

	return capturedContext;
}

async function toggleVoicePairSession(): Promise<void> {
	if (isVoicePairRunning) {
		isVoicePairRunning = false;
		stopTranscriptPolling();
		updateStatusBarItem();
		sidebarProvider.setSessionRunning(false);
		stopBackendMic().then((result) => {
			if (!result.ok) {
				sidebarProvider.setBackendStatus(result.status);
			}
		});
		sidebarProvider.setBackendStatus('Call stopped');
		vscode.window.showInformationMessage('Voice Pair Programmer stopped.');
		return;
	}

	const capturedContext = await syncLatestContext(false);
	sidebarProvider.setBackendStatus('Creating LiveKit room...');

	const sendResult = await sendContextToBackend(capturedContext);
	if (!sendResult.ok) {
		sidebarProvider.setBackendStatus(sendResult.status);
		vscode.window.showWarningMessage(`Could not sync context before joining: ${sendResult.status}`);
		return;
	}

	const sessionResult = await createLiveKitSession();
	if (!sessionResult.ok || !sessionResult.session) {
		sidebarProvider.setBackendStatus(sessionResult.status);
		vscode.window.showWarningMessage(`Could not create LiveKit session: ${sessionResult.status}`);
		return;
	}

	isVoicePairRunning = true;
	updateStatusBarItem();
	sidebarProvider.setSessionRunning(true);
	sidebarProvider.setBackendStatus('Starting sidecar mic...');
	await sendContextToBackend(capturedContext);
	const micResult = await startBackendMic(sessionResult.session.roomName);
	sidebarProvider.setBackendStatus(micResult.status);

	if (!micResult.ok) {
		vscode.window.showWarningMessage(`Could not start sidecar microphone publisher: ${micResult.status}`);
	}

	await sendContextToBackend(capturedContext);
	startTranscriptPolling();
	vscode.window.showInformationMessage(`Voice Pair Programmer started ${sessionResult.session.roomName}.`);
}

function startTranscriptPolling(): void {
	stopTranscriptPolling();

	transcriptPollTimer = setInterval(() => {
		pollLatestTranscript();
	}, transcriptPollIntervalMs);
	pollLatestTranscript();
}

function stopTranscriptPolling(): void {
	if (!transcriptPollTimer) {
		return;
	}

	clearInterval(transcriptPollTimer);
	transcriptPollTimer = undefined;
}

async function pollLatestTranscript(): Promise<void> {
	const result = await getLatestTranscript();

	if (!result.ok || !result.transcript) {
		return;
	}

	const transcriptSignature = JSON.stringify({
		transcript: result.transcript.transcript,
		isFinal: result.transcript.isFinal,
		createdAt: result.transcript.createdAt,
	});

	if (transcriptSignature === lastTranscriptSignature) {
		return;
	}

	lastTranscriptSignature = transcriptSignature;
	sidebarProvider.setLastTranscript(
		result.transcript.transcript,
		result.transcript.isFinal,
		result.transcript.sttModel
	);
}

function scheduleLocalContextRefresh(): void {
	if (localRefreshTimer) {
		clearTimeout(localRefreshTimer);
	}

	localRefreshTimer = setTimeout(() => {
		localRefreshTimer = undefined;
		refreshLocalContext();
	}, localRefreshDelayMs);
}

async function refreshLocalContext(): Promise<void> {
	const capturedContext = await getCapturedContext();
	const contextSignature = getContextSignature(capturedContext);

	if (contextSignature === lastContextSignature) {
		return;
	}

	lastCapturedContext = capturedContext;
	lastContextSignature = contextSignature;
	sidebarProvider.setLastContext(capturedContext, isVoicePairRunning);

	if (isVoicePairRunning) {
		sendContextToBackend(capturedContext).then((result) => {
			if (!result.ok) {
				sidebarProvider.setBackendStatus(result.status);
			}
		});
	}
}

function getContextSignature(capturedContext: CapturedContext): string {
	return JSON.stringify({
		activeEditor: capturedContext.activeEditor,
		workspace: capturedContext.workspace,
	});
}

function updateStatusBarItem(): void {
	statusBarItem.text = isVoicePairRunning ? '$(debug-pause) Voice Pair Programmer' : '$(debug-start) Voice Pair Programmer';
	statusBarItem.tooltip = isVoicePairRunning
		? 'Pause Voice Pair Programmer'
		: 'Start Voice Pair Programmer';
}

export function deactivate() {
	stopTranscriptPolling();
}

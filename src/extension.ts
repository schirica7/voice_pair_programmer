import * as vscode from 'vscode';

import {
	createLiveKitSession,
	getLiveKitCallState,
	getLiveKitCallUrl,
	getLatestTranscript,
	sendContextToBackend,
	stopLiveKitCall,
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
let isVoicePairStarting = false;
let isVoicePairStopping = false;
let activeCallRoomName: string | null = null;

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
		logLiveKitError,
		...localContextRefreshers,
		statusBarItem,
		contextOutput
	);
}

async function syncLatestContext(showOutput: boolean): Promise<CapturedContext> {
	const capturedContext = resolveCapturedContext(await getCapturedContext());

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
	if (isVoicePairStarting || isVoicePairStopping) {
		return;
	}

	if (isVoicePairRunning) {
		isVoicePairStopping = true;
		isVoicePairRunning = false;
		stopTranscriptPolling();
		updateStatusBarItem();
		sidebarProvider.setSessionRunning(false);
		sidebarProvider.setBackendStatus('Stopping call page...');

		try {
			const stopResult = await stopLiveKitCall(activeCallRoomName);
			activeCallRoomName = null;
			sidebarProvider.setBackendStatus(stopResult.ok ? 'Call stopped' : stopResult.status);
			sidebarProvider.clearSpeech();

			if (!stopResult.ok) {
				vscode.window.showWarningMessage(`Voice Pair Programmer stopped, but ${stopResult.status.toLowerCase()}.`);
				return;
			}

			vscode.window.showInformationMessage('Voice Pair Programmer stopped.');
		} finally {
			isVoicePairStopping = false;
			updateStatusBarItem();
		}
		return;
	}

	isVoicePairStarting = true;
	updateStatusBarItem();
	sidebarProvider.setBackendStatus('Starting...');

	try {
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

		activeCallRoomName = sessionResult.session.roomName;
		lastTranscriptSignature = null;
		sidebarProvider.setLoadingMessage('Loading');
		sidebarProvider.setBackendStatus('Opening call page...');
		await sendContextToBackend(capturedContext);
		await vscode.env.openExternal(vscode.Uri.parse(getLiveKitCallUrl(sessionResult.session.roomName)));

		isVoicePairRunning = true;
		sidebarProvider.setSessionRunning(true);
		sidebarProvider.clearSpeech();
		sidebarProvider.setBackendStatus('Call page opened');
		await sendContextToBackend(capturedContext);
		startTranscriptPolling();
		vscode.window.showInformationMessage(`Voice Pair Programmer call opened ${sessionResult.session.roomName}.`);
	} finally {
		isVoicePairStarting = false;
		updateStatusBarItem();
	}
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
	const didCallEnd = await pollCallPageState();

	if (didCallEnd) {
		return;
	}

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

async function pollCallPageState(): Promise<boolean> {
	if (!isVoicePairRunning || !activeCallRoomName || isVoicePairStopping) {
		return false;
	}

	const result = await getLiveKitCallState(activeCallRoomName);

	if (!result.ok || !result.wasLeftByPage) {
		return false;
	}

	isVoicePairRunning = false;
	activeCallRoomName = null;
	stopTranscriptPolling();
	updateStatusBarItem();
	sidebarProvider.setSessionRunning(false);
	sidebarProvider.setBackendStatus('Call page left');
	sidebarProvider.clearSpeech();
	vscode.window.showInformationMessage('Voice Pair Programmer call ended from the browser.');
	return true;
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
	const capturedContext = resolveCapturedContext(await getCapturedContext());
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

function resolveCapturedContext(capturedContext: CapturedContext): CapturedContext {
	if (capturedContext.activeEditor || !lastCapturedContext?.activeEditor) {
		return capturedContext;
	}

	return {
		...lastCapturedContext,
		workspace: capturedContext.workspace,
		capturedAt: capturedContext.capturedAt,
	};
}

function getContextSignature(capturedContext: CapturedContext): string {
	return JSON.stringify({
		activeEditor: capturedContext.activeEditor,
		workspace: capturedContext.workspace,
	});
}

function updateStatusBarItem(): void {
	statusBarItem.text = isVoicePairStarting
		? '$(loading~spin) Voice Pair Programmer'
		: isVoicePairRunning
			? '$(debug-pause) Voice Pair Programmer'
			: '$(debug-start) Voice Pair Programmer';
	statusBarItem.tooltip = isVoicePairStarting
		? 'Starting Voice Pair Programmer'
		: isVoicePairRunning
		? 'Pause Voice Pair Programmer'
		: 'Start Voice Pair Programmer';
}

export function deactivate(): Promise<void> | void {
	stopTranscriptPolling();

	if (activeCallRoomName) {
		return stopLiveKitCall(activeCallRoomName).then(() => undefined);
	}
}

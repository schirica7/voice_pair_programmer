import * as vscode from 'vscode';

import { askBackend, sendContextToBackend } from './backendBridge';
import { getCapturedContext } from './ideContext';
import { VoicePairSidebarProvider } from './sidebarProvider';
import { CapturedContext } from './types';

const contextOutput = vscode.window.createOutputChannel('Voice Pair Programmer');
const localRefreshDelayMs = 250;

let isVoicePairRunning = false;
let lastCapturedContext: CapturedContext | null = null;
let lastContextSignature: string | null = null;
let statusBarItem: vscode.StatusBarItem;
let sidebarProvider: VoicePairSidebarProvider;
let localRefreshTimer: NodeJS.Timeout | undefined;

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

		const question = 'What should I pay attention to in the current IDE context?';
		sidebarProvider.setBackendStatus('Asking...');
		const askResult = await askBackend(question);
		sidebarProvider.setBackendStatus(askResult.status);

		if (!askResult.ok || !askResult.text) {
			vscode.window.showWarningMessage(`Could not get LLM response: ${askResult.status}`);
			return;
		}

		contextOutput.appendLine('');
		contextOutput.appendLine('LLM response');
		contextOutput.appendLine(`Model: ${askResult.model ?? 'unknown'}`);
		contextOutput.appendLine(askResult.text);
		contextOutput.show(true);

		vscode.window.showInformationMessage(askResult.text, { modal: true });
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

export function deactivate() {}

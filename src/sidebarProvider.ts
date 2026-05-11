import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { getSidebarState } from './sidebarState';
import { CapturedContext, SidebarState } from './types';

type SidebarMessage = {
	command?: string;
};

export class VoicePairSidebarProvider implements vscode.WebviewViewProvider {
	static readonly viewType = 'voice-pair-programmer.sidebar';

	private view: vscode.WebviewView | undefined;
	private isRunning = false;
	private lastContext: CapturedContext | null = null;
	private backendStatus = 'Not sent';

	constructor(private readonly extensionUri: vscode.Uri) {}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
		};

		webviewView.webview.onDidReceiveMessage((message: SidebarMessage) => {
			if (message.command === 'toggleSession') {
				vscode.commands.executeCommand('voice-pair-programmer.toggleSession');
			}

			if (message.command === 'captureContext') {
				vscode.commands.executeCommand('voice-pair-programmer.captureContext');
			}
		});

		webviewView.webview.html = this.getHtml(webviewView.webview);
	}

	setSessionRunning(isRunning: boolean): void {
		this.isRunning = isRunning;
		this.postState(this.getState());
	}

	setLastContext(capturedContext: CapturedContext, isRunning: boolean): void {
		this.lastContext = capturedContext;
		this.isRunning = isRunning;
		this.postState(this.getState());
	}

	setBackendStatus(status: string): void {
		this.backendStatus = status;
		this.postState(this.getState());
	}

	private postState(state: SidebarState): void {
		this.view?.webview.postMessage({
			type: 'state',
			state,
		});
	}

	private getState(): SidebarState {
		return getSidebarState(this.isRunning, this.lastContext, this.backendStatus);
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();
		const templatePath = path.join(this.extensionUri.fsPath, 'media', 'sidebar.html');
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js'));
		const initialState = escapeJsonForHtml(this.getState());

		return fs.readFileSync(templatePath, 'utf8')
			.replaceAll('${cspSource}', webview.cspSource)
			.replaceAll('${nonce}', nonce)
			.replaceAll('${styleUri}', String(styleUri))
			.replaceAll('${scriptUri}', String(scriptUri))
			.replaceAll('${initialState}', initialState);
	}
}

function escapeJsonForHtml(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

function getNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';

	for (let i = 0; i < 32; i++) {
		nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}

	return nonce;
}

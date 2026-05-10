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

	private postState(state: SidebarState): void {
		this.view?.webview.postMessage({
			type: 'state',
			state,
		});
	}

	private getState(): SidebarState {
		return getSidebarState(this.isRunning, this.lastContext);
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();
		const templatePath = path.join(this.extensionUri.fsPath, 'media', 'sidebar.html');
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.js'));
		const initialState = JSON.stringify(this.getState()).replace(/</g, '\\u003c');

		return fs.readFileSync(templatePath, 'utf8')
			.replaceAll('${cspSource}', webview.cspSource)
			.replaceAll('${nonce}', nonce)
			.replaceAll('${styleUri}', String(styleUri))
			.replaceAll('${scriptUri}', String(scriptUri))
			.replaceAll('${initialState}', initialState);
	}
}

function getNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';

	for (let i = 0; i < 32; i++) {
		nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
	}

	return nonce;
}

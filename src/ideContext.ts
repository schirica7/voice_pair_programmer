import * as vscode from 'vscode';

import { CapturedContext, CapturedDiagnostic } from './types';

export async function getCapturedContext(): Promise<CapturedContext> {
	const activeEditor = vscode.window.activeTextEditor;
	const availableFiles = await vscode.workspace.findFiles(
		'**/*',
		'{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**,**/coverage/**}',
		200
	);

	return {
		activeEditor: activeEditor ? getActiveEditorContext(activeEditor) : null,
		workspace: {
			folders: getWorkspaceFolders(),
			openTabs: getOpenTabs(),
			visibleEditors: vscode.window.visibleTextEditors.map((editor) => getRelativePath(editor.document.uri)),
			activeTerminal: vscode.window.activeTerminal?.name ?? null,
			terminals: vscode.window.terminals.map((terminal) => terminal.name),
			availableFiles: availableFiles.map(getRelativePath).sort(),
		},
		capturedAt: new Date().toISOString(),
	};
}

function getActiveEditorContext(editor: vscode.TextEditor): CapturedContext['activeEditor'] {
	const document = editor.document;
	const position = editor.selection.active;

	return {
		fileName: document.fileName,
		relativePath: getRelativePath(document.uri),
		languageId: document.languageId,
		cursorLine: position.line + 1,
		cursorCharacter: position.character + 1,
		selection: document.getText(editor.selection),
		diagnostics: vscode.languages.getDiagnostics(document.uri).map(getCapturedDiagnostic),
	};
}

function getCapturedDiagnostic(diagnostic: vscode.Diagnostic): CapturedDiagnostic {
	return {
		source: diagnostic.source,
		message: diagnostic.message,
		severity: getDiagnosticSeverity(diagnostic.severity),
		line: diagnostic.range.start.line + 1,
		character: diagnostic.range.start.character + 1,
	};
}

function getDiagnosticSeverity(severity: vscode.DiagnosticSeverity): string {
	switch (severity) {
		case vscode.DiagnosticSeverity.Error:
			return 'error';
		case vscode.DiagnosticSeverity.Warning:
			return 'warning';
		case vscode.DiagnosticSeverity.Information:
			return 'information';
		case vscode.DiagnosticSeverity.Hint:
			return 'hint';
	}
}

function getWorkspaceFolders(): string[] {
	return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
}

function getOpenTabs(): string[] {
	return vscode.window.tabGroups.all.flatMap((group) =>
		group.tabs.map((tab) => getTabLabel(tab)).filter((label) => label.length > 0)
	);
}

function getTabLabel(tab: vscode.Tab): string {
	const input = tab.input;

	if (input instanceof vscode.TabInputText) {
		return getRelativePath(input.uri);
	}

	if (input instanceof vscode.TabInputTextDiff) {
		return `${getRelativePath(input.original)} -> ${getRelativePath(input.modified)}`;
	}

	if (input instanceof vscode.TabInputNotebook) {
		return getRelativePath(input.uri);
	}

	if (input instanceof vscode.TabInputNotebookDiff) {
		return `${getRelativePath(input.original)} -> ${getRelativePath(input.modified)}`;
	}

	return tab.label;
}

function getRelativePath(uri: vscode.Uri): string {
	if (uri.scheme === 'file') {
		return vscode.workspace.asRelativePath(uri, false);
	}

	return uri.toString();
}

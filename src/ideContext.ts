import * as vscode from 'vscode';

import {
	CapturedCodeContext,
	CapturedContext,
	CapturedDiagnostic,
	CapturedSymbol,
	CodeContextKind,
} from './types';

const defaultSurroundingLineRadius = 35;

export async function getCapturedContext(): Promise<CapturedContext> {
	const activeEditor = vscode.window.activeTextEditor;
	const availableFiles = await vscode.workspace.findFiles(
		'**/*',
		'{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**,**/coverage/**}',
		200
	);

	return {
		activeEditor: activeEditor ? await getActiveEditorContext(activeEditor) : null,
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

async function getActiveEditorContext(editor: vscode.TextEditor): Promise<CapturedContext['activeEditor']> {
	const document = editor.document;
	const position = editor.selection.active;
	const selection = document.getText(editor.selection);
	const enclosingSymbol = await getEnclosingSymbol(document, position);

	return {
		fileName: document.fileName,
		relativePath: getRelativePath(document.uri),
		languageId: document.languageId,
		cursorLine: position.line + 1,
		cursorCharacter: position.character + 1,
		selection,
		primaryCodeContext: getPrimaryCodeContext(editor.selection, selection, enclosingSymbol, document, position.line),
		fallbackCodeContext: getFallbackCodeContext(document, position.line),
		enclosingSymbol,
		diagnostics: vscode.languages.getDiagnostics(document.uri).map(getCapturedDiagnostic),
	};
}

function getPrimaryCodeContext(
	selection: vscode.Selection,
	selectionText: string,
	enclosingSymbol: CapturedSymbol | null,
	document: vscode.TextDocument,
	activeLine: number
): CapturedCodeContext | null {
	if (selectionText) {
		return {
			source: 'selection',
			kind: 'unknown',
			range: {
				startLine: selection.start.line + 1,
				endLine: selection.end.line + 1,
			},
			text: selectionText,
		};
	}

	if (enclosingSymbol) {
		return {
			source: 'enclosingSymbol',
			name: enclosingSymbol.name,
			kind: enclosingSymbol.kind,
			range: enclosingSymbol.range,
			text: enclosingSymbol.text,
		};
	}

	return getTopLevelCodeContext(document, activeLine);
}

function getTopLevelCodeContext(document: vscode.TextDocument, activeLine: number): CapturedCodeContext {
	const fallbackContext = getFallbackCodeContext(document, activeLine);

	return {
		...fallbackContext,
		source: 'topLevel',
		name: 'top-level code',
		kind: 'topLevel',
	};
}

async function getEnclosingSymbol(
	document: vscode.TextDocument,
	position: vscode.Position
): Promise<CapturedSymbol | null> {
	const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | vscode.SymbolInformation[]>(
		'vscode.executeDocumentSymbolProvider',
		document.uri
	);

	if (!symbols || symbols.length === 0 || !isDocumentSymbolArray(symbols)) {
		return null;
	}

	const symbol = findSmallestContainingSymbol(symbols, position);

	if (!symbol) {
		return null;
	}

	return {
		name: symbol.name,
		kind: getNormalizedSymbolKind(symbol, document),
		range: {
			startLine: symbol.range.start.line + 1,
			endLine: symbol.range.end.line + 1,
		},
		text: getRangeText(document, symbol.range),
	};
}

function findSmallestContainingSymbol(
	symbols: vscode.DocumentSymbol[],
	position: vscode.Position
): vscode.DocumentSymbol | null {
	let bestMatch: vscode.DocumentSymbol | null = null;

	for (const symbol of symbols) {
		if (!symbol.range.contains(position)) {
			continue;
		}

		const childMatch = findSmallestContainingSymbol(symbol.children, position);
		const candidate = childMatch ?? symbol;

		if (!bestMatch || getRangeLineCount(candidate.range) < getRangeLineCount(bestMatch.range)) {
			bestMatch = candidate;
		}
	}

	return bestMatch;
}

function getRangeText(document: vscode.TextDocument, range: vscode.Range): string {
	const lines: string[] = [];

	for (let line = range.start.line; line <= range.end.line; line++) {
		lines.push(document.lineAt(line).text);
	}

	return lines.join('\n');
}

function getRangeLineCount(range: vscode.Range): number {
	return range.end.line - range.start.line + 1;
}

function isDocumentSymbolArray(
	symbols: vscode.DocumentSymbol[] | vscode.SymbolInformation[]
): symbols is vscode.DocumentSymbol[] {
	return symbols.every((symbol) => 'children' in symbol);
}

function getNormalizedSymbolKind(
	symbol: vscode.DocumentSymbol,
	document: vscode.TextDocument
): CodeContextKind {
	const text = getRangeText(document, symbol.range);
	const firstMeaningfulLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? '';

	if (/^(export\s+)?type\s+/.test(firstMeaningfulLine)) {
		return 'type';
	}

	if (/^(export\s+)?interface\s+/.test(firstMeaningfulLine)) {
		return 'interface';
	}

	if (/^(export\s+)?enum\s+/.test(firstMeaningfulLine)) {
		return 'enum';
	}

	if (/^(export\s+)?class\s+/.test(firstMeaningfulLine)) {
		return 'class';
	}

	if (/^(export\s+)?(async\s+)?function\s+/.test(firstMeaningfulLine)) {
		return 'function';
	}

	switch (symbol.kind) {
		case vscode.SymbolKind.Function:
			return 'function';
		case vscode.SymbolKind.Method:
		case vscode.SymbolKind.Constructor:
			return 'method';
		case vscode.SymbolKind.Class:
			return 'class';
		case vscode.SymbolKind.Interface:
			return 'interface';
		case vscode.SymbolKind.Enum:
			return 'enum';
		case vscode.SymbolKind.Module:
		case vscode.SymbolKind.Namespace:
		case vscode.SymbolKind.Package:
			return 'module';
		case vscode.SymbolKind.Variable:
		case vscode.SymbolKind.Constant:
		case vscode.SymbolKind.Property:
			return 'variable';
		default:
			return 'unknown';
	}
}

function getFallbackCodeContext(
	document: vscode.TextDocument,
	activeLine: number
): CapturedCodeContext {
	const surroundingLineRadius = getSurroundingLineRadius();
	const startLine = Math.max(activeLine - surroundingLineRadius, 0);
	const endLine = Math.min(activeLine + surroundingLineRadius, document.lineCount - 1);
	const range = new vscode.Range(
		startLine,
		0,
		endLine,
		document.lineAt(endLine).range.end.character
	);

	return {
		source: 'surroundingWindow',
		text: document.getText(range),
		range: {
			startLine: startLine + 1,
			endLine: endLine + 1,
		},
	};
}

function getSurroundingLineRadius(): number {
	return vscode.workspace
		.getConfiguration('voicePairProgrammer')
		.get('surroundingLineRadius', defaultSurroundingLineRadius);
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

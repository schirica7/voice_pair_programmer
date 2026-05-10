"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const contextOutput = vscode.window.createOutputChannel('Voice Pair Programmer');
function activate(context) {
    console.log('Voice Pair Programmer is active.');
    const captureContext = vscode.commands.registerCommand('voice-pair-programmer.captureContext', async () => {
        const capturedContext = await getCapturedContext();
        contextOutput.clear();
        contextOutput.appendLine(JSON.stringify(capturedContext, null, 2));
        contextOutput.show(true);
        vscode.window.showInformationMessage('Captured Voice Pair Programmer context.');
    });
    context.subscriptions.push(captureContext, contextOutput);
}
async function getCapturedContext() {
    const activeEditor = vscode.window.activeTextEditor;
    const availableFiles = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**,**/coverage/**}', 200);
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
function getActiveEditorContext(editor) {
    const document = editor.document;
    const position = editor.selection.active;
    return {
        fileName: document.fileName,
        relativePath: getRelativePath(document.uri),
        languageId: document.languageId,
        cursorLine: position.line + 1,
        cursorCharacter: position.character + 1,
        selection: document.getText(editor.selection),
        surroundingText: getSurroundingText(document, position.line),
        diagnostics: vscode.languages.getDiagnostics(document.uri).map(getCapturedDiagnostic),
    };
}
function getSurroundingText(document, activeLine) {
    const radius = 20;
    const startLine = Math.max(activeLine - radius, 0);
    const endLine = Math.min(activeLine + radius, document.lineCount - 1);
    const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).range.end.character);
    return document.getText(range);
}
function getCapturedDiagnostic(diagnostic) {
    return {
        source: diagnostic.source,
        message: diagnostic.message,
        severity: getDiagnosticSeverity(diagnostic.severity),
        line: diagnostic.range.start.line + 1,
        character: diagnostic.range.start.character + 1,
    };
}
function getDiagnosticSeverity(severity) {
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
function getWorkspaceFolders() {
    return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
}
function getOpenTabs() {
    return vscode.window.tabGroups.all.flatMap((group) => group.tabs.map((tab) => getTabLabel(tab)).filter((label) => label.length > 0));
}
function getTabLabel(tab) {
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
function getRelativePath(uri) {
    if (uri.scheme === 'file') {
        return vscode.workspace.asRelativePath(uri, false);
    }
    return uri.toString();
}
// This method is called when your extension is deactivated
function deactivate() { }
//# sourceMappingURL=extension.js.map
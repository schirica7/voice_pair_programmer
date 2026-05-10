"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSidebarState = getSidebarState;
function getSidebarState(isRunning, capturedContext) {
    const activeEditor = capturedContext?.activeEditor;
    return {
        isRunning,
        activeFile: activeEditor?.relativePath ?? 'No context captured',
        languageId: activeEditor?.languageId ?? '-',
        selectionLines: getSelectionLineCount(activeEditor?.selection ?? ''),
        diagnosticCount: activeEditor?.diagnostics.length ?? 0,
        openTabCount: capturedContext?.workspace.openTabs.length ?? 0,
        availableFileCount: capturedContext?.workspace.availableFiles.length ?? 0,
        lastCapturedAt: capturedContext ? new Date(capturedContext.capturedAt).toLocaleTimeString() : 'Never',
    };
}
function getSelectionLineCount(selection) {
    if (!selection) {
        return 0;
    }
    return selection.split(/\r?\n/).length;
}
//# sourceMappingURL=sidebarState.js.map
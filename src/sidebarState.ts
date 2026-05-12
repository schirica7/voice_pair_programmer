import { CapturedContext, SidebarState } from './types';

export function getSidebarState(
	isRunning: boolean,
	capturedContext: CapturedContext | null,
	backendStatus: string,
	lastAnswer: string,
	lastAnswerModel: string,
	lastTranscript: string,
	lastTranscriptIsFinal: boolean,
	lastTranscriptModel: string,
	currentSpeaker: SidebarState['currentSpeaker'],
	currentSpeechText: string,
	currentSpeechMeta: string
): SidebarState {
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
		backendStatus,
		lastAnswer,
		lastAnswerModel,
		lastTranscript,
		lastTranscriptIsFinal,
		lastTranscriptModel,
		currentSpeaker,
		currentSpeechText,
		currentSpeechMeta,
	};
}

function getSelectionLineCount(selection: string): number {
	if (!selection) {
		return 0;
	}

	return selection.split(/\r?\n/).length;
}

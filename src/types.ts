export type CapturedDiagnostic = {
	source: string | undefined;
	message: string;
	severity: string;
	line: number;
	character: number;
};

export type CapturedContext = {
	activeEditor: {
		fileName: string;
		relativePath: string;
		languageId: string;
		cursorLine: number;
		cursorCharacter: number;
		selection: string;
		diagnostics: CapturedDiagnostic[];
	} | null;
	workspace: {
		folders: string[];
		openTabs: string[];
		visibleEditors: string[];
		activeTerminal: string | null;
		terminals: string[];
		availableFiles: string[];
	};
	capturedAt: string;
};

export type SidebarState = {
	isRunning: boolean;
	activeFile: string;
	languageId: string;
	selectionLines: number;
	diagnosticCount: number;
	openTabCount: number;
	availableFileCount: number;
	lastCapturedAt: string;
	backendStatus: string;
};

export type BackendSendResult = {
	ok: boolean;
	status: string;
};

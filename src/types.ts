export type CapturedDiagnostic = {
	source: string | undefined;
	message: string;
	severity: string;
	line: number;
	character: number;
};

export type CodeContextSource = 'selection' | 'enclosingSymbol' | 'topLevel' | 'surroundingWindow';

export type CodeContextKind =
	| 'function'
	| 'method'
	| 'class'
	| 'type'
	| 'interface'
	| 'enum'
	| 'module'
	| 'variable'
	| 'topLevel'
	| 'unknown';

export type CapturedSymbol = {
	name: string;
	kind: CodeContextKind;
	range: {
		startLine: number;
		endLine: number;
	};
	text: string;
};

export type CapturedCodeContext = {
	source: CodeContextSource;
	name?: string;
	kind?: CodeContextKind;
	range: {
		startLine: number;
		endLine: number;
	};
	text: string;
};

export type CapturedContext = {
	activeEditor: {
		fileName: string;
		relativePath: string;
		languageId: string;
		cursorLine: number;
		cursorCharacter: number;
		selection: string;
		primaryCodeContext: CapturedCodeContext | null;
		fallbackCodeContext: CapturedCodeContext;
		enclosingSymbol: CapturedSymbol | null;
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
	lastAnswer: string;
	lastAnswerModel: string;
	lastTranscript: string;
	lastTranscriptIsFinal: boolean;
	lastTranscriptModel: string;
};

export type BackendSendResult = {
	ok: boolean;
	status: string;
};

export type LiveKitSession = {
	url: string;
	roomName: string;
	identity: string;
	token: string;
};

export type LiveKitSessionResult = {
	ok: boolean;
	status: string;
	session?: LiveKitSession;
};

export type BackendActionResult = {
	ok: boolean;
	status: string;
};

export type Transcript = {
	transcript: string;
	isFinal: boolean;
	speakerId: string | null;
	language: string | null;
	createdAt: number;
	sttModel: string;
	receivedAt: string;
};

export type TranscriptResult = {
	ok: boolean;
	status: string;
	transcript?: Transcript | null;
};

const vscode = acquireVsCodeApi();

let state = getInitialState();

const elements = {
	toggle: document.getElementById('toggle'),
	ask: document.getElementById('ask'),
	statusDot: document.getElementById('statusDot'),
	statusText: document.getElementById('statusText'),
	activeFile: document.getElementById('activeFile'),
	contextMeta: document.getElementById('contextMeta'),
	diagnosticCount: document.getElementById('diagnosticCount'),
	openTabCount: document.getElementById('openTabCount'),
	availableFileCount: document.getElementById('availableFileCount'),
	backendStatus: document.getElementById('backendStatus'),
	transcriptSection: document.getElementById('transcriptSection'),
	transcriptStatus: document.getElementById('transcriptStatus'),
	lastTranscript: document.getElementById('lastTranscript'),
	answerSection: document.getElementById('answerSection'),
	answerModel: document.getElementById('answerModel'),
	lastAnswer: document.getElementById('lastAnswer'),
};

elements.toggle.addEventListener('click', () => {
	vscode.postMessage({ command: 'toggleSession' });
});

elements.ask.addEventListener('click', () => {
	vscode.postMessage({ command: 'askContext' });
});

window.addEventListener('message', (event) => {
	if (event.data.type === 'state') {
		state = event.data.state;
		render();
	}

});

function render() {
	elements.toggle.textContent = state.isRunning ? 'Pause' : 'Start';
	elements.statusDot.classList.toggle('running', state.isRunning);
	elements.statusText.textContent = state.isRunning ? 'Listening' : 'Paused';
	elements.activeFile.textContent = state.activeFile;
	elements.backendStatus.textContent = state.backendStatus;
	elements.contextMeta.textContent = getContextMeta();
	elements.diagnosticCount.textContent = `${state.diagnosticCount} diagnostics`;
	elements.openTabCount.textContent = `${state.openTabCount} tabs`;
	elements.availableFileCount.textContent = `${state.availableFileCount} files`;
	elements.transcriptSection.hidden = !state.lastTranscript;
	elements.transcriptStatus.textContent = state.lastTranscriptIsFinal ? 'final' : 'listening';
	elements.lastTranscript.textContent = state.lastTranscript;
	elements.answerSection.hidden = !state.lastAnswer;
	elements.answerModel.textContent = state.lastAnswerModel;
	elements.lastAnswer.textContent = state.lastAnswer;
}

function getContextMeta() {
	if (state.activeFile === 'No context captured') {
		return 'No IDE context captured yet';
	}

	return `${state.languageId} · ${state.selectionLines} selected lines · ${state.lastCapturedAt}`;
}

function getInitialState() {
	const initialStateElement = document.getElementById('initialState');

	if (!initialStateElement?.textContent) {
		return getFallbackState();
	}

	try {
		return JSON.parse(initialStateElement.textContent);
	} catch {
		return getFallbackState();
	}
}

function getFallbackState() {
	return {
		isRunning: false,
		activeFile: 'No context captured',
		languageId: '-',
		selectionLines: 0,
		diagnosticCount: 0,
		openTabCount: 0,
		availableFileCount: 0,
		lastCapturedAt: 'Never',
		backendStatus: 'Not sent',
		lastAnswer: '',
		lastAnswerModel: '',
		lastTranscript: '',
		lastTranscriptIsFinal: false,
	};
}

render();

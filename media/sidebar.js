const vscode = acquireVsCodeApi();

let state = getInitialState();

const elements = {
	toggle: document.getElementById('toggle'),
	ask: document.getElementById('ask'),
	statusDot: document.getElementById('statusDot'),
	statusText: document.getElementById('statusText'),
	backendStatus: document.getElementById('backendStatus'),
	speechSection: document.getElementById('speechSection'),
	speechSpeaker: document.getElementById('speechSpeaker'),
	speechMeta: document.getElementById('speechMeta'),
	speechText: document.getElementById('speechText'),
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
	elements.backendStatus.textContent = state.backendStatus;
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
		lastTranscriptModel: '',
		currentSpeaker: 'idle',
		currentSpeechText: '',
		currentSpeechMeta: '',
	};
}

render();
const vscode = acquireVsCodeApi();

let state = window.initialVoicePairState;

const elements = {
	toggle: document.getElementById('toggle'),
	capture: document.getElementById('capture'),
	statusDot: document.getElementById('statusDot'),
	statusText: document.getElementById('statusText'),
	activeFile: document.getElementById('activeFile'),
	contextMeta: document.getElementById('contextMeta'),
	diagnosticCount: document.getElementById('diagnosticCount'),
	openTabCount: document.getElementById('openTabCount'),
	availableFileCount: document.getElementById('availableFileCount'),
	backendStatus: document.getElementById('backendStatus'),
};

elements.toggle.addEventListener('click', () => {
	vscode.postMessage({ command: 'toggleSession' });
});

elements.capture.addEventListener('click', () => {
	vscode.postMessage({ command: 'captureContext' });
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
}

function getContextMeta() {
	if (state.activeFile === 'No context captured') {
		return 'No IDE context captured yet';
	}

	return `${state.languageId} · ${state.selectionLines} selected lines · ${state.lastCapturedAt}`;
}

render();

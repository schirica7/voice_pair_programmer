const vscode = acquireVsCodeApi();

let state = window.initialVoicePairState;

const elements = {
	toggle: document.getElementById('toggle'),
	capture: document.getElementById('capture'),
	statusDot: document.getElementById('statusDot'),
	statusText: document.getElementById('statusText'),
	activeFile: document.getElementById('activeFile'),
	languageId: document.getElementById('languageId'),
	selectionLines: document.getElementById('selectionLines'),
	diagnosticCount: document.getElementById('diagnosticCount'),
	openTabCount: document.getElementById('openTabCount'),
	availableFileCount: document.getElementById('availableFileCount'),
	lastCapturedAt: document.getElementById('lastCapturedAt'),
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
	elements.languageId.textContent = state.languageId;
	elements.selectionLines.textContent = `${state.selectionLines} lines`;
	elements.diagnosticCount.textContent = String(state.diagnosticCount);
	elements.openTabCount.textContent = String(state.openTabCount);
	elements.availableFileCount.textContent = String(state.availableFileCount);
	elements.lastCapturedAt.textContent = state.lastCapturedAt;
}

render();

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const devDir = join(projectRoot, '.dev');
const pidFilePath = join(devDir, 'agent.json');

mkdirSync(devDir, { recursive: true });

const child = spawn(process.execPath, [join(projectRoot, 'server', 'livekitAgent.mjs'), 'dev'], {
	cwd: projectRoot,
	env: {
		...process.env,
		NODE_OPTIONS: '',
	},
	stdio: ['ignore', 'pipe', 'pipe'],
});

writeFileSync(
	pidFilePath,
	JSON.stringify(
		{
			name: 'agent',
			wrapperPid: process.pid,
			childPid: child.pid,
		},
		null,
		2
	)
);

console.log('Voice Pair Programmer LiveKit agent starting...');

child.stdout.on('data', (chunk) => {
	process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
	process.stderr.write(chunk);
});

child.on('exit', (code, signal) => {
	removePidFile();

	if (signal) {
		process.exit(0);
	}

	process.exit(code ?? 0);
});

process.on('SIGINT', stopAgent);
process.on('SIGTERM', stopAgent);
process.on('exit', removePidFile);

function stopAgent() {
	if (!child.killed) {
		child.kill('SIGTERM');
	}
}

function removePidFile() {
	rmSync(pidFilePath, { force: true });
}

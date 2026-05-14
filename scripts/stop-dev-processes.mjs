import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const devDir = join(projectRoot, '.dev');

if (!existsSync(devDir)) {
	console.log('No Voice Pair Programmer dev processes to stop.');
	process.exit(0);
}

const pidFiles = readdirSync(devDir).filter((fileName) => fileName.endsWith('.json'));

if (pidFiles.length === 0) {
	console.log('No Voice Pair Programmer dev processes to stop.');
	process.exit(0);
}

for (const pidFile of pidFiles) {
	const pidFilePath = join(devDir, pidFile);
	const processInfo = readProcessInfo(pidFilePath);

	if (!processInfo) {
		rmSync(pidFilePath, { force: true });
		continue;
	}

	for (const childPid of getChildPids(processInfo)) {
		stopProcess(childPid, `${processInfo.name} child`);
	}

	stopProcess(processInfo.wrapperPid, `${processInfo.name} task`);
	rmSync(pidFilePath, { force: true });
}

function readProcessInfo(pidFilePath) {
	try {
		return JSON.parse(readFileSync(pidFilePath, 'utf8'));
	} catch {
		return null;
	}
}

function stopProcess(pid, label) {
	if (!Number.isInteger(pid)) {
		return;
	}

	try {
		process.kill(pid, 'SIGTERM');
		console.log(`Stopped ${label} (${pid}).`);
	} catch (error) {
		if (error?.code !== 'ESRCH') {
			console.warn(`Could not stop ${label} (${pid}): ${error.message}`);
		}
	}
}

function getChildPids(processInfo) {
	if (Array.isArray(processInfo.childPids)) {
		return processInfo.childPids;
	}

	if (Number.isInteger(processInfo.childPid)) {
		return [processInfo.childPid];
	}

	return [];
}

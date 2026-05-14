import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(projectRoot, 'server', '.env');

loadEnv(envPath);

const missingEnv = [
	'LIVEKIT_URL',
	'LIVEKIT_API_KEY',
	'LIVEKIT_API_SECRET',
].filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
	console.error(`Missing required server/.env values: ${missingEnv.join(', ')}`);
	process.exit(1);
}

console.log('Voice Pair Programmer dev environment ready.');

function loadEnv(filePath) {
	if (!existsSync(filePath)) {
		return;
	}

	const envFile = readFileSync(filePath, 'utf8');

	for (const line of envFile.split(/\r?\n/)) {
		const trimmedLine = line.trim();

		if (!trimmedLine || trimmedLine.startsWith('#')) {
			continue;
		}

		const separatorIndex = trimmedLine.indexOf('=');

		if (separatorIndex === -1) {
			continue;
		}

		const key = trimmedLine.slice(0, separatorIndex).trim();
		const value = stripQuotes(trimmedLine.slice(separatorIndex + 1).trim());

		if (key && process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

function stripQuotes(value) {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	return value;
}

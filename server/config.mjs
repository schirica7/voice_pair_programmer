import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const envPath = join(serverDir, '.env');

loadEnvFile(envPath);

export const config = {
	port: getNumberEnv('PORT', 3123),
	host: process.env.HOST ?? '127.0.0.1',
	providers: {
		livekit: {
			url: process.env.LIVEKIT_URL,
			apiKey: process.env.LIVEKIT_API_KEY,
			apiSecret: process.env.LIVEKIT_API_SECRET,
		},
		deepgram: {
			apiKey: process.env.DEEPGRAM_API_KEY,
		},
		openai: {
			apiKey: process.env.OPENAI_API_KEY,
			model: process.env.OPENAI_MODEL ?? 'gpt-5.2',
		},
		elevenLabs: {
			apiKey: process.env.ELEVENLABS_API_KEY,
			voiceId: process.env.ELEVENLABS_VOICE_ID,
		},
	},
};

export function getConfigStatus() {
	return {
		livekit: {
			configured: Boolean(
				config.providers.livekit.url &&
				config.providers.livekit.apiKey &&
				config.providers.livekit.apiSecret
			),
			hasUrl: Boolean(config.providers.livekit.url),
			hasApiKey: Boolean(config.providers.livekit.apiKey),
			hasApiSecret: Boolean(config.providers.livekit.apiSecret),
		},
		deepgram: {
			configured: Boolean(config.providers.deepgram.apiKey),
			hasApiKey: Boolean(config.providers.deepgram.apiKey),
		},
		openai: {
			configured: Boolean(config.providers.openai.apiKey),
			hasApiKey: Boolean(config.providers.openai.apiKey),
			model: config.providers.openai.model,
		},
		elevenLabs: {
			configured: Boolean(
				config.providers.elevenLabs.apiKey &&
				config.providers.elevenLabs.voiceId
			),
			hasApiKey: Boolean(config.providers.elevenLabs.apiKey),
			hasVoiceId: Boolean(config.providers.elevenLabs.voiceId),
		},
	};
}

function loadEnvFile(filePath) {
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

function getNumberEnv(key, fallback) {
	const value = Number(process.env[key]);

	return Number.isFinite(value) ? value : fallback;
}

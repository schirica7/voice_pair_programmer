import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const envPath = join(serverDir, '.env');

loadEnvFile(envPath);

export const config = {
	port: getNumberEnv('PORT', 3123),
	host: process.env.HOST ?? '127.0.0.1',
	livekit: {
		url: process.env.LIVEKIT_URL,
		apiKey: process.env.LIVEKIT_API_KEY,
		apiSecret: process.env.LIVEKIT_API_SECRET,
		agentName: process.env.LIVEKIT_AGENT_NAME ?? 'voice-pair-programmer',
	},
	inference: {
		stt: {
			model: process.env.LIVEKIT_STT_MODEL ?? 'elevenlabs/scribe_v2_realtime',
			language: process.env.LIVEKIT_STT_LANGUAGE ?? 'en',
		},
		llm: {
			model: process.env.LIVEKIT_LLM_MODEL ?? 'openai/gpt-5.5',
		},
		tts: {
			model: process.env.LIVEKIT_TTS_MODEL ?? 'cartesia/sonic-3',
			voice: process.env.LIVEKIT_TTS_VOICE,
		},
	},
};

export function getConfigStatus() {
	return {
		livekit: {
			configured: Boolean(
				config.livekit.url &&
				config.livekit.apiKey &&
				config.livekit.apiSecret
			),
			hasUrl: Boolean(config.livekit.url),
			hasApiKey: Boolean(config.livekit.apiKey),
			hasApiSecret: Boolean(config.livekit.apiSecret),
			agentName: config.livekit.agentName,
		},
		inference: config.inference,
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

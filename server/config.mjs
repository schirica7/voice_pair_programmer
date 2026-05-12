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
			modelOptions: getJsonEnv('LIVEKIT_STT_MODEL_OPTIONS', {}),
		},
		llm: {
			model: process.env.LIVEKIT_LLM_MODEL ?? 'openai/gpt-5.5',
		},
		tts: {
			model: process.env.LIVEKIT_TTS_MODEL ?? 'cartesia/sonic-3',
			voice: process.env.LIVEKIT_TTS_VOICE,
		},
	},
	turnHandling: getTurnHandlingConfig(),
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

function getOptionalNumberEnv(key) {
	const value = Number(process.env[key]);

	return Number.isFinite(value) ? value : undefined;
}

function getOptionalEnv(key) {
	const value = process.env[key];

	return value || undefined;
}

function getJsonEnv(key, fallback) {
	const value = process.env[key];

	if (!value) {
		return fallback;
	}

	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(`${key} must be valid JSON: ${error instanceof Error ? error.message : 'invalid JSON'}`);
	}
}

function getTurnHandlingConfig() {
	const turnDetection = getOptionalEnv('LIVEKIT_TURN_DETECTION');
	const endpointing = removeUndefined({
		mode: getOptionalEnv('LIVEKIT_ENDPOINTING_MODE'),
		minDelay: getOptionalNumberEnv('LIVEKIT_ENDPOINTING_MIN_DELAY_MS'),
		maxDelay: getOptionalNumberEnv('LIVEKIT_ENDPOINTING_MAX_DELAY_MS'),
	});

	return removeUndefined({
		turnDetection,
		endpointing: Object.keys(endpointing).length > 0 ? endpointing : undefined,
	});
}

function removeUndefined(object) {
	return Object.fromEntries(
		Object.entries(object).filter(([, value]) => value !== undefined)
	);
}

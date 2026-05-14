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
			model: process.env.LIVEKIT_STT_MODEL ?? 'deepgram/nova-3',
			language: process.env.LIVEKIT_STT_LANGUAGE ?? 'en',
			modelOptions: getJsonEnv('LIVEKIT_STT_MODEL_OPTIONS', {}),
			fallback: getJsonEnv('LIVEKIT_STT_FALLBACK', ['deepgram/flux-general']),
			connOptions: getApiConnectOptions('LIVEKIT_STT', {
				maxRetry: 8,
				retryIntervalMs: 1000,
				timeoutMs: 15000,
			}),
		},
		llm: {
			model: process.env.LIVEKIT_LLM_MODEL ?? 'openai/gpt-5.5',
		},
		tts: {
			model: process.env.LIVEKIT_TTS_MODEL ?? 'elevenlabs/eleven_turbo_v2_5',
			voice: process.env.LIVEKIT_TTS_VOICE,
		},
	},
	turnHandling: getTurnHandlingConfig(),
	session: {
		userAwayTimeout: getNullableNumberEnv('LIVEKIT_USER_AWAY_TIMEOUT_SECONDS', null),
		connOptions: {
			sttConnOptions: getApiConnectOptions('LIVEKIT_STT', {
				maxRetry: 8,
				retryIntervalMs: 1000,
				timeoutMs: 15000,
			}),
			llmConnOptions: getApiConnectOptions('LIVEKIT_LLM', {
				maxRetry: 4,
				retryIntervalMs: 1000,
				timeoutMs: 15000,
			}),
			ttsConnOptions: getApiConnectOptions('LIVEKIT_TTS', {
				maxRetry: 4,
				retryIntervalMs: 1000,
				timeoutMs: 15000,
			}),
			maxUnrecoverableErrors: getNumberEnv('LIVEKIT_MAX_UNRECOVERABLE_ERRORS', 8),
		},
	},
	worker: {
		numIdleProcesses: getNumberEnv('LIVEKIT_AGENT_NUM_IDLE_PROCESSES', 1),
		initializeProcessTimeout: getNumberEnv('LIVEKIT_AGENT_INITIALIZE_PROCESS_TIMEOUT_MS', 60000),
		shutdownProcessTimeout: getNumberEnv('LIVEKIT_AGENT_SHUTDOWN_PROCESS_TIMEOUT_MS', 60000),
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

function getApiConnectOptions(prefix, fallback) {
	return removeUndefined({
		maxRetry: getOptionalNumberEnv(`${prefix}_MAX_RETRY`) ?? fallback.maxRetry,
		retryIntervalMs: getOptionalNumberEnv(`${prefix}_RETRY_INTERVAL_MS`) ?? fallback.retryIntervalMs,
		timeoutMs: getOptionalNumberEnv(`${prefix}_TIMEOUT_MS`) ?? fallback.timeoutMs,
	});
}

function getNullableNumberEnv(key, fallback) {
	const value = process.env[key];

	if (value === undefined || value === '') {
		return fallback;
	}

	if (value.toLowerCase() === 'null') {
		return null;
	}

	const number = Number(value);

	if (Number.isFinite(number)) {
		return number;
	}

	throw new Error(`${key} must be a number or null`);
}

function getTurnHandlingConfig() {
	const turnDetection = getOptionalEnv('LIVEKIT_TURN_DETECTION');
	const endpointing = removeUndefined({
		mode: getOptionalEnv('LIVEKIT_ENDPOINTING_MODE'),
		minDelay: getOptionalNumberEnv('LIVEKIT_ENDPOINTING_MIN_DELAY_MS'),
		maxDelay: getOptionalNumberEnv('LIVEKIT_ENDPOINTING_MAX_DELAY_MS'),
	});
	const interruption = removeUndefined({
		enabled: getOptionalBooleanEnv('LIVEKIT_INTERRUPTION_ENABLED') ?? true,
		mode: getOptionalEnv('LIVEKIT_INTERRUPTION_MODE'),
		discardAudioIfUninterruptible: getOptionalBooleanEnv('LIVEKIT_DISCARD_AUDIO_IF_UNINTERRUPTIBLE') ?? false,
		minDuration: getOptionalNumberEnv('LIVEKIT_INTERRUPTION_MIN_DURATION_MS') ?? 200,
		minWords: getOptionalNumberEnv('LIVEKIT_INTERRUPTION_MIN_WORDS') ?? 0,
		falseInterruptionTimeout: getOptionalNumberEnv('LIVEKIT_FALSE_INTERRUPTION_TIMEOUT_MS') ?? 1000,
		resumeFalseInterruption: getOptionalBooleanEnv('LIVEKIT_RESUME_FALSE_INTERRUPTION') ?? false,
		backchannelBoundary: getOptionalBackchannelBoundaryEnv(),
	});

	return removeUndefined({
		turnDetection,
		endpointing: Object.keys(endpointing).length > 0 ? endpointing : undefined,
		interruption: Object.keys(interruption).length > 0 ? interruption : undefined,
	});
}

function removeUndefined(object) {
	return Object.fromEntries(
		Object.entries(object).filter(([, value]) => value !== undefined)
	);
}

function getOptionalBooleanEnv(key) {
	const value = process.env[key]?.toLowerCase();

	if (value === undefined || value === '') {
		return undefined;
	}

	if (value === 'true') {
		return true;
	}

	if (value === 'false') {
		return false;
	}

	throw new Error(`${key} must be true or false`);
}

function getOptionalBackchannelBoundaryEnv() {
	const value = process.env.LIVEKIT_INTERRUPTION_BACKCHANNEL_BOUNDARY_MS;

	if (!value || value.toLowerCase() === 'null') {
		return null;
	}

	const boundary = Number(value);

	if (Number.isFinite(boundary)) {
		return boundary;
	}

	throw new Error('LIVEKIT_INTERRUPTION_BACKCHANNEL_BOUNDARY_MS must be a number or null');
}

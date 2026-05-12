import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	AudioFrame,
	AudioSource,
	LocalAudioTrack,
	Room,
	TrackPublishOptions,
	TrackSource,
} from '@livekit/rtc-node';

import { createLiveKitToken } from './livekitToken.mjs';

const sampleRate = 48_000;
const channels = 1;
const frameDurationMs = 10;
const samplesPerFrame = sampleRate / (1000 / frameDurationMs);
const bytesPerFrame = samplesPerFrame * channels * Int16Array.BYTES_PER_ELEMENT;
const serverDir = dirname(fileURLToPath(import.meta.url));
const debugDir = join(serverDir, 'debug');

let activePublisher = null;

export async function startMicPublisher({ roomName }) {
	await stopMicPublisher();

	if (!roomName) {
		throw new Error('roomName is required to start mic publisher');
	}

	const session = await createLiveKitToken({
		roomName,
		identity: `vscode-mic-${process.pid}`,
		dispatchAgent: true,
	});
	const room = new Room();
	const source = new AudioSource(sampleRate, channels);
	const track = LocalAudioTrack.createAudioTrack('vscode-microphone', source);
	const publishOptions = new TrackPublishOptions();
	publishOptions.source = TrackSource.SOURCE_MICROPHONE;

	console.log('');
	console.log('Starting backend microphone publisher');
	console.log(`  room: ${session.roomName}`);
	console.log(`  identity: ${session.identity}`);
	console.log(`  dispatch agent: ${true}`);
	console.log(`  ffmpeg input: ${process.env.FFMPEG_AVFOUNDATION_INPUT ?? 'none:default'}`);
	console.log('  transcription: handled by the LiveKit agent STT model, not ffmpeg');

	await room.connect(session.url, session.token);
	console.log('Backend microphone participant connected to LiveKit');

	await room.localParticipant.publishTrack(track, publishOptions);
	console.log('Backend microphone track published');

	const ffmpeg = spawn('ffmpeg', getFfmpegArgs(), {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	console.log('ffmpeg microphone capture started');

	const publisher = {
		room,
		source,
		track,
		ffmpeg,
		buffer: Buffer.alloc(0),
		roomName,
		recording: null,
	};

	activePublisher = publisher;

	ffmpeg.stdout.on('data', (chunk) => {
		recordDiagnosticChunk(publisher, chunk);
		publishPcmChunk(publisher, chunk);
	});
	ffmpeg.stderr.on('data', (chunk) => {
		process.stderr.write(`[ffmpeg mic] ${chunk}`);
	});
	ffmpeg.on('exit', (code, signal) => {
		console.warn(`ffmpeg mic capture exited (${signal ?? code})`);
		if (activePublisher === publisher) {
			activePublisher = null;
		}
	});

	return {
		roomName,
		identity: session.identity,
	};
}

export async function stopMicPublisher() {
	const publisher = activePublisher;
	activePublisher = null;

	if (!publisher) {
		return;
	}

	if (!publisher.ffmpeg.killed) {
		publisher.ffmpeg.kill('SIGTERM');
	}

	await publisher.room.disconnect();
	await publisher.track.close(true);
	console.log('Backend microphone publisher stopped');
}

export function getMicPublisherStatus() {
	return activePublisher
		? {
				running: true,
				roomName: activePublisher.roomName,
			}
		: {
				running: false,
			};
}

export function startMicDiagnosticRecording({ durationMs = 5000 } = {}) {
	if (!activePublisher) {
		throw new Error('Start the sidecar mic before recording a diagnostic sample');
	}

	const safeDurationMs = Math.min(Math.max(Number(durationMs) || 5000, 1000), 15000);
	const recordedAt = new Date();

	activePublisher.recording = {
		chunks: [],
		endsAt: Date.now() + safeDurationMs,
		fileName: `mic-diagnostic-${formatDebugTimestamp(recordedAt)}.wav`,
	};

	console.log(`Recording sidecar mic diagnostic sample for ${safeDurationMs}ms`);

	return {
		recording: true,
		durationMs: safeDurationMs,
		fileName: activePublisher.recording.fileName,
	};
}

function getFfmpegArgs() {
	return [
		'-hide_banner',
		'-loglevel',
		'warning',
		'-f',
		'avfoundation',
		'-i',
		process.env.FFMPEG_AVFOUNDATION_INPUT ?? 'none:default',
		'-vn',
		'-ac',
		String(channels),
		'-ar',
		String(sampleRate),
		'-f',
		's16le',
		'-',
	];
}

function publishPcmChunk(publisher, chunk) {
	publisher.buffer = Buffer.concat([publisher.buffer, chunk]);

	while (publisher.buffer.length >= bytesPerFrame) {
		const frameBuffer = publisher.buffer.subarray(0, bytesPerFrame);
		publisher.buffer = publisher.buffer.subarray(bytesPerFrame);
		const samples = new Int16Array(frameBuffer.buffer, frameBuffer.byteOffset, samplesPerFrame * channels);

		const frame = new AudioFrame(
			samples,
			sampleRate,
			channels,
			samplesPerFrame
		);

		publisher.source.captureFrame(frame).catch((error) => {
			console.warn(`Could not publish mic frame: ${error.message}`);
		});
	}
}

function recordDiagnosticChunk(publisher, frameBuffer) {
	const recording = publisher.recording;

	if (!recording) {
		return;
	}

	recording.chunks.push(Buffer.from(frameBuffer));

	if (Date.now() < recording.endsAt) {
		return;
	}

	const pcm = Buffer.concat(recording.chunks);
	const wav = createWavBuffer(pcm);
	const filePath = join(debugDir, recording.fileName);

	mkdirSync(debugDir, { recursive: true });
	writeFileSync(filePath, wav);
	publisher.recording = null;

	console.log(`Wrote sidecar mic diagnostic sample: ${filePath}`);
}

function createWavBuffer(pcm) {
	const header = Buffer.alloc(44);
	const byteRate = sampleRate * channels * Int16Array.BYTES_PER_ELEMENT;
	const blockAlign = channels * Int16Array.BYTES_PER_ELEMENT;

	header.write('RIFF', 0);
	header.writeUInt32LE(36 + pcm.length, 4);
	header.write('WAVE', 8);
	header.write('fmt ', 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(channels, 22);
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(byteRate, 28);
	header.writeUInt16LE(blockAlign, 32);
	header.writeUInt16LE(16, 34);
	header.write('data', 36);
	header.writeUInt32LE(pcm.length, 40);

	return Buffer.concat([header, pcm]);
}

function formatDebugTimestamp(date) {
	return date.toISOString().replace(/[:.]/g, '-');
}

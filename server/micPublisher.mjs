import { spawn } from 'node:child_process';

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

let activePublisher = null;

export async function startMicPublisher({ roomName }) {
	await stopMicPublisher();

	if (!roomName) {
		throw new Error('roomName is required to start mic publisher');
	}

	const session = await createLiveKitToken({
		roomName,
		identity: `vscode-mic-${process.pid}`,
		dispatchAgent: false,
	});
	const room = new Room();
	const source = new AudioSource(sampleRate, channels);
	const track = LocalAudioTrack.createAudioTrack('vscode-microphone', source);
	const publishOptions = new TrackPublishOptions();
	publishOptions.source = TrackSource.SOURCE_MICROPHONE;

	await room.connect(session.url, session.token);
	await room.localParticipant.publishTrack(track, publishOptions);

	const ffmpeg = spawn('ffmpeg', getFfmpegArgs(), {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const publisher = {
		room,
		source,
		track,
		ffmpeg,
		buffer: Buffer.alloc(0),
		roomName,
	};

	activePublisher = publisher;

	ffmpeg.stdout.on('data', (chunk) => {
		publishPcmChunk(publisher, chunk);
	});
	ffmpeg.stderr.on('data', (chunk) => {
		process.stderr.write(`[ffmpeg mic] ${chunk}`);
	});
	ffmpeg.on('exit', (code, signal) => {
		if (activePublisher === publisher) {
			console.warn(`ffmpeg mic capture exited (${signal ?? code})`);
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

		const frame = new AudioFrame(
			new Int16Array(frameBuffer.buffer, frameBuffer.byteOffset, samplesPerFrame * channels),
			sampleRate,
			channels,
			samplesPerFrame
		);

		publisher.source.captureFrame(frame).catch((error) => {
			console.warn(`Could not publish mic frame: ${error.message}`);
		});
	}
}

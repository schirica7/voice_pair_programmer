import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	AudioFrame,
	AudioSource,
	AudioStream,
	LocalAudioTrack,
	RemoteAudioTrack,
	Room,
	RoomEvent,
	TrackPublishOptions,
	TrackSource,
} from '@livekit/rtc-node';

import { createLiveKitToken } from './livekitToken.mjs';

const sampleRate = 48_000;
const channels = 1;
const frameDurationMs = 10;
const samplesPerFrame = sampleRate / (1000 / frameDurationMs);
const bytesPerFrame = samplesPerFrame * channels * Int16Array.BYTES_PER_ELEMENT;
const agentAudioPeakThreshold = 300;
const agentEchoSuppressionHoldMs = 750;
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
	const publisher = {
		room,
		source,
		track,
		ffmpeg: null,
		buffer: Buffer.alloc(0),
		roomName,
		recording: null,
		playbacks: new Map(),
		suppressMicUntil: 0,
		micSuppressed: false,
	};

	attachRoomAudioListeners(publisher);

	console.log('');
	console.log('Starting backend microphone publisher');
	console.log(`  room: ${session.roomName}`);
	console.log(`  identity: ${session.identity}`);
	console.log(`  dispatch agent: ${true}`);
	console.log(`  ffmpeg input: ${process.env.FFMPEG_AVFOUNDATION_INPUT ?? 'none:default'}`);
	console.log('  transcription: handled by the LiveKit agent STT model, not ffmpeg');

	await room.connect(session.url, session.token);
	console.log('Backend microphone participant connected to LiveKit');
	subscribeRemoteAudioPublications(room);

	await room.localParticipant.publishTrack(track, publishOptions);
	console.log('Backend microphone track published');

	const ffmpeg = spawn('ffmpeg', getFfmpegArgs(), {
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	console.log('ffmpeg microphone capture started');
	publisher.ffmpeg = ffmpeg;

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

	if (publisher.ffmpeg && !publisher.ffmpeg.killed) {
		publisher.ffmpeg.kill('SIGTERM');
	}

	stopAllRemoteAudioPlayback(publisher);
	await publisher.room.disconnect();
	await publisher.track.close(true);
	console.log('Backend microphone publisher stopped');
}

export function getMicPublisherStatus() {
	return activePublisher
		? {
				running: true,
				roomName: activePublisher.roomName,
				audioPlaybackCount: activePublisher.playbacks.size,
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

function getFfplayArgs() {
	return [
		'-hide_banner',
		'-loglevel',
		'warning',
		'-nodisp',
		'-autoexit',
		'-fflags',
		'nobuffer',
		'-flags',
		'low_delay',
		'-probesize',
		'32',
		'-analyzeduration',
		'0',
		'-f',
		's16le',
		'-sample_rate',
		String(sampleRate),
		'-ch_layout',
		'mono',
		'-i',
		'-',
	];
}

function attachRoomAudioListeners(publisher) {
	const room = publisher.room;

	room.on(RoomEvent.ParticipantConnected, (participant) => {
		console.log(`LiveKit participant connected: ${participant.identity}`);
		subscribeParticipantAudioPublications(participant);
	});
	room.on(RoomEvent.TrackPublished, (publication, participant) => {
		console.log(
			`LiveKit track published by ${participant.identity}: ${publication.name ?? publication.sid ?? 'unknown'}`
		);
		subscribeRemotePublication(publication);
	});
	room.on(RoomEvent.TrackSubscribed, (remoteTrack, publication, participant) => {
		console.log(
			`LiveKit track subscribed from ${participant.identity}: ${publication.name ?? remoteTrack.name ?? 'unknown'}`
		);

		if (!(remoteTrack instanceof RemoteAudioTrack)) {
			return;
		}

		startRemoteAudioPlayback(publisher, remoteTrack, participant);
	});
	room.on(RoomEvent.TrackUnsubscribed, (remoteTrack, _publication, participant) => {
		if (!(remoteTrack instanceof RemoteAudioTrack)) {
			return;
		}

		stopRemoteAudioPlayback(publisher, getPlaybackId(remoteTrack, participant));
	});
	room.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, reason) => {
		console.warn(
			`LiveKit track subscription failed for ${participant.identity}/${trackSid}: ${reason ?? 'unknown reason'}`
		);
	});
}

function subscribeRemoteAudioPublications(room) {
	for (const participant of room.remoteParticipants.values()) {
		subscribeParticipantAudioPublications(participant);
	}
}

function subscribeParticipantAudioPublications(participant) {
	for (const publication of participant.trackPublications.values()) {
		subscribeRemotePublication(publication);
	}
}

function subscribeRemotePublication(publication) {
	if (typeof publication.setSubscribed !== 'function') {
		return;
	}

	if (publication.subscribed) {
		return;
	}

	console.log(`Subscribing to LiveKit remote track: ${publication.name ?? publication.sid ?? 'unknown'}`);
	publication.setSubscribed(true);
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

		if (shouldSuppressMic(publisher)) {
			continue;
		}

		publisher.source.captureFrame(frame).catch((error) => {
			console.warn(`Could not publish mic frame: ${error.message}`);
		});
	}
}

function startRemoteAudioPlayback(publisher, remoteTrack, participant) {
	const playbackId = getPlaybackId(remoteTrack, participant);

	if (publisher.playbacks.has(playbackId)) {
		return;
	}

	console.log('');
	console.log('Starting LiveKit agent audio playback');
	console.log(`  participant: ${participant.identity}`);
	console.log(`  track: ${remoteTrack.name ?? remoteTrack.sid ?? 'unknown'}`);

	const ffplay = spawn('ffplay', getFfplayArgs(), {
		stdio: ['pipe', 'ignore', 'pipe'],
	});
	const stream = new AudioStream(remoteTrack, {
		sampleRate,
		numChannels: channels,
		frameSizeMs: 20,
	});
	const reader = stream.getReader();
	const playback = {
		ffplay,
		reader,
		stopped: false,
	};

	publisher.playbacks.set(playbackId, playback);

	ffplay.stderr.on('data', (chunk) => {
		process.stderr.write(`[ffplay agent] ${chunk}`);
	});
	ffplay.on('error', (error) => {
		console.warn(`Could not start ffplay for agent audio: ${error.message}`);
		stopRemoteAudioPlayback(publisher, playbackId);
	});
	ffplay.on('exit', (code, signal) => {
		console.log(`ffplay agent audio exited (${signal ?? code})`);
		stopRemoteAudioPlayback(publisher, playbackId);
	});

	pumpRemoteAudio(publisher, playback).catch((error) => {
		if (!playback.stopped) {
			console.warn(`Agent audio playback stopped: ${error.message}`);
			stopRemoteAudioPlayback(publisher, playbackId);
		}
	});
}

async function pumpRemoteAudio(publisher, playback) {
	while (!playback.stopped) {
		const { value: frame, done } = await playback.reader.read();

		if (done || !frame) {
			break;
		}

		updateMicSuppressionFromAgentFrame(publisher, frame);
		await writeAudioFrame(playback.ffplay, frame);
	}
}

function updateMicSuppressionFromAgentFrame(publisher, frame) {
	if (!hasAudibleSamples(frame.data)) {
		return;
	}

	publisher.suppressMicUntil = Date.now() + agentEchoSuppressionHoldMs;
}

function hasAudibleSamples(samples) {
	for (const sample of samples) {
		if (Math.abs(sample) >= agentAudioPeakThreshold) {
			return true;
		}
	}

	return false;
}

function shouldSuppressMic(publisher) {
	const suppress = Date.now() < publisher.suppressMicUntil;

	if (suppress && !publisher.micSuppressed) {
		publisher.micSuppressed = true;
		console.log('Suppressing microphone while agent audio is playing');
	}

	if (!suppress && publisher.micSuppressed) {
		publisher.micSuppressed = false;
		console.log('Resumed microphone publishing');
	}

	return suppress;
}

function writeAudioFrame(ffplay, frame) {
	if (!ffplay.stdin.writable) {
		return Promise.resolve();
	}

	const frameBytes = new Uint8Array(
		frame.data.buffer,
		frame.data.byteOffset,
		frame.data.byteLength
	);
	const pcm = Buffer.from(frameBytes);

	return new Promise((resolve, reject) => {
		const handleError = (error) => {
			ffplay.stdin.off('drain', handleDrain);
			reject(error);
		};
		const handleDrain = () => {
			ffplay.stdin.off('error', handleError);
			resolve();
		};

		ffplay.stdin.once('error', handleError);

		if (ffplay.stdin.write(pcm)) {
			ffplay.stdin.off('error', handleError);
			resolve();
			return;
		}

		ffplay.stdin.once('drain', handleDrain);
	});
}

function stopAllRemoteAudioPlayback(publisher) {
	for (const playbackId of publisher.playbacks.keys()) {
		stopRemoteAudioPlayback(publisher, playbackId);
	}
}

function stopRemoteAudioPlayback(publisher, playbackId) {
	const playback = publisher.playbacks.get(playbackId);

	if (!playback) {
		return;
	}

	publisher.playbacks.delete(playbackId);
	playback.stopped = true;
	playback.reader.cancel().catch(() => undefined);

	if (playback.ffplay.stdin.writable) {
		playback.ffplay.stdin.end();
	}

	if (!playback.ffplay.killed) {
		playback.ffplay.kill('SIGTERM');
	}
}

function getPlaybackId(remoteTrack, participant) {
	return remoteTrack.sid ?? `${participant.identity}:${remoteTrack.name ?? 'audio'}`;
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

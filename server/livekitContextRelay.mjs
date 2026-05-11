import { DataPacket_Kind, RoomServiceClient } from 'livekit-server-sdk';

import { config } from './config.mjs';

const textEncoder = new TextEncoder();

export async function sendIdeContextToRoom(roomName, context) {
	if (!roomName) {
		return;
	}

	const client = new RoomServiceClient(
		getLiveKitHttpUrl(),
		config.livekit.apiKey,
		config.livekit.apiSecret
	);

	const payload = textEncoder.encode(JSON.stringify({
		type: 'ide-context',
		context,
		sentAt: new Date().toISOString(),
	}));

	await client.sendData(roomName, payload, DataPacket_Kind.RELIABLE, {
		topic: 'ide-context',
	});
}

function getLiveKitHttpUrl() {
	if (!config.livekit.url) {
		return '';
	}

	return config.livekit.url
		.replace(/^wss:\/\//, 'https://')
		.replace(/^ws:\/\//, 'http://');
}

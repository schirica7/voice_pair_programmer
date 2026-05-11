import { randomUUID } from 'node:crypto';

import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource } from 'livekit-server-sdk';

import { config } from './config.mjs';

const defaultRoomPrefix = 'voice-pair';

export async function createLiveKitToken({ roomName, identity, dispatchAgent = true } = {}) {
	if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
		throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be configured');
	}

	const resolvedRoomName = roomName || `${defaultRoomPrefix}-${randomUUID()}`;
	const resolvedIdentity = identity || `vscode-${randomUUID()}`;

	const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
		identity: resolvedIdentity,
		name: 'VS Code',
	});

	token.addGrant({
		room: resolvedRoomName,
		roomJoin: true,
		canPublish: true,
		canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
		canSubscribe: true,
		canPublishData: true,
	});

	if (dispatchAgent) {
		token.roomConfig = new RoomConfiguration({
			agents: [
				new RoomAgentDispatch({
					agentName: config.livekit.agentName,
				}),
			],
		});
	}

	return {
		url: config.livekit.url,
		roomName: resolvedRoomName,
		identity: resolvedIdentity,
		token: await token.toJwt(),
	};
}

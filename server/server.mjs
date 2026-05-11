import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, getConfigStatus } from './config.mjs';
import { askOpenAI } from './openaiClient.mjs';

const serverDir = dirname(fileURLToPath(import.meta.url));
const debugDir = join(serverDir, 'debug');
const latestContextPath = join(debugDir, 'latest-context.json');

let latestContext = null;

const server = http.createServer(async (request, response) => {
	if (request.method === 'GET' && request.url === '/health') {
		sendJson(response, 200, {
			ok: true,
			config: getConfigStatus(),
		});
		return;
	}

	if (request.method === 'GET' && request.url === '/context/latest') {
		sendJson(response, 200, latestContext ?? { context: null });
		return;
	}

	if (request.method === 'POST' && request.url === '/context') {
		try {
			const context = await readJson(request);
			latestContext = context;
			writeLatestContext(context);
			logContextSummary(context);
			sendJson(response, 200, { ok: true });
		} catch (error) {
			sendJson(response, 400, {
				ok: false,
				error: error instanceof Error ? error.message : 'Invalid request',
			});
		}

		return;
	}

	if (request.method === 'POST' && request.url === '/ask') {
		try {
			const body = await readJson(request);
			const answer = await askOpenAI({
				context: latestContext,
				question: body.question ?? 'What should I pay attention to in the current IDE context?',
			});

			console.log('');
			console.log('Generated LLM response');
			console.log(`  model: ${answer.model}`);
			console.log(`  response: ${answer.text}`);

			sendJson(response, 200, {
				ok: true,
				answer,
			});
		} catch (error) {
			sendJson(response, 500, {
				ok: false,
				error: error instanceof Error ? error.message : 'Failed to generate answer',
			});
		}

		return;
	}

	sendJson(response, 404, {
		ok: false,
		error: 'Not found',
	});
});

server.listen(config.port, config.host, () => {
	console.log(`Voice Pair Programmer backend listening on http://${config.host}:${config.port}`);
});

function readJson(request) {
	return new Promise((resolve, reject) => {
		let body = '';

		request.setEncoding('utf8');
		request.on('data', (chunk) => {
			body += chunk;
		});
		request.on('end', () => {
			try {
				resolve(JSON.parse(body));
			} catch {
				reject(new Error('Request body must be valid JSON'));
			}
		});
		request.on('error', reject);
	});
}

function sendJson(response, statusCode, payload) {
	response.writeHead(statusCode, {
		'content-type': 'application/json',
	});
	response.end(JSON.stringify(payload));
}

function writeLatestContext(context) {
	mkdirSync(debugDir, { recursive: true });
	writeFileSync(latestContextPath, `${JSON.stringify(context, null, 2)}\n`);
}

function logContextSummary(context) {
	const activeEditor = context.activeEditor;
	const workspace = context.workspace;

	console.log('');
	console.log('Received IDE context');
	console.log(`  file: ${activeEditor?.relativePath ?? 'none'}`);
	console.log(`  language: ${activeEditor?.languageId ?? 'none'}`);
	console.log(`  selection chars: ${activeEditor?.selection?.length ?? 0}`);
	console.log(`  diagnostics: ${activeEditor?.diagnostics?.length ?? 0}`);
	console.log(`  open tabs: ${workspace?.openTabs?.length ?? 0}`);
	console.log(`  available files: ${workspace?.availableFiles?.length ?? 0}`);
	console.log(`  debug file: ${latestContextPath}`);
}

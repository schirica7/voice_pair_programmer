import http from 'node:http';

const port = Number(process.env.PORT ?? 3123);
const host = '127.0.0.1';

let latestContext = null;

const server = http.createServer(async (request, response) => {
	if (request.method === 'GET' && request.url === '/health') {
		sendJson(response, 200, { ok: true });
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

	sendJson(response, 404, {
		ok: false,
		error: 'Not found',
	});
});

server.listen(port, host, () => {
	console.log(`Voice Pair Programmerbackend listening on http://${host}:${port}`);
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
}

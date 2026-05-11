import { config } from './config.mjs';

const responsesUrl = 'https://api.openai.com/v1/responses';

export async function askOpenAI({ context, question }) {
	if (!config.providers.openai.apiKey) {
		throw new Error('OPENAI_API_KEY is not configured');
	}

	const response = await fetch(responsesUrl, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${config.providers.openai.apiKey}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			model: config.providers.openai.model,
			instructions: getInstructions(),
			input: getInput({ context, question }),
			max_output_tokens: 600,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
	}

	const payload = await response.json();
	const outputText = getOutputText(payload);

	if (!outputText) {
		throw new Error('OpenAI response did not include text output');
	}

	return {
		model: config.providers.openai.model,
		text: outputText,
		responseId: payload.id,
	};
}

function getInstructions() {
	return [
		'You are a voice-based pair programming tutor inside VS Code.',
		'Help the user understand the code they are working on.',
		'Use primaryCodeContext as the main code context.',
		'Use fallbackCodeContext only when primaryCodeContext is null or insufficient.',
		'Answer in 1-3 short bullets. Max 60 words.',
		'Do not ask follow-up questions when code context is available.',
		'If context is incomplete, give your best useful answer and state the missing piece briefly.'
	].join('\n');
}

function getInput({ context, question }) {
	return JSON.stringify(
		{
			question,
			ideContext: summarizeContext(context),
		},
		null,
		2
	);
}

function summarizeContext(context) {
	if (!context) {
		return {
			activeEditor: null,
			workspace: null,
		};
	}

	return {
		activeEditor: context.activeEditor
			? {
					relativePath: context.activeEditor.relativePath,
					languageId: context.activeEditor.languageId,
					cursorLine: context.activeEditor.cursorLine,
					cursorCharacter: context.activeEditor.cursorCharacter,
					primaryCodeContext: context.activeEditor.primaryCodeContext,
					fallbackCodeContext: context.activeEditor.fallbackCodeContext,
					enclosingSymbol: context.activeEditor.enclosingSymbol,
					diagnostics: context.activeEditor.diagnostics,
				}
			: null,
		workspace: {
			folders: context.workspace?.folders,
			openTabs: context.workspace?.openTabs,
			visibleEditors: context.workspace?.visibleEditors,
			activeTerminal: context.workspace?.activeTerminal,
			terminals: context.workspace?.terminals,
			availableFiles: context.workspace?.availableFiles,
		},
		capturedAt: context.capturedAt,
	};
}

function getOutputText(payload) {
	if (typeof payload.output_text === 'string') {
		return payload.output_text;
	}

	return payload.output
		?.flatMap((item) => item.content ?? [])
		.filter((content) => content.type === 'output_text')
		.map((content) => content.text)
		.join('\n')
		.trim();
}

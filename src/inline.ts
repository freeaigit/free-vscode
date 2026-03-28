import * as vscode from 'vscode';
import { APIClient, ChatMessage } from './client';
import { getConfig } from './config';

export class InlineCompletionProvider implements vscode.CompletionItemProvider {
    private client: APIClient;
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(client: APIClient) {
        this.client = client;
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | undefined> {
        const config = getConfig();
        if (!config.inlineSuggestions) {
            return undefined;
        }

        // Get context: preceding lines and the current line up to cursor
        const startLine = Math.max(0, position.line - 30);
        const prefixRange = new vscode.Range(startLine, 0, position.line, position.character);
        const prefix = document.getText(prefixRange);

        // Get a few lines after cursor for context
        const endLine = Math.min(document.lineCount - 1, position.line + 10);
        const suffixRange = new vscode.Range(position.line, position.character, endLine, document.lineAt(endLine).text.length);
        const suffix = document.getText(suffixRange);

        const language = document.languageId;
        const fileName = document.fileName.split('/').pop() || document.fileName.split('\\').pop() || '';

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `You are an inline code completion engine. Given the code context, output ONLY the code that should be inserted at the cursor position. No explanations, no markdown, no code fences. Output raw code only. Language: ${language}. File: ${fileName}.`,
            },
            {
                role: 'user',
                content: `Complete the code at the cursor position [CURSOR]:\n\n${prefix}[CURSOR]${suffix}`,
            },
        ];

        try {
            this.client.updateConfig(config);
            const response = await this.client.chat(messages, config.model);
            const completionText = response.content.trim();

            if (!completionText) {
                return undefined;
            }

            const item = new vscode.CompletionItem(
                completionText.split('\n')[0].substring(0, 60) + (completionText.includes('\n') ? '...' : ''),
                vscode.CompletionItemKind.Snippet
            );
            item.insertText = new vscode.SnippetString(completionText);
            item.detail = `Free.ai (${config.model})`;
            item.documentation = new vscode.MarkdownString(`\`\`\`${language}\n${completionText}\n\`\`\``);
            item.sortText = '0'; // Put at top
            item.preselect = true;

            return [item];
        } catch (err: any) {
            // Don't show errors for inline completions, just return nothing
            console.error('Free.ai inline completion error:', err.message);
            return undefined;
        }
    }
}

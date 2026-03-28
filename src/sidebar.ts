import * as vscode from 'vscode';
import * as path from 'path';
import { APIClient, ChatMessage } from './client';
import { getConfig } from './config';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'freeai.chatView';
    private webviewView?: vscode.WebviewView;
    private client: APIClient;
    private conversationHistory: ChatMessage[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        client: APIClient
    ) {
        this.client = client;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'sendMessage':
                    await this.handleUserMessage(msg.text);
                    break;
                case 'clear':
                    this.conversationHistory = [];
                    break;
                case 'applyCode':
                    await this.applyCodeToEditor(msg.code, msg.language);
                    break;
            }
        });
    }

    public async sendToChat(text: string): Promise<void> {
        if (this.webviewView) {
            this.webviewView.webview.postMessage({ type: 'addUserMessage', text });
            await this.handleUserMessage(text);
        }
    }

    private async handleUserMessage(text: string): Promise<void> {
        const config = getConfig();
        this.client.updateConfig(config);

        // Add file context
        const editor = vscode.window.activeTextEditor;
        let contextInfo = '';
        if (editor) {
            const fileName = path.basename(editor.document.fileName);
            const language = editor.document.languageId;
            const selection = editor.selection;
            if (!selection.isEmpty) {
                const selectedText = editor.document.getText(selection);
                contextInfo = `\n\nCurrent file: ${fileName} (${language})\nSelected code:\n\`\`\`${language}\n${selectedText}\n\`\`\``;
            } else {
                // Send nearby code context (100 lines around cursor)
                const cursorLine = editor.selection.active.line;
                const startLine = Math.max(0, cursorLine - 50);
                const endLine = Math.min(editor.document.lineCount - 1, cursorLine + 50);
                const range = new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
                const nearbyCode = editor.document.getText(range);
                contextInfo = `\n\nCurrent file: ${fileName} (${language}), cursor at line ${cursorLine + 1}\nNearby code:\n\`\`\`${language}\n${nearbyCode}\n\`\`\``;
            }
        }

        if (this.conversationHistory.length === 0) {
            this.conversationHistory.push({
                role: 'system',
                content: 'You are Free.ai Coder, an expert programming assistant. Provide concise, accurate code help. When suggesting code changes, use markdown code blocks with the language specified. Be direct and practical.',
            });
        }

        this.conversationHistory.push({
            role: 'user',
            content: text + contextInfo,
        });

        // Notify webview that response is starting
        this.webviewView?.webview.postMessage({ type: 'streamStart' });

        let fullResponse = '';

        try {
            await this.client.chatStream(
                this.conversationHistory,
                config.model,
                (chunk: string) => {
                    fullResponse += chunk;
                    this.webviewView?.webview.postMessage({ type: 'streamChunk', text: chunk });
                },
                () => {
                    this.conversationHistory.push({ role: 'assistant', content: fullResponse });
                    this.webviewView?.webview.postMessage({ type: 'streamEnd' });
                },
                (err: Error) => {
                    this.webviewView?.webview.postMessage({
                        type: 'error',
                        text: `Error: ${err.message}`,
                    });
                }
            );
        } catch (err: any) {
            this.webviewView?.webview.postMessage({
                type: 'error',
                text: `Error: ${err.message}`,
            });
        }
    }

    private async applyCodeToEditor(code: string, language?: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor to apply code to.');
            return;
        }

        const config = getConfig();
        if (config.safeMode) {
            const choice = await vscode.window.showWarningMessage(
                'Apply AI-suggested code to editor?',
                'Apply',
                'Cancel'
            );
            if (choice !== 'Apply') {
                return;
            }
        }

        const selection = editor.selection;
        if (!selection.isEmpty) {
            await editor.edit(editBuilder => {
                editBuilder.replace(selection, code);
            });
        } else {
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, code);
            });
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar.css'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
    <link rel="stylesheet" href="${cssUri}">
    <title>Free.ai Chat</title>
</head>
<body>
    <div id="chat-container">
        <div id="messages"></div>
        <div id="input-area">
            <textarea id="input" placeholder="Ask about your code..." rows="3"></textarea>
            <div id="buttons">
                <button id="send-btn" title="Send">Send</button>
                <button id="clear-btn" title="Clear chat">Clear</button>
            </div>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const messagesEl = document.getElementById('messages');
        const inputEl = document.getElementById('input');
        const sendBtn = document.getElementById('send-btn');
        const clearBtn = document.getElementById('clear-btn');
        let currentAssistantEl = null;
        let currentAssistantText = '';

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function renderMarkdown(text) {
            // Simple markdown: code blocks, inline code, bold, italic
            let html = escapeHtml(text);
            // Code blocks
            html = html.replace(/\\\`\\\`\\\`(\\w*)\\n([\\s\\S]*?)\\\`\\\`\\\`/g, (_, lang, code) => {
                return '<pre class="code-block" data-lang="' + lang + '"><code>' + code + '</code><button class="apply-btn" onclick="applyCode(this)">Apply</button></pre>';
            });
            // Inline code
            html = html.replace(/\\\`([^\\\`]+)\\\`/g, '<code class="inline-code">$1</code>');
            // Bold
            html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
            // Line breaks
            html = html.replace(/\\n/g, '<br>');
            return html;
        }

        function addMessage(role, text) {
            const el = document.createElement('div');
            el.className = 'message ' + role;
            if (role === 'assistant') {
                el.innerHTML = renderMarkdown(text);
            } else {
                el.innerHTML = '<strong>You:</strong><br>' + escapeHtml(text);
            }
            messagesEl.appendChild(el);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return el;
        }

        function applyCode(btn) {
            const pre = btn.parentElement;
            const code = pre.querySelector('code').textContent;
            const lang = pre.getAttribute('data-lang');
            vscode.postMessage({ type: 'applyCode', code, language: lang });
        }

        function sendMessage() {
            const text = inputEl.value.trim();
            if (!text) return;
            addMessage('user', text);
            vscode.postMessage({ type: 'sendMessage', text });
            inputEl.value = '';
        }

        sendBtn.addEventListener('click', sendMessage);
        clearBtn.addEventListener('click', () => {
            messagesEl.innerHTML = '';
            vscode.postMessage({ type: 'clear' });
        });

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'addUserMessage':
                    addMessage('user', msg.text);
                    break;
                case 'streamStart':
                    currentAssistantEl = document.createElement('div');
                    currentAssistantEl.className = 'message assistant';
                    currentAssistantEl.innerHTML = '<span class="typing">Thinking...</span>';
                    messagesEl.appendChild(currentAssistantEl);
                    currentAssistantText = '';
                    break;
                case 'streamChunk':
                    currentAssistantText += msg.text;
                    if (currentAssistantEl) {
                        currentAssistantEl.innerHTML = renderMarkdown(currentAssistantText);
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                    }
                    break;
                case 'streamEnd':
                    currentAssistantEl = null;
                    break;
                case 'error':
                    const errEl = document.createElement('div');
                    errEl.className = 'message error';
                    errEl.textContent = msg.text;
                    messagesEl.appendChild(errEl);
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}

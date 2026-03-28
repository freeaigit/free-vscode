import * as vscode from 'vscode';
import { APIClient, ChatMessage } from './client';
import { getConfig } from './config';
import { SidebarProvider } from './sidebar';
import { InlineCompletionProvider } from './inline';
import { terminalCommand } from './terminal';
import { promptAndApplyCodeBlock } from './diff';
import { MODELS } from './models';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    const config = getConfig();
    const client = new APIClient(config);

    // Sidebar chat panel
    const sidebarProvider = new SidebarProvider(context.extensionUri, client);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
    );

    // Inline completions
    const inlineProvider = new InlineCompletionProvider(client);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file' },
            inlineProvider,
            '.', '(', '{', ' ', '\n'
        )
    );

    // Status bar model selector
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'freeai.selectModel';
    statusBarItem.text = `$(hubot) ${config.model}`;
    statusBarItem.tooltip = 'Free.ai: Click to change model';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Update status bar when config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('freeai.model')) {
                const newConfig = getConfig();
                statusBarItem.text = `$(hubot) ${newConfig.model}`;
            }
        })
    );

    // --- Commands ---

    // Select model
    context.subscriptions.push(
        vscode.commands.registerCommand('freeai.selectModel', async () => {
            const items = MODELS.map(m => ({
                label: m.name,
                description: `${m.provider} | ${m.category} | ${m.contextLength.toLocaleString()} ctx${m.free ? ' | FREE' : ''}`,
                modelId: m.id,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a model',
            });

            if (selected) {
                await vscode.workspace.getConfiguration('freeai').update('model', selected.modelId, vscode.ConfigurationTarget.Global);
                statusBarItem.text = `$(hubot) ${selected.modelId}`;
                vscode.window.showInformationMessage(`Free.ai: Model set to ${selected.label}`);
            }
        })
    );

    // Ask about selection
    context.subscriptions.push(
        vscode.commands.registerCommand('freeai.askAboutSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showWarningMessage('Select some code first.');
                return;
            }

            const question = await vscode.window.showInputBox({
                prompt: 'Ask about the selected code',
                placeHolder: 'What does this code do?',
            });

            if (!question) { return; }

            const selectedCode = editor.document.getText(editor.selection);
            const language = editor.document.languageId;

            sidebarProvider.sendToChat(
                `${question}\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``
            );

            // Focus the sidebar
            vscode.commands.executeCommand('freeai.chatView.focus');
        })
    );

    // Explain code
    context.subscriptions.push(
        vscode.commands.registerCommand('freeai.explainCode', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showWarningMessage('Select some code first.');
                return;
            }

            const selectedCode = editor.document.getText(editor.selection);
            const language = editor.document.languageId;

            sidebarProvider.sendToChat(
                `Explain this code in detail:\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``
            );
            vscode.commands.executeCommand('freeai.chatView.focus');
        })
    );

    // Refactor
    context.subscriptions.push(
        vscode.commands.registerCommand('freeai.refactor', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showWarningMessage('Select some code first.');
                return;
            }

            const selectedCode = editor.document.getText(editor.selection);
            const language = editor.document.languageId;

            const cfg = getConfig();
            client.updateConfig(cfg);

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: 'You are Free.ai Coder. Refactor the given code to be cleaner, more efficient, and more maintainable. Return the refactored code in a code block. Briefly explain the changes.',
                },
                {
                    role: 'user',
                    content: `Refactor this ${language} code:\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``,
                },
            ];

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Free.ai: Refactoring...' },
                async () => {
                    try {
                        const response = await client.chat(messages, cfg.model);
                        await promptAndApplyCodeBlock(response.content);
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`Free.ai: ${err.message}`);
                    }
                }
            );
        })
    );

    // Write tests
    context.subscriptions.push(
        vscode.commands.registerCommand('freeai.writeTests', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showWarningMessage('Select some code first.');
                return;
            }

            const selectedCode = editor.document.getText(editor.selection);
            const language = editor.document.languageId;
            const fileName = editor.document.fileName;

            const cfg = getConfig();
            client.updateConfig(cfg);

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: 'You are Free.ai Coder. Generate comprehensive unit tests for the given code. Use the most common testing framework for the language. Return the tests in a code block.',
                },
                {
                    role: 'user',
                    content: `Write tests for this ${language} code from ${fileName}:\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``,
                },
            ];

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Free.ai: Writing tests...' },
                async () => {
                    try {
                        const response = await client.chat(messages, cfg.model);
                        // Open tests in a new editor
                        const doc = await vscode.workspace.openTextDocument({
                            content: extractFirstCodeBlock(response.content),
                            language,
                        });
                        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`Free.ai: ${err.message}`);
                    }
                }
            );
        })
    );

    // Fix errors
    context.subscriptions.push(
        vscode.commands.registerCommand('freeai.fixErrors', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor.');
                return;
            }

            const document = editor.document;
            const diagnostics = vscode.languages.getDiagnostics(document.uri);
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);

            if (errors.length === 0) {
                vscode.window.showInformationMessage('No errors found in this file.');
                return;
            }

            const language = document.languageId;
            const fullText = document.getText();
            const errorDescriptions = errors.map(e =>
                `Line ${e.range.start.line + 1}: ${e.message} (${e.source || 'unknown'})`
            ).join('\n');

            const cfg = getConfig();
            client.updateConfig(cfg);

            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: 'You are Free.ai Coder. Fix the errors in the given code. Return the complete fixed code in a single code block. Briefly explain each fix.',
                },
                {
                    role: 'user',
                    content: `Fix these errors in my ${language} file:\n\nErrors:\n${errorDescriptions}\n\nCode:\n\`\`\`${language}\n${fullText}\n\`\`\``,
                },
            ];

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Free.ai: Fixing errors...' },
                async () => {
                    try {
                        const response = await client.chat(messages, cfg.model);
                        await promptAndApplyCodeBlock(response.content);
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`Free.ai: ${err.message}`);
                    }
                }
            );
        })
    );

    // Terminal command
    context.subscriptions.push(
        vscode.commands.registerCommand('freeai.terminalCommand', () => terminalCommand(client))
    );

    console.log('Free.ai Coder activated');
}

function extractFirstCodeBlock(text: string): string {
    const match = text.match(/```\w*\n([\s\S]*?)```/);
    return match ? match[1].trim() : text;
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

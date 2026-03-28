import * as vscode from 'vscode';
import * as os from 'os';
import { APIClient, ChatMessage } from './client';
import { getConfig } from './config';

export async function terminalCommand(client: APIClient): Promise<void> {
    const description = await vscode.window.showInputBox({
        prompt: 'Describe what you want to do in the terminal',
        placeHolder: 'e.g., find all Python files larger than 1MB',
    });

    if (!description) {
        return;
    }

    const config = getConfig();
    client.updateConfig(config);

    const platform = os.platform();
    const shell = process.env.SHELL || (platform === 'win32' ? 'powershell' : 'bash');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: `You are a terminal command generator. Output ONLY the shell command, nothing else. No explanations, no markdown, no code fences. Platform: ${platform}. Shell: ${shell}. Working directory: ${workspaceFolder}.`,
        },
        {
            role: 'user',
            content: description,
        },
    ];

    try {
        const response = await client.chat(messages, config.model);
        const command = response.content.trim();

        const choice = await vscode.window.showInformationMessage(
            `Run command: ${command}`,
            'Run',
            'Copy',
            'Cancel'
        );

        if (choice === 'Run') {
            const terminal = vscode.window.activeTerminal || vscode.window.createTerminal('Free.ai');
            terminal.show();
            terminal.sendText(command);
        } else if (choice === 'Copy') {
            await vscode.env.clipboard.writeText(command);
            vscode.window.showInformationMessage('Command copied to clipboard.');
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Free.ai: ${err.message}`);
    }
}

import * as vscode from 'vscode';
import { getConfig } from './config';

/**
 * Apply a code block from AI response directly to the active editor.
 * Handles replacing selection or inserting at cursor.
 */
export async function applyDiff(code: string): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor to apply changes to.');
        return false;
    }

    const config = getConfig();

    if (config.safeMode) {
        // Show diff preview
        const originalDoc = editor.document;
        const selection = editor.selection;

        let previewContent: string;
        if (!selection.isEmpty) {
            const fullText = originalDoc.getText();
            const before = fullText.substring(0, originalDoc.offsetAt(selection.start));
            const after = fullText.substring(originalDoc.offsetAt(selection.end));
            previewContent = before + code + after;
        } else {
            const fullText = originalDoc.getText();
            const offset = originalDoc.offsetAt(editor.selection.active);
            previewContent = fullText.substring(0, offset) + code + fullText.substring(offset);
        }

        // Create temp document for diff view
        const tempUri = vscode.Uri.parse('untitled:Free.ai-Preview');
        const tempDoc = await vscode.workspace.openTextDocument({
            content: previewContent,
            language: originalDoc.languageId,
        });

        await vscode.commands.executeCommand(
            'vscode.diff',
            originalDoc.uri,
            tempDoc.uri,
            'Current <-> Free.ai Suggestion'
        );

        const choice = await vscode.window.showInformationMessage(
            'Apply these changes?',
            'Apply',
            'Cancel'
        );

        if (choice !== 'Apply') {
            return false;
        }
    }

    // Apply the changes
    const success = await editor.edit(editBuilder => {
        if (!editor.selection.isEmpty) {
            editBuilder.replace(editor.selection, code);
        } else {
            editBuilder.insert(editor.selection.active, code);
        }
    });

    if (success) {
        vscode.window.showInformationMessage('Free.ai: Changes applied.');
    } else {
        vscode.window.showErrorMessage('Free.ai: Failed to apply changes.');
    }

    return success;
}

/**
 * Extract code blocks from a markdown response.
 * Returns array of { language, code } objects.
 */
export function extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
    const blocks: Array<{ language: string; code: string }> = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        blocks.push({
            language: match[1] || '',
            code: match[2].trim(),
        });
    }

    return blocks;
}

/**
 * Show a quick pick to select which code block to apply from the AI response.
 */
export async function promptAndApplyCodeBlock(responseText: string): Promise<void> {
    const blocks = extractCodeBlocks(responseText);

    if (blocks.length === 0) {
        vscode.window.showInformationMessage('No code blocks found in AI response.');
        return;
    }

    if (blocks.length === 1) {
        await applyDiff(blocks[0].code);
        return;
    }

    const items = blocks.map((block, i) => ({
        label: `Block ${i + 1}${block.language ? ` (${block.language})` : ''}`,
        description: block.code.split('\n')[0].substring(0, 80),
        index: i,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select code block to apply',
    });

    if (selected) {
        await applyDiff(blocks[selected.index].code);
    }
}

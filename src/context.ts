/**
 * prompt-tracer: context.ts
 *
 * Collects IDE context (active file, project root, language) at the exact
 * moment a prompt is captured.
 */

import * as vscode from "vscode";
import * as path from "path";

export interface CaptureContext {
  projectRoot: string;
  activeFile: string | null;
  activeLanguage: string | null;
}

/**
 * Snaps a read of the current IDE context. Called synchronously at
 * interception time so we get the right file state.
 */
export function snapContext(): CaptureContext {
  const folders = vscode.workspace.workspaceFolders;
  const projectRoot = folders?.[0]?.uri.fsPath ?? process.cwd();

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return { projectRoot, activeFile: null, activeLanguage: null };
  }

  const filePath = editor.document.uri.fsPath;
  const activeFile = path.relative(projectRoot, filePath);
  const activeLanguage = editor.document.languageId;

  return { projectRoot, activeFile, activeLanguage };
}

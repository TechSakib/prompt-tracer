/**
 * prompt-tracer: logger.ts
 * Centralized output channel logger. Silent in production unless verbose.
 */

import * as vscode from "vscode";

let channel: vscode.OutputChannel | null = null;

export function initLogger(): vscode.OutputChannel {
  channel = vscode.window.createOutputChannel("Prompt Tracer");
  return channel;
}

export function log(msg: string): void {
  const ts = new Date().toISOString();
  channel?.appendLine(`[${ts}] ${msg}`);
}

export function error(msg: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? "");
  channel?.appendLine(`[ERROR] ${msg}${detail ? ` | ${detail}` : ""}`);
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = null;
}

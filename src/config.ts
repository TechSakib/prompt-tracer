/**
 * prompt-tracer: config.ts
 * Reads and validates extension configuration from VS Code settings.
 */

import * as vscode from "vscode";
import { ExtensionConfig } from "./types";

const SECTION = "promptTracer";

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled:         cfg.get<boolean>("enabled", true),
    outputFolder:    cfg.get<string>("outputFolder", "ai-prompts"),
    captureResponse: cfg.get<boolean>("captureResponse", true),
    jsonEnabled:     cfg.get<boolean>("jsonEnabled", true),
    markdownEnabled: cfg.get<boolean>("markdownEnabled", true),
    debounceMs:      cfg.get<number>("debounceMs", 300),
  };
}

export function onConfigChange(
  callback: (cfg: ExtensionConfig) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) {
      callback(getConfig());
    }
  });
}

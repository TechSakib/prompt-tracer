/**
 * prompt-tracer: interceptors/webviewInterceptor.ts
 *
 * ═══════════════════════════════════════════════════════════════════
 * SECONDARY INTERCEPTION STRATEGY: Webview Message Bridge
 * ═══════════════════════════════════════════════════════════════════
 *
 * HOW IT WORKS:
 * Trae renders its Chat panel as an Electron Webview (HTML/JS inside
 * a sandboxed iframe). Communication between the Webview UI and the
 * VS Code extension host happens via postMessage / onDidReceiveMessage.
 *
 * VS Code exposes a hook: vscode.window.onDidReceiveMessage (on the
 * extension side of WebviewPanel). Since Trae's chat panel is a
 * Webview, its messages flow through this channel.
 *
 * We register a listener on ALL webview panels via the VS Code API
 * event system. When a message matching the "send prompt" shape
 * arrives, we capture it.
 *
 * TECHNIQUE:
 * We patch WebviewPanel's onDidReceiveMessage before Trae registers
 * its own handler, so we get first-look at every message.
 */

import * as vscode from "vscode";
import { CaptureEngine } from "../capture";
import { log } from "../logger";

// Message shapes Trae's webview might send for prompt submission
const PROMPT_MESSAGE_TYPES = new Set([
  "sendMessage",
  "submitPrompt",
  "chatSubmit",
  "sendPrompt",
  "userMessage",
  "aiRequest",
  "query",
  "send",
]);

function extractPromptFromMessage(msg: unknown): string | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;

  // Check type field matches
  if (
    typeof m.type === "string" &&
    PROMPT_MESSAGE_TYPES.has(m.type)
  ) {
    const text =
      m.text ?? m.prompt ?? m.message ?? m.content ?? m.input ?? m.query;
    if (typeof text === "string" && text.trim()) {
      return text.trim();
    }
  }

  // Fallback: any object with a non-empty text/prompt/message field
  // that looks like a user submission
  if (typeof m.prompt === "string" && m.prompt.trim()) {
    return m.prompt.trim();
  }
  if (typeof m.message === "string" && m.message.trim() && m.role === "user") {
    return m.message.trim();
  }

  return null;
}

export class WebviewInterceptor {
  private engine: CaptureEngine;
  private disposables: vscode.Disposable[] = [];
  private originalCreatePanel:
    | typeof vscode.window.createWebviewPanel
    | null = null;

  constructor(engine: CaptureEngine) {
    this.engine = engine;
  }

  install(): void {
    this.patchWebviewPanelCreation();

    log("WebviewInterceptor installed");
  }

  private attachToPanel(panel: vscode.WebviewPanel): void {
    const listener = panel.webview.onDidReceiveMessage((msg: unknown) => {
      const prompt = extractPromptFromMessage(msg);
      if (prompt) {
        log(`WebviewInterceptor: captured prompt from panel "${panel.viewType}"`);
        this.engine.capture(prompt, "webview-message");
      }
    });
    this.disposables.push(listener);
    log(`WebviewInterceptor: attached to panel "${panel.viewType}"`);
  }

  /**
   * Patches the VS Code API to intercept WebviewPanel creation.
   * Works because in the extension host, the API objects are mutable.
   */
  private patchWebviewPanelCreation(): void {
    const originalCreatePanel = vscode.window.createWebviewPanel.bind(vscode.window);
    this.originalCreatePanel = originalCreatePanel;

    try {
      (vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel =
        (
          viewType: string,
          title: string,
          showOptions:
            | vscode.ViewColumn
            | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
          options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
        ): vscode.WebviewPanel => {
          const panel = originalCreatePanel(viewType, title, showOptions, options);
          this.attachToPanel(panel);
          return panel;
        };
    } catch (e) {
      // Some hosts expose read-only API objects; in that case we skip this layer.
      this.originalCreatePanel = null;
      log(`WebviewInterceptor: unable to patch createWebviewPanel (${String(e)})`);
    }
  }

  dispose(): void {
    if (this.originalCreatePanel) {
      try {
        (vscode.window as unknown as { createWebviewPanel: typeof vscode.window.createWebviewPanel }).createWebviewPanel =
          this.originalCreatePanel;
      } catch {
        // no-op: host might keep the API immutable
      }
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    log("WebviewInterceptor disposed");
  }
}

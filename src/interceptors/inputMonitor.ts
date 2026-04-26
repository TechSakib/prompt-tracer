/**
 * prompt-tracer: interceptors/inputMonitor.ts
 *
 * ═══════════════════════════════════════════════════════════════════
 * TERTIARY INTERCEPTION STRATEGY: Input Box / Quick Input Monitor
 * ═══════════════════════════════════════════════════════════════════
 *
 * HOW IT WORKS:
 * Some versions of Trae use VS Code's QuickInput / InputBox for
 * inline prompts (e.g. inline chat, quick question modes).
 *
 * VS Code provides `vscode.window.onDidChangeActiveTextEditor` and
 * `createInputBox` / `createQuickPick` APIs. We patch these to
 * observe any text submitted via input widgets.
 *
 * Additionally, we watch the Trae output channels and text documents
 * that match the prompt history file pattern to detect retroactively
 * saved prompts we might have missed.
 *
 * This is the FALLBACK interceptor — it catches anything the command
 * and webview interceptors miss.
 */

import * as vscode from "vscode";
import { CaptureEngine } from "../capture";
import { log } from "../logger";

export class InputMonitor {
  private engine: CaptureEngine;
  private disposables: vscode.Disposable[] = [];
  private originalCreateInputBox: typeof vscode.window.createInputBox;
  private originalCreateQuickPick: typeof vscode.window.createQuickPick;
  private inputPatched = false;
  private quickPickPatched = false;

  constructor(engine: CaptureEngine) {
    this.engine = engine;
    this.originalCreateInputBox = vscode.window.createInputBox.bind(
      vscode.window
    );
    this.originalCreateQuickPick = vscode.window.createQuickPick.bind(
      vscode.window
    );
  }

  install(): void {
    this.patchInputBox();
    this.patchQuickPick();
    log("InputMonitor installed");
  }

  private patchInputBox(): void {
    const original = this.originalCreateInputBox;
    try {
      (vscode.window as unknown as { createInputBox: typeof vscode.window.createInputBox }).createInputBox =
        (): vscode.InputBox => {
          const inputBox = original();

          // We listen to the accept event (user presses Enter)
          const acceptSub = inputBox.onDidAccept(() => {
            const value = inputBox.value?.trim();
            if (value && value.length > 3) {
              // Heuristic: if the placeholder or title suggests AI
              const isAiInput =
                inputBox.title?.toLowerCase().includes("ai") ||
                inputBox.title?.toLowerCase().includes("prompt") ||
                inputBox.title?.toLowerCase().includes("chat") ||
                inputBox.placeholder?.toLowerCase().includes("ask") ||
                inputBox.placeholder?.toLowerCase().includes("prompt");

              if (isAiInput) {
                log(`InputMonitor: captured from InputBox`);
                this.engine.capture(value, "input-monitor");
              }
            }
          });

          // Clean up when box closes
          inputBox.onDidHide(() => acceptSub.dispose());

          return inputBox;
        };
      this.inputPatched = true;
    } catch (e) {
      log(`InputMonitor: unable to patch createInputBox (${String(e)})`);
      this.inputPatched = false;
    }
  }

  private patchQuickPick(): void {
    const original = this.originalCreateQuickPick as () => vscode.QuickPick<vscode.QuickPickItem>;
    try {
      (vscode.window as unknown as Record<string, unknown>)["createQuickPick"] =
        (() => {
          const qp = original();

          const sub = qp.onDidAccept(() => {
            // QuickPick value is the typed text when no item is selected
            const value = qp.value?.trim();
            if (value && value.length > 3) {
              const isAiInput =
                qp.title?.toLowerCase().includes("ai") ||
                qp.title?.toLowerCase().includes("prompt") ||
                qp.title?.toLowerCase().includes("chat");

              if (isAiInput) {
                log(`InputMonitor: captured from QuickPick`);
                this.engine.capture(value, "input-monitor");
              }
            }
          });

          qp.onDidHide(() => sub.dispose());
          return qp;
        }) as typeof vscode.window.createQuickPick;
      this.quickPickPatched = true;
    } catch (e) {
      log(`InputMonitor: unable to patch createQuickPick (${String(e)})`);
      this.quickPickPatched = false;
    }
  }

  dispose(): void {
    // Restore original functions
    if (this.inputPatched) {
      (vscode.window as unknown as { createInputBox: typeof vscode.window.createInputBox }).createInputBox =
        this.originalCreateInputBox;
    }
    if (this.quickPickPatched) {
      (vscode.window as unknown as { createQuickPick: typeof vscode.window.createQuickPick }).createQuickPick =
        this.originalCreateQuickPick;
    }

    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    log("InputMonitor disposed");
  }
}

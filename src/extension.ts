/**
 * prompt-tracer: extension.ts
 *
 * ═══════════════════════════════════════════════════════════════════
 * MAIN ENTRY POINT
 * ═══════════════════════════════════════════════════════════════════
 *
 * Activation flow:
 *  1. Read configuration
 *  2. Create status bar item
 *  3. Initialize CaptureEngine
 *  4. Install all interceptors (layered approach)
 *  5. Register user-facing commands
 *  6. Register config change listener
 *
 * On deactivate: all interceptors are cleanly uninstalled.
 */

import * as vscode from "vscode";
import { getConfig, onConfigChange } from "./config";
import { initLogger, log, disposeLogger } from "./logger";
import { CaptureEngine } from "./capture";
import { CommandInterceptor } from "./interceptors/commandInterceptor";
import { WebviewInterceptor } from "./interceptors/webviewInterceptor";
import { InputMonitor } from "./interceptors/inputMonitor";
import { NetworkInterceptor } from "./interceptors/networkInterceptor";
import { readLog, clearLog, getLogPaths } from "./storage";

// ─── Extension lifecycle ──────────────────────────────────────────────────

const disposables: vscode.Disposable[] = [];
let engine: CaptureEngine | null = null;
let cmdInterceptor: CommandInterceptor | null = null;
let webviewInterceptor: WebviewInterceptor | null = null;
let inputMonitor: InputMonitor | null = null;
let networkInterceptor: NetworkInterceptor | null = null;

export function activate(context: vscode.ExtensionContext): void {
  // ── 1. Logger ──────────────────────────────────────────────────────
  const outputChannel = initLogger();
  disposables.push(outputChannel);
  log("Prompt Tracer activating…");

  // ── 2. Status bar ──────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.text = "$(history) Tracer";
  statusBar.tooltip = "Prompt Tracer: waiting for first prompt…";
  statusBar.command = "promptTracer.openLog";
  statusBar.show();
  disposables.push(statusBar);

  // ── 3. Config + Engine ─────────────────────────────────────────────
  let cfg = getConfig();
  engine = new CaptureEngine(cfg, statusBar);

  // ── 4. Interceptors ────────────────────────────────────────────────
  // Layer 1: Command proxy (highest fidelity)
  cmdInterceptor = new CommandInterceptor(engine);
  try {
    cmdInterceptor.install();
  } catch (e) {
    log(`CommandInterceptor failed to install: ${String(e)}`);
  }

  // Layer 2: Webview message bridge
  webviewInterceptor = new WebviewInterceptor(engine);
  try {
    webviewInterceptor.install();
  } catch (e) {
    log(`WebviewInterceptor failed to install: ${String(e)}`);
  }

  // Layer 3: Input box / quick pick monitor
  inputMonitor = new InputMonitor(engine);
  try {
    inputMonitor.install();
  } catch (e) {
    log(`InputMonitor failed to install: ${String(e)}`);
  }

  // Layer 4: Network request interception (deepest fallback)
  networkInterceptor = new NetworkInterceptor(engine);
  try {
    networkInterceptor.install();
  } catch (e) {
    log(`NetworkInterceptor failed to install: ${String(e)}`);
  }

  log("All interceptors installed");

  // ── 5. Config change listener ──────────────────────────────────────
  disposables.push(
    onConfigChange((newCfg) => {
      cfg = newCfg;
      engine?.updateConfig(newCfg);
      log(`Config updated: enabled=${newCfg.enabled}`);
      vscode.window.setStatusBarMessage(
        `Prompt Tracer: ${newCfg.enabled ? "enabled" : "disabled"}`,
        2000
      );
    })
  );

  // ── 6. Commands ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("promptTracer.toggle", () => {
      const current = cfg.enabled;
      vscode.workspace
        .getConfiguration("promptTracer")
        .update("enabled", !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Prompt Tracer: ${!current ? "enabled ✓" : "disabled"}`
      );
    }),

    vscode.commands.registerCommand("promptTracer.openLog", async () => {
      const paths = getLogPaths(cfg);
      if (!paths.md) {
        vscode.window.showWarningMessage(
          "Prompt Tracer: No project open — cannot find log file."
        );
        return;
      }
      try {
        const uri = vscode.Uri.file(paths.md);
        await vscode.commands.executeCommand("markdown.showPreview", uri);
      } catch {
        // Fallback: open as plain text
        const uri = vscode.Uri.file(paths.json ?? "");
        await vscode.window.showTextDocument(uri);
      }
    }),

    vscode.commands.registerCommand("promptTracer.clearLog", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Clear all captured prompts for this project?",
        { modal: true },
        "Yes, clear"
      );
      if (confirm === "Yes, clear") {
        clearLog(cfg);
        vscode.window.showInformationMessage(
          "Prompt Tracer: Log cleared."
        );
      }
    }),

    vscode.commands.registerCommand("promptTracer.showStats", () => {
      const promptLog = readLog(cfg);
      if (!promptLog) {
        vscode.window.showInformationMessage(
          "Prompt Tracer: No prompts captured yet for this project."
        );
        return;
      }
      const count = promptLog.totalPrompts;
      const sessions = promptLog.sessionCount;
      const first = new Date(promptLog.createdAt).toLocaleDateString();
      const last  = new Date(promptLog.updatedAt).toLocaleString();
      vscode.window.showInformationMessage(
        `Prompt Tracer — ${count} prompts across ${sessions} session(s). ` +
        `First: ${first}. Last: ${last}.`
      );
    })
  );

  // Register all disposables
  context.subscriptions.push(...disposables);

  log("Prompt Tracer activated ✓");

  // Welcome message on first install
  const isFirstRun = !context.globalState.get("promptTracer.hasRun");
  if (isFirstRun) {
    context.globalState.update("promptTracer.hasRun", true);
    vscode.window.showInformationMessage(
      "Prompt Tracer is active! Your AI prompts will be automatically saved to `ai-prompts/` in each project.",
      "Open Settings"
    ).then((selection) => {
      if (selection === "Open Settings") {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "promptTracer"
        );
      }
    });
  }
}

export function deactivate(): void {
  log("Deactivating Prompt Tracer…");
  cmdInterceptor?.dispose();
  webviewInterceptor?.dispose();
  inputMonitor?.dispose();
  networkInterceptor?.dispose();
  disposeLogger();
}

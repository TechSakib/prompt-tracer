/**
 * prompt-tracer: capture.ts  (with dedup)
 */

import { CapturedPrompt, CaptureMethod, ExtensionConfig } from "./types";
import { snapContext } from "./context";
import { appendPrompt } from "./storage";
import { generateId, getSessionId, truncate, debounce } from "./utils";
import { log, error } from "./logger";
import { DedupGuard } from "./dedup";
import * as vscode from "vscode";

export class CaptureEngine {
  private cfg: ExtensionConfig;
  private dedup = new DedupGuard();
  private debouncedWrite!: (entry: CapturedPrompt) => void;
  private statusBar: vscode.StatusBarItem;
  private captureCount = 0;

  constructor(cfg: ExtensionConfig, statusBar: vscode.StatusBarItem) {
    this.cfg = cfg;
    this.statusBar = statusBar;
    this.setupDebounce();
  }

  private setupDebounce(): void {
    this.debouncedWrite = debounce(
      this._writeEntry.bind(this) as (...args: unknown[]) => void,
      this.cfg.debounceMs
    ) as (entry: CapturedPrompt) => void;
  }

  updateConfig(cfg: ExtensionConfig): void {
    this.cfg = cfg;
    this.setupDebounce();
  }

  capture(promptText: string, method: CaptureMethod, response?: string): void {
    if (!this.cfg.enabled) return;
    if (!promptText?.trim()) return;

    if (this.dedup.isDuplicate(promptText)) {
      log(`Dedup: skipped duplicate from [${method}]`);
      return;
    }

    const ctx = snapContext();

    const entry: CapturedPrompt = {
      id:             generateId(),
      prompt:         promptText.trim(),
      timestamp:      new Date().toISOString(),
      projectRoot:    ctx.projectRoot,
      activeFile:     ctx.activeFile,
      activeLanguage: ctx.activeLanguage,
      response:       this.cfg.captureResponse ? (response ?? null) : null,
      captureMethod:  method,
      sessionId:      getSessionId(),
    };

    log(`✓ Captured [${method}]: "${truncate(entry.prompt)}"`);
    this.debouncedWrite(entry);
    this.captureCount++;
    this.updateStatusBar();

    if (this.captureCount === 1) {
      vscode.window.setStatusBarMessage(
        "$(history) Prompt Tracer: first prompt captured!",
        3000
      );
    }
  }

  private _writeEntry(entry: CapturedPrompt): void {
    try {
      const result = appendPrompt(entry, this.cfg);
      if (result.projectRoot) {
        log(`Written → ${result.jsonPath}`);
      }
    } catch (e) {
      error("CaptureEngine write failed", e);
    }
  }

  private updateStatusBar(): void {
    this.statusBar.text = `$(history) ${this.captureCount}`;
    this.statusBar.tooltip = `Prompt Tracer: ${this.captureCount} prompt(s) captured. Click to open log.`;
    this.statusBar.command = "promptTracer.openLog";
    this.statusBar.show();
  }

  getCount(): number {
    return this.captureCount;
  }
}

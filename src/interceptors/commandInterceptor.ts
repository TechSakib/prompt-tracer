/**
 * prompt-tracer: interceptors/commandInterceptor.ts
 *
 * ═══════════════════════════════════════════════════════════════════
 * PRIMARY INTERCEPTION STRATEGY: VS Code Command Proxy
 * ═══════════════════════════════════════════════════════════════════
 *
 * HOW IT WORKS:
 * Trae is a VS Code fork. All AI chat interactions go through VS Code's
 * command system. When you type a prompt and press Enter, Trae triggers
 * one or more internal VS Code commands (e.g. trae.chat.send,
 * trae.inline.accept, workbench.action.chat.submit, etc.)
 *
 * We proxy vscode.commands.executeCommand to intercept these calls
 * before they reach the Trae AI backend. This gives us the prompt
 * text at the exact moment of submission.
 *
 * WHY THIS WORKS:
 * - Trae uses the VS Code extension host like any VS Code fork
 * - Extensions share the same JS runtime as internal commands
 * - The extension API exposes executeCommand synchronously
 * - We replace it with a transparent wrapper that also logs
 *
 * KNOWN COMMAND IDs (discovered via VS Code command palette scanning):
 * These are the commands Trae uses internally — we watch all of them.
 */

import * as vscode from "vscode";
import { CaptureEngine } from "../capture";
import { log } from "../logger";

// Known AI prompt submission command patterns across Trae / VS Code chat
const PROMPT_COMMANDS = new Set([
  // Trae-specific (observed via command palette)
  "trae.chat.send",
  "trae.chat.submit",
  "trae.ai.send",
  "trae.ai.submit",
  "trae.inline.send",
  "trae.inline.submit",
  "trae.panel.send",
  "trae.builder.send",
  "trae.solo.send",
  // VS Code Chat API (used by Trae since it's a VS Code fork)
  "workbench.action.chat.submit",
  "workbench.action.chat.send",
  "workbench.action.inlineChat.accept",
  "workbench.action.inlineChat.send",
  // MarsCode / legacy command IDs
  "marscode.chat.send",
  "marscode.chat.submit",
]);

// Patterns: if we don't have an exact match, check these substrings
const PROMPT_COMMAND_PATTERNS = [
  "chat.send",
  "chat.submit",
  "ai.send",
  "ai.submit",
  "inline.send",
  "inline.submit",
  "prompt.send",
  "prompt.submit",
];

function isPromptCommand(commandId: string): boolean {
  if (PROMPT_COMMANDS.has(commandId)) return true;
  return PROMPT_COMMAND_PATTERNS.some((p) =>
    commandId.toLowerCase().includes(p)
  );
}

/**
 * Extracts prompt text from command arguments.
 * Trae passes the prompt as a string or inside an object.
 */
function extractPrompt(args: unknown[]): string | null {
  for (const arg of args) {
    if (typeof arg === "string" && arg.trim().length > 0) {
      return arg;
    }
    if (arg && typeof arg === "object") {
      const obj = arg as Record<string, unknown>;
      const candidates = ["prompt", "text", "message", "input", "query", "content"];
      for (const key of candidates) {
        if (typeof obj[key] === "string" && (obj[key] as string).trim()) {
          return obj[key] as string;
        }
      }
    }
  }
  return null;
}

export class CommandInterceptor {
  private commandSubscription: vscode.Disposable | null = null;
  private originalExecuteCommand: typeof vscode.commands.executeCommand | null = null;
  private executeCommandPatched = false;
  private engine: CaptureEngine;
  private hitCount = 0;

  constructor(engine: CaptureEngine) {
    this.engine = engine;
  }

  install(): void {
    if (this.commandSubscription) return;
    const commandsApi = vscode.commands as unknown as {
      onDidExecuteCommand?: (
        listener: (event: { command: string; arguments?: unknown[] }) => void
      ) => vscode.Disposable;
    };

    if (typeof commandsApi.onDidExecuteCommand === "function") {
      this.commandSubscription = commandsApi.onDidExecuteCommand((event) => {
        if (!isPromptCommand(event.command)) return;

        this.hitCount++;
        log(
          `CommandInterceptor: hit command "${event.command}" (hit #${this.hitCount})`
        );

        const args = event.arguments ?? [];
        const promptText = extractPrompt(args);
        if (promptText) {
          this.engine.capture(promptText, "command-intercept");
        } else {
          log(
            `CommandInterceptor: matched command "${event.command}" but no prompt in args`
          );
        }
      });
    } else {
      // Backward-compatible fallback for hosts/types where onDidExecuteCommand is unavailable.
      this.patchExecuteCommand();
    }

    log("CommandInterceptor installed");
  }

  private patchExecuteCommand(): void {
    const commandsObj = vscode.commands as unknown as {
      executeCommand: typeof vscode.commands.executeCommand;
    };
    const original = commandsObj.executeCommand.bind(vscode.commands);
    this.originalExecuteCommand = original;

    commandsObj.executeCommand = async <T>(
      command: string,
      ...args: unknown[]
    ): Promise<T> => {
      const result = original<T>(command, ...args);

      if (isPromptCommand(command)) {
        this.hitCount++;
        log(`CommandInterceptor: hit command "${command}" (hit #${this.hitCount})`);

        const promptText = extractPrompt(args);
        if (promptText) {
          this.engine.capture(promptText, "command-intercept");
        } else {
          log(
            `CommandInterceptor: matched command "${command}" but no prompt in args`
          );
        }
      }

      return result;
    };
    this.executeCommandPatched = true;
  }

  uninstall(): void {
    if (this.commandSubscription) {
      this.commandSubscription.dispose();
      this.commandSubscription = null;
    }
    if (this.executeCommandPatched && this.originalExecuteCommand) {
      const commandsObj = vscode.commands as unknown as {
        executeCommand: typeof vscode.commands.executeCommand;
      };
      commandsObj.executeCommand = this.originalExecuteCommand;
      this.executeCommandPatched = false;
      this.originalExecuteCommand = null;
    }
    log("CommandInterceptor uninstalled");
  }

  getHitCount(): number {
    return this.hitCount;
  }

  dispose(): void {
    this.uninstall();
  }
}

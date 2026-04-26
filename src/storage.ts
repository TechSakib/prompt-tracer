/**
 * prompt-tracer: storage.ts
 *
 * Handles all filesystem I/O for the captured prompt log.
 * Writes two files per project:
 *   <projectRoot>/ai-prompts/prompts.json   → machine-readable
 *   <projectRoot>/ai-prompts/prompts.md     → human-readable / Git-friendly
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { CapturedPrompt, PromptLog } from "./types";
import { ExtensionConfig } from "./types";
import { log, error } from "./logger";
import { mdEscape } from "./utils";

// ─── Helpers ───────────────────────────────────────────────────────────────

function getProjectRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  return folders[0].uri.fsPath;
}

function getOutputDir(root: string, cfg: ExtensionConfig): string {
  return path.join(root, cfg.outputFolder);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`Created output directory: ${dir}`);
  }
}

// ─── JSON ──────────────────────────────────────────────────────────────────

function readJsonLog(jsonPath: string): PromptLog | null {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = fs.readFileSync(jsonPath, "utf-8");
    return JSON.parse(raw) as PromptLog;
  } catch (e) {
    error("Failed to read prompt JSON log", e);
    return null;
  }
}

function writeJsonLog(jsonPath: string, log_: PromptLog): void {
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(log_, null, 2), "utf-8");
  } catch (e) {
    error("Failed to write prompt JSON log", e);
  }
}

// ─── Markdown ──────────────────────────────────────────────────────────────

function buildMarkdown(promptLog: PromptLog): string {
  const lines: string[] = [
    "# AI Prompt History",
    "",
    `> **Project:** \`${promptLog.project}\`  `,
    `> **Total Prompts:** ${promptLog.totalPrompts}  `,
    `> **Sessions:** ${promptLog.sessionCount}  `,
    `> **Last Updated:** ${new Date(promptLog.updatedAt).toLocaleString()}`,
    "",
    "---",
    "",
  ];

  // Most recent first for readability
  const sorted = [...promptLog.prompts].reverse();

  for (const entry of sorted) {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleString();
    const file = entry.activeFile ? `\`${entry.activeFile}\`` : "_none_";
    const lang = entry.activeLanguage ?? "unknown";

    lines.push(`## [${dateStr}]`);
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| **ID** | \`${entry.id}\` |`);
    lines.push(`| **Time** | ${dateStr} |`);
    lines.push(`| **Active File** | ${file} |`);
    lines.push(`| **Language** | ${lang} |`);
    lines.push(`| **Method** | \`${entry.captureMethod}\` |`);
    lines.push("");
    lines.push("### Prompt");
    lines.push("");
    lines.push("```");
    lines.push(entry.prompt.trim());
    lines.push("```");
    lines.push("");

    if (entry.response) {
      lines.push("### Response");
      lines.push("");
      lines.push("```");
      lines.push(entry.response.trim());
      lines.push("```");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function writeMarkdownLog(mdPath: string, promptLog: PromptLog): void {
  try {
    const content = buildMarkdown(promptLog);
    fs.writeFileSync(mdPath, content, "utf-8");
  } catch (e) {
    error("Failed to write prompt Markdown log", e);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface StorageResult {
  jsonPath: string | null;
  mdPath: string | null;
  projectRoot: string | null;
}

export function appendPrompt(
  entry: CapturedPrompt,
  cfg: ExtensionConfig
): StorageResult {
  const root = getProjectRoot();
  if (!root) {
    error("No workspace open — cannot save prompt");
    return { jsonPath: null, mdPath: null, projectRoot: null };
  }

  const outDir = getOutputDir(root, cfg);
  ensureDir(outDir);

  const jsonPath = path.join(outDir, "prompts.json");
  const mdPath   = path.join(outDir, "prompts.md");

  // Load or create the log
  let promptLog = readJsonLog(jsonPath);
  const now = new Date().toISOString();

  if (!promptLog) {
    promptLog = {
      version: "1.0",
      project: path.basename(root),
      createdAt: now,
      updatedAt: now,
      sessionCount: 1,
      totalPrompts: 0,
      prompts: [],
    };
  } else {
    promptLog.updatedAt = now;
    // Increment session count if this is a new session
    const lastSession = promptLog.prompts[promptLog.prompts.length - 1]?.sessionId;
    if (lastSession && lastSession !== entry.sessionId) {
      promptLog.sessionCount++;
    }
  }

  promptLog.prompts.push(entry);
  promptLog.totalPrompts = promptLog.prompts.length;

  if (cfg.jsonEnabled) {
    writeJsonLog(jsonPath, promptLog);
    log(`Saved JSON: ${jsonPath}`);
  }

  if (cfg.markdownEnabled) {
    writeMarkdownLog(mdPath, promptLog);
    log(`Saved Markdown: ${mdPath}`);
  }

  return { jsonPath, mdPath, projectRoot: root };
}

export function readLog(cfg: ExtensionConfig): PromptLog | null {
  const root = getProjectRoot();
  if (!root) return null;
  const outDir = getOutputDir(root, cfg);
  const jsonPath = path.join(outDir, "prompts.json");
  return readJsonLog(jsonPath);
}

export function clearLog(cfg: ExtensionConfig): boolean {
  const root = getProjectRoot();
  if (!root) return false;
  const outDir = getOutputDir(root, cfg);
  const jsonPath = path.join(outDir, "prompts.json");
  const mdPath   = path.join(outDir, "prompts.md");

  try {
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    if (fs.existsSync(mdPath))   fs.unlinkSync(mdPath);
    log("Cleared prompt log");
    return true;
  } catch (e) {
    error("Failed to clear log", e);
    return false;
  }
}

export function getLogPaths(cfg: ExtensionConfig): { json: string | null; md: string | null } {
  const root = getProjectRoot();
  if (!root) return { json: null, md: null };
  const outDir = getOutputDir(root, cfg);
  return {
    json: path.join(outDir, "prompts.json"),
    md:   path.join(outDir, "prompts.md"),
  };
}

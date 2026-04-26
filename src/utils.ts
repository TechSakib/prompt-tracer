/**
 * prompt-tracer: utils.ts
 * Shared utility functions.
 */

import * as crypto from "crypto";

/**
 * Generates a short unique ID for each captured prompt.
 */
export function generateId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Generates a stable session ID for the current IDE session.
 * Changes each time the extension activates (i.e., each IDE launch).
 */
let _sessionId: string | null = null;
export function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }
  return _sessionId;
}

/**
 * Returns a debounced version of the given function.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Truncates a string for display.
 */
export function truncate(str: string, maxLen = 80): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * Sanitizes text for safe Markdown output.
 */
export function mdEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

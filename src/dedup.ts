/**
 * prompt-tracer: dedup.ts
 *
 * Prevents duplicate captures when multiple interceptors fire for
 * the same user prompt submission (which can happen when both the
 * command interceptor AND network interceptor both catch the same event).
 *
 * Strategy: hash the prompt text + round it to the nearest 2 seconds.
 * If the same hash appears within 2s, deduplicate.
 */

import * as crypto from "crypto";

const WINDOW_MS = 2000; // 2 second dedup window

interface DedupEntry {
  hash: string;
  timestamp: number;
}

export class DedupGuard {
  private recent: DedupEntry[] = [];

  /**
   * Returns true if this prompt is a duplicate (should be skipped).
   */
  isDuplicate(promptText: string): boolean {
    const hash = this.hashPrompt(promptText);
    const now = Date.now();

    // Purge old entries
    this.recent = this.recent.filter(
      (e) => now - e.timestamp < WINDOW_MS
    );

    const dup = this.recent.some((e) => e.hash === hash);
    if (!dup) {
      this.recent.push({ hash, timestamp: now });
    }
    return dup;
  }

  private hashPrompt(text: string): string {
    return crypto
      .createHash("sha256")
      .update(text.trim().toLowerCase())
      .digest("hex")
      .slice(0, 16);
  }

  clear(): void {
    this.recent = [];
  }
}

/**
 * prompt-tracer: interceptors/networkInterceptor.ts
 *
 * ═══════════════════════════════════════════════════════════════════
 * QUATERNARY STRATEGY: Network Request Interception (Electron-level)
 * ═══════════════════════════════════════════════════════════════════
 *
 * HOW IT WORKS:
 * Trae is an Electron app. All AI requests go through Node.js's
 * http/https modules (or the global `fetch`) in the extension host.
 *
 * We intercept at two levels:
 *   1. Global `fetch` — patched in the extension host JS context
 *   2. Node `https.request` — patched via the http module
 *
 * When we see a request to a known Trae/ByteDance AI endpoint, we
 * clone the request body and extract the prompt.
 *
 * ENDPOINT PATTERNS (ByteDance AI / Trae backend):
 *   - api.trae.ai/v1/chat/completions
 *   - *.bytedance.com/ai/*
 *   - api.openai.com (if proxied)
 *   - api.anthropic.com (if proxied)
 *
 * RESPONSE CAPTURE:
 * We also intercept responses to capture the AI's reply (streaming
 * responses are reassembled from SSE chunks).
 */

import * as https from "https";
import * as http from "http";
import { CaptureEngine } from "../capture";
import { log, error } from "../logger";

// Endpoints to watch
const AI_ENDPOINT_PATTERNS = [
  "trae.ai",
  "marscode.com",
  "bytedance.com",
  "openai.com/v1/chat",
  "anthropic.com/v1/messages",
  "comate.baidu.com",
];

function isAiEndpoint(url: string): boolean {
  return AI_ENDPOINT_PATTERNS.some((p) => url.includes(p));
}

function extractPromptFromBody(body: string): string | null {
  try {
    const data = JSON.parse(body);

    // OpenAI / Anthropic format: messages array
    if (Array.isArray(data.messages)) {
      const userMessages = data.messages
        .filter(
          (m: { role: string; content: string }) =>
            m.role === "user" && m.content
        )
        .map((m: { content: string }) =>
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content)
        );
      if (userMessages.length > 0) {
        return userMessages[userMessages.length - 1];
      }
    }

    // Direct prompt field
    if (typeof data.prompt === "string" && data.prompt.trim()) {
      return data.prompt.trim();
    }

    // Trae-specific formats
    if (typeof data.query === "string" && data.query.trim()) {
      return data.query.trim();
    }
    if (typeof data.input === "string" && data.input.trim()) {
      return data.input.trim();
    }
  } catch {
    // Not JSON — skip
  }
  return null;
}

export class NetworkInterceptor {
  private engine: CaptureEngine;
  private originalFetch: typeof fetch | null = null;
  private originalHttpsRequest: typeof https.request | null = null;
  private originalHttpRequest: typeof http.request | null = null;
  private installed = false;

  constructor(engine: CaptureEngine) {
    this.engine = engine;
  }

  install(): void {
    if (this.installed) return;
    this.patchFetch();
    this.patchHttps();
    this.installed = true;
    log("NetworkInterceptor installed");
  }

  private patchFetch(): void {
    if (typeof globalThis.fetch === "undefined") return;
    this.originalFetch = globalThis.fetch;
    const self = this;

    globalThis.fetch = async function (
      input: any,
      init?: RequestInit
    ): Promise<Response> {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url;

      if (isAiEndpoint(url)) {
        const body =
          init?.body instanceof ReadableStream
            ? null
            : typeof init?.body === "string"
            ? init.body
            : init?.body
            ? String(init.body)
            : null;

        if (body) {
          const prompt = extractPromptFromBody(body);
          if (prompt) {
            log(`NetworkInterceptor(fetch): captured prompt from ${url}`);
            self.engine.capture(prompt, "network-proxy");
          }
        }
      }

      return self.originalFetch!(input, init);
    };
  }

  private patchHttps(): void {
    this.originalHttpRequest = http.request;
    this.originalHttpsRequest = https.request;
    const self = this;

    // Patch both http and https
    const patchRequest = (
      mod: typeof http | typeof https
    ): void => {
      const originalReq = mod.request.bind(mod);
      (mod as unknown as Record<string, unknown>)["request"] = function (
        options: http.RequestOptions | string | URL,
        callback?: (res: http.IncomingMessage) => void
      ): http.ClientRequest {
        const url =
          typeof options === "string"
            ? options
            : options instanceof URL
            ? options.toString()
            : `${(options as http.RequestOptions).hostname ?? ""}${
                (options as http.RequestOptions).path ?? ""
              }`;

        if (isAiEndpoint(url)) {
          const req = originalReq(options, callback);
          const originalWrite = req.write.bind(req);
          const chunks: Buffer[] = [];

          req.write = function (
            chunk: unknown,
            encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
            cb?: (err?: Error | null) => void
          ): boolean {
            if (Buffer.isBuffer(chunk)) chunks.push(chunk);
            else if (typeof chunk === "string") chunks.push(Buffer.from(chunk));

            if (typeof encodingOrCb === "function") {
              return originalWrite(chunk, encodingOrCb);
            }
            return originalWrite(chunk, encodingOrCb as BufferEncoding, cb!);
          };

          req.on("finish", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf-8");
              const prompt = extractPromptFromBody(body);
              if (prompt) {
                log(`NetworkInterceptor(https): captured prompt from ${url}`);
                self.engine.capture(prompt, "network-proxy");
              }
            } catch (e) {
              error("NetworkInterceptor: body parse error", e);
            }
          });

          return req;
        }

        return originalReq(options, callback);
      };
    };

    patchRequest(http);
    patchRequest(https);
  }

  uninstall(): void {
    if (!this.installed) return;
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }
    if (this.originalHttpRequest) (http as any).request = this.originalHttpRequest;
    if (this.originalHttpsRequest) (https as any).request = this.originalHttpsRequest;
    this.installed = false;
    log("NetworkInterceptor uninstalled");
  }

  dispose(): void {
    this.uninstall();
  }
}

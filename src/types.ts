/**
 * prompt-tracer: types.ts
 * All shared data types for the extension.
 */

export interface CapturedPrompt {
  /** Unique ID for this entry */
  id: string;
  /** Full text of the prompt sent to the AI */
  prompt: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** The workspace/project root path at capture time */
  projectRoot: string;
  /** Active editor file path at capture time (relative to projectRoot) */
  activeFile: string | null;
  /** Language ID of the active file */
  activeLanguage: string | null;
  /** AI response text, if captured */
  response: string | null;
  /** How the prompt was intercepted */
  captureMethod: CaptureMethod;
  /** Session identifier - groups prompts per IDE session */
  sessionId: string;
}

export type CaptureMethod =
  | "command-intercept"   // Intercepted via VS Code command proxy
  | "webview-message"     // Intercepted from a Webview postMessage
  | "input-monitor"       // Intercepted via keyboard/input monitoring
  | "network-proxy"       // Intercepted via network request proxy
  | "manual";             // Fallback: manually triggered

export interface PromptLog {
  version: "1.0";
  project: string;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
  totalPrompts: number;
  prompts: CapturedPrompt[];
}

export interface ExtensionConfig {
  enabled: boolean;
  outputFolder: string;
  captureResponse: boolean;
  jsonEnabled: boolean;
  markdownEnabled: boolean;
  debounceMs: number;
}

export interface InterceptorResult {
  prompt: string;
  response?: string;
  method: CaptureMethod;
}

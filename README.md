# Prompt Tracer for Trae AI

> **Automatic prompt capture → Git-native history**  
> A production VS Code extension that silently records every AI prompt you send in Trae, saving it to your project for natural Git inclusion.

---

## Architecture Overview

### Key Discovery: Trae is a VS Code Fork

Trae AI is built on the VS Code/Electron codebase (confirmed: it ships with VS Code's extension host, supports `.vsix` extensions, and uses the VS Code Extension API internally). This is the **critical architectural fact** the entire extension rests on.

This means:
- We can write a standard VS Code extension (TypeScript, `package.json` manifest, `.vsix`)
- Install it **once, globally** into Trae
- It activates automatically for **every project** you open
- It has access to VS Code's runtime — command bus, webview messages, and Node.js context

---

## Interception Strategy (4 Layers)

Trae does **not** expose an official "on prompt sent" event. So we use a layered interception approach, where each layer is a separate interceptor that independently tries to capture prompts. A deduplication guard ensures the same prompt is never saved twice.

```
User types prompt → presses Enter
         │
         ▼
┌─────────────────────────────────────────────┐
│  Layer 1: Command Interceptor               │  ← PRIMARY
│  Patches vscode.commands.executeCommand()   │
│  Intercepts: trae.chat.send, chat.submit,  │
│  workbench.action.chat.submit, etc.         │
└─────────────────────┬───────────────────────┘
                      │ (if no args found in command)
                      ▼
┌─────────────────────────────────────────────┐
│  Layer 2: Webview Message Interceptor       │  ← SECONDARY
│  Patches WebviewPanel creation              │
│  Intercepts: postMessages from Trae's       │
│  chat panel HTML → extension host           │
└─────────────────────┬───────────────────────┘
                      │ (if not a webview panel)
                      ▼
┌─────────────────────────────────────────────┐
│  Layer 3: Input Box Monitor                 │  ← TERTIARY
│  Patches createInputBox / createQuickPick   │
│  Intercepts: inline chat, quick-question    │
│  modes that use VS Code input widgets       │
└─────────────────────┬───────────────────────┘
                      │ (always active in parallel)
                      ▼
┌─────────────────────────────────────────────┐
│  Layer 4: Network Interceptor               │  ← FALLBACK
│  Patches globalThis.fetch + https.request   │
│  Intercepts: HTTP calls to Trae's AI        │
│  backend (api.trae.ai, *.bytedance.com,     │
│  api.openai.com, api.anthropic.com)         │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  DedupGuard                                 │
│  SHA-256 hash + 2-second window             │
│  Prevents double-saves when 2+ layers fire  │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  CaptureEngine                              │
│  Enriches with: timestamp, active file,     │
│  project root, language, session ID         │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  Storage Engine                             │
│  <projectRoot>/ai-prompts/prompts.json      │
│  <projectRoot>/ai-prompts/prompts.md        │
└─────────────────────────────────────────────┘
```

---

## Layer 1: Command Interceptor (Primary)

**How it works:**  
Every user action in a VS Code fork goes through `vscode.commands.executeCommand()`. When you send a prompt in Trae, the chat panel calls something like `executeCommand("trae.chat.send", promptText)`. We replace `executeCommand` with a transparent proxy that logs matching command calls before passing them through.

**Why it works:**  
In the VS Code extension host JS context, the `vscode` module object is mutable. We can reassign `vscode.commands.executeCommand` to our wrapper function at runtime.

**Risk:** Command IDs are internal to Trae and undocumented. We watch a broad set of patterns (`chat.send`, `chat.submit`, `ai.send`, etc.) to maximize coverage.

---

## Layer 2: Webview Interceptor (Secondary)

**How it works:**  
Trae's chat panel is an Electron `WebviewPanel` (HTML running in a sandboxed iframe). The webview communicates with the extension host via `postMessage`. We patch `vscode.window.createWebviewPanel` to intercept panel creation and attach a message listener before Trae does.

**Why it works:**  
The VS Code API object is shared in the extension host process. Patching `createWebviewPanel` gives us a first-look at every message flowing from any webview to the host.

---

## Layer 3: Input Monitor (Tertiary)

**How it works:**  
Some Trae input modes (inline questions, quick queries) use VS Code's `InputBox` or `QuickPick` widgets. We patch `createInputBox` and `createQuickPick` to attach `onDidAccept` listeners to every widget that has AI-related titles or placeholders.

---

## Layer 4: Network Interceptor (Fallback)

**How it works:**  
Every AI request from Trae eventually becomes an HTTP(S) request to a backend. We patch `globalThis.fetch` and `https.request` in the Node.js extension host context to intercept outbound requests to known AI endpoints. Request bodies (JSON with `messages` arrays or `prompt` fields) are parsed to extract the user prompt.

**Why it works:**  
Trae runs in Electron's Node.js renderer/main process, which means standard Node.js module patching works just as it does in any Node app.

**Captured endpoints:**
- `api.trae.ai` — Trae's own backend
- `*.bytedance.com` — ByteDance infrastructure
- `api.openai.com/v1/chat` — if Trae proxies GPT-4o
- `api.anthropic.com/v1/messages` — if Trae proxies Claude

---

## File Structure

```
prompt-tracer/
├── src/
│   ├── extension.ts              ← Entry point, wires everything
│   ├── types.ts                  ← Shared data types
│   ├── config.ts                 ← Config reader/watcher
│   ├── capture.ts                ← Core capture engine (+ dedup)
│   ├── dedup.ts                  ← Deduplication guard
│   ├── context.ts                ← IDE context snapshot
│   ├── storage.ts                ← JSON + Markdown writer
│   ├── logger.ts                 ← Output channel logger
│   ├── utils.ts                  ← Helpers (ID, debounce, etc.)
│   └── interceptors/
│       ├── commandInterceptor.ts ← Layer 1
│       ├── webviewInterceptor.ts ← Layer 2
│       ├── inputMonitor.ts       ← Layer 3
│       └── networkInterceptor.ts ← Layer 4
├── example-output/
│   ├── prompts.json              ← Example JSON output
│   └── prompts.md                ← Example Markdown output
├── package.json
├── tsconfig.json
├── .vscodeignore
├── INSTALL.md
└── README.md
```

---

## Output Format

### prompts.json (structured, machine-readable)

```json
{
  "version": "1.0",
  "project": "my-react-app",
  "totalPrompts": 12,
  "sessionCount": 3,
  "prompts": [
    {
      "id": "a1b2c3d4e5f6a7b8",
      "prompt": "Create a custom React hook...",
      "timestamp": "2025-04-26T08:12:03.441Z",
      "projectRoot": "/Users/dev/projects/my-react-app",
      "activeFile": "src/hooks/index.ts",
      "activeLanguage": "typescript",
      "response": "Here's the hook...",
      "captureMethod": "command-intercept",
      "sessionId": "sess_1745654323441_a1b2c3d4"
    }
  ]
}
```

### prompts.md (human-readable, Git-diff-friendly)

The Markdown format is designed to be legible in GitHub's file viewer, making your prompt history browsable directly from the repository.

---

## Assumptions Made

1. **Trae uses VS Code's extension host** — Confirmed from public sources. Extensions are `.vsix` and installed via the standard VS Code mechanism.

2. **Command IDs contain "chat.send" or similar** — Inferred from how Cursor, Windsurf, and other VS Code forks implement AI chat. The exact IDs are undocumented; we cover a broad pattern list.

3. **Trae's chat panel is a WebviewPanel** — Standard approach for all VS Code AI chat extensions. High confidence.

4. **AI requests go to api.trae.ai or ByteDance endpoints** — Inferred from Trae's ByteDance ownership and observed network traffic reports.

5. **Extension host is Node.js and supports module patching** — True for all Electron apps; this is a well-established technique.

---

## Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| Trae command IDs are undocumented | Layer 1 may miss some prompt types | Layers 2-4 act as fallback |
| Webview content security policy may block messages | Layer 2 may not fire | Layer 4 (network) catches it |
| Streaming responses are not reassembled | Response text may be incomplete | JSON prompt is always captured |
| No prompt capture without a workspace open | Prompts in "no folder" mode aren't saved | Open a folder before starting |
| Trae updates may change internal command IDs | Layer 1 may break after updates | Community can update PROMPT_COMMANDS list |
| Network interception can't decrypt if TLS pinning is used | Layer 4 blind | Layers 1-3 handle it |

---

## Trade-offs

**Monkey-patching** (`executeCommand`, `fetch`, `createWebviewPanel`) is the only viable approach since Trae exposes no official "onPromptSent" event. The risks are:
- Future Trae updates could change internals (mitigated by 4-layer fallback)
- Patches are scoped to the extension host and fully reversed on `deactivate()`
- No user data is sent anywhere — all writes are local filesystem only

---

## Privacy

All captured data is written **only to your local filesystem**, inside your project directory. Nothing is sent to any server. The extension makes no outbound network calls of its own.

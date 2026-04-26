# Prompt Tracer — Installation & Usage Guide

## What This Does

Prompt Tracer is a **VS Code extension** that installs once into Trae AI and automatically captures every prompt you send to the AI — saving them into each project's `ai-prompts/` folder so they're committed to Git naturally, alongside your code.

---

## Prerequisites

- **Node.js** v18+ (for building)
- **npm** v9+
- **Trae AI IDE** (any recent version — it's VS Code-based)
- `vsce` package manager (installed below)

---

## Step 1: Build the Extension

```bash
# Clone or unzip the prompt-tracer folder
cd prompt-tracer

# Install dependencies
npm install

# Compile TypeScript → JavaScript
npm run compile

# Package into a .vsix file
npx vsce package --no-dependencies
# This creates: prompt-tracer-1.0.0.vsix
```

---

## Step 2: Install into Trae AI

### Method A — From the Command Palette (Recommended)

1. Open **Trae AI**
2. Open the Command Palette: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
3. Type: **`Extensions: Install from VSIX…`**
4. Navigate to `prompt-tracer-1.0.0.vsix` and select it
5. Click **Install** when prompted
6. **Reload** Trae when prompted (or restart it)

### Method B — Drag and Drop

1. Open Trae AI
2. Go to the **Extensions** sidebar (`Cmd+Shift+X`)
3. Drag the `.vsix` file into the Extensions panel
4. Confirm installation

### Method C — Command Line

```bash
# Find Trae's binary (macOS)
/Applications/Trae.app/Contents/MacOS/Trae --install-extension prompt-tracer-1.0.0.vsix

# Windows (typical path)
"C:\Users\<you>\AppData\Local\Programs\Trae\Trae.exe" --install-extension prompt-tracer-1.0.0.vsix
```

---

## Step 3: Verify Installation

1. Open any project folder in Trae
2. Check the **bottom status bar** — you should see: `⌚ Tracer`
3. Send any prompt to the Trae AI chat
4. Within 1-2 seconds, check your project:

```
your-project/
  ai-prompts/
    prompts.json   ← created automatically
    prompts.md     ← created automatically
```

---

## How to Enable / Disable

### Toggle via Command Palette

```
Cmd+Shift+P → "Prompt Tracer: Toggle On/Off"
```

### Via Settings UI

1. Open Settings: `Cmd+,`
2. Search: `promptTracer`
3. Toggle **Prompt Tracer: Enabled**

### Via settings.json

```json
{
  "promptTracer.enabled": false
}
```

---

## Available Commands

| Command | Description |
|---------|-------------|
| `Prompt Tracer: Toggle On/Off` | Enable or disable capture |
| `Prompt Tracer: Open Prompt Log` | View the Markdown prompt history |
| `Prompt Tracer: Clear Prompt Log` | Delete all saved prompts for current project |
| `Prompt Tracer: Show Statistics` | Show prompt count and session stats |

---

## Configuration Options

All settings live under `promptTracer.*` in VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Master on/off switch |
| `outputFolder` | `"ai-prompts"` | Folder name inside project |
| `captureResponse` | `true` | Also capture AI responses |
| `jsonEnabled` | `true` | Write `prompts.json` |
| `markdownEnabled` | `true` | Write `prompts.md` |
| `debounceMs` | `300` | Write delay to avoid disk thrash |

---

## Git Integration

No extra steps. Just add and commit normally:

```bash
git add ai-prompts/
git commit -m "feat: add user auth module"
# prompts.json and prompts.md are committed alongside your code
```

To exclude prompts from Git, add to `.gitignore`:

```
ai-prompts/
```

---

## Viewing the Output Channel (Debug)

If something seems wrong:

1. `View → Output` (or `Cmd+Shift+U`)
2. Select **"Prompt Tracer"** from the dropdown
3. All capture events and errors are logged here

---

## Uninstalling

1. Go to Extensions (`Cmd+Shift+X`)
2. Find **Prompt Tracer**
3. Click **Uninstall**

Your existing `ai-prompts/` folders in projects are untouched.

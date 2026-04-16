# Lightpanda Browser Extension

Browse web pages using [Lightpanda](https://lightpanda.io/) headless browser directly from pi.

## Installation

1. Install Lightpanda: see <https://lightpanda.io/> (this extension was tested with `v1.0.0-nightly.5626+d66cdcbf`)
2. The extension auto-discovers from `~/.pi/agent/extensions/lightpanda.ts`
3. Run `/reload` in pi to pick up the extension

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `LIGHTPANDA_BIN` | `lightpanda` | Path to lightpanda binary |
| `LIGHTPANDA_CDP_HOST` | `127.0.0.1` | CDP server host |
| `LIGHTPANDA_CDP_PORT` | `9222` | CDP server port |

## Tools

### `browse` — Quick Page Snapshots

Uses `lightpanda fetch` to render a page and dump the output. JavaScript executes before capture, so SPAs (Svelte, React, etc.) render correctly.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `url` | string | **Required.** URL to fetch |
| `format` | enum | **Required.** `markdown`, `html`, `semantic_tree`, `semantic_tree_text` |
| `stripMode` | string? | Tags to strip: `js`, `ui` (img,video,css,svg), `css`, `full`. E.g. `"js,css"` |
| `waitMs` | number? | Wait N ms before dumping (overrides other wait options) |
| `waitSelector` | string? | CSS selector to wait for before dumping |
| `waitScript` | string? | JS expression to wait for (must return truthy) |
| `waitUntil` | enum? | `load`, `domcontentloaded`, `networkidle`, `done` |
| `withBase` | bool? | Add `<base>` tag in output |
| `withFrames` | bool? | Include iframe contents |
| `httpTimeout` | number? | HTTP timeout in ms (default 10000) |

**Format guide:**

| Format | Best for | Example output |
|--------|----------|----------------|
| `markdown` | Reading page content | `# Title\n\nParagraph text [link](url)` |
| `html` | Inspecting DOM structure | Full rendered HTML with all elements |
| `semantic_tree_text` | Understanding page layout/interactive elements | `1 RootWebArea\n 8 heading\n 15 button` |
| `semantic_tree` | Programmatic a11y tree analysis | JSON with nodeId, role, name, isInteractive |

**Examples:**

```
# Read a page
browse(url="https://fitgrep.je.mk/", format="markdown")
→ # fitgrep\nWorkout Analyzer\nDrop your .FIT file here...

# Check page structure
browse(url="https://fitgrep.je.mk/", format="semantic_tree_text")
→ 1 RootWebArea 'fitgrep – Workout Analyzer'\n 8 heading 'fitgrep'\n 15 button

# Wait for dynamic content
browse(url="https://example.com/data", format="markdown", waitSelector=".data-loaded")

# Full HTML without JS/CSS noise
browse(url="https://example.com", format="html", stripMode="js,css")
```

### `browse_js` — JavaScript Evaluation via CDP

Navigate to a page and evaluate JavaScript using Lightpanda's CDP (Chrome DevTools Protocol) server. The CDP server starts automatically.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `url` | string? | Navigate to this URL first (omit to use current page) |
| `expression` | string? | JavaScript expression to evaluate |
| `dumpHtml` | bool? | Also dump page HTML after evaluation |
| `waitMs` | number? | Wait after navigation (default 5000) |

**Examples:**

```
# Check page title and state
browse_js(url="https://fitgrep.je.mk/", expression="JSON.stringify({title: document.title, hasUpload: !!document.querySelector('.upload-zone')})")
→ {"title":"fitgrep – Workout Analyzer","hasUpload":true}

# Extract text content
browse_js(expression="document.body.innerText.substring(0, 2000)")

# Navigate and dump HTML
browse_js(url="https://fitgrep.je.mk/", dumpHtml=true)
```

### `browse_fill` — Page Interaction via CDP

Click elements, fill inputs, evaluate JS on a page. Actions execute sequentially.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `url` | string? | Navigate first |
| `waitMs` | number? | Wait after navigation (default 5000) |
| `actions` | array? | List of actions to execute in order |

**Action types:**

| Type | Fields | Description |
|------|--------|-------------|
| `click` | `selector` | Click element at its center coordinates |
| `fill` | `selector`, `value` | Set input value + dispatch input/change events |
| `evaluate` | `value` | Run JS expression, return result |
| `wait` | `value` | Wait N milliseconds (value is ms as string) |

**Examples:**

```
# Click a button then check the result
browse_fill(url="https://example.com", actions=[
  {type: "click", selector: ".toggle-btn"},
  {type: "wait", value: "1000"},
  {type: "evaluate", value: "document.querySelector('.result')?.innerText"}
])

# Fill a form
browse_fill(actions=[
  {type: "fill", selector: "#email", value: "test@example.com"},
  {type: "fill", selector: "#password", value: "secret"},
  {type: "click", selector: "button[type=submit]"}
])
```

---

## Known Limitations (Lightpanda v1.0.0-nightly)

These are limitations of the Lightpanda browser itself, not the extension. They may be fixed in future versions.

### CDP Methods Not Implemented

| CDP Method | Status | Impact |
|-----------|--------|--------|
| `DOM.setFileInputFiles` | ❌ `UnknownMethod` | **Cannot upload files** programmatically |
| `Input.dispatchKeyEvent` | ❓ Untested | Keyboard input may not work |
| `Page.captureScreenshot` | ❓ Untested | Screenshots may not work |

### JavaScript Runtime Gaps

| Feature | Status | Impact |
|---------|--------|--------|
| `DataTransfer` constructor | ❌ Not defined | Cannot create synthetic `FileList` for drag/drop |
| `File` constructor with `Uint8Array` | ⚠️ Returns empty file | `new File([bytes], name)` creates a file with `size: 0` |
| Dynamic `import()` | ❌ `"FailedToLoad"` | Cannot lazy-load ES module chunks |
| `atob()` | ✅ Works | Base64 decoding works fine |
| `localStorage` | ✅ Works | Can read/write localStorage |
| `document.querySelector` | ✅ Works | DOM queries work |
| `document.dispatchEvent` | ✅ Works | Custom events dispatch correctly |

### What These Mean in Practice

**File uploads are not possible via CDP.** The three approaches all fail:

1. **`DOM.setFileInputFiles`** — Lightpanda returns "UnknownMethod"
2. **Synthetic `DataTransfer`** — Constructor doesn't exist
3. **Dynamic `import()` of app parser** — Returns "FailedToLoad"

The only browser-based workaround is to pre-seed `localStorage` with file data and then reload the page, which causes the app to show the file in its "stored files" list. But this still requires the user to click the file to load it.

**SPAs with lazy-loaded chunks may not fully work via CDP.** Since `import()` fails, any app that dynamically imports modules (like fitgrep's parser) cannot load those modules in the CDP session. Pages that load everything upfront work fine.

---

## What Works Well

### `lightpanda fetch` (browse tool)

This is the reliable workhorse. It:

- Executes JavaScript before capturing (SPAs render fully)
- Supports `--wait-selector` and `--wait-script` for dynamic content
- Returns clean markdown, full HTML, or accessibility trees
- Has no CDP limitations — it's a one-shot render + dump

Tested successfully on fitgrep.je.mk:

```
# Main page — renders the full Svelte app
lightpanda fetch --dump markdown https://fitgrep.je.mk/
→ # fitgrep\nWorkout Analyzer\n\nDrop your .FIT file here...

# Share link with invalid ID — error message renders correctly
lightpanda fetch --dump markdown "https://fitgrep.je.mk/?s=invalid"
→ This share link is invalid or has expired. ✕

# Semantic tree — shows interactive elements
lightpanda fetch --dump semantic_tree_text https://fitgrep.je.mk/
→ 1 RootWebArea 'fitgrep – Workout Analyzer'
→   8 heading 'fitgrep'
→   11 link 'View source on GitHub'
→   15 button (upload zone)
→     17 paragraph 'Drop your .FIT file here or click to browse'

# Stripped HTML — content without JS/CSS
lightpanda fetch --dump html --strip-mode js,css https://fitgrep.je.mk/
```

### CDP JavaScript Evaluation (browse_js tool)

Works for reading page state, extracting data, and inspecting DOM:

```javascript
// Page title
document.title  → "fitgrep – Workout Analyzer"

// Check if elements exist
!!document.querySelector('.upload-zone')  → true
!!document.querySelector('input[type="file"]')  → true

// Extract text
document.body.innerText  → "fitgrep Workout Analyzer Drop your .FIT file here..."

// localStorage
localStorage.getItem('fitgrep_files_meta')  → stored file metadata
```

### CDP DOM Queries (browse_fill tool)

Click and fill work via CDP:

```javascript
// Click: finds element → gets box model → dispatches mouse events at center
// Fill: focuses element → sets value via JS → dispatches input + change events
```

---

## fitgrep-Specific Notes

### Browsing fitgrep

The `browse` tool works perfectly for viewing the site:

```
browse(url="https://fitgrep.je.mk/", format="markdown")
→ Shows upload zone, header, tagline

browse(url="https://fitgrep.je.mk/?s=<share_id>", format="markdown")
→ Shows shared workout data (charts, stats, map) or error message
```

### Why File Upload Doesn't Work

fitgrep's upload flow (`UploadZone.svelte`):

1. User drops a `.fit` file or clicks the upload zone → file picker opens
2. `handleFileInput()` or `handleDrop()` gets the `File` object
3. `file.arrayBuffer()` reads the binary data
4. Dynamic `import('$lib/parser')` loads the parser chunk (lazy-loaded by Vite)
5. `parseFitFile(buffer)` parses the FIT data
6. `saveFile()` saves to localStorage
7. `store.setWorkoutData()` updates the Svelte reactive state → UI renders

Steps 2, 4, and 6 all hit Lightpanda CDP limitations:
- **Step 2**: No `DataTransfer` or `DOM.setFileInputFiles`
- **Step 4**: Dynamic `import()` fails
- Even bypassing step 2 and creating the ArrayBuffer directly, step 4 blocks us

### Workarounds for Testing fitgrep with Data

1. **Share API**: Upload the FIT file via the Cloudflare Worker using `curl`, then browse the share link:
   ```bash
   # Upload via share API
   BASE64=$(base64 -w0 externalHR.fit)
   curl -X POST https://fitgrep-worker.example.com/share \
     -H "Content-Type: application/json" \
     -d "{\"file\":\"$BASE64\",\"filename\":\"externalHR.fit\",\"fields\":[\"heart_rate\",\"enhanced_speed\"]}"
   # Returns: {"id":"abc12345"}
   
   # Then browse the share link
   browse(url="https://fitgrep.je.mk/?s=abc12345", format="markdown")
   ```

2. **localStorage injection**: Pre-seed localStorage via CDP, then reload:
   ```javascript
   // Set file data
   localStorage.setItem('fitgrep_file:externalHR.fit', '<base64 of FIT file>');
   localStorage.setItem('fitgrep_files_meta', JSON.stringify([{filename:'externalHR.fit', sport:'Running', ...}]));
   // Reload — StoredFiles component will show the file, but user must click it
   location.reload();
   ```
   Limitation: The file appears in the stored files list, but still requires a click to load into the viewer.

3. **Use a local dev server + real browser**: For full interactive testing of fitgrep with file uploads, use a real browser. Lightpanda is best for content inspection, not full app interaction.

---

## CDP Protocol Reference

### Connection Flow

```
1. Check if CDP server is running: GET http://127.0.0.1:9222/json/version
2. If not, start: lightpanda serve --host 127.0.0.1 --port 9222 --timeout 300
3. Connect WebSocket: ws://127.0.0.1:9222/
4. Create target: Target.createTarget({url: "about:blank"}) → targetId
5. Attach to target: Target.attachToTarget({targetId, flatten: true}) → sessionId
6. All subsequent commands include sessionId as top-level field
```

### Key CDP Commands Tested

| Command | Works | Notes |
|---------|-------|-------|
| `Target.createTarget` | ✅ | Creates a new page/tab |
| `Target.attachToTarget` | ✅ | Gets sessionId for commands |
| `Page.navigate` | ✅ | Navigate to URL |
| `Runtime.evaluate` | ✅ | Run JS, get results |
| `DOM.getDocument` | ✅ | Get DOM root |
| `DOM.querySelector` | ✅ | Find elements |
| `DOM.getOuterHTML` | ✅ | Get element HTML |
| `DOM.getBoxModel` | ✅ | Get element coordinates |
| `DOM.focus` | ✅ | Focus an element |
| `DOM.setFileInputFiles` | ❌ | Not implemented |
| `Input.dispatchMouseEvent` | ✅ | Click at coordinates |

### Node.js WebSocket Notes

Lightpanda's CDP uses standard WebSocket. When using Node.js's built-in `WebSocket` (v22+):

- Use `addEventListener` not `.on()` (different API than `ws` npm package)
- `MessageEvent` data is in `event.data` (string)
- No `Buffer` support — data comes as strings

---

## Troubleshooting

### "CDP server failed to start"

- Check that `lightpanda` is in your `$PATH`
- Try running `lightpanda serve --host 127.0.0.1 --port 9222` manually
- Check if port 9222 is already in use: `lsof -i :9222`
- Set `LIGHTPANDA_BIN` to the full path if needed

### "WebSocket connection failed"

- The CDP server may have timed out (default 10s inactivity timeout)
- The extension uses `--timeout 300` (5 minutes) when starting the server
- If the server was started externally with a shorter timeout, it may close the connection

### JS evaluation returns empty or unexpected results

- Lightpanda may not implement all JS APIs
- Check `exceptionDetails` in the CDP response for error info
- Try wrapping expressions in `JSON.stringify()` for complex return values
- Remember: `import()` always fails with "FailedToLoad"

### Page content is empty or not rendered

- The page may need more time to render. Increase `waitMs` or use `waitSelector`
- Some heavy SPAs may not fully render in Lightpanda's JS runtime
- Try `lightpanda fetch --dump html --wait-ms 10000 <url>` to give more time

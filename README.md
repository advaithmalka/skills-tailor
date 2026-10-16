# Skills Tailor

A Microsoft Edge / Chromium extension that tailors only the Skills section of a PDF resume while preserving its existing layout. Uses OpenAI GPT-6 Luna, or manually reviewed keywords imported from Simplify's visible Resume Score panel.

## Features

- Local resume library: add, select, rename, replace, remove, and undo removal.
- Paste a job description or capture supported pages with the toolbar action.
- Extract grounded keywords with GPT-6 Luna; review, add, and drop keywords before editing.
- Import Simplify's currently visible keyword chips, with a paste fallback.
- Review individual skill replacements with deterministic character-count, printed-width, and font-glyph checks.
- Download the modified original PDF without regenerating its template.
- Show keyword coverage with a score ring and matched/missing chips.

## Install

1. Download this repository and extract it, or clone it.
2. Open `edge://extensions` (or `chrome://extensions`). Enable **Developer mode**.
3. Choose **Load unpacked** and select the repository folder containing `manifest.json`.
4. Open **Skills Tailor** from the Extensions menu and pin it if desired. The toolbar opens a sidebar beside the job page.
5. Add your own PDF resume. No personal resumes or API keys are included.
6. Open **Settings** and save your OpenAI API key. The inference model is `gpt-6-luna`.

There is no build step or dependency installation. OpenAI API usage requires its own account access and billing, separate from a ChatGPT subscription.

## Workflow

Select a resume → paste the job description → **Find keywords with Luna** → review keywords → **Suggest skill replacements** → review/fix replacements → **Tailor & download PDF**.

**Edit replacements manually** works without an API request once keywords are imported. Every copy starts from the immutable master. The extension never submits a job application.

To import Simplify keywords, open its **Resume Score** panel on a job page and click the Skills Tailor toolbar icon. In the sidebar choose **Use Simplify keywords**. This reads visible DOM only; it does not access Simplify's credentials, private APIs, network traffic, or extension storage. The integration may break when Simplify's UI changes. Paste comma-separated or line-separated keywords as a fallback. Cross-origin embedded job descriptions may also need copy/paste.

## Sidebar and full-page views

The toolbar opens the sidebar while capturing the exact job tab you clicked from. Open Simplify’s **Resume Score** panel first; its visible chips still import through **Use Simplify keywords**. **Refresh job** rereads the active job and its currently visible chips. If the browser has not granted temporary access to a different job tab, click **S** on that tab instead.

Use **Full page ↗** in the sidebar to open the original spacious view. Your selected resume, pasted description, reviewed keywords, and replacement draft travel with it. **Open sidebar** returns that workflow to the sidebar. Both views share the local resume library and API-key storage; no credentials or PDF bytes are copied into the handoff. Sidebar drafts persist in session storage while the browser session lasts. A captured-job label identifies which posting the displayed workflow belongs to; switching browser tabs alone never silently rewrites a draft or scans another site.

Browsers without a working Side Panel API fall back to the full-page view. Existing full-page options remain available through the extension’s Details/Options page.

## PDF compatibility

This is a constrained PDF editor, not an arbitrary PDF rewriting tool. Import currently requires:

- One `SKILLS` or `TECHNICAL SKILLS` heading.
- Category labels ending in colons, with bullet-separated skills.
- Supported embedded fonts/encodings and simple horizontal text positioning.
- A text-based, unencrypted, unsigned PDF; maximum 15 MB and 8 pages.

The editor changes selected text-show operations, retaining original font resources, size, color, baseline, labels, separators, and unrelated content. A replacement cannot exceed the original skill's character count or printed width. Missing embedded-font glyphs are blocked rather than silently substituted. Shorter replacements can leave extra space before existing bullets; the document never reflows.

Scanned PDFs, unusual encodings/positioning, inline images, and some other layouts may be rejected. Adding a PDF runs compatibility checks before saving it.

## Scores

The score is exact keyword coverage across the selected resume, including draft replacements: matched keywords divided by selected keywords. It is not Simplify's weighted score, an employer ATS score, or a hiring prediction. Simplify may use a different resume or infer keywords absent from a posting. Review chip tooltips show keyword provenance and Luna evidence.

## Storage and privacy

- Resumes are stored locally in extension-specific IndexedDB.
- The API key is stored in extension-local browser storage. It persists across browser/computer restarts, but local storage is not a password vault. **Forget key** removes it; uninstalling clears extension data.
- API requests go directly to `https://api.openai.com/v1/responses` with `store:false`.
- Keyword extraction sends job text. Planning sends job text, selected keywords, and Skills-slot limits. The app does not upload the full PDF, contact details, education, or work history.
- OpenAI's provider data policies still apply. No analytics or third-party backend is included.
- Never commit API keys or personal resumes. `.env` files are ignored but are not read by the extension.

Permissions: sidePanel, storage, downloads, activeTab, scripting, and OpenAI API host access. Job-page reading is temporary and begins when the toolbar icon is clicked; there is no background scanning.

Downloads follow browser preferences. To save automatically, turn off the browser's option to ask where to save each file; this affects other downloads too. The extension reports download completion or interruption.

## Tests

Requires Node.js, with no package installation:

```sh
node tests/engine.cjs
node tests/ai.cjs
node tests/sidebar.cjs
```

The PDF tests generate a synthetic resume in memory using the licensed Bitstream Vera fixture. They check font/width limits, replacement validation, and preservation of untouched glyph positions. API tests use controlled responses to verify request structure, grounded evidence, filtering, and error handling; they do not make paid API requests. Tests on private user documents are not included.

For a development-only preview, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/app.html`. Preview storage is separate from the installed extension, and toolbar capture/extension permissions require the installed extension to test. The installed extension needs no server.

## License

Project code: MIT. Bundled dependencies and test fonts retain their own licenses/notices; see `THIRD_PARTY.md` and the files in `vendor/` and `tests/fixtures/`.

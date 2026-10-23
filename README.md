# Skills Tailor

A Microsoft Edge / Chromium extension that tailors only the Skills section of a PDF resume while preserving its existing layout. Uses OpenAI GPT-6 Luna, or manually reviewed keywords imported from Simplify's visible Resume Score panel.

## Features

- Local resume library: add, select, rename, replace, remove, and undo removal.
- Paste a job description or capture supported pages with the toolbar action.
- Extract grounded keywords with GPT-6 Luna; review, add, and drop keywords before editing.
- Import Simplify's currently visible keyword chips, with a paste fallback.
- Review individual skill replacements with shared line-width budgets and font-glyph checks.
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

The toolbar opens the sidebar while capturing the exact job tab you clicked from. Open Simplify’s **Resume Score** panel first; its visible chips still import through **Use Simplify keywords**. **Refresh Simplify** in the top bar beside **Full page** rereads the active job and imports its latest visible Simplify keywords into the review list, clearing the previous replacement draft. The sidebar stays open and the selected resume is preserved. If the browser has not granted temporary access to a different job tab, click **S** on that tab instead.

Use **Full page ↗** in the sidebar to open the original spacious view. Your selected resume, pasted description, reviewed keywords, and replacement draft travel with it. **Open sidebar** returns that workflow to the sidebar. Both views share the local resume library and API-key storage; no credentials or PDF bytes are copied into the handoff. Sidebar drafts persist in session storage while the browser session lasts. A captured-job label identifies which posting the displayed workflow belongs to; switching browser tabs alone never silently rewrites a draft or scans another site.

Browsers without a working Side Panel API fall back to the full-page view. Existing full-page options remain available through the extension’s Details/Options page.

## PDF compatibility

This is a constrained PDF editor, not an arbitrary PDF rewriting tool. Import currently requires:

- One `SKILLS` or `TECHNICAL SKILLS` heading.
- Category labels ending in colons, with bullet-separated skills.
- Supported embedded fonts/encodings and simple horizontal text positioning.
- A text-based, unencrypted, unsigned PDF; maximum 15 MB and 8 pages.

The editor changes only edited Skills lines, retaining original font resources, size, color, baseline, category labels, and unrelated content. Each line shares its original printed-width budget. Choose Remove (or clear a box) to delete a skill and free room for longer wording on that same line. The remaining skills and original bullet style compact together without line wrapping; no line may extend past its original right edge. Missing embedded-font glyphs are blocked rather than silently substituted. Restore reverses a removal.

Scanned PDFs, unusual encodings/positioning, inline images, and some other layouts may be rejected. Adding a PDF runs compatibility checks before saving it.

## Scores

The score is exact keyword coverage across the selected resume, including draft replacements: matched keywords divided by selected keywords. It is not Simplify's weighted score, an employer ATS score, or a hiring prediction. Simplify may use a different resume or infer keywords absent from a posting. Review chip tooltips show keyword provenance and Luna evidence.

## Storage and privacy

- Resumes are stored locally in extension-specific IndexedDB.
- The API key is stored in extension-local browser storage. It persists across browser/computer restarts, but local storage is not a password vault. **Forget key** removes it; uninstalling clears extension data.
- API requests go directly to `https://api.openai.com/v1/responses` with `store:false`.
- Keyword extraction sends job text. Planning sends job text, selected keywords, Skills-slot limits, and text under recognized Projects headings. Keywords already present anywhere in the resume are identified locally and sent as keyword names, so they need not be repeated in Skills. Project descriptions can support methods such as end-to-end development without requiring that wording in the original Skills list. The app does not upload the full PDF. Project-section text is sent as written.
- OpenAI's provider data policies still apply. No analytics or third-party backend is included.
- Never commit API keys or personal resumes. `.env` files are ignored but are not read by the extension.

Permissions: sidePanel, storage, downloads, activeTab, scripting, and OpenAI API host access. Job-page reading is temporary and begins when the toolbar icon is clicked; there is no background scanning.

Downloads follow browser preferences. To save automatically, turn off the browser's option to ask where to save each file; this affects other downloads too. The extension reports download completion or interruption.

## Tests

Requires Node.js, with no package installation:

```sh
node tests/engine.cjs
node tests/ai.cjs
node tests/suggestions.cjs
node tests/score.cjs
node tests/one-click.cjs
node tests/incomplete.cjs
node tests/overflow.cjs
node tests/preserve-skills.cjs
node tests/refresh.cjs
node tests/simplify-matches.cjs
node tests/sidebar.cjs
```

The PDF tests generate a synthetic resume in memory using the licensed Bitstream Vera fixture. They check font/width limits, replacement validation, and preservation of untouched glyph positions. API tests use controlled responses to verify request structure, grounded evidence, filtering, and error handling; they do not make paid API requests. Tests on private user documents are not included.

For a development-only preview, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/app.html`. Preview storage is separate from the installed extension, and toolbar capture/extension permissions require the installed extension to test. The installed extension needs no server.

## License

Project code: MIT. Bundled dependencies and test fonts retain their own licenses/notices; see `THIRD_PARTY.md` and the files in `vendor/` and `tests/fixtures/`.


Live Edge verification: sidebar capture and visible Simplify imports tested on T-Mobile and Duolingo; replacement drafts survive full-page round trips; tailored PDF download tested from the sidebar.


### Shared line space (v1.2)

Skills can be removed with Remove or an empty box and restored with Restore. Longer replacements share space with the other skills on the same original line; the preview shows used / available points and blocks overflow. Luna can propose removals to make room for approved keywords. Each downloaded copy starts from the original PDF.


### Duplicate-free suggestions (v1.2.1)

Suggestions are checked against the entire final Skills section before display, including unchanged originals. Repeated terms (ignoring case, Unicode presentation variants, and extra spaces) are resolved locally without another API call. Redundant proposals keep their original skill when possible; a duplicate whose original is already used elsewhere becomes an explicit removal for review. Repeated slot IDs are ignored. Manual edits still receive the same duplicate guard before download.


### Coverage-focused planning and comparison (v1.3)

Luna aims for 85% of the approved keywords, reaching toward 90% when the original line space and fonts allow. It can replace or remove more low-relevance skills, while retaining existing approved matches. Width and duplicate checks remain mandatory.

The score card shows immutable **Before** and live **After draft** keyword coverage. When Simplify is captured, a separate comparison always uses all captured Simplify keywords against the selected PDF, regardless of the keywords chosen for Luna. Simplify’s reported weighted score is shown as a captured baseline; an updated official score requires uploading the tailored PDF to Simplify. The local after percentage is never labeled as Simplify’s weighted score.


### One-click Simplify planning (v1.3.1)

Choose **Simplify + Luna** to import all captured Simplify keywords and immediately ask Luna for a replacement draft. This uses one planning request and skips Luna keyword extraction. Review the additions/removals, then download. The shortcut is available when a resume and captured Simplify keywords are present; it never downloads automatically. **Use Simplify keywords** and the separate planning button remain available for editing the keyword list first.


### Visible request errors and incomplete-response recovery (v1.3.2)

Luna errors/progress appear immediately below the action buttons that started the request, and errors scroll into view. The app uses low reasoning effort and reserves response space for both reasoning and the structured result (6,000 tokens for keyword extraction; 12,000 for planning). If OpenAI explicitly reports `max_output_tokens`, one retry doubles that limit; other incomplete reasons are not retried or mislabeled as long job descriptions. The overall 90-second timeout still applies. Evidence/replacement explanations remain concise. A detected application-start screen prompts for the actual posting before keyword extraction; Simplify-based planning remains available.

After filtering suggestions and resolving duplicates, the app measures each final Skills row using the PDF’s exact widths. If any row overflows, Luna gets one automatic repair request with the previous plan, the overfull row IDs, their current skills, and the excess width to remove. Fitting rows should be preserved. If the repair still overflows, the app removes lower-priority skills from that same row, remeasuring after every removal until it fits. It prefers removing unselected originals, then keywords already covered elsewhere, then lower-priority selected terms. The result message confirms the retry and any additional removals. This layout repair is separate from the response-token-limit retry. Project evidence informs planning; the displayed coverage score remains an exact keyword match.

For an unpacked extension update, pull or download the updated code into the loaded folder, click **Reload** in the browser’s Extensions page, then close and reopen the sidebar. The footer displays **v1.3.6**. Updating a different copy of the repository does not update an already loaded extension.

### Simplify matched and missing keywords (v1.3.5)

Refresh Simplify captures each visible keyword’s matched/missing styling as well as its text. Review chips highlight Simplify matches and show matched/missing status on hover, independently of whether you include the keyword in planning. The Simplify snapshot shows these captured statuses; the separate **Local draft coverage** card keeps its exact-text calculation. Luna receives matched and missing keyword lists and prioritizes missing skills rather than adding literal duplicates of skills Simplify already recognizes. The last captured statuses stay fixed until the next refresh; upload your tailored PDF to Simplify and refresh to get its new assessment.

### Preserve skills when they fit (v1.3.6)

Luna keeps originals by default and only removes skills to make room on the same row. After planning and any overflow retry, exact PDF measurements restore deleted originals wherever they fit beside the additions, without introducing duplicates. Necessary deletions remain, and manual edits are unaffected.

# 📝 Page Sticky Notes

A Manifest V3 Chrome extension that lets you stick notes and text highlights onto any webpage, get reminded about them later, and ask an AI assistant questions about the page you're reading.

**Version:** 2.1.0 · **Platform:** Chrome (Manifest V3) · **Stack:** Vanilla JavaScript, Chrome Extension APIs, Groq API

<!-- Add screenshots here, e.g. ![Sticky notes on a page](screenshots/notes.png) -->

---

## Features

### Sticky notes
- Add a note to any `http`, `https` or `file` page. Notes are saved per URL (the `#fragment` is ignored) and reappear when you return.
- Drag, resize, minimize, and **pin** a note to the screen so it stays visible while you scroll.
- Eight colours, with automatic light and dark note styling.
- Lightweight formatting: `**bold**`, `*italic*`, `` `code` ``, clickable links, headings, bullet lists and **interactive checklists** (`- [ ]` / `- [x]`). A small toolbar and `Ctrl/Cmd + B` / `Ctrl/Cmd + I` shortcuts are included, and pressing Enter continues a list automatically.
- Deleting a note with content asks for a second click to confirm.
- Notes are drawn inside a Shadow DOM, so website styles can't break them and they don't interfere with the page.

### Text highlights
- Select text and attach a note to it. The text is highlighted on the page in the note's colour using the CSS Custom Highlight API.
- Highlights are stored as a quote plus surrounding text, so they are re-found when the page reloads, including on pages that load content late.
- A 🔗 button on the note scrolls to its highlight, and clicking highlighted text makes its note flash.

### Reminders
- Set a date and time on any note. At that time Chrome shows a notification, and clicking it opens the page and flashes the note (opening the tab first if needed).

### Popup
- Add a note, highlight the current selection, or show/hide all notes on the page.
- **This page** and **All notes** tabs with live counts, plus search across note text, titles, URLs and highlighted text.
- Click a note to jump to it, or delete it from the list.
- The toolbar icon shows a badge with the number of notes on the current page.

### Ask AI (Groq)
- Chat about the current page, your highlights and your notes from the popup.
- Checkboxes control what is sent: page text, highlights, notes (this page or all notes).
- Page text is taken from `<article>` / `<main>` where possible to avoid menus and ads, and any text you have selected is included.
- Quick prompts: summarize the page, explain highlights, turn notes into a checklist, quiz me.
- Answers are rendered as safe Markdown. Each answer can be copied from the chat.
- Chat history is kept per page. Temporary Groq server errors (500/502/503/504) are retried automatically, and requests time out after 45 seconds.

### Settings, sync and backup
- **Theme:** automatic (follows system), light or dark.
- **Sync:** optional cross-device sync through your Chrome account (`chrome.storage.sync`). The newest edit wins.
- **Export / Import:** back up notes to a JSON file and restore them later. Imported notes are validated field by field.

---

## Keyboard shortcuts and menus

| Action | Shortcut |
| --- | --- |
| Add a note | `Alt + Shift + N` |
| Highlight selected text and add a note | `Alt + Shift + L` |
| Show / hide notes on the page | `Alt + Shift + H` |

Shortcuts can be changed at `chrome://extensions/shortcuts`. The right-click menu also offers **Add sticky note to this page**, **Add sticky note with selected text** and **Highlight selection and add note**.

---

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. Reload any tabs that were already open (the extension attaches when a page loads).

To use notes on local files (`file://`), enable **Allow access to file URLs** for the extension on its details page.

## Setting up Ask AI

1. Create a free API key in the [Groq Console](https://console.groq.com/keys).
2. Open the popup, click ⚙ **Settings**, and paste the key under **AI assistant**.
3. Keep the default model (`openai/gpt-oss-20b`) or enter another Groq model ID.
4. Click **Save & test connection**, then open a regular webpage and use the **Ask AI** tab.

---

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Extension configuration, permissions, shortcuts and the content script. |
| `background.js` | Service worker: context menu, shortcuts, badge counts, reminder alarms and notifications, and Chrome-account sync. |
| `content.js` | Runs on every page: renders notes in a Shadow DOM, handles editing, dragging, pinning, highlight anchoring, and answers page-text requests from the popup. |
| `popup.html` / `popup.js` / `popup.css` | Toolbar popup: note list, search and the Ask AI chat, including the Groq request logic. |
| `md.js` | Small Markdown renderer for AI answers. It builds DOM nodes with `textContent` only and never uses `innerHTML`. |
| `options.html` / `options.js` / `options.css` | Settings page: theme, sync, Groq key and model, export and import. |
| `theme.css` / `theme.js` | Shared light/dark theme for the popup and settings page. |

**Data model.** Each note is stored in `chrome.storage.local` under the key `note_<id>` with its URL, text, colour, position, size, pin and minimize state, optional reminder time, and an optional highlight anchor (`quote`, `prefix`, `suffix`).

**Highlight anchoring.** The page's text nodes are indexed, the saved quote is searched for, and the occurrence whose surrounding text matches best is chosen. This is retried several times after load (up to 30 seconds) to cope with dynamic pages.

**Single-page apps.** The content script checks for URL changes every second and reloads the notes that belong to the new URL.

**Sync.** Chrome syncs at most about 100 KB in total and 8 KB per item, so very long notes stay on the device where they were written. The sync status is shown in Settings.

---

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Save notes, settings and chat history. |
| `contextMenus` | Right-click menu entries. |
| `tabs` | Find the active tab, read its URL for badges, and focus or open the tab for a note. |
| `alarms` / `notifications` | Reminders. |
| `https://api.groq.com/*` | Send Ask AI requests to Groq. |
| Content script on all URLs | Show notes and highlights on any site. |

---

## Privacy and security

- Notes, settings and chat history are stored locally in your browser. Notes only leave your device if you turn on Chrome sync.
- Nothing is sent to Groq until you send an AI question. Then only the context you have ticked and your question are sent.
- The Groq API key is stored in `chrome.storage.local`. It is **not** synced and **not** included in exports, because both only process `note_*` entries. It is not encrypted, so anyone with access to your browser profile may be able to read it.
- AI answers are rendered without `innerHTML`, so model output cannot inject markup. The system prompt also tells the model to treat webpage text as untrusted data rather than instructions.
- Imported files are validated: note IDs, URLs, colours, sizes, timestamps, text length and anchors are checked, and invalid entries are skipped.

---

## Limitations

- Chrome blocks extensions on `chrome://` pages, the Chrome Web Store and some other restricted pages.
- Highlights are matched by their saved text. If the page's wording changes, the highlight may no longer be found (the note itself is still kept).
- Notes are tied to the exact URL (query string included, `#fragment` excluded). Notes appear in the top-level page only, not inside iframes.
- Reminders only fire while Chrome is running.
- Ask AI sends a limited amount of text (page text is truncated to about 10,000 characters) and needs a Groq API key and internet access.

---

## Built with AI-assisted development

This project was built with AI coding tools (prompting, testing and iterating on the generated code) and refined through manual review and testing. It covers extension architecture, DOM and Shadow DOM work, storage and sync handling, input validation, API integration with error handling, and documentation.

## Author

Aman Varma — [GitHub](https://github.com/AmanVarma1)
"# Page-Sticky-Notes" 

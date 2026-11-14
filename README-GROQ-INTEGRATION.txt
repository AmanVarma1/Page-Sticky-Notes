Page Sticky Notes — Groq AI integration (v2.1.0)

Updated files retain the existing UI and Groq integration. Chat answers support safe Markdown rendering, chat history persists per page in chrome.storage.local, temporary HTTP 500/502/503/504 errors retry automatically, and page context prefers article/main content and includes the current text selection.

Setup:
1. Back up the existing extension folder.
2. Replace the files from this update.
3. Open chrome://extensions and click Reload.
4. Open Settings, paste your Groq API key and click Save & test connection.
5. Open a regular webpage and use Ask AI.

The API key remains in local extension storage and is not included in note exports or Chrome sync. It may still be accessible to someone who can inspect the browser profile.

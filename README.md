# Flashcard Library

Dark-mode, searchable flashcard library for GitHub Pages.

## Frontend
Upload `index.html`, `styles.css`, `app.js`, `config.js`, and the `decks/` folder to GitHub. Enable Settings > Pages > Deploy from branch > main > /(root).

## Add a new deck
Add a new JSON file in `decks/` and add its metadata to `decks/index.json`. When you give ChatGPT another PDF or slide deck, it can generate that JSON and update the library.

## AI Tutor
Do not put an OpenAI API key in GitHub Pages. Frontend JavaScript is public. Deploy `backend/vercel/` as a Vercel project, set environment variable `OPENAI_API_KEY`, then place the deployed `/api/ask` URL in `config.js`.

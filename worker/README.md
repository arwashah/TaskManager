# Gemini planner service (Cloudflare Worker)

`gemini-worker.js` holds the Gemini key so it never appears on the website or on GitHub.

1. Cloudflare dashboard -> Workers & Pages -> Create -> Create Worker -> Deploy.
2. Click "Edit code", replace everything with `gemini-worker.js`, then Deploy.
3. Settings -> Variables and Secrets -> Add a **Secret** named `GEMINI_API_KEY` (paste your key there, nowhere else) -> Deploy.
4. Copy the Worker address (`https://<name>.<account>.workers.dev`) into `AI_ENDPOINT` at the top of the AI section in `planner.js`, commit and push.

Optional: add a plain variable `ALLOWED_ORIGIN` (comma separated) to allow other sites, for example `http://localhost:8000` for local testing.
If Google retires a model, edit the `MODELS` list at the top of the Worker.

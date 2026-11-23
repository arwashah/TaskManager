// Cloudflare Worker: lets the planner website use Gemini without the key ever being on the website.
//
// Setup (once, in the Cloudflare dashboard):
//   1. Workers & Pages -> Create -> Create Worker -> Deploy, then "Edit code" and paste this whole file.
//   2. Settings -> Variables and Secrets -> add a SECRET named GEMINI_API_KEY with your Gemini key.
//   3. (Optional) add a plain variable ALLOWED_ORIGIN. It defaults to https://arwashah.github.io.
//      Separate several origins with commas, e.g. to test locally: https://arwashah.github.io,http://localhost:8000
//   4. Copy the Worker's address (https://something.workers.dev) into AI_ENDPOINT at the top of planner.js.
//
// The key lives only in Cloudflare. Never paste it into this file or into GitHub.

const MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"]; // tried in order
const MAX_PROMPT_CHARS = 30000;
const DEFAULT_ORIGIN = "https://arwashah.github.io";

export default {
    async fetch(request, env) {
        const allowed = String(env.ALLOWED_ORIGIN || DEFAULT_ORIGIN).split(",").map(item => item.trim()).filter(Boolean);
        const origin = request.headers.get("Origin") || "";
        const originOk = allowed.includes(origin);
        const cors = {
            "Access-Control-Allow-Origin": originOk ? origin : allowed[0],
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
            "Vary": "Origin"
        };
        const reply = (body, status = 200) => new Response(JSON.stringify(body), {
            status,
            headers: { ...cors, "Content-Type": "application/json" }
        });

        if (request.method === "OPTIONS") {
            return new Response(null, { status: originOk ? 204 : 403, headers: cors });
        }
        if (request.method !== "POST") {
            return reply({ error: "Use POST." }, 405);
        }
        if (!originOk) {
            return reply({ error: "This planner service only answers the planner website." }, 403);
        }
        if (!env.GEMINI_API_KEY) {
            return reply({ error: "The planner service isn't finished being set up (no Gemini key saved on it)." }, 500);
        }

        const declared = Number(request.headers.get("Content-Length") || 0);
        if (declared > MAX_PROMPT_CHARS * 4) {
            return reply({ error: "That request is too big." }, 413);
        }
        let prompt;
        try {
            const body = await request.json();
            prompt = body && body.prompt;
        } catch {
            return reply({ error: "Couldn't read the request." }, 400);
        }
        if (typeof prompt !== "string" || !prompt.trim()) {
            return reply({ error: "No prompt was sent." }, 400);
        }
        if (prompt.length > MAX_PROMPT_CHARS) {
            return reply({ error: "That request is too big. Try with fewer tasks." }, 413);
        }

        for (const model of MODELS) {
            let upstream;
            try {
                upstream = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
                        body: JSON.stringify({
                            contents: [{ role: "user", parts: [{ text: prompt }] }],
                            generationConfig: { responseMimeType: "application/json" }
                        }),
                        signal: AbortSignal.timeout(50000)
                    }
                );
            } catch {
                return reply({ error: "The planner service couldn't reach Gemini. Try again." }, 502);
            }

            if (upstream.status === 404) {
                continue; // that model name was retired, try the next one
            }
            if (upstream.status === 429) {
                return reply({ error: "Gemini's usage limit was reached. Wait a minute and try again." }, 429);
            }
            if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403) {
                // Details are deliberately not passed on to the browser.
                return reply({ error: "Gemini rejected the planner service's key. The site owner needs to check it." }, 502);
            }
            if (!upstream.ok) {
                return reply({ error: `Gemini returned an error (${upstream.status}). Try again.` }, 502);
            }

            let data;
            try {
                data = await upstream.json();
            } catch {
                return reply({ error: "Gemini sent back something unreadable. Try again." }, 502);
            }
            const text = (data.candidates?.[0]?.content?.parts ?? []).map(part => part.text ?? "").join("");
            if (!text.trim()) {
                return reply({ error: "Gemini sent back an empty answer. Try again." }, 502);
            }
            return reply({ text, model });
        }
        return reply({ error: "None of the Gemini models the service knows about are available any more. The site owner needs to update the model list." }, 502);
    }
};

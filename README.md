# Deadline Planner

A task and deadline planner for students that runs entirely in the browser. Add tasks, track them on a board, and get a 7-day study plan that fits your work around deadlines, fixed events and free time. An optional AI planner (Google Gemini) can suggest a smarter schedule, and the app always falls back to its own built-in planner.

**Live site:** https://arwashah.github.io/TaskManager/



## Features

**Taskboard**
- Three columns: **To-do**, **In progress** and **Done**. Move tasks between them with drag and drop.
- Sections for **Study**, **Personal** and **Clubs**, plus your own custom titles, each with its own accent colour.
- Each task has a title, course, CRN, deadline date, optional due time, duration and reminder.
- Cards are highlighted when a task is **overdue**, **due today** or **due tomorrow**.
- **Fixed-time events** (appointments, classes) can be added with an exact date, start time and length. The planner never moves them.
- Quick-add box for jotting down a task title straight into the To-do column.

**Week plan**
- Lays your open tasks out on a 7-day timeline (8:00 to 23:00).
- Settings for the **most work per day** and **free time per day**, which are saved between visits.
- Shows notices when something can't fit, for example a task that needs more time than is available before its deadline.
- Colour key matches the task sections.

**AI planning (optional)**
- "Plan my week with AI" asks Gemini for a schedule. You can add a note such as "I'm busy Wednesday evening".
- The result is shown as a **preview**. Nothing changes until you press **Apply this plan**, or you can **Discard** it.
- Every block the AI suggests is checked against the planner's rules, and invalid blocks are skipped. A wrong AI answer can't break the plan. The built-in planner fills any gaps.
- "Use basic plan" switches back to the built-in planner at any time.

**Reminders**
- Choose 10 minutes, 1 hour or 1 day before a task is due.
- Reminders show as a banner on the page and, if you allow it, as a browser notification.
- A task with no due time counts from 9:00 on its due date.

**Backup**
- **Export backup** downloads all tasks and custom titles as a JSON file. **Import backup** merges one back in. Use this to move your data between browsers or devices.

## How the planner works

The built-in planner is deterministic, so the same tasks always give the same plan.

1. **Fixed events** are placed at their exact time and never moved.
2. Time that has already passed today is blocked off.
3. **Free time** is reserved first, preferably around 19:00, so work never eats into it.
4. Remaining tasks are sorted by **earliest deadline first**. Each is split into sessions of at most 2.5 hours, scheduled between 9:00 and 22:00, within the daily work limit. Gaps shorter than 30 minutes are not used.
5. A task with no duration is planned as 1 hour.

Duration text is flexible. These all work: `1 hour`, `90 min`, `1h 30m`, `2h`, `1.5` (a bare number means hours). Anything unreadable shows an error on the form.

When the AI planner is used, the app sends Gemini only the free time windows it may use plus the rules, then validates the answer before showing it (see `buildAiRequest` and `applyAiBlocks` in `planner.js`).

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | Taskboard (home page) and backup buttons |
| `AddTask.html` | Form for adding or editing a task |
| `calendar.html` | Week plan page and AI panel |
| `taskboard.js` | Storage, board, form, reminders, backup, duration parser |
| `planner.js` | Week plan logic, AI request, validation of AI answers |
| `Study.css` | Main styles |
| `calendar.css` | Week plan and AI preview styles |
| `worker/gemini-worker.js` | Cloudflare Worker that holds the Gemini key (see `worker/README.md`) |

Older files from the first prototype that the app no longer uses: `todo.html`, `script.js`, `Studyfirstwebpage.html`, `styles.css`, `_footer`.

## Run locally

No install or build step.

1. Download or clone the repo.
2. Open `index.html` in a browser.

The board, form, week plan, reminders and backup all work offline this way. The AI planner needs internet and the Worker below. To test it locally, serve the folder (for example `python -m http.server 8000`) and add `http://localhost:8000` to the Worker's `ALLOWED_ORIGIN`.

## Set up the AI planner (optional)

The Gemini API key must never be on the website or in GitHub, so the site talks to a small Cloudflare Worker that holds the key.

1. Deploy `worker/gemini-worker.js` as a Cloudflare Worker.
2. Add your key as a **Secret** named `GEMINI_API_KEY`.
3. Put the Worker's address in `AI_ENDPOINT` in `planner.js`, then commit and push.

Full steps are in [`worker/README.md`](worker/README.md). If `AI_ENDPOINT` is empty, the AI panel is hidden and only the built-in planner is shown.

**Security and reliability measures in the Worker**
- The key is stored as a Cloudflare secret and is never sent to the browser.
- The Worker only answers requests from allowed origins (the live site by default).
- Prompts over 30,000 characters are rejected.
- If Gemini is overloaded or a model has been retired, the Worker tries the next model in its list and retries once before giving up. Error details from Google are not passed on to the browser.

## Data and privacy

- Tasks, custom titles, settings and reminder state are saved in your browser's **localStorage**. Nothing is stored on a server.
- Clearing your browser data deletes your tasks, so use **Export backup** now and then.
- When you press **Plan my week with AI**, your task titles, due dates and durations are sent to Google's Gemini through the Worker. This is stated on the Week plan page. Nothing is sent unless you press the button.

## Known limitations

- **Reminders only fire while the planner is open in a browser tab.** There is no server, so nothing can notify you when the tab is closed.
- **No sync between devices.** Each browser has its own data. Use export and import to move tasks.
- **The Worker has no per-user rate limit.** It only checks the request origin, which a determined person could fake. Adding a per-IP limit would be the next step.
- **Add Task does not warn when the deadline date has already passed.** The task is saved, and shows as overdue on the board.
- **Browser testing:** tested in Chromium. Safari has not been fully tested, and mobile browsers may only show the reminder banner without a system notification.
- No recurring tasks yet (for example "gym every Tuesday").

## Possible future work

- Cloudflare D1 for syncing tasks between devices, with real push reminders that work when the tab is closed.
- Recurring tasks.
- Mark tasks done directly from the Week plan.
- Automated tests for the duration parser and the planner's date logic.
- Per-IP rate limiting on the Worker, and a full keyboard and colour-contrast accessibility check.

## Tech

Plain HTML, CSS and JavaScript with no frameworks or build tools. Hosted on GitHub Pages. The AI feature uses a Cloudflare Worker and the Google Gemini API.

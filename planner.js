// Week plan: lays your open tasks out on a 7-day timeline.
// Needs taskboard.js to be loaded first (it provides readTasks, parseDurationMinutes
// and the custom title list).
(function () {
    const settingsKey = "deadline-planner.settings.v1";
    const defaultSettings = { workHours: 4, freeHours: 2 };

    const DAYS = 7;
    const DISPLAY_START = 8 * 60;   // timeline starts at 8:00
    const DISPLAY_END = 23 * 60;    // and ends at 23:00
    const WORK_START = 9 * 60;      // tasks are scheduled from 9:00 ...
    const WORK_END = 22 * 60;       // ... until 22:00
    const FREE_PREFERRED = 19 * 60; // free time is placed around 19:00 when possible
    const MIN_SLOT = 30;            // shortest gap worth scheduling into
    const MAX_SESSION = 150;        // longest single sitting for one task
    const PX_PER_MINUTE = 0.8;

    const builtInCategories = {
        study: { name: "Study", color: "#3e92cc" },
        personal: { name: "Personal", color: "#2ba84a" },
        clubs: { name: "Clubs", color: "#d8315b" }
    };

    function pad(value) {
        return String(value).padStart(2, "0");
    }

    function dateKey(date) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function parseDateKey(key) {
        const [year, month, day] = key.split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    function clockText(minutes) {
        return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    }

    function durationText(minutes) {
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        if (!hours) {
            return `${rest}m`;
        }
        return rest ? `${hours}h ${rest}m` : `${hours}h`;
    }

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
            const workHours = Number(saved.workHours);
            const freeHours = Number(saved.freeHours);
            return {
                workHours: workHours >= 1 && workHours <= 12 ? workHours : defaultSettings.workHours,
                freeHours: freeHours >= 0 && freeHours <= 6 ? freeHours : defaultSettings.freeHours
            };
        } catch {
            return { ...defaultSettings };
        }
    }

    function categoryInfo(categoryId) {
        if (builtInCategories[categoryId]) {
            return builtInCategories[categoryId];
        }
        const custom = customCategories.find(entry => entry.id === categoryId);
        if (custom) {
            return { name: custom.name, color: customCategoryPalette[custom.colorIndex].accent };
        }
        return { name: "Other", color: "#6b7f7f" };
    }

    // Free gaps inside [lo, hi] that are at least MIN_SLOT long, starting on a quarter hour.
    function freeSlots(day, lo, hi) {
        const busy = day.busy
            .map(([start, end]) => [Math.max(start, lo), Math.min(end, hi)])
            .filter(([start, end]) => end > start)
            .sort((a, b) => a[0] - b[0]);
        const slots = [];
        const addSlot = (from, to) => {
            const start = Math.ceil(from / 15) * 15;
            if (to - start >= MIN_SLOT) {
                slots.push([start, to]);
            }
        };

        let cursor = lo;
        for (const [start, end] of busy) {
            if (start > cursor) {
                addSlot(cursor, start);
            }
            cursor = Math.max(cursor, end);
        }
        addSlot(cursor, hi);
        return slots;
    }

    // Sets up the 7 days: fixed tasks, today's past hours and protected free time.
    // Returns the open flexible tasks ordered by deadline, ready to be scheduled.
    function prepare(tasks, settings, now) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const days = [];
        for (let index = 0; index < DAYS; index += 1) {
            const date = new Date(today);
            date.setDate(today.getDate() + index);
            days.push({ date, key: dateKey(date), busy: [], blocks: [], workMinutes: 0 });
        }
        const dayIndex = new Map(days.map((day, index) => [day.key, index]));
        const openTasks = tasks.filter(task => task.status !== "done");

        // 1. Fixed tasks sit at their exact time and are never moved.
        for (const task of openTasks.filter(entry => entry.fixed)) {
            const index = dayIndex.get(task.date);
            const time = /^(\d{2}):(\d{2})$/.exec(task.startTime ?? "");
            if (index === undefined || !time) {
                continue;
            }
            const start = Number(time[1]) * 60 + Number(time[2]);
            const end = Math.min(start + (parseDurationMinutes(task.duration) || 60), 24 * 60);
            days[index].blocks.push({ kind: "fixed", task, start, end });
            days[index].busy.push([start, end]);
        }

        // Time that has already passed today can't be planned into.
        const nowMinutes = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
        days[0].busy.push([0, nowMinutes]);

        // 2. Protect free time first, so work never eats into it.
        const freeMinutes = Math.round(settings.freeHours * 60);
        if (freeMinutes > 0) {
            for (const day of days) {
                let remaining = freeMinutes;
                for (const [lo, hi] of [[16 * 60, DISPLAY_END], [DISPLAY_START, DISPLAY_END]]) {
                    const slots = freeSlots(day, lo, hi)
                        .sort((a, b) => Math.abs(a[0] - FREE_PREFERRED) - Math.abs(b[0] - FREE_PREFERRED));
                    for (const [slotStart, slotEnd] of slots) {
                        if (remaining <= 0) {
                            break;
                        }
                        const length = Math.min(remaining, slotEnd - slotStart);
                        const start = slotStart < FREE_PREFERRED && FREE_PREFERRED + length <= slotEnd
                            ? FREE_PREFERRED
                            : slotStart;
                        day.blocks.push({ kind: "free", start, end: start + length });
                        day.busy.push([start, start + length]);
                        remaining -= length;
                    }
                    if (remaining <= 0) {
                        break;
                    }
                }
            }
        }

        // 3. Flexible tasks, earliest deadline first.
        const flexible = openTasks
            .filter(task => !task.fixed)
            .map(task => {
                const minutes = parseDurationMinutes(task.duration) || 60;
                let deadline = Infinity;
                let overdue = false;
                if (task.date) {
                    const difference = Math.round((parseDateKey(task.date) - today) / 86400000);
                    overdue = difference < 0;
                    deadline = Math.max(difference, 0);
                }
                return { task, minutes, remaining: minutes, deadline, overdue };
            })
            .sort((a, b) => a.deadline - b.deadline);

        return { today, days, dayIndex, flexible, dailyLimit: Math.round(settings.workHours * 60) };
    }

    function clockMinutes(text) {
        const match = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? "").trim());
        if (!match) {
            return null;
        }
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        return hours <= 24 && minutes <= 59 ? hours * 60 + minutes : null;
    }

    // Takes the AI's suggested blocks and keeps only the ones that obey every rule.
    // Anything invalid is skipped, so a wrong AI answer can never break the plan.
    function applyAiBlocks(state, aiBlocks) {
        const stats = { accepted: 0, rejected: 0, minutes: 0 };
        const byId = new Map(state.flexible.map(item => [item.task.id, item]));
        const list = (Array.isArray(aiBlocks) ? aiBlocks : [])
            .filter(block => block && typeof block === "object")
            .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start).localeCompare(String(b.start)));

        for (const raw of list) {
            const item = byId.get(raw.taskId);
            const index = state.dayIndex.get(raw.date);
            let start = clockMinutes(raw.start);
            let end = clockMinutes(raw.end);
            if (!item || index === undefined || start === null || end === null) {
                stats.rejected += 1;
                continue;
            }
            start = Math.round(start / 15) * 15;
            end = Math.round(end / 15) * 15;
            const day = state.days[index];
            end = Math.min(end, start + item.remaining, start + MAX_SESSION, WORK_END, start + (state.dailyLimit - day.workMinutes));
            const fits = start >= WORK_START
                && end - start >= MIN_SLOT
                && index <= item.deadline
                && freeSlots(day, start, end).some(([from, to]) => from === start && to === end);
            if (!fits) {
                stats.rejected += 1;
                continue;
            }
            day.blocks.push({ kind: "task", task: item.task, start, end });
            day.busy.push([start, end]);
            day.workMinutes += end - start;
            item.remaining -= end - start;
            stats.accepted += 1;
            stats.minutes += end - start;
        }
        return stats;
    }

    // The basic planner: places whatever is still unplanned, earliest deadline first.
    function fillGreedy(state) {
        for (let index = 0; index < DAYS; index += 1) {
            const day = state.days[index];
            for (const item of state.flexible) {
                if (item.remaining <= 0 || index > item.deadline) {
                    continue;
                }
                const room = state.dailyLimit - day.workMinutes;
                if (room <= 0 || room < Math.min(item.remaining, MIN_SLOT)) {
                    continue;
                }
                const slots = freeSlots(day, WORK_START, WORK_END);
                if (!slots.length) {
                    continue;
                }
                const [slotStart, slotEnd] = slots[0];
                const length = Math.min(item.remaining, room, MAX_SESSION, slotEnd - slotStart);
                day.blocks.push({ kind: "task", task: item.task, start: slotStart, end: slotStart + length });
                day.busy.push([slotStart, slotStart + length]);
                day.workMinutes += length;
                item.remaining -= length;
            }
        }
    }

    // aiBlocks is optional. With it, the AI's valid blocks go in first and the basic planner fills the gaps.
    function buildPlan(tasks, settings, now, aiBlocks) {
        const state = prepare(tasks, settings, now);
        const aiStats = aiBlocks ? applyAiBlocks(state, aiBlocks) : null;
        fillGreedy(state);

        const { days, flexible } = state;
        const leftover = flexible.filter(item => item.remaining > 0);
        const plannedMinutes = days.reduce((sum, day) => sum + day.workMinutes, 0);
        return {
            days,
            overdue: flexible.filter(item => item.overdue).map(item => item.task),
            short: leftover.filter(item => item.deadline < DAYS),
            later: leftover.filter(item => item.deadline >= DAYS),
            plannedMinutes,
            taskCount: flexible.length,
            aiStats: aiStats && { ...aiStats, filledMinutes: plannedMinutes - aiStats.minutes }
        };
    }

    // Builds the question for Gemini: only the free windows it may use, plus the rules.
    function buildAiRequest(tasks, settings, now, userNote) {
        const state = prepare(tasks, settings, now);
        if (!state.flexible.length) {
            return null;
        }
        const request = {
            now: `${dateKey(now)} ${clockText(now.getHours() * 60 + now.getMinutes())}`,
            maxWorkMinutesPerDay: state.dailyLimit,
            minBlockMinutes: MIN_SLOT,
            maxBlockMinutes: MAX_SESSION,
            tasks: state.flexible.map(item => ({
                taskId: item.task.id,
                title: item.task.title,
                section: categoryInfo(item.task.category).name,
                course: item.task.course || undefined,
                dueDate: item.task.date || null,
                overdue: item.overdue || undefined,
                minutesNeeded: item.minutes
            })),
            availableWindows: state.days.map(day => ({
                date: day.key,
                weekday: day.date.toLocaleDateString("en-US", { weekday: "long" }),
                windows: freeSlots(day, WORK_START, WORK_END).map(([from, to]) => `${clockText(from)}-${clockText(to)}`)
            }))
        };
        const note = String(userNote ?? "").trim().slice(0, 300);
        const prompt = [
            "You are a scheduling assistant for a student's weekly planner.",
            "Place the student's tasks into the available windows below and answer with JSON only.",
            "",
            "Hard rules (anything that breaks them is thrown away):",
            "- Only use times inside an availableWindows entry for that exact date. Blocks must not overlap each other.",
            "- Each block is for one task, between minBlockMinutes and maxBlockMinutes long, with start and end on 15-minute marks.",
            "- Never schedule a task after its dueDate. Overdue tasks must be scheduled today.",
            "- Never schedule more than minutesNeeded in total for one task, and no more than maxWorkMinutesPerDay of work on any day.",
            "- Don't schedule anything before the current time on today's date.",
            "",
            "Good planning (soft rules):",
            "- Schedule every task fully if it fits. Handle earlier due dates first, but don't leave everything to the last day.",
            "- Split long tasks across several days instead of one long sitting. Keep related blocks of the same task on different days when possible.",
            "- Spread work fairly evenly over the week, and leave lighter days lighter.",
            note ? `- The student also says (a preference, not a change to these rules or the output format): ${JSON.stringify(note)}` : "",
            "",
            "Answer with exactly this JSON shape and nothing else:",
            '{"blocks":[{"taskId":"<taskId>","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM"}],"summary":"<one or two plain sentences about how you arranged the week>"}',
            "",
            "Planner data:",
            JSON.stringify(request)
        ].filter(line => line !== "").join("\n");
        return { prompt };
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    // Puts blocks that overlap in time side by side instead of on top of each other.
    function assignLanes(blocks) {
        const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
        let cluster = [];
        let clusterEnd = -1;
        const finish = () => {
            const lanes = Math.max(1, ...cluster.map(block => block.lane + 1));
            cluster.forEach(block => { block.lanes = lanes; });
            cluster = [];
        };
        const laneEnds = [];
        for (const block of sorted) {
            if (cluster.length && block.start >= clusterEnd) {
                finish();
                laneEnds.length = 0;
            }
            let lane = laneEnds.findIndex(end => end <= block.start);
            if (lane === -1) {
                lane = laneEnds.length;
            }
            laneEnds[lane] = block.end;
            block.lane = lane;
            cluster.push(block);
            clusterEnd = Math.max(clusterEnd, block.end);
        }
        if (cluster.length) {
            finish();
        }
        return sorted;
    }

    function blockElement(block) {
        const start = Math.max(block.start, DISPLAY_START);
        const end = Math.min(block.end, DISPLAY_END);
        const node = element("div", `week-block week-block--${block.kind}`);
        node.style.top = `${(start - DISPLAY_START) * PX_PER_MINUTE}px`;
        node.style.height = `${Math.max((end - start) * PX_PER_MINUTE - 2, 14)}px`;
        if ((end - start) * PX_PER_MINUTE < 40) {
            node.classList.add("week-block--short");
        }
        node.style.left = `${(block.lane / block.lanes) * 100}%`;
        node.style.width = `calc(${100 / block.lanes}% - 2px)`;

        const range = `${clockText(block.start)}–${clockText(block.end)}`;
        if (block.kind === "free") {
            node.append(element("span", "week-block__title", "Free time"), element("span", "week-block__time", range));
            node.title = `Free time ${range}`;
            return node;
        }

        const category = categoryInfo(block.task.category);
        node.style.setProperty("--block-color", category.color);
        const fixedNote = block.kind === "fixed" ? " · fixed" : "";
        node.append(
            element("span", "week-block__title", block.task.title),
            element("span", "week-block__time", `${range}${fixedNote}`)
        );
        node.title = `${block.task.title} (${category.name}) ${range}${fixedNote}`;
        return node;
    }

    function renderWeek(plan, now) {
        const week = document.querySelector("#week");
        week.replaceChildren();
        const totalHeight = (DISPLAY_END - DISPLAY_START) * PX_PER_MINUTE;
        week.style.setProperty("--hour", `${60 * PX_PER_MINUTE}px`);

        const head = element("div", "week-row week-row--head");
        head.append(element("div", "week-corner"));
        const body = element("div", "week-row week-row--body");

        const times = element("div", "week-times");
        times.style.height = `${totalHeight}px`;
        for (let hour = DISPLAY_START / 60; hour < DISPLAY_END / 60; hour += 1) {
            const label = element("span", "week-time", `${pad(hour)}:00`);
            label.style.top = `${(hour * 60 - DISPLAY_START) * PX_PER_MINUTE}px`;
            times.append(label);
        }
        body.append(times);

        let hiddenCount = 0;
        plan.days.forEach((day, index) => {
            const isToday = index === 0;
            const dayHead = element("div", `week-dayhead${isToday ? " week-dayhead--today" : ""}`);
            dayHead.append(
                element("span", "week-dayhead__name", day.date.toLocaleDateString(undefined, { weekday: "short" })),
                element("span", "week-dayhead__date", day.date.toLocaleDateString(undefined, { day: "numeric", month: "short" }))
            );
            head.append(dayHead);

            const column = element("div", `week-day${isToday ? " week-day--today" : ""}`);
            column.style.height = `${totalHeight}px`;

            const visible = day.blocks.filter(block => block.end > DISPLAY_START && block.start < DISPLAY_END);
            hiddenCount += day.blocks.length - visible.length;
            for (const block of assignLanes(visible)) {
                column.append(blockElement(block));
            }

            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            if (isToday && nowMinutes >= DISPLAY_START && nowMinutes <= DISPLAY_END) {
                const line = element("div", "week-now");
                line.style.top = `${(nowMinutes - DISPLAY_START) * PX_PER_MINUTE}px`;
                column.append(line);
            }
            body.append(column);
        });

        week.append(head, body);
        return hiddenCount;
    }

    function renderNotices(plan, hiddenCount, ai, aiStale) {
        const notices = document.querySelector("#plan-notices");
        notices.replaceChildren();

        if (!plan.taskCount && !plan.days.some(day => day.blocks.some(block => block.kind === "fixed"))) {
            notices.append(element("p", "plan-note", "Nothing to plan yet. Add tasks on the board and they'll be scheduled here."));
            return;
        }

        notices.append(element(
            "p",
            "plan-note",
            `${durationText(plan.plannedMinutes)} of work planned across the next 7 days. ` +
            "The plan is worked out from the current time, so it shifts as the day goes on."
        ));

        if (ai && plan.aiStats) {
            const stats = plan.aiStats;
            const text = ai.summary ? `Planned with AI. ${ai.summary}` : "Planned with AI.";
            notices.append(element("p", "plan-note plan-note--ai", text));
            if (stats.rejected || stats.filledMinutes > 0) {
                const parts = [];
                if (stats.rejected) {
                    parts.push(`${stats.rejected} suggestion(s) broke a rule and were skipped`);
                }
                if (stats.filledMinutes > 0) {
                    parts.push(`the basic planner placed the other ${durationText(stats.filledMinutes)}`);
                }
                notices.append(element("p", "plan-note", `${parts.join(", and ")}.`));
            }
        } else if (aiStale) {
            notices.append(element(
                "p",
                "plan-note",
                "Your tasks or settings changed since the AI plan, so this is the basic plan. Press \u201cPlan my week with AI\u201d to plan again."
            ));
        }

        const addList = (heading, className, items) => {
            if (!items.length) {
                return;
            }
            const box = element("div", `plan-warning ${className}`);
            box.append(element("strong", "", heading));
            const list = element("ul");
            for (const text of items) {
                list.append(element("li", "", text));
            }
            box.append(list);
            notices.append(box);
        };

        addList(
            "Overdue (planned for today)",
            "plan-warning--overdue",
            plan.overdue.map(task => `${task.title} was due ${task.date}`)
        );
        addList(
            "Won't fit before the deadline",
            "plan-warning--short",
            plan.short.map(item =>
                `${item.task.title}: ${durationText(item.remaining)} still unplanned before ${item.task.date}. ` +
                "Raise your daily work hours, move something, or ask for more time."
            )
        );
        addList(
            "Not planned this week",
            "plan-warning--later",
            plan.later.map(item => `${item.task.title}: ${item.task.date ? `due ${item.task.date}` : "no deadline"}, no room left in the next 7 days`)
        );
        if (hiddenCount) {
            notices.append(element("p", "plan-note", `${hiddenCount} fixed event(s) fall outside 8:00 to 23:00 and aren't shown.`));
        }
    }

    function renderLegend(tasks) {
        const legend = document.querySelector("#plan-legend");
        legend.replaceChildren();
        const used = new Set(tasks.filter(task => task.status !== "done").map(task => task.category));
        for (const categoryId of used) {
            const category = categoryInfo(categoryId);
            const item = element("li", "plan-legend__item");
            const swatch = element("span", "plan-legend__swatch");
            swatch.style.background = category.color;
            item.append(swatch, document.createTextNode(category.name));
            legend.append(item);
        }
        const fixed = element("li", "plan-legend__item");
        fixed.append(element("span", "plan-legend__swatch plan-legend__swatch--fixed"), document.createTextNode("Fixed time"));
        const free = element("li", "plan-legend__item");
        free.append(element("span", "plan-legend__swatch plan-legend__swatch--free"), document.createTextNode("Free time"));
        legend.append(fixed, free);
    }

    // ---- AI planning through a small backend (optional) ----
    // Paste your Cloudflare Worker's address here (see worker/gemini-worker.js).
    // The Gemini key lives only on that Worker, never in this file or on GitHub.
    // While this is empty, the AI panel stays hidden and only the basic planner is shown.
    const AI_ENDPOINT = "https://empty-wood-14f7.arwashahzad027.workers.dev";

    const aiPlanStorage = "deadline-planner.ai-plan.v1";
    const aiPanel = document.querySelector(".ai-panel");
    const aiButton = document.querySelector("#ai-plan");
    const aiClear = document.querySelector("#ai-clear");
    const aiStatus = document.querySelector("#ai-status");

    function storageGet(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function storageSet(key, value) {
        try {
            if (value === null || value === "") {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, value);
            }
            return true;
        } catch {
            return false;
        }
    }

    function setAiStatus(text, tone) {
        aiStatus.textContent = text;
        aiStatus.className = `ai-status${tone ? ` ai-status--${tone}` : ""}`;
    }

    function loadAiPlan() {
        try {
            const saved = JSON.parse(storageGet(aiPlanStorage) ?? "null");
            return saved && typeof saved.signature === "string" && Array.isArray(saved.blocks) ? saved : null;
        } catch {
            return null;
        }
    }

    // Identifies the tasks and settings an AI plan was made for. If any change, the AI plan is stale.
    function planSignature(tasks, settings, now) {
        return JSON.stringify([
            dateKey(now),
            settings.workHours,
            settings.freeHours,
            tasks.filter(task => task.status !== "done")
                .map(task => [task.id, task.title, task.category, task.date, task.duration, !!task.fixed, task.startTime])
        ]);
    }

    // Sends the prompt to the Worker, which adds the key and talks to Gemini.
    async function askBackend(prompt) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 70000);
        try {
            const response = await fetch(AI_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
                signal: controller.signal
            });
            let data = null;
            try {
                data = await response.json();
            } catch {
                // not JSON
            }
            if (!response.ok) {
                throw new Error(data?.error || `The planner service returned an error (${response.status}).`);
            }
            if (typeof data?.text !== "string" || !data.text.trim()) {
                throw new Error("The planner service sent back an empty answer. Try again.");
            }
            return { text: data.text, model: typeof data.model === "string" ? data.model : "Gemini" };
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("The planner took too long to answer. Try again.");
            }
            if (error instanceof TypeError) {
                throw new Error("Couldn't reach the planner service. Check your internet connection.");
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }

    function parseAiAnswer(text) {
        const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        let data;
        try {
            data = JSON.parse(cleaned);
        } catch {
            throw new Error("The AI's answer wasn't in a format the planner could read. Try again.");
        }
        const blocks = Array.isArray(data) ? data : data?.blocks;
        if (!Array.isArray(blocks)) {
            throw new Error("The AI's answer had no schedule in it. Try again.");
        }
        return { blocks, summary: typeof data?.summary === "string" ? data.summary.slice(0, 400) : "" };
    }

    // A plan the AI has just made but the person hasn't applied yet. Kept in memory only.
    let pendingPlan = null;
    const aiPreview = document.querySelector("#ai-preview");
    const aiPreviewText = document.querySelector("#ai-preview-text");

    function updateAiControls(aiActive) {
        aiClear.hidden = !aiActive || !!pendingPlan;
        aiButton.textContent = aiActive || pendingPlan ? "Re-plan with AI" : "Plan my week with AI";
        aiPreview.hidden = !pendingPlan;
        if (pendingPlan) {
            aiPreviewText.textContent = "Preview: this is the AI's plan. Nothing is saved until you press Apply." +
                (pendingPlan.summary ? ` ${pendingPlan.summary}` : "");
        }
    }

    function render() {
        const settings = loadSettings();
        document.querySelector("#work-hours").value = settings.workHours;
        document.querySelector("#free-hours").value = settings.freeHours;

        const now = new Date();
        const tasks = readTasks();
        const saved = loadAiPlan();
        const signature = planSignature(tasks, settings, now);
        if (pendingPlan && pendingPlan.signature !== signature) {
            pendingPlan = null; // tasks changed, so the preview no longer matches
        }
        const aiActive = !!saved && saved.signature === signature;
        const shown = pendingPlan ?? (aiActive ? saved : null);

        const plan = buildPlan(tasks, settings, now, shown ? shown.blocks : null);
        const hiddenCount = renderWeek(plan, now);
        renderNotices(plan, hiddenCount, shown, !!saved && !aiActive && !pendingPlan);
        renderLegend(tasks);
        updateAiControls(aiActive);
        return plan;
    }

    async function planWithAi() {
        if (aiButton.disabled) {
            return;
        }
        aiButton.disabled = true;
        setAiStatus("Asking the AI to plan your week…", "busy");
        try {
            const tasks = readTasks();
            const settings = loadSettings();
            const now = new Date();
            const request = buildAiRequest(tasks, settings, now, document.querySelector("#ai-note").value);
            if (!request) {
                setAiStatus("Nothing to plan yet. Add a task with a duration (and ideally a deadline) first. Fixed-time tasks aren't sent to the AI.", "warn");
                return;
            }

            const { text, model } = await askBackend(request.prompt);
            const answer = parseAiAnswer(text);

            // Only keep the plan if the app's own planner is still looking at the same tasks.
            if (planSignature(readTasks(), loadSettings(), new Date()) !== planSignature(tasks, settings, now)) {
                setAiStatus("Your tasks changed while the AI was planning. Press the button again.", "warn");
                return;
            }
            pendingPlan = {
                signature: planSignature(tasks, settings, now),
                blocks: answer.blocks,
                summary: answer.summary,
                model,
                createdAt: now.toISOString()
            };
            const plan = render();
            if (!plan.aiStats || plan.aiStats.accepted === 0) {
                pendingPlan = null;
                render();
                setAiStatus("The AI's suggestions didn't fit your rules, so the basic plan is shown. Try again.", "warn");
            } else {
                setAiStatus(`Preview ready (planned with ${model}). Press Apply to keep it or Discard to go back.`, "ok");
            }
        } catch (error) {
            console.error("AI planning failed:", error);
            setAiStatus(`Something went wrong: ${error && error.message ? error.message : "unknown error"}`, "error");
        } finally {
            aiButton.disabled = false;
        }
    }

    aiButton.addEventListener("click", planWithAi);
    document.querySelector("#ai-apply").addEventListener("click", () => {
        if (!pendingPlan) {
            return;
        }
        storageSet(aiPlanStorage, JSON.stringify(pendingPlan));
        pendingPlan = null;
        render();
        setAiStatus("Plan applied.", "ok");
    });
    document.querySelector("#ai-discard").addEventListener("click", () => {
        pendingPlan = null;
        render();
        setAiStatus("Discarded. Showing your previous plan.", "");
    });
    aiClear.addEventListener("click", () => {
        pendingPlan = null;
        storageSet(aiPlanStorage, null);
        render();
        setAiStatus("Showing the basic plan.", "");
    });

    if (!AI_ENDPOINT) {
        aiPanel.hidden = true;
    }

    function onSettingChange() {
        const workHours = Number(document.querySelector("#work-hours").value);
        const freeHours = Number(document.querySelector("#free-hours").value);
        const saved = {
            workHours: workHours >= 1 && workHours <= 12 ? workHours : defaultSettings.workHours,
            freeHours: freeHours >= 0 && freeHours <= 6 ? freeHours : defaultSettings.freeHours
        };
        localStorage.setItem(settingsKey, JSON.stringify(saved));
        render();
    }

    document.querySelector("#work-hours").addEventListener("change", onSettingChange);
    document.querySelector("#free-hours").addEventListener("change", onSettingChange);
    window.addEventListener("storage", render);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            render();
        }
    });

    render();

    // Exposed so the plan can be checked from the browser console or tests.
    window.deadlinePlanner = { buildPlan, buildAiRequest, parseDateKey, dateKey };
})();

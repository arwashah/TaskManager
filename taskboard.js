const taskStorageKey = "deadline-planner.tasks.v1";
const categoryStorageKey = "deadline-planner.category.v1";
const taskCategories = new Set(["study", "personal", "clubs"]);
const customCategoryStorageKey = "deadline-planner.custom-categories.v1";
const customCategoryPalette = [
    {
        accent: "#8c63c7",
        muted: "#59476d",
        panel: "rgba(65, 46, 89, 0.82)",
        light: "#b397df",
        field: "#d3c8e4",
        fieldText: "#35284b"
    },
    {
        accent: "#d47a35",
        muted: "#755137",
        panel: "rgba(93, 52, 20, 0.82)",
        light: "#eba46e",
        field: "#e5c7ad",
        fieldText: "#492d19"
    },
    {
        accent: "#218c83",
        muted: "#3d625e",
        panel: "rgba(18, 75, 69, 0.82)",
        light: "#71c7bc",
        field: "#b6d8d2",
        fieldText: "#193c38"
    },
    {
        accent: "#b38a20",
        muted: "#6d6036",
        panel: "rgba(89, 70, 14, 0.82)",
        light: "#ddc05b",
        field: "#e2d7a8",
        fieldText: "#473b18"
    },
    {
        accent: "#b95778",
        muted: "#704858",
        panel: "rgba(89, 34, 54, 0.82)",
        light: "#df91aa",
        field: "#e4c1cd",
        fieldText: "#492333"
    }
];
const taskStatuses = [
    { key: "todo", label: "To-do" },
    { key: "progress", label: "In progress" },
    { key: "done", label: "Done" }
];

// Turns text like "1 hour", "90 min", "1h 30m" or "2" (hours) into minutes.
// Returns 0 for an empty value and null when the text can't be understood.
function parseDurationMinutes(text) {
    const value = String(text ?? "").trim().toLowerCase();
    if (!value) {
        return 0;
    }
    if (/^\d+(\.\d+)?$/.test(value)) {
        return Math.round(parseFloat(value) * 60);
    }

    const pattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/g;
    let total = 0;
    let matched = false;
    let leftover = value;
    for (const match of value.matchAll(pattern)) {
        matched = true;
        const amount = parseFloat(match[1]);
        total += match[2].startsWith("h") ? amount * 60 : amount;
        leftover = leftover.replace(match[0], "");
    }
    if (!matched || /\d/.test(leftover)) {
        return null;
    }
    return Math.round(total);
}

function readCustomCategories() {
    // Never let bad saved data stop the page from working: fall back to no custom titles.
    try {
        const savedCategories = localStorage.getItem(customCategoryStorageKey);
        if (savedCategories === null) {
            return [];
        }
        const categories = JSON.parse(savedCategories);
        const ids = new Set();
        const names = new Set();
        const valid = Array.isArray(categories) && !categories.some(category => {
            if (
                !category ||
                typeof category.id !== "string" ||
                !category.id.startsWith("custom-") ||
                typeof category.name !== "string" ||
                !category.name.trim() ||
                category.name.length > 40 ||
                !Number.isInteger(category.colorIndex) ||
                category.colorIndex < 0 ||
                category.colorIndex >= customCategoryPalette.length
            ) {
                return true;
            }
            const normalizedName = category.name.trim().toLocaleLowerCase();
            if (ids.has(category.id) || names.has(normalizedName)) {
                return true;
            }
            ids.add(category.id);
            names.add(normalizedName);
            return false;
        });
        if (!valid) {
            console.warn("Saved custom categories were invalid and were ignored.");
            return [];
        }
        return categories;
    } catch (error) {
        console.warn("Saved custom categories could not be read and were ignored.", error);
        return [];
    }
}

let customCategories = readCustomCategories();

function isKnownCategory(categoryId) {
    return taskCategories.has(categoryId) ||
        customCategories.some(category => category.id === categoryId);
}

function renderCategories() {
    const categoryList = document.querySelector(".category-list");
    if (!categoryList) {
        return;
    }

    categoryList.querySelectorAll(".category-shell--custom").forEach(shell => shell.remove());
    for (const category of customCategories) {
        const color = customCategoryPalette[category.colorIndex];
        const shell = document.createElement("div");
        shell.className = "category-shell category-shell--custom";

        const button = document.createElement("button");
        button.className = "category category--custom";
        button.type = "button";
        button.dataset.category = category.id;
        button.textContent = category.name;
        button.style.setProperty("--category-color", color.accent);
        button.style.setProperty("--category-muted", color.muted);

        const removeButton = document.createElement("button");
        removeButton.className = "category-remove";
        removeButton.type = "button";
        removeButton.dataset.deleteCategory = category.id;
        removeButton.setAttribute("aria-label", `Delete title: ${category.name}`);
        removeButton.textContent = "×";

        shell.append(button, removeButton);
        categoryList.append(shell);
    }
}

function applyCategory(category) {
    if (!taskCategories.has(category) && !customCategories.some(entry => entry.id === category)) {
        category = "study";
        localStorage.setItem(categoryStorageKey, category);
    }
    const customCategory = customCategories.find(entry => entry.id === category);
    if (!taskCategories.has(category) && !customCategory) {
        throw new Error("Saved task category is invalid.");
    }

    const planner = document.querySelector(".planner-canvas");
    if (!planner) {
        return;
    }
    planner.dataset.theme = category;
    for (const property of [
        "--accent-color",
        "--accent-panel",
        "--accent-light",
        "--accent-field",
        "--accent-field-text"
    ]) {
        planner.style.removeProperty(property);
    }
    if (customCategory) {
        const color = customCategoryPalette[customCategory.colorIndex];
        planner.style.setProperty("--accent-color", color.accent);
        planner.style.setProperty("--accent-panel", color.panel);
        planner.style.setProperty("--accent-light", color.light);
        planner.style.setProperty("--accent-field", color.field);
        planner.style.setProperty("--accent-field-text", color.fieldText);
    }

    for (const button of planner.querySelectorAll(".category[data-category]")) {
        if (button.dataset.category === category) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    }
}

const savedCategory = localStorage.getItem(categoryStorageKey) ?? "study";
renderCategories();
applyCategory(savedCategory);

const categoryList = document.querySelector(".category-list");
categoryList?.addEventListener("click", event => {
    if (!(event.target instanceof Element)) {
        return;
    }
    const removeButton = event.target.closest(".category-remove[data-delete-category]");
    if (removeButton && categoryList.contains(removeButton)) {
        const categoryId = removeButton.dataset.deleteCategory;
        const category = customCategories.find(entry => entry.id === categoryId);
        if (!categoryId || !category) {
            return;
        }

        const confirmed = window.confirm(`Delete "${category.name}" and all of its tasks?`);
        if (!confirmed) {
            return;
        }

        const remainingTasks = readTasks().filter(task =>
            (task.category ?? "study") !== categoryId
        );
        customCategories = customCategories.filter(entry => entry.id !== categoryId);
        localStorage.setItem(customCategoryStorageKey, JSON.stringify(customCategories));
        localStorage.setItem(taskStorageKey, JSON.stringify(remainingTasks));

        if (localStorage.getItem(categoryStorageKey) === categoryId) {
            localStorage.setItem(categoryStorageKey, "study");
        }
        renderCategories();
        applyCategory(localStorage.getItem(categoryStorageKey) ?? "study");
        renderTasks();
        return;
    }

    const button = event.target.closest(".category[data-category]");
    if (!button || !categoryList.contains(button)) {
        return;
    }
    const category = button.dataset.category;
    if (!category) {
        throw new Error("Task category button is missing its category.");
    }
    localStorage.setItem(categoryStorageKey, category);
    applyCategory(category);
    renderTasks();
});

const addCategoryButton = document.querySelector(".add-category-button");
addCategoryButton?.addEventListener("click", () => {
    const form = document.createElement("form");
    form.className = "category-create-form";
    form.setAttribute("aria-label", "Create a task title");

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 40;
    input.required = true;
    input.placeholder = "Title name";
    input.setAttribute("aria-label", "New title name");

    const submitButton = document.createElement("button");
    submitButton.className = "category-create-submit";
    submitButton.type = "submit";
    submitButton.textContent = "Add";

    const cancelButton = document.createElement("button");
    cancelButton.className = "category-create-cancel";
    cancelButton.type = "button";
    cancelButton.textContent = "×";
    cancelButton.setAttribute("aria-label", "Cancel creating title");

    form.append(input, submitButton, cancelButton);
    addCategoryButton.replaceWith(form);
    input.focus();

    cancelButton.addEventListener("click", () => form.replaceWith(addCategoryButton));
    form.addEventListener("submit", event => {
        event.preventDefault();
        const name = input.value.trim();
        if (!name) {
            input.setCustomValidity("Enter a title name.");
            input.reportValidity();
            return;
        }

        const duplicate = [...document.querySelectorAll(".category[data-category]")]
            .some(button => button.textContent.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
        if (duplicate) {
            input.setCustomValidity("A title with this name already exists.");
            input.reportValidity();
            return;
        }

        let id;
        do {
            id = `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        } while (customCategories.some(category => category.id === id));

        customCategories.push({
            id,
            name,
            colorIndex: customCategories.length % customCategoryPalette.length
        });
        localStorage.setItem(customCategoryStorageKey, JSON.stringify(customCategories));
        localStorage.setItem(categoryStorageKey, id);
        form.replaceWith(addCategoryButton);
        renderCategories();
        applyCategory(id);
        renderTasks();
    });

    input.addEventListener("input", () => input.setCustomValidity(""));
});

function readTasks() {
    // Keep every valid task; skip broken ones instead of crashing the whole page.
    let saved;
    try {
        const raw = localStorage.getItem(taskStorageKey);
        if (raw === null) {
            return [];
        }
        saved = JSON.parse(raw);
    } catch (error) {
        console.warn("Saved tasks could not be read.", error);
        return [];
    }
    if (!Array.isArray(saved)) {
        console.warn("Saved task data was not a list and was ignored.");
        return [];
    }
    return saved.filter(task =>
        task &&
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        (task.category === undefined || isKnownCategory(task.category)) &&
        taskStatuses.some(status => status.key === task.status)
    ).map(task => ({ ...task, category: task.category ?? "study" }));
}

function saveTasks(tasks, focusTaskId = null) {
    localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
    renderTasks(focusTaskId);
}

function moveTaskToStatus(taskId, statusKey, shouldFocus = false) {
    const tasks = readTasks();
    const task = tasks.find(entry => entry.id === taskId);
    if (!task || !taskStatuses.some(status => status.key === statusKey) || task.status === statusKey) {
        return;
    }

    task.status = statusKey;
    saveTasks(tasks, shouldFocus ? taskId : null);
}

function localDateKey(date) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Returns "overdue", "today", "tomorrow" or null for a task card.
function dueStatus(task) {
    if (task.status === "done" || task.fixed || !/^\d{4}-\d{2}-\d{2}$/.test(task.date ?? "")) {
        return null;
    }
    const now = new Date();
    const today = localDateKey(now);
    const tomorrow = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    if (task.date < today) {
        return "overdue";
    }
    if (task.date === today) {
        return "today";
    }
    return task.date === tomorrow ? "tomorrow" : null;
}

function renderTasks(focusTaskId = null) {
    const board = document.querySelector(".task-columns");
    if (!board) {
        return;
    }

    const category = document.querySelector(".planner-canvas")?.dataset.theme ?? "study";
    const tasks = readTasks().filter(task => task.category === category);
    for (const status of taskStatuses) {
        const list = board.querySelector(`.task-column--${status.key} .task-list`);
        const statusTasks = tasks.filter(task => task.status === status.key);
        list.replaceChildren();
        for (const task of statusTasks) {
            const item = document.createElement("li");
            item.className = "task-card";
            item.draggable = true;
            item.tabIndex = 0;
            item.dataset.taskId = task.id;
            item.setAttribute("aria-roledescription", "draggable task");
            item.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
            item.setAttribute("aria-label", `Task: ${task.title}. Drag to another board or use the left and right arrow keys to change its status.`);

            const details = document.createElement("div");
            details.className = "task-card__details";

            const title = document.createElement("span");
            title.className = "task-card__title";
            title.textContent = task.title;
            details.append(title);

            const due = dueStatus(task);
            if (due) {
                item.classList.add(`task-card--${due === "overdue" ? "overdue" : "soon"}`);
                const badge = document.createElement("span");
                badge.className = `task-card__badge task-card__badge--${due === "overdue" ? "overdue" : "soon"}`;
                badge.textContent = due === "overdue" ? "Overdue" : due === "today" ? "Due today" : "Due tomorrow";
                details.append(badge);
            }

            const metadata = [
                task.fixed ? "Fixed" : "",
                task.course,
                task.crn,
                [task.date, task.fixed ? task.startTime : task.dueTime].filter(Boolean).join(" "),
                task.duration,
                task.reminder
            ]
                .filter(Boolean)
                .join(" · ");
            if (metadata) {
                const meta = document.createElement("span");
                meta.className = "task-card__meta";
                meta.textContent = metadata;
                details.append(meta);
            }

            const removeButton = document.createElement("button");
            removeButton.className = "task-card__remove";
            removeButton.type = "button";
            removeButton.draggable = false;
            removeButton.textContent = "×";
            removeButton.setAttribute("aria-label", `Remove task: ${task.title}`);
            removeButton.addEventListener("click", event => {
                event.stopPropagation();
                saveTasks(readTasks().filter(entry => entry.id !== task.id));
            });

            const editLink = document.createElement("a");
            editLink.className = "task-card__edit";
            editLink.href = `AddTask.html?edit=${encodeURIComponent(task.id)}`;
            editLink.draggable = false;
            editLink.textContent = "Edit";
            editLink.setAttribute("aria-label", `Edit task: ${task.title}`);

            item.addEventListener("dragstart", event => {
                if (event.target instanceof Element && event.target.closest(".task-card__remove, .task-card__edit")) {
                    event.preventDefault();
                    return;
                }
                if (!event.dataTransfer) {
                    return;
                }
                event.dataTransfer.setData("text/plain", task.id);
                event.dataTransfer.effectAllowed = "move";
                item.classList.add("task-card--dragging");
            });
            item.addEventListener("dragend", () => item.classList.remove("task-card--dragging"));
            item.addEventListener("keydown", event => {
                if (event.target !== item || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
                    return;
                }
                event.preventDefault();
                const currentIndex = taskStatuses.findIndex(status => status.key === task.status);
                const nextIndex = currentIndex + (event.key === "ArrowRight" ? 1 : -1);
                if (nextIndex >= 0 && nextIndex < taskStatuses.length) {
                    moveTaskToStatus(task.id, taskStatuses[nextIndex].key, true);
                }
            });

            item.append(details, editLink, removeButton);
            list.append(item);
        }
    }

    if (focusTaskId) {
        const movedTask = [...board.querySelectorAll(".task-card")]
            .find(item => item.dataset.taskId === focusTaskId);
        movedTask?.focus();
    }
}

function setupDropTargets() {
    for (const status of taskStatuses) {
        const column = document.querySelector(`.task-column--${status.key}`);
        if (!column) {
            continue;
        }

        column.addEventListener("dragover", event => {
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
            column.classList.add("task-column--drop-target");
        });
        column.addEventListener("dragleave", event => {
            if (event.relatedTarget instanceof Node && column.contains(event.relatedTarget)) {
                return;
            }
            column.classList.remove("task-column--drop-target");
        });
        column.addEventListener("drop", event => {
            event.preventDefault();
            column.classList.remove("task-column--drop-target");
            const taskId = event.dataTransfer?.getData("text/plain");
            if (taskId) {
                moveTaskToStatus(taskId, status.key);
            }
        });
    }
}

const editTaskId = new URLSearchParams(window.location.search).get("edit");

// ---- Reminders ----
// There is no server, so reminders fire while the planner is open in a browser tab.
// A task with no time set counts from 9:00 on its due date.
const reminderFiredKey = "deadline-planner.reminders-fired.v1";
const reminderOffsets = {
    "10 minutes before": 10 * 60 * 1000,
    "1 hour before": 60 * 60 * 1000,
    "1 day before": 24 * 60 * 60 * 1000
};

function dueMoment(task) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.date ?? "")) {
        return null;
    }
    const time = task.fixed ? task.startTime : task.dueTime;
    const [hours, minutes] = /^\d{2}:\d{2}$/.test(time ?? "") ? time.split(":").map(Number) : [9, 0];
    const [year, month, day] = task.date.split("-").map(Number);
    return new Date(year, month - 1, day, hours, minutes);
}

// Returns { due, at, key } for a task that has a reminder, or null.
function reminderMoment(task) {
    const offset = reminderOffsets[task.reminder];
    const due = dueMoment(task);
    if (offset === undefined || !due) {
        return null;
    }
    const at = new Date(due.getTime() - offset);
    return { due, at, key: `${task.id}|${at.getTime()}` };
}

function readFiredReminders() {
    try {
        const saved = JSON.parse(localStorage.getItem(reminderFiredKey) ?? "{}");
        return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch {
        return {};
    }
}

function writeFiredReminders(fired) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const key of Object.keys(fired)) {
        if (!(fired[key] > cutoff)) {
            delete fired[key];
        }
    }
    try {
        localStorage.setItem(reminderFiredKey, JSON.stringify(fired));
    } catch {
        // storage full or blocked: reminders may repeat, nothing else breaks
    }
}

// A reminder whose time has already passed when a task is saved shouldn't fire straight away.
function markPastRemindersHandled(tasks) {
    const fired = readFiredReminders();
    const now = Date.now();
    for (const task of tasks) {
        const moment = reminderMoment(task);
        if (moment && moment.at.getTime() <= now) {
            fired[moment.key] = now;
        }
    }
    writeFiredReminders(fired);
}

function describeTimeLeft(due) {
    const minutes = Math.round((due.getTime() - Date.now()) / 60000);
    if (minutes <= 1) {
        return "due now";
    }
    if (minutes < 60) {
        return `due in ${minutes} minutes`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return `due in ${hours} hour${hours === 1 ? "" : "s"}`;
    }
    const days = Math.round(hours / 24);
    return `due in ${days} day${days === 1 ? "" : "s"}`;
}

function showReminder(task, due, key) {
    const message = `${task.title} is ${describeTimeLeft(due)}.`;

    let box = document.querySelector("#reminder-toasts");
    if (!box) {
        box = document.createElement("div");
        box.id = "reminder-toasts";
        box.className = "reminder-toasts";
        box.setAttribute("role", "status");
        box.setAttribute("aria-live", "polite");
        document.body.append(box);
    }
    const toast = document.createElement("div");
    toast.className = "reminder-toast";
    const text = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = "Reminder";
    const body = document.createElement("span");
    body.textContent = message;
    text.append(heading, body);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "reminder-toast__dismiss";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => toast.remove());
    toast.append(text, dismiss);
    box.append(toast);

    if ("Notification" in window && Notification.permission === "granted") {
        try {
            new Notification(`Reminder: ${task.title}`, { body: message, tag: key });
        } catch {
            // some mobile browsers only allow notifications from a service worker; the banner still shows
        }
    }
}

function checkReminders() {
    const now = Date.now();
    const fired = readFiredReminders();
    let changed = false;
    for (const task of readTasks()) {
        if (task.status === "done") {
            continue;
        }
        const moment = reminderMoment(task);
        if (!moment || fired[moment.key] || now < moment.at.getTime() || now > moment.due.getTime()) {
            continue;
        }
        fired[moment.key] = now;
        changed = true;
        showReminder(task, moment.due, moment.key);
    }
    if (changed) {
        writeFiredReminders(fired);
    }
}

function saveTaskFromForm(form) {
    const formData = new FormData(form);
    const fixed = formData.get("fixed") === "on";
    const fields = {
        title: String(formData.get("title")).trim(),
        course: String(formData.get("course")).trim(),
        crn: String(formData.get("crn")).trim(),
        date: String(formData.get("date")),
        startTime: fixed ? String(formData.get("startTime")) : "",
        dueTime: fixed ? "" : String(formData.get("startTime") ?? ""),
        duration: String(formData.get("duration")).trim(),
        reminder: String(formData.get("reminder")),
        fixed,
        category: localStorage.getItem(categoryStorageKey) ?? "study"
    };

    if (!fields.title) {
        return;
    }

    const tasks = readTasks();
    let savedTask;
    if (editTaskId) {
        if (!tasks.some(task => task.id === editTaskId)) {
            return;
        }
        savedTask = { ...tasks.find(task => task.id === editTaskId), ...fields };
        saveTasks(tasks.map(task => task.id === editTaskId ? savedTask : task));
    } else {
        savedTask = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            ...fields,
            status: "todo"
        };
        saveTasks([...tasks, savedTask]);
    }
    try {
        markPastRemindersHandled([savedTask]);
    } catch (error) {
        console.warn("Couldn't update reminder bookkeeping:", error);
    }
    window.location.href = "index.html";
}

const quickAddInput = document.querySelector(".quick-add input");
if (quickAddInput) {
    quickAddInput.addEventListener("keydown", event => {
        if (event.key !== "Enter") {
            return;
        }
        event.preventDefault();

        const title = quickAddInput.value.trim();
        if (!title) {
            return;
        }
        saveTasks([...readTasks(), {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title,
            course: "",
            crn: "",
            date: "",
            duration: "",
            reminder: "",
            category: localStorage.getItem(categoryStorageKey) ?? "study",
            status: "todo"
        }]);
        quickAddInput.value = "";
    });
}

const taskForm = document.querySelector("#task-form");
if (taskForm) {
    // The save handler goes on first and looks up everything it needs itself, so nothing
    // else on this page (or an older copy of the page) can stop a task from being saved.
    taskForm.addEventListener("submit", event => {
        event.preventDefault();
        const lengthInput = taskForm.elements.duration;
        const lengthError = document.querySelector("#duration-error");
        if (lengthInput && parseDurationMinutes(lengthInput.value) === null) {
            const message = "I couldn't read that length. Try something like 1 hour, 90 min or 1h 30m.";
            lengthInput.setCustomValidity(message);
            if (lengthError) {
                lengthError.textContent = message;
                lengthError.hidden = false;
            }
            lengthInput.reportValidity();
            lengthInput.focus();
            return;
        }
        try {
            saveTaskFromForm(taskForm);
        } catch (error) {
            console.error("Saving the task failed:", error);
            let problem = document.querySelector("#save-error");
            if (!problem) {
                problem = document.createElement("p");
                problem.id = "save-error";
                problem.className = "task-field__error";
                problem.setAttribute("role", "alert");
                taskForm.append(problem);
            }
            problem.textContent = `Couldn't save the task: ${error && error.message ? error.message : "unknown error"}`;
        }
    });

    // Everything below is extra behaviour. If any piece is missing it is skipped, never fatal.
    try {
    const fixedBox = taskForm.elements.fixed;
    const dateInput = taskForm.elements.date;
    const startTimeInput = taskForm.elements.startTime;
    const durationInput = taskForm.elements.duration;
    const dateLabel = document.querySelector("#date-label");
    const startTimeLabel = document.querySelector("#start-time-label");
    const submitButton = taskForm.querySelector(".task-submit-button");

    // A fixed task (an appointment) needs an exact date, start time and length.
    const syncFixedFields = () => {
        const fixed = taskForm.elements.fixed.checked;
        if (startTimeLabel) {
            startTimeLabel.textContent = fixed ? "Start time" : "Due time (optional)";
        }
        dateInput.required = fixed;
        startTimeInput.required = fixed;
        durationInput.required = fixed;
        if (dateLabel) {
            dateLabel.textContent = fixed ? "Date" : "Deadline";
        }
    };
    fixedBox.addEventListener("change", syncFixedFields);
    const durationError = document.querySelector("#duration-error");
    durationInput.addEventListener("input", () => {
        durationInput.setCustomValidity("");
        if (durationError) {
            durationError.hidden = true;
        }
    });

    if (editTaskId) {
        const taskToEdit = readTasks().find(task => task.id === editTaskId);
        if (!taskToEdit) {
            window.location.href = "index.html";
        } else {
            document.querySelector("#task-entry-heading").textContent = "Edit task";
            document.title = "Edit task | Deadline Planner";
            submitButton.textContent = "Save changes";
            taskForm.elements.title.value = taskToEdit.title;
            taskForm.elements.course.value = taskToEdit.course ?? "";
            taskForm.elements.crn.value = taskToEdit.crn ?? "";
            dateInput.value = taskToEdit.date ?? "";
            startTimeInput.value = (taskToEdit.fixed ? taskToEdit.startTime : taskToEdit.dueTime) ?? "";
            durationInput.value = taskToEdit.duration ?? "";
            taskForm.elements.reminder.value = taskToEdit.reminder ?? "";
            fixedBox.checked = Boolean(taskToEdit.fixed);

            // The highlighted title tab is the section the task is saved in.
            // Starting on the task's own section lets the user move it by picking another tab.
            localStorage.setItem(categoryStorageKey, taskToEdit.category);
            applyCategory(taskToEdit.category);

            const cancelLink = document.createElement("a");
            cancelLink.className = "task-cancel-link";
            cancelLink.href = "index.html";
            cancelLink.textContent = "Cancel";
            submitButton.after(cancelLink);
        }
    }
    syncFixedFields();

    // Explains how reminders work and lets the person turn on browser notifications.
    const reminderSelect = taskForm.elements.reminder;
    const reminderHelp = document.querySelector("#reminder-help");
    const reminderHelpText = document.querySelector("#reminder-help-text");
    const notifyButton = document.querySelector("#enable-notifications");

    function updateReminderHelp() {
        if (!reminderHelp) {
            return;
        }
        reminderHelp.hidden = !reminderSelect.value;
        if (!reminderSelect.value) {
            return;
        }
        const supported = "Notification" in window;
        const permission = supported ? Notification.permission : "unsupported";
        const open = "Reminders appear while Deadline Planner is open in a browser tab.";
        const noTime = startTimeInput.value ? "" : " With no time set, they count from 9:00 on the due date.";
        let text;
        if (permission === "granted") {
            text = `Notifications are on. ${open}${noTime}`;
        } else if (permission === "denied") {
            text = `Notifications are blocked for this site, so you'll see a banner on the page instead. ${open}${noTime}`;
        } else if (permission === "unsupported") {
            text = `This browser can't show pop-up notifications, so you'll see a banner on the page instead. ${open}${noTime}`;
        } else {
            text = `${open} Turn on notifications to also get a pop-up from your browser.${noTime}`;
        }
        reminderHelpText.textContent = text;
        notifyButton.hidden = permission !== "default";
    }

    reminderSelect.addEventListener("change", updateReminderHelp);
    startTimeInput.addEventListener("input", updateReminderHelp);
    notifyButton?.addEventListener("click", async () => {
        try {
            await new Promise(resolve => {
                const result = Notification.requestPermission(resolve);
                if (result && typeof result.then === "function") {
                    result.then(resolve);
                }
            });
        } catch {
            // ignore: the help text below shows the current state
        }
        updateReminderHelp();
    });
    updateReminderHelp();

    } catch (error) {
        console.warn("Add Task page extras failed to set up:", error);
    }
}

// ---- Backup: export and import tasks as a file ----
const exportButton = document.querySelector("#export-tasks");
const importButton = document.querySelector("#import-tasks");
const importFile = document.querySelector("#import-file");
const dataStatus = document.querySelector("#data-status");

function setDataStatus(text, tone) {
    if (dataStatus) {
        dataStatus.textContent = text;
        dataStatus.dataset.tone = tone ?? "";
    }
}

if (exportButton && importButton && importFile) {
    exportButton.addEventListener("click", () => {
        const backup = {
            app: "deadline-planner",
            version: 1,
            exportedAt: new Date().toISOString(),
            tasks: readTasks(),
            customCategories: readCustomCategories()
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `deadline-planner-backup-${localDateKey(new Date())}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setDataStatus(`Saved a backup of ${backup.tasks.length} task(s).`, "ok");
    });

    importButton.addEventListener("click", () => importFile.click());

    importFile.addEventListener("change", async () => {
        const file = importFile.files && importFile.files[0];
        importFile.value = "";
        if (!file) {
            return;
        }
        try {
            if (file.size > 2 * 1024 * 1024) {
                throw new Error("That file is too big to be a planner backup.");
            }
            let backup;
            try {
                backup = JSON.parse(await file.text());
            } catch {
                throw new Error("That file isn't a planner backup (it couldn't be read).");
            }
            if (!backup || backup.app !== "deadline-planner" || !Array.isArray(backup.tasks)) {
                throw new Error("That file isn't a planner backup.");
            }

            // Custom titles first, so imported tasks can belong to them.
            const mergedCategories = [...customCategories];
            for (const category of Array.isArray(backup.customCategories) ? backup.customCategories : []) {
                const shapeOk = category &&
                    typeof category.id === "string" && category.id.startsWith("custom-") &&
                    typeof category.name === "string" && category.name.trim() && category.name.length <= 40 &&
                    Number.isInteger(category.colorIndex) &&
                    category.colorIndex >= 0 && category.colorIndex < customCategoryPalette.length;
                const nameTaken = shapeOk && mergedCategories.some(entry =>
                    entry.name.trim().toLocaleLowerCase() === category.name.trim().toLocaleLowerCase());
                if (shapeOk && !nameTaken && !mergedCategories.some(entry => entry.id === category.id)) {
                    mergedCategories.push({ id: category.id, name: category.name.trim(), colorIndex: category.colorIndex });
                }
            }
            const knownCategory = id => taskCategories.has(id) || mergedCategories.some(entry => entry.id === id);
            const text = (value, max) => typeof value === "string" ? value.slice(0, max) : "";

            const imported = [];
            for (const task of backup.tasks) {
                if (!task || typeof task.id !== "string" || typeof task.title !== "string" || !task.title.trim() ||
                    !taskStatuses.some(status => status.key === task.status)) {
                    continue;
                }
                imported.push({
                    id: task.id.slice(0, 80),
                    title: task.title.trim().slice(0, 120),
                    course: text(task.course, 80),
                    crn: text(task.crn, 20),
                    date: /^\d{4}-\d{2}-\d{2}$/.test(task.date ?? "") ? task.date : "",
                    startTime: /^\d{2}:\d{2}$/.test(task.startTime ?? "") ? task.startTime : "",
                    dueTime: /^\d{2}:\d{2}$/.test(task.dueTime ?? "") ? task.dueTime : "",
                    duration: text(task.duration, 40),
                    reminder: text(task.reminder, 40),
                    fixed: task.fixed === true,
                    category: knownCategory(task.category) ? task.category : "study",
                    status: task.status
                });
            }
            if (!imported.length) {
                throw new Error("There were no tasks in that file.");
            }

            const existing = readTasks();
            const existingIds = new Set(existing.map(task => task.id));
            const updated = imported.filter(task => existingIds.has(task.id)).length;
            const importedById = new Map(imported.map(task => [task.id, task]));
            const result = [
                ...existing.map(task => importedById.get(task.id) ?? task),
                ...imported.filter(task => !existingIds.has(task.id))
            ];

            localStorage.setItem(customCategoryStorageKey, JSON.stringify(mergedCategories));
            customCategories = readCustomCategories();
            renderCategories();
            applyCategory(localStorage.getItem(categoryStorageKey) ?? "study");
            saveTasks(result);
            markPastRemindersHandled(imported);
            setDataStatus(`Imported ${imported.length} task(s): ${imported.length - updated} new, ${updated} updated.`, "ok");
        } catch (error) {
            setDataStatus(error && error.message ? error.message : "Couldn't import that file.", "error");
        }
    });
}

setupDropTargets();
renderTasks();
window.addEventListener("storage", event => {
    if (event.key === taskStorageKey) {
        renderTasks();
    } else if (event.key === customCategoryStorageKey) {
        customCategories = readCustomCategories();
        renderCategories();
        applyCategory(localStorage.getItem(categoryStorageKey) ?? "study");
        renderTasks();
    } else if (event.key === categoryStorageKey && event.newValue !== null) {
        applyCategory(event.newValue);
        renderTasks();
    }
});

checkReminders();
setInterval(checkReminders, 30000);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        checkReminders();
    }
});
window.addEventListener("focus", checkReminders);

// Show today's real date in the page header.
const headerDate = document.querySelector(".planner-date time");
if (headerDate) {
    const today = new Date();
    headerDate.dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    headerDate.textContent = today.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

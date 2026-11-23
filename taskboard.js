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

function readCustomCategories() {
    const savedCategories = localStorage.getItem(customCategoryStorageKey);
    if (savedCategories === null) {
        return [];
    }

    const categories = JSON.parse(savedCategories);
    const ids = new Set();
    const names = new Set();
    if (!Array.isArray(categories) || categories.some(category => {
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
    })) {
        throw new Error("Saved custom categories are invalid.");
    }
    return categories;
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
    const savedTasks = localStorage.getItem(taskStorageKey);
    if (savedTasks === null) {
        return [];
    }

    const tasks = JSON.parse(savedTasks);
    if (!Array.isArray(tasks) || tasks.some(task =>
        !task ||
        typeof task.id !== "string" ||
        typeof task.title !== "string" ||
        (task.category !== undefined && !isKnownCategory(task.category)) ||
        !taskStatuses.some(status => status.key === task.status)
    )) {
        throw new Error("Saved task data is invalid.");
    }
    return tasks.map(task => ({
        ...task,
        category: task.category ?? "study"
    }));
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

            const metadata = [task.course, task.crn, task.date, task.duration, task.reminder]
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

            item.addEventListener("dragstart", event => {
                if (event.target instanceof Element && event.target.closest(".task-card__remove")) {
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

            item.append(details, removeButton);
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

function addTask(form) {
    const formData = new FormData(form);
    const task = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: String(formData.get("title")).trim(),
        course: String(formData.get("course")).trim(),
        crn: String(formData.get("crn")).trim(),
        date: String(formData.get("date")),
        duration: String(formData.get("duration")).trim(),
        reminder: String(formData.get("reminder")),
        category: localStorage.getItem(categoryStorageKey) ?? "study",
        status: "todo"
    };

    if (!task.title) {
        return;
    }
    saveTasks([...readTasks(), task]);
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
    taskForm.addEventListener("submit", event => {
        event.preventDefault();
        addTask(taskForm);
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

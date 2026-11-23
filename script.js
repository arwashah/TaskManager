let toDoTask = document.getElementById("todo-task");
let inputNewTask = document.getElementById("input-new-task");
let doneTask = document.getElementById("done-task");
let toDoTasks = [];
let doneTasks = [];
let totalTaskCounter = 0;
let taskToDoCounter = 0;
let doneTaskCounter = 0;
let percentageDone = taskToDoCounter / totalTaskCounter * 100;

inputNewTask.addEventListener("input", function(receivedInput) {
toDoTaskClone = toDoTask.cloneNode(true);
taskToDoCounter+=1
toDoTaskClone.id = `todo-task-${taskToDoCounter}`;
toDoTaskClone.setAttribute("draggable", "true");
toDoTasks.push(receivedInput.target.value);
toDoTaskClone.textContent = receivedInput.target.value;
});

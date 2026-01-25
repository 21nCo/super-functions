<script lang="ts">
  import { onMount } from "svelte";
  import { client, startSync } from "./lib/datafn";
  import { toSvelteStore } from "@datafn/svelte";

  // State
  let newTodoText = "";

  // Queries
  // Use client.table(...).signal(query)
  const todosSignal = client.table("todos").signal({
    orderBy: [{ field: "createdAt", direction: "desc" }],
  });
  
  const todos = toSvelteStore(todosSignal) as any;

  onMount(() => {
      startSync();
  });

  async function addTodo() {
    if (!newTodoText.trim()) return;
    
    await client.table("todos").mutate({
      type: "create",
      data: {
        text: newTodoText,
        completed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    
    newTodoText = "";
  }

  async function toggleTodo(todo: any) {
    await client.table("todos").mutate({
      type: "update",
      where: [{ field: "id", operator: "eq", value: todo.id }],
      data: {
        completed: !todo.completed,
        updatedAt: new Date(),
      },
    });
  }

  async function deleteTodo(todo: any) {
    await client.table("todos").mutate({
        type: "delete",
        where: [{ field: "id", operator: "eq", value: todo.id }],
    });
  }
</script>


<main>
  <h1>Todo App</h1>
  
  <div class="add-todo">
    <input 
      type="text" 
      bind:value={newTodoText} 
      placeholder="What needs to be done?" 
      on:keydown={(e) => e.key === 'Enter' && addTodo()}
    />
    <button on:click={addTodo}>Add</button>
  </div>

  <div class="todo-list">
    {#if $todos.loading }
      <p>Loading...</p>
    {:else if $todos.error}
        <p class="error">Error: {$todos.error.message}</p>
    {:else}
        {#each $todos.data || [] as todo (todo.id)}
        <div class="todo-item" class:completed={todo.completed}>
            <input 
            type="checkbox" 
            checked={todo.completed} 
            on:change={() => toggleTodo(todo)}
            />
            <span class="text">{todo.text}</span>
            <button class="delete-btn" on:click={() => deleteTodo(todo)}>×</button>
        </div>
        {/each}
    {/if}
  </div>
    
    <div class="status-bar">
        Tasks: {($todos.data || []).length}
    </div>
</main>

<style>
  main {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 2rem;
  }

  .add-todo {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  input[type="text"] {
    flex: 1;
    padding: 0.8rem;
    border-radius: 8px;
    border: 1px solid #444;
    background: #333;
    color: white;
    font-size: 1rem;
  }

  button {
    padding: 0.8rem 1.5rem;
    border-radius: 8px;
    border: none;
    background: #646cff;
    color: white;
    cursor: pointer;
    font-weight: bold;
    transition: background 0.2s;
  }

  button:hover {
    background: #535bf2;
  }

  .todo-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: left;
  }

  .todo-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #2a2a2a;
    border-radius: 8px;
    transition: opacity 0.2s;
  }

  .todo-item.completed .text {
    text-decoration: line-through;
    color: #888;
  }

  .delete-btn {
    margin-left: auto;
    background: transparent;
    color: #888;
    padding: 0.5rem;
    font-size: 1.5rem;
    line-height: 1;
  }
  
  .delete-btn:hover {
      background: rgba(255, 0, 0, 0.1);
      color: #ff4444;
  }

  .error {
      color: #ff4444;
  }
  
  .status-bar {
      margin-top: 2rem;
      color: #666;
      font-size: 0.9rem;
  }
</style>

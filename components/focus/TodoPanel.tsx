/**
 * [INPUT]: 用户名（用于 localStorage key）
 * [OUTPUT]: Shift Objectives 待办面板（增删改查 + 动画）
 * [POS]: 位于 `components/focus/TodoPanel.tsx`，被 `FocusExperience.tsx` 左侧栏消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/focus/CLAUDE.md`
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AddGlyph } from "@/components/focus/FocusGlyphs";
import { joinClasses } from "@/lib/utils";

/* ================================================================
 *  Types & Persistence
 * ================================================================ */

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

function todosKey(username: string) {
  return `nlc:focus-todos:${username}`;
}

function loadTodos(key: string): TodoItem[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TodoItem[]) : [];
  } catch {
    return [];
  }
}

function saveTodos(key: string, todos: TodoItem[]) {
  localStorage.setItem(key, JSON.stringify(todos));
}

/* ================================================================
 *  TodoItemRow
 * ================================================================ */

function TodoItemRow({
  item,
  onDelete,
  onToggle,
}: {
  item: TodoItem;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <li className="group flex items-center gap-3 py-3 text-[0.94rem]">
      <button
        aria-label={item.done ? "标记未完成" : "标记完成"}
        className={joinClasses(
          "nlc-focus-ring flex size-5 shrink-0 items-center justify-center border text-[0.65rem] transition-colors",
          item.done
            ? "border-[rgba(244,164,98,0.34)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)]"
            : "border-[rgba(244,164,98,0.48)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)]",
        )}
        onClick={onToggle}
        type="button"
      >
        {item.done ? "✓" : ""}
      </button>
      <span
        className={joinClasses(
          "min-w-0 flex-1 font-semibold tracking-[0.04em] transition-all",
          item.done
            ? "text-[rgba(247,221,197,0.38)] line-through decoration-[rgba(244,164,98,0.5)]"
            : "text-[rgba(247,221,197,0.92)]",
        )}
      >
        {item.text}
      </span>
      <button
        aria-label="删除待办"
        className="nlc-focus-ring ml-auto shrink-0 text-[rgba(247,221,197,0.28)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
        onClick={onDelete}
        type="button"
      >
        <svg aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

/* ================================================================
 *  TodoPanel
 * ================================================================ */

export default function TodoPanel({ username }: { username: string }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState("");
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const newTodoInputRef = useRef<HTMLInputElement>(null);
  const addTodoFormRef = useRef<HTMLFormElement>(null);

  const storageKey = todosKey(username);

  /* ── 加载 ── */
  useEffect(() => {
    setTodos(loadTodos(storageKey));
  }, [storageKey]);

  /* ── 点击外部关闭输入框 ── */
  useEffect(() => {
    if (!isAddingTodo) return;
    function handleClick(e: MouseEvent) {
      if (addTodoFormRef.current && !addTodoFormRef.current.contains(e.target as Node)) {
        setIsAddingTodo(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isAddingTodo]);

  /* ── 自动聚焦 ── */
  useEffect(() => {
    if (isAddingTodo) newTodoInputRef.current?.focus();
  }, [isAddingTodo]);

  const updateTodos = useCallback((next: TodoItem[]) => {
    setTodos(next);
    saveTodos(storageKey, next);
  }, [storageKey]);

  const addTodo = useCallback(() => {
    const text = newTodoText.trim();
    if (!text) return;
    const item: TodoItem = { id: crypto.randomUUID(), text, done: false };
    updateTodos([...todos, item]);
    setNewTodoText("");
    setIsAddingTodo(false);
  }, [newTodoText, todos, updateTodos]);

  const toggleTodo = useCallback((id: string) => {
    updateTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }, [todos, updateTodos]);

  const deleteTodo = useCallback((id: string) => {
    updateTodos(todos.filter((t) => t.id !== id));
  }, [todos, updateTodos]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="m-0 text-[1.2rem] font-semibold uppercase italic tracking-[0.04em] text-[#eef1f5]">
          Shift Objectives
        </h2>
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[var(--nlc-orange)]">
          Priority Alpha
        </span>
      </div>

      <ul className="mt-3 divide-y divide-[rgba(238,241,245,0.12)] border-t border-[rgba(238,241,245,0.16)]">
        {todos.map((item) => (
          <TodoItemRow
            key={item.id}
            item={item}
            onDelete={() => deleteTodo(item.id)}
            onToggle={() => toggleTodo(item.id)}
          />
        ))}
      </ul>

      {todos.length === 0 && !isAddingTodo ? (
        <p className="mt-2 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]">
          No objectives yet. Add one below.
        </p>
      ) : null}

      {isAddingTodo ? (
        <form
          ref={addTodoFormRef}
          className="mt-3 flex animate-[slideInFade_0.2s_ease-out] items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); addTodo(); }}
        >
          <input
            ref={newTodoInputRef}
            autoFocus
            className="h-8 flex-1 rounded-sm border border-[rgba(244,164,98,0.24)] bg-[rgba(5,4,3,0.62)] px-3 text-[0.88rem] text-[rgba(247,221,197,0.88)] outline-none transition placeholder:text-[rgba(247,221,197,0.3)] focus:border-[rgba(255,157,0,0.48)]"
            onChange={(e) => setNewTodoText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setIsAddingTodo(false); }}
            placeholder="Enter objective..."
            value={newTodoText}
          />
          <button
            className="nlc-focus-ring flex h-8 w-8 items-center justify-center rounded-sm border border-[rgba(244,164,98,0.3)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)] transition-colors hover:bg-[rgba(244,164,98,0.14)]"
            type="submit"
          >
            <AddGlyph />
          </button>
        </form>
      ) : (
        <button
          className="nlc-focus-ring mt-3 text-[var(--nlc-orange)] transition-colors hover:text-[rgba(255,208,165,0.95)]"
          onClick={() => setIsAddingTodo(true)}
          type="button"
        >
          <AddGlyph />
        </button>
      )}
    </div>
  );
}

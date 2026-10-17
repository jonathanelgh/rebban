"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ListTodo } from "lucide-react";

export type TaskSuggestOption = {
  id: string;
  title: string;
};

export function TaskSuggestInput({
  value,
  tasks,
  onChange,
  onSelectTask,
  placeholder = "What are you working on?",
  disabled = false,
  className = "",
  onEnter,
}: {
  value: string;
  tasks: TaskSuggestOption[];
  onChange: (value: string) => void;
  onSelectTask: (task: TaskSuggestOption) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onEnter?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimer = useRef<number | null>(null);

  const canSuggest = !disabled && tasks.length > 0;

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return tasks.slice(0, 8);
    return tasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [tasks, value]);

  const updatePosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, value, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() {
      updatePosition();
    }
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menu =
    open && canSuggest && coords
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: coords.width,
              zIndex: 80,
            }}
            className="rounded-xl border border-line bg-white shadow-[0_12px_32px_rgba(16,24,40,0.16)] overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-line flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <ListTodo className="w-3.5 h-3.5" />
              Choose task
            </div>
            {filtered.length === 0 ? (
              <p className="px-3 py-2.5 text-[12px] text-gray-400">
                No matching tasks — keep typing freely.
              </p>
            ) : (
              <ul className="max-h-48 overflow-y-auto py-1">
                {filtered.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onSelectTask(task);
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] text-gray-800 hover:bg-[#FAFBFC] truncate"
                    >
                      {task.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          if (canSuggest) setOpen(true);
        }}
        onFocus={() => {
          if (canSuggest) setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            setOpen(false);
            onEnter();
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={`w-full bg-transparent border-none outline-none text-gray-900 disabled:text-gray-700 placeholder:text-gray-400 ${className}`}
      />
      {menu}
    </div>
  );
}

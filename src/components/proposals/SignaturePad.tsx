"use client";

import React, { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

export function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onChangeRef = useRef(onChange);
  const drawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const [hasInk, setHasInk] = useState(false);

  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const ratio = window.devicePixelRatio || 1;
    const width = parent.clientWidth;
    const height = 160;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.25;

    onChangeRef.current(null);
  }, []);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function emitChange() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChangeRef.current(canvas.toDataURL("image/png"));
  }

  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const point = getPoint(event);
    lastPoint.current = point;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y + 0.01);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function moveStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastPoint.current) return;

    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
  }

  function endStroke() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    emitChange();
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.25;
    setHasInk(false);
    onChangeRef.current(null);
  }

  return (
    <div>
      <div className="relative rounded-xl border border-line bg-[#FAFBFC] overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair"
          onPointerDown={startStroke}
          onPointerMove={moveStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        />
        {!hasInk ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Draw your signature
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={disabled || !hasInk}
          onClick={clear}
          className="text-[13px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

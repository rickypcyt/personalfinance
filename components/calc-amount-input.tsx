"use client";

import { useEffect, useRef, useState } from "react";

/** Evalúa sumas/restas/multiplicaciones/divisiones simples: "4+4+12-3", "10*2,5". */
export function evalExpression(raw: string): number | null {
  const s = raw.replace(/\s+/g, "").replace(/,/g, ".").replace(/[xX×]/g, "*").replace(/÷/g, "/");
  if (!s || !/^[0-9+\-*/().]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];

  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = s[i++];
      const r = factor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function factor(): number {
    if (peek() === "-") { i++; return -factor(); }
    if (peek() === "+") { i++; return factor(); }
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
    if (!m) throw new Error("num");
    i += m[0].length;
    return parseFloat(m[0]);
  }

  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}

export function CalcAmountInput({ name = "amount", className, initial = "" }: { name?: string; className?: string; initial?: string }) {
  const [text, setText] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => setText("");
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  const value = evalExpression(text);
  const isExpr = /[+\-*/()xX×÷]/.test(text.replace(/^\s*-/, ""));
  const valid = value !== null && value > 0;

  return (
    <div className="w-full">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required
        value={text}
        placeholder="0,00"
        aria-label="Importe"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && isExpr && valid) {
            e.preventDefault();
            setText(String(value).replace(".", ","));
          }
        }}
        onBlur={() => {
          if (isExpr && valid) setText(String(value).replace(".", ","));
        }}
        ref={(el) => {
          inputRef.current = el;
          el?.setCustomValidity(valid ? "" : "Importe no válido");
        }}
        className={className}
      />
      <input type="hidden" name={name} value={valid ? String(value) : ""} />
      {isExpr && (
        <p className={`mt-1 text-xs font-medium ${valid ? "text-dim" : "text-neg"}`}>
          {valid ? `= ${String(value).replace(".", ",")}` : "Expresión no válida"}
        </p>
      )}
    </div>
  );
}

export function CalcHint() {
  return (
    <p className="text-xs text-dim">
      💡 Puedes calcular en el importe: prueba <span className="font-medium">4+4+12-3</span> o <span className="font-medium">3x3</span>
    </p>
  );
}

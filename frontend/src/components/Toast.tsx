import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  level: "info" | "alert";
}

interface ToastCtx {
  show: (t: Omit<ToastItem, "id">) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const show = useCallback<ToastCtx["show"]>((t) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, ...t }]);
    window.setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[400px] max-w-[calc(100vw-2rem)]">
        {items.map((t) => (
          <div
            key={t.id}
            className={`surface px-3.5 py-3 flex items-start gap-3 ${
              t.level === "alert" ? "border-[var(--color-accent)]" : ""
            }`}
            role="status"
          >
            <div
              className={`status-dot mt-1.5 ${
                t.level === "alert" ? "pulse-accent" : ""
              }`}
              style={{
                background:
                  t.level === "alert"
                    ? "var(--color-accent)"
                    : "var(--color-info)",
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium">{t.title}</div>
              {t.body && (
                <div className="text-mono text-[12px] text-[var(--color-text-dim)] mt-1 truncate">
                  {t.body}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm px-1"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}

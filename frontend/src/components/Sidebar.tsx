import { NavLink } from "react-router-dom";
import { useEventStream } from "../hooks/useEventStream";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";

export function Sidebar() {
  const { connectionState } = useEventStream();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  const dotColor =
    connectionState === "open"
      ? "var(--color-success)"
      : connectionState === "connecting"
        ? "var(--color-warning)"
        : "var(--color-accent)";
  const stateLabel =
    connectionState === "open"
      ? t("ws.online")
      : connectionState === "connecting"
        ? t("ws.connecting")
        : t("ws.offline");

  const links = [
    { to: "/", code: "01", labelKey: "nav.live" as const },
    { to: "/events", code: "02", labelKey: "nav.events" as const },
    { to: "/cameras", code: "03", labelKey: "nav.cameras" as const },
    { to: "/stats", code: "04", labelKey: "nav.stats" as const },
  ];

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
      <div className="px-4 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[var(--color-accent)] flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-[var(--color-on-accent)]" />
          </div>
          <div>
            <div className="text-[11px] label-mono leading-none mb-1">
              {t("brand.line1")}
            </div>
            <div className="text-[15px] font-semibold leading-none">
              {t("brand.line2")}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-3">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 text-[15px] border-l-2 transition-colors ${
                isActive
                  ? "border-[var(--color-accent)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
              }`
            }
          >
            <span className="text-mono text-[11px] text-[var(--color-text-muted)]">
              {l.code}
            </span>
            <span>{t(l.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-[var(--color-border)] flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="label-mono text-[10px]">
            {t("toggle.theme.label")}
          </span>
          <div className="seg">
            <button
              type="button"
              data-active={theme === "dark"}
              onClick={() => setTheme("dark")}
            >
              {t("toggle.theme.dark")}
            </button>
            <button
              type="button"
              data-active={theme === "light"}
              onClick={() => setTheme("light")}
            >
              {t("toggle.theme.light")}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="label-mono text-[10px]">
            {t("toggle.lang.label")}
          </span>
          <div className="seg">
            <button
              type="button"
              data-active={lang === "en"}
              onClick={() => setLang("en")}
            >
              EN
            </button>
            <button
              type="button"
              data-active={lang === "jp"}
              onClick={() => setLang("jp")}
            >
              JP
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-[var(--color-border)] flex items-center gap-2 text-[12px] label-mono">
        <span
          className="status-dot"
          style={{ background: dotColor }}
          aria-hidden
        />
        <span style={{ color: "var(--color-text-dim)" }}>{stateLabel}</span>
      </div>
    </aside>
  );
}

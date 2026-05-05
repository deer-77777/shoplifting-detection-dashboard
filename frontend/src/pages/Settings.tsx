import { useEffect, useState } from "react";
import {
  useResetSettings,
  useSettings,
  useUpdateSettings,
} from "../hooks/useSettings";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import { PageHeader } from "./Live";

interface FormState {
  conf_threshold: number;
  positive_required: number;
  positive_window: number;
  cooldown_seconds: number;
  pre_roll_seconds: number;
  post_roll_seconds: number;
}

export function SettingsPage() {
  const { data, isLoading } = useSettings();
  const update = useUpdateSettings();
  const reset = useResetSettings();
  const toast = useToast();
  const { t } = useI18n();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the form once when settings load (or after reset/save).
  useEffect(() => {
    if (data) setForm({ ...data });
  }, [data]);

  if (isLoading || !form || !data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
        <div className="surface px-4 py-8 text-center label-mono">
          {t("settings.loading")}
        </div>
      </div>
    );
  }

  const dirty =
    form.conf_threshold !== data.conf_threshold ||
    form.positive_required !== data.positive_required ||
    form.positive_window !== data.positive_window ||
    form.cooldown_seconds !== data.cooldown_seconds ||
    form.pre_roll_seconds !== data.pre_roll_seconds ||
    form.post_roll_seconds !== data.post_roll_seconds;

  const onSave = async () => {
    setError(null);
    if (form.positive_window < form.positive_required) {
      setError(t("settings.error.windowBelowRequired"));
      return;
    }
    try {
      await update.mutateAsync(form);
      toast.show({
        level: "info",
        title: t("settings.toast.saved"),
        body: t("settings.toast.savedBody"),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  };

  const onReset = async () => {
    setError(null);
    try {
      await reset.mutateAsync();
      toast.show({
        level: "info",
        title: t("settings.toast.reset"),
        body: t("settings.toast.savedBody"),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    }
  };

  const busy = update.isPending || reset.isPending;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <section className="surface p-5 flex flex-col gap-6 max-w-3xl">
        <Field
          label={t("settings.confThreshold.label")}
          hint={t("settings.confThreshold.hint")}
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.05}
              value={form.conf_threshold}
              onChange={(e) =>
                setForm({ ...form, conf_threshold: Number(e.target.value) })
              }
              className="flex-1 accent-[var(--color-accent)]"
            />
            <input
              type="number"
              min={0.05}
              max={0.95}
              step={0.05}
              value={form.conf_threshold}
              onChange={(e) =>
                setForm({ ...form, conf_threshold: Number(e.target.value) })
              }
              className="input w-24 text-right"
            />
          </div>
        </Field>

        <Field
          label={t("settings.positiveRequired.label")}
          hint={t("settings.positiveRequired.hint")}
        >
          <input
            type="number"
            min={1}
            max={20}
            value={form.positive_required}
            onChange={(e) =>
              setForm({
                ...form,
                positive_required: Math.max(1, Number(e.target.value)),
              })
            }
            className="input w-32"
          />
        </Field>

        <Field
          label={t("settings.positiveWindow.label")}
          hint={t("settings.positiveWindow.hint")}
        >
          <input
            type="number"
            min={1}
            max={50}
            value={form.positive_window}
            onChange={(e) =>
              setForm({
                ...form,
                positive_window: Math.max(1, Number(e.target.value)),
              })
            }
            className="input w-32"
          />
        </Field>

        <Field
          label={t("settings.cooldownSeconds.label")}
          hint={t("settings.cooldownSeconds.hint")}
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={600}
              value={form.cooldown_seconds}
              onChange={(e) =>
                setForm({
                  ...form,
                  cooldown_seconds: Math.max(5, Number(e.target.value)),
                })
              }
              className="input w-32"
            />
            <span className="label-mono">{t("settings.seconds")}</span>
          </div>
        </Field>

        <Field
          label={t("settings.preRollSeconds.label")}
          hint={t("settings.preRollSeconds.hint")}
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={form.pre_roll_seconds}
              onChange={(e) =>
                setForm({
                  ...form,
                  pre_roll_seconds: Math.max(1, Number(e.target.value)),
                })
              }
              className="input w-32"
            />
            <span className="label-mono">{t("settings.seconds")}</span>
          </div>
        </Field>

        <Field
          label={t("settings.postRollSeconds.label")}
          hint={t("settings.postRollSeconds.hint")}
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={60}
              value={form.post_roll_seconds}
              onChange={(e) =>
                setForm({
                  ...form,
                  post_roll_seconds: Math.max(1, Number(e.target.value)),
                })
              }
              className="input w-32"
            />
            <span className="label-mono">{t("settings.seconds")}</span>
          </div>
        </Field>

        {error && (
          <div className="text-[13px] text-[var(--color-accent)] text-mono break-words">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-border)]">
          <button
            type="button"
            className="btn btn-danger"
            onClick={onReset}
            disabled={busy}
          >
            {t("settings.action.reset")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => setForm({ ...data })}
              disabled={busy || !dirty}
            >
              {t("settings.action.discard")}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={onSave}
              disabled={busy || !dirty}
            >
              {update.isPending
                ? t("settings.action.saving")
                : t("settings.action.save")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 md:gap-6 items-start">
      <div className="flex flex-col gap-1">
        <div className="text-[15px] font-medium">{label}</div>
        <div className="label-mono">{hint}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStats } from "../hooks/useStats";
import { PageHeader } from "./Live";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";

export function StatsPage() {
  const { data, isLoading } = useStats();
  const { t } = useI18n();
  const { theme } = useTheme();

  const palette =
    theme === "dark"
      ? {
          accent: "#ff3d2e",
          grid: "#232328",
          tick: "#8e8e93",
          tooltipBg: "#16161a",
          tooltipBorder: "#232328",
          tooltipLabel: "#e5e5e7",
          tooltipCursor: "rgba(255,255,255,0.04)",
        }
      : {
          accent: "#e02d1e",
          grid: "#dcdce2",
          tick: "#52525b",
          tooltipBg: "#ffffff",
          tooltipBorder: "#d8d8de",
          tooltipLabel: "#18181b",
          tooltipCursor: "rgba(0,0,0,0.05)",
        };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("stats.title")} subtitle={t("stats.subtitle")} />

      {isLoading || !data ? (
        <div className="surface px-4 py-8 text-center label-mono">
          {t("stats.loading")}
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard label={t("stats.kpi.total")} value={data.total_events} />
            <KpiCard label={t("stats.kpi.today")} value={data.events_today} />
            <KpiCard
              label={t("stats.kpi.online")}
              value={`${data.online_cameras} / ${data.total_cameras}`}
            />
          </section>

          <section className="surface p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[16px] font-semibold">
                {t("stats.byDay.title")}
              </h2>
              <span className="label-mono">{t("stats.byDay.range")}</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.by_day.map((d) => ({
                    day: d.day.slice(5),
                    count: d.count,
                  }))}
                  margin={{ top: 4, right: 8, bottom: 4, left: -16 }}
                >
                  <CartesianGrid stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke={palette.tick}
                    tick={{ fontSize: 12, fontFamily: "IBM Plex Mono" }}
                    tickLine={false}
                    axisLine={{ stroke: palette.grid }}
                  />
                  <YAxis
                    stroke={palette.tick}
                    tick={{ fontSize: 12, fontFamily: "IBM Plex Mono" }}
                    tickLine={false}
                    axisLine={{ stroke: palette.grid }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: palette.tooltipCursor }}
                    contentStyle={{
                      background: palette.tooltipBg,
                      border: `1px solid ${palette.tooltipBorder}`,
                      borderRadius: 2,
                      fontFamily: "IBM Plex Mono",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: palette.tooltipLabel }}
                  />
                  <Bar
                    dataKey="count"
                    fill={palette.accent}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="surface p-5">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-[16px] font-semibold">
                {t("stats.byCamera.title")}
              </h2>
              <span className="label-mono">{t("stats.byCamera.range")}</span>
            </div>
            <div
              className="w-full"
              style={{
                height: Math.max(180, 36 * (data.by_camera.length || 1)),
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.by_camera.map((c) => ({
                    name: c.camera_name,
                    count: c.count,
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 16 }}
                >
                  <CartesianGrid stroke={palette.grid} horizontal={false} />
                  <XAxis
                    type="number"
                    stroke={palette.tick}
                    tick={{ fontSize: 12, fontFamily: "IBM Plex Mono" }}
                    tickLine={false}
                    axisLine={{ stroke: palette.grid }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke={palette.tick}
                    tick={{ fontSize: 13 }}
                    tickLine={false}
                    axisLine={{ stroke: palette.grid }}
                    width={160}
                  />
                  <Tooltip
                    cursor={{ fill: palette.tooltipCursor }}
                    contentStyle={{
                      background: palette.tooltipBg,
                      border: `1px solid ${palette.tooltipBorder}`,
                      borderRadius: 2,
                      fontFamily: "IBM Plex Mono",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: palette.tooltipLabel }}
                  />
                  <Bar
                    dataKey="count"
                    fill={palette.accent}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="surface px-5 py-6">
      <div className="label-mono">{label}</div>
      <div className="mt-3 text-mono text-[36px] font-semibold leading-none">
        {value}
      </div>
    </div>
  );
}

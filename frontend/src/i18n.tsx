import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

export type Lang = "en" | "jp";

const dict = {
  en: {
    // sidebar / nav
    "brand.line1": "LP / 01",
    "brand.line2": "Loss Prevention",
    "nav.live": "Live",
    "nav.events": "Events",
    "nav.cameras": "Cameras",
    "nav.stats": "Stats",
    "ws.online": "Online",
    "ws.connecting": "Connecting",
    "ws.offline": "Offline",
    "toggle.theme.dark": "Dark",
    "toggle.theme.light": "Light",
    "toggle.theme.label": "Theme",
    "toggle.lang.label": "Language",

    // pages — Live
    "live.title": "Live",
    "live.subtitle": "Real-time event feed and camera health",
    "live.recent": "Recent Events",
    "live.recent.range": "Last 20",
    "live.empty.title": "No events yet.",
    "live.empty.body": "Waiting for the first confirmed incident",

    // pages — Events
    "events.title": "Events",
    "events.subtitle": "Historical incidents archive",
    "events.filter.camera": "Camera",
    "events.filter.allCameras": "All cameras",
    "events.filter.from": "From",
    "events.filter.to": "To",
    "events.filter.reset": "Reset",
    "events.col.thumb": "Thumb",
    "events.col.started": "Started",
    "events.col.camera": "Camera",
    "events.col.track": "Track",
    "events.col.conf": "Conf",
    "events.col.duration": "Duration",
    "events.loading": "Loading…",
    "events.empty": "No events match the current filters",
    "events.page": "Page {p} · Showing {n}",
    "events.prev": "Previous",
    "events.next": "Next",

    // pages — Cameras
    "cameras.title": "Cameras",
    "cameras.subtitle": "RTSP source management",
    "cameras.add": "+ Add Camera",
    "cameras.col.status": "Status",
    "cameras.col.name": "Name",
    "cameras.col.rtsp": "RTSP",
    "cameras.col.lastSeen": "Last Seen",
    "cameras.col.enabled": "Enabled",
    "cameras.col.actions": "Actions",
    "cameras.empty": "No cameras yet — add the first one",
    "cameras.action.edit": "Edit",
    "cameras.action.delete": "Delete",
    "cameras.toggle.enabled": "Enabled",
    "cameras.toggle.disabled": "Disabled",
    "cameras.form.add.title": "Add Camera",
    "cameras.form.edit.title": "Edit Camera",
    "cameras.form.name": "Name",
    "cameras.form.namePlaceholder": "Aisle 4 ceiling",
    "cameras.form.rtsp": "RTSP URL",
    "cameras.form.rtspHint":
      "Credentials are stored as-is; the UI masks them on display.",
    "cameras.form.enabled": "Enabled",
    "cameras.form.cancel": "Cancel",
    "cameras.form.save": "Save",
    "cameras.form.submit": "Add Camera",
    "cameras.delete.title": "Delete Camera",
    "cameras.delete.confirm":
      "Delete {name}? This also removes its events and clips on disk.",

    // pages — Stats
    "stats.title": "Stats",
    "stats.subtitle": "Operational metrics",
    "stats.loading": "Loading…",
    "stats.kpi.total": "Total Events",
    "stats.kpi.today": "Events Today",
    "stats.kpi.online": "Cameras Online",
    "stats.byDay.title": "Events per Day",
    "stats.byDay.range": "Last 14 days",
    "stats.byCamera.title": "Events per Camera",
    "stats.byCamera.range": "All-time",

    // strip
    "strip.loading": "Loading cameras…",
    "strip.empty": "No cameras configured — add one on the Cameras tab",

    // statuses
    "status.offline": "Offline",
    "status.connecting": "Connecting",
    "status.online": "Online",
    "status.error": "Error",

    // alert banner
    "alert.label": "Alert",
    "alert.title": "Confirmed incident — {camera}",
    "alert.unknownCamera": "Unknown camera",
    "alert.dismiss": "Dismiss",

    // event card / detail
    "event.unknownCamera": "Unknown camera",
    "event.title": "Event",
    "event.loading": "Loading…",
    "event.field.eventId": "Event ID",
    "event.field.camera": "Camera",
    "event.field.trackId": "Track ID",
    "event.field.peakConf": "Peak Confidence",
    "event.field.startedAt": "Started At",
    "event.field.endedAt": "Ended At",
    "event.field.trajectory": "Trajectory",
    "event.field.created": "Created",
    "event.trajectorySamples": "{n} samples",

    // toast
    "toast.incident.title": "Incident — {camera}",
    "toast.incident.body": "Track #{id} · Conf {conf}",
    "toast.unknownCamera": "camera",
  },
  jp: {
    "brand.line1": "LP / 01",
    "brand.line2": "万引き検知",
    "nav.live": "ライブ",
    "nav.events": "イベント",
    "nav.cameras": "カメラ",
    "nav.stats": "統計",
    "ws.online": "接続中",
    "ws.connecting": "接続中…",
    "ws.offline": "切断",
    "toggle.theme.dark": "ダーク",
    "toggle.theme.light": "ライト",
    "toggle.theme.label": "テーマ",
    "toggle.lang.label": "言語",

    "live.title": "ライブ",
    "live.subtitle": "リアルタイムイベントとカメラ状況",
    "live.recent": "最新イベント",
    "live.recent.range": "最新20件",
    "live.empty.title": "イベントはまだありません。",
    "live.empty.body": "最初の検知を待機中…",

    "events.title": "イベント",
    "events.subtitle": "過去の事案アーカイブ",
    "events.filter.camera": "カメラ",
    "events.filter.allCameras": "すべて",
    "events.filter.from": "開始",
    "events.filter.to": "終了",
    "events.filter.reset": "リセット",
    "events.col.thumb": "画像",
    "events.col.started": "開始時刻",
    "events.col.camera": "カメラ",
    "events.col.track": "トラック",
    "events.col.conf": "信頼度",
    "events.col.duration": "長さ",
    "events.loading": "読み込み中…",
    "events.empty": "条件に一致するイベントはありません",
    "events.page": "ページ {p} · 表示 {n} 件",
    "events.prev": "前へ",
    "events.next": "次へ",

    "cameras.title": "カメラ",
    "cameras.subtitle": "RTSPソース管理",
    "cameras.add": "+ カメラを追加",
    "cameras.col.status": "状態",
    "cameras.col.name": "名前",
    "cameras.col.rtsp": "RTSP",
    "cameras.col.lastSeen": "最終接続",
    "cameras.col.enabled": "有効",
    "cameras.col.actions": "操作",
    "cameras.empty": "カメラが未登録です — 最初の1台を追加してください",
    "cameras.action.edit": "編集",
    "cameras.action.delete": "削除",
    "cameras.toggle.enabled": "有効",
    "cameras.toggle.disabled": "無効",
    "cameras.form.add.title": "カメラを追加",
    "cameras.form.edit.title": "カメラを編集",
    "cameras.form.name": "名前",
    "cameras.form.namePlaceholder": "通路4 天井",
    "cameras.form.rtsp": "RTSP URL",
    "cameras.form.rtspHint":
      "認証情報はそのまま保存され、表示時のみマスクされます",
    "cameras.form.enabled": "有効",
    "cameras.form.cancel": "キャンセル",
    "cameras.form.save": "保存",
    "cameras.form.submit": "カメラを追加",
    "cameras.delete.title": "カメラを削除",
    "cameras.delete.confirm":
      "{name} を削除しますか？関連するイベントとクリップもすべて削除されます。",

    "stats.title": "統計",
    "stats.subtitle": "運用指標",
    "stats.loading": "読み込み中…",
    "stats.kpi.total": "イベント総数",
    "stats.kpi.today": "本日のイベント",
    "stats.kpi.online": "稼働中カメラ",
    "stats.byDay.title": "日別イベント数",
    "stats.byDay.range": "過去14日",
    "stats.byCamera.title": "カメラ別イベント数",
    "stats.byCamera.range": "全期間",

    "strip.loading": "カメラを読み込み中…",
    "strip.empty":
      "カメラが未登録です — Cameras タブで追加してください",

    "status.offline": "切断",
    "status.connecting": "接続中",
    "status.online": "接続中",
    "status.error": "エラー",

    "alert.label": "警告",
    "alert.title": "事案を検出 — {camera}",
    "alert.unknownCamera": "不明なカメラ",
    "alert.dismiss": "閉じる",

    "event.unknownCamera": "不明なカメラ",
    "event.title": "イベント",
    "event.loading": "読み込み中…",
    "event.field.eventId": "イベントID",
    "event.field.camera": "カメラ",
    "event.field.trackId": "トラックID",
    "event.field.peakConf": "最大信頼度",
    "event.field.startedAt": "開始時刻",
    "event.field.endedAt": "終了時刻",
    "event.field.trajectory": "軌跡",
    "event.field.created": "作成日時",
    "event.trajectorySamples": "{n} サンプル",

    "toast.incident.title": "事案検出 — {camera}",
    "toast.incident.body": "トラック#{id} · 信頼度 {conf}",
    "toast.unknownCamera": "カメラ",
  },
} as const satisfies Record<Lang, Record<string, string>>;

type DictKey = keyof (typeof dict)["en"];

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

const STORAGE_KEY = "lp.lang";

function readInitial(): Lang {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "jp" ? "jp" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial);

  useEffect(() => {
    document.documentElement.lang = lang === "jp" ? "ja" : "en";
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const t = useCallback<I18nCtx["t"]>(
    (key, vars) => {
      const table = dict[lang] as Record<string, string>;
      const fallback = dict.en as Record<string, string>;
      let s = table[key] ?? fallback[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [lang],
  );

  const value = useMemo<I18nCtx>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("LanguageProvider missing");
  return ctx;
}

import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
// SVG — для обычного UI
import gradeSSSilver from "./assets/grades/ss_silver.svg";
import gradeSS from "./assets/grades/ss.svg";
import gradeSSilver from "./assets/grades/s_silver.svg";
import gradeS from "./assets/grades/s.svg";
import gradeA from "./assets/grades/a.svg";

// PNG — ТОЛЬКО для скриншота
// PNG — ТОЛЬКО для скриншота
import gradeSSSilverPng from "./assets/grades/ss_silver.png";
import gradeSSPng from "./assets/grades/ss.png";
import gradeSSilverPng from "./assets/grades/s_silver.png";
import gradeSPng from "./assets/grades/s.png";
import gradeAPng from "./assets/grades/a.png";
import { webApi } from "./webApi";
import html2canvas from "html2canvas";


type ScoreItem = {
  artist: string;
  title: string;
  difficulty: string;
  rank: string | null;
  accuracy: number | null;
  pp: number | null;

  mods?: string[]; // ? NEW

  beatmapUrl: string;
  beatmapId: number | null;
  createdAt: string | null;
};

type Report = {
  id: string;
  createdAt: string;
  title: string;
  userId: string;
  mode: "osu" | "mania";
  username: string;
  avatarUrl: string;
  stats: {
    globalRank: number | null;
    countryRank: number | null;
    pp: number | null;
    accuracy: number | null;
    playcount: number | null;
    rankedScore: number | null;
    totalScore: number | null;
    totalHits: number | null;
    maximumCombo: number | null;
    replaysWatchedByOthers: number | null;
    grades: { ss: number | null; ssh: number | null; s: number | null; sh: number | null; a: number | null };
  };

  bestScores?: ScoreItem[];
  firstScores?: ScoreItem[];
};

function fmtInt(n: number | null) {
  if (n === null || n === undefined) return "�";
  return new Intl.NumberFormat("ru-RU").format(n);
}
function fmtPct(n: number | null) {
  if (n === null || n === undefined) return "�";
  return `${n.toFixed(2)}%`;
}

function fmtSignedInt(n: number | null) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

function fmtSignedPct(n: number | null) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(2) + "%";
}

function diffClass(d: number | null) {
  if (d == null) return "";
  if (d > 0) return "diffUp";
  if (d < 0) return "diffDown";
  return "diffEq";
}

function diffArrow(d: number | null) {
  if (d == null) return "";
  if (d > 0) return "↑";
  if (d < 0) return "↓";
  return "→";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

function fmtMode(mode: "osu" | "mania") {
  if (mode === "osu") return "osu!";
  return "osu!mania";
}

function fmtDiffDaysHours(fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();

  const diffMs = Math.abs(to - from);
  const totalHours = Math.floor(diffMs / 36e5); // 36e5 = 60*60*1000

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  const dWord = days === 1 ? "day" : "days";
  const hWord = hours === 1 ? "hour" : "hours";

  if (days > 0 && hours > 0) return `${days} ${dWord} ${hours} ${hWord}`;
  if (days > 0) return `${days} ${dWord}`;
  return `${hours} ${hWord}`;
}

function progressText(fromIso?: string | null, toIso?: string | null) {
  if (!fromIso || !toIso) return null;

  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();

  // если RESULT старее SOURCE (сравнение "назад") — не "progress"
  if (to < from) return "That’s the difference :)";

  const span = fmtDiffDaysHours(fromIso, toIso);
  return `Progress in ${span}`;
}

function fmtAcc01(n: number | null) {
  if (n == null) return "�";
  return `${(n * 100).toFixed(2)}%`;
}
function fmtAgo(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
function openExternal(url: string) {
  try {
    window.open(url, "_blank");
  } catch {
    // ignore
  }
}

type PlayerProfile = {
  id: number;
  username: string;
  avatarUrl: string;
};

const api = (window as any).api ?? webApi;

export default function App() {
  const [mode, setMode] = useState<"mania" | "osu">("mania");
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [profilesClosing, setProfilesClosing] = useState(false);
  const [profileLink, setProfileLink] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [shotAskOpen, setShotAskOpen] = useState(false);

  async function refresh(osuUserId?: number | null) {
    // если профиль не выбран — просто пусто
    if (!osuUserId) {
      setReports([]);
      return;
    }

    // ✅ тянем через api, чтобы deviceId совпадал (LS_DEVICE)
    const all = (await api.listReports()) as Report[];

    // оставляем только текущий профиль
    const list = (Array.isArray(all) ? all : [])
      .filter((r) => String(r.userId) === String(osuUserId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setReports(list);
  }

  useEffect(() => {
    refresh(selectedProfileId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId, mode]);

  useEffect(() => {
    (async () => {
      try {
        const state = await api.profilesGet();
        // state: { profiles: [{id, username, avatarUrl}], selectedId: string|null }

        const list = (state?.profiles ?? []).map((p: any) => ({
          id: Number(p.id),
          username: p.username,
          avatarUrl: p.avatarUrl,
        })) as PlayerProfile[];

        setProfiles(list);

        const sel = state?.selectedId ? Number(state.selectedId) : null;
        const validSel = sel && list.some((p) => p.id === sel) ? sel : null;
        setSelectedProfileId(validSel);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const visibleReports = useMemo(() => {
    const byMode = reports.filter((r) => (r.mode ?? "mania") === mode);

    if (selectedProfileId == null) return [];

    const pid = String(selectedProfileId);
    return byMode.filter((r) => String(r.userId) === pid);
  }, [reports, mode, selectedProfileId]);

  useEffect(() => {
    if (selectedId && !visibleReports.some((r) => r.id === selectedId)) {
      setSelectedId(visibleReports[0]?.id ?? null);
      setOpenId(null);
    }
    if (!selectedId && visibleReports.length) setSelectedId(visibleReports[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reports, selectedProfileId]);

  const source = useMemo(
    () => (sourceId ? visibleReports.find((r) => r.id === sourceId) ?? null : null),
    [visibleReports, sourceId]
  );

  const result = useMemo(
    () => (resultId ? visibleReports.find((r) => r.id === resultId) ?? null : null),
    [visibleReports, resultId]
  );

  // что показываем в превью:
  // - если showChanges ON -> показываем result
  // - если OFF -> как раньше selected/open
  const selected = useMemo(() => {
    if (showChanges) return result;
    return visibleReports.find((r) => r.id === (openId ?? selectedId)) ?? null;
  }, [showChanges, result, visibleReports, selectedId, openId]);

  // какой репорт реально открыт в модалке
  const openReport = useMemo(() => {
    if (!openId) return null;
    return visibleReports.find((r) => r.id === openId) ?? null;
  }, [openId, visibleReports]);

  // показывать дельты в модалке только если:
  // - comparison on
  // - source выбран
  // - result выбран
  // - и открыта именно RESULT (а не SOURCE)
  const showModalDiffs = !!(
    showChanges &&
    source &&
    resultId &&
    openReport &&
    openReport.id === resultId
  );

  async function onAddProfile() {
    setProfileError(null);

    try {
      const state = await api.profilesAddByUrl(profileLink);

      const list = (state?.profiles ?? []).map((p: any) => ({
        id: Number(p.id),
        username: p.username,
        avatarUrl: p.avatarUrl,
      })) as PlayerProfile[];

      setProfiles(list);

      const sel = state?.selectedId ? Number(state.selectedId) : null;
      const validSel = sel && list.some((p) => p.id === sel) ? sel : null;
      setSelectedProfileId(validSel);

      setSelectedId(null);
      setProfileLink("");
    } catch (e: any) {
      setProfileError(e?.message ? String(e.message) : String(e));
    }
  }

  async function onRemoveProfile(id: number) {
    try {
      const state = await api.profilesRemove(String(id));

      const list = (state?.profiles ?? []).map((p: any) => ({
        id: Number(p.id),
        username: p.username,
        avatarUrl: p.avatarUrl,
      })) as PlayerProfile[];

      setProfiles(list);

      const sel = state?.selectedId ? Number(state.selectedId) : null;
      const validSel = sel && list.some((p) => p.id === sel) ? sel : null;
      setSelectedProfileId(validSel);

      setSelectedId(null);
    } catch (e) {
      console.error(e);
    }
  }

  const WORKER_BASE = (import.meta as any).env?.VITE_WORKER_BASE || "";
  // пример потом: VITE_WORKER_BASE="https://xxx.yyy.workers.dev"
  const API_BASE = WORKER_BASE ? String(WORKER_BASE).replace(/\/$/, "") : "";

  async function workerJson(path: string, init?: RequestInit) {
    if (!API_BASE) throw new Error("VITE_WORKER_BASE is empty");

    const resp = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "Content-Type": "application/json",
      },
    });

    const text = await resp.text().catch(() => "");
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!resp.ok) {
      const msg =
        (data && (data.error || data.message)) ? String(data.error || data.message) :
          `HTTP ${resp.status}`;
      throw new Error(msg);
    }

    return data;
  }

  function toIsoFromCreatedAt(v: any) {
    // D1 может вернуть number, string, string с ".0"
    const n = typeof v === "number" ? v : Number(String(v).replace(/\.0$/, ""));
    if (!Number.isFinite(n)) return new Date().toISOString();
    return new Date(n).toISOString();
  }

  const IMG_PROXY = WORKER_BASE
    ? `${String(WORKER_BASE).replace(/\/$/, "")}/img?url=`
    : "/img?url="; // если вдруг воркер на том же домене (редко)


  const GRADE_PNG_BY_KEY: Record<"ssh" | "ss" | "sh" | "s" | "a", string> = {
    ssh: gradeSSSilverPng,
    ss: gradeSSPng,
    sh: gradeSSilverPng,
    s: gradeSPng,
    a: gradeAPng,
  };

  async function doModalScreenshot() {
    const content = modalRef.current;
    if (!content) return;

    const modal = content.closest(".modal") as HTMLElement | null;
    if (!modal) return;



    // 1) создаём невидимую "студию"
    const wrap = document.createElement("div");
    wrap.className = "sshotWrap";
    document.body.appendChild(wrap);

    // 2) клонируем модалку целиком (ВАЖНО: не content)
    const clone = modal.cloneNode(true) as HTMLElement;

    // 3) фикс: внутри клона не должно быть анимаций/трансформаций
    clone.style.animation = "none";
    clone.style.transform = "none";
    clone.style.opacity = "1";

    wrap.appendChild(clone);

    // --- SWITCH GRADES TO PNG FOR SCREENSHOT (clone only) ---
    const gradeImgs = Array.from(
      clone.querySelectorAll("img.gradeImg")
    ) as HTMLImageElement[];

    gradeImgs.forEach((img) => {
      const key = img.getAttribute("data-grade") as ("ssh" | "ss" | "sh" | "s" | "a" | null);
      if (!key) return;

      const png = GRADE_PNG_BY_KEY[key];
      if (!png) return;

      img.dataset.svgSrc = img.src; // запоминаем что было
      img.src = png;                // ставим png
    });


    const liveGrade = modal.querySelector("img.gradeImg") as HTMLImageElement | null;
    const rect = liveGrade?.getBoundingClientRect();

    const gw = rect ? Math.round(rect.width) : 46;
    const gh = rect ? Math.round(rect.height) : 23;

    // scale — только качество PNG, не размер элементов
    const scale = Math.max(2, Math.round(window.devicePixelRatio || 2));


    function forceGradeSize(root: HTMLElement, gw: number, gh: number) {
      root.querySelectorAll("img.gradeImg").forEach((img) => {
        const el = img as HTMLImageElement;

        // убираем эффекты, которые html2canvas часто корявит
        el.style.filter = "none";
        el.style.transform = "none";

        // фиксируем размер максимально жёстко
        el.style.width = `${gw}px`;
        el.style.height = `${gh}px`;
        el.style.minWidth = `${gw}px`;
        el.style.minHeight = `${gh}px`;
        el.style.maxWidth = `${gw}px`;
        el.style.maxHeight = `${gh}px`;

        el.style.display = "block";
        el.style.objectFit = "contain";
        el.style.objectPosition = "center";
        el.style.flex = "0 0 auto";

        el.setAttribute("width", String(gw));
        el.setAttribute("height", String(gh));

        (el as any).width = gw;
        (el as any).height = gh;
      });
    }
    forceGradeSize(clone, gw, gh);

    // 4) инлайним все <img> в клоне (чтобы CORS/рендер не ломался)
    async function imgToDataURL(url: string) {

      const proxied = IMG_PROXY + encodeURIComponent(url);
      const resp = await fetch(proxied, { cache: "no-store" });
      if (!resp.ok) throw new Error(`proxy fetch failed: ${resp.status}`);
      const blob = await resp.blob();

      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }

    const imgs = Array.from(clone.querySelectorAll("img")) as HTMLImageElement[];
    await Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute("src") || img.currentSrc || img.src;
        if (!src || src.startsWith("data:")) return;

        // ✅ ЛОКАЛЬНЫЕ КАРТИНКИ НЕ ТРОГАЕМ (Vite assets)
        if (src.includes("/assets/") || src.startsWith("/") || src.startsWith("./") || src.startsWith("../")) {
          return;
        }

        try {
          img.crossOrigin = "anonymous";
          const dataUrl = await imgToDataURL(src);
          img.src = dataUrl;
        } catch {
          // оставляем как есть
        }
      })
    );

    // 5) ждём декодирование картинок (особенно svg)
    await Promise.all(
      imgs.map(async (img) => {
        if ((img as any).decode) {
          try { await (img as any).decode(); } catch { }
        }
      })
    );

    forceGradeSize(clone, gw, gh);

    // 6) делаем канвас с прозрачным фоном вокруг
    const canvas = await html2canvas(clone, {
      backgroundColor: null,
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 15000,
    });

    // --- RESTORE SVG AFTER SCREENSHOT ---
    gradeImgs.forEach((img) => {
      const orig = img.dataset.svgSrc;
      if (orig) {
        img.src = orig;
        delete img.dataset.svgSrc;
      }
    });

    // 7) чистим студию
    wrap.remove();

    // 8) сохраняем
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/png")
    );
    if (!blob) return;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `osu-count-modal-${stamp}.png`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openProfiles() {
    setProfilesClosing(false);
    setProfilesOpen(true);
  }

  function closeProfiles() {
    setProfilesClosing(true);

    // ВАЖНО: время должно совпадать с CSS (я дам 160ms)
    window.setTimeout(() => {
      setProfilesOpen(false);
      setProfilesClosing(false);
    }, 160);
  }

  async function onCreate() {
    try {
      setLoading(true);

      if (selectedProfileId == null) {
        alert("Select profile first");
        return;
      }

      // ✅ createReport сам: тянет user/scores и сохраняет в D1
      const savedReport = (await api.createReport({
        mode,
        userId: String(selectedProfileId),
      })) as Report;

      // ✅ обновляем список и открываем то, что создали
      await refresh(selectedProfileId);

      setSelectedId(String(savedReport.id));
      setOpenId(String(savedReport.id));
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!selectedId) return;
    const ok = confirm("Delete selected report?");
    if (!ok) return;

    await api.deleteReport(selectedId);

    const all = (await api.listReports()) as Report[];
    setReports(all);

    setSelectedId(null);
    setOpenId(null);
  }

  function ScoresBlock({ title, items }: { title: string; items?: ScoreItem[] }) {
    const list = items ?? [];
    if (!list.length) return null;

    const MOD_NAMES: Record<string, string> = {
      // Difficulty reduction
      EZ: "Easy",
      NF: "No Fail",
      HT: "Half Time",

      // Difficulty increase
      HR: "Hard Rock",
      SD: "Sudden Death",
      PF: "Perfect",
      DT: "Double Time",
      NC: "Nightcore",
      HD: "Hidden",
      FI: "Fade In",
      FL: "Flashlight",

      // Special
      RL: "Relax",        // �����: RL (� �� RX)   [oai_citation:1�osu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
      AP: "Autopilot",
      SO: "Spun Out",

      // Mania special
      MR: "Mirror",
      RD: "Random",
      CP: "Co-op",        // �����: CP (� �� CO)   [oai_citation:2�osu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)

      // Other
      TD: "Touch Device",
      AT: "Auto",
      CM: "Cinema",       // �����: CM (� �� CN)   [oai_citation:3�osu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
      SV2: "ScoreV2",
      TP: "Target Practice", // legacy/experimental  [oai_citation:4�osu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
    };

    // ������������ ����, ��� ����� ��������� ��� ������
    function normalizeMod(raw: string) {
      let code = String(raw ?? "").trim().toUpperCase();

      // ���� ����� ��������� "K4" -> "4K" (�� ��� ��� � ��������)
      const m = code.match(/^K(\d+)$/);
      if (m) code = `${m[1]}K`;

      // �����: 1K..9K
      if (/^\dK$/.test(code)) return code;

      // ��������� ������ "�����" ������� �� ���������/������ ���:
      if (code === "RX") code = "RL";   // ������ ����� RX, �� ��� � RL  [oai_citation:5�osu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
      if (code === "CN") code = "CM";   // ������ CN, �� ��� � CM  [oai_citation:6�osu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
      if (code === "CO") code = "CP";   // ������ CO, �� ��� � CP  [oai_citation:7�osu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)

      return code;
    }

    // ��� ��� �������
    function modFullName(code: string) {
      if (/^\dK$/.test(code)) return `${code[0]} Keys`; // 4K => 4 Keys
      return MOD_NAMES[code] ?? code; // �������
    }

    const rankImg = (rankRaw: string | null) => {
      const r = (rankRaw ?? "").toUpperCase();

      const map: Record<string, string> = {
        XH: "https://osu.ppy.sh/assets/images/GradeSmall-SS-Silver.6681366c.svg",
        X: "https://osu.ppy.sh/assets/images/GradeSmall-SS.a21de890.svg",
        SH: "https://osu.ppy.sh/assets/images/GradeSmall-S-Silver.811ae28c.svg",
        S: "https://osu.ppy.sh/assets/images/GradeSmall-S.3b4498a9.svg",
        A: "https://osu.ppy.sh/assets/images/GradeSmall-A.d785e824.svg",
        B: "https://osu.ppy.sh/assets/images/GradeSmall-B.e19fc91b.svg",
        C: "https://osu.ppy.sh/assets/images/GradeSmall-C.6bb75adc.svg",
        D: "https://osu.ppy.sh/assets/images/GradeSmall-D.6b170c4c.svg",
        // F � ��� ������, ����� ������� ������� ����
      };

      return map[r] ?? null;
    };

    const rankLabel = (rankRaw: string | null) => {
      const r = (rankRaw ?? "").toUpperCase();
      if (!r) return "�";
      // osu ������ ����� ������ X/XH, �� ������� ��� ����
      return r;
    };

    return (
      <div className="scoresBlock">
        <div className="scoresTitle">{title}</div>

        <div className="scoresList">
          {list.map((s, idx) => {
            const img = rankImg(s.rank);
            const label = rankLabel(s.rank);

            return (
              <button
                key={`${s.beatmapId ?? "x"}-${idx}`}
                className="scoreItem"
                type="button"
                onClick={() => openExternal(s.beatmapUrl)}
                title="Open beatmap"
              >
                <div className="scoreRank">
                  {img ? (
                    <img className="scoreRankImg" src={img} alt={label} />
                  ) : (
                    <span className="scoreRankText">{label}</span>
                  )}
                </div>

                <div className="scoreMain">
                  <div className="scoreSong">
                    <span className="scoreSongTitle">{s.title}</span>
                    <span className="scoreSongArtist">
                      <span className="scoreSep"> - </span>
                      {s.artist}
                    </span>
                  </div>

                  <div className="scoreDiff">
                    <span className="scoreDiffText">{s.difficulty}</span>

                    {s.mods && s.mods.length > 0 ? (
                      <span className="scoreMods">
                        {s.mods
                          .map(normalizeMod)
                          .filter(Boolean)
                          .map((code) => {
                            const full = modFullName(code);
                            return (
                              <span
                                key={code}
                                className="modChip"
                                data-tip={full}
                                aria-label={full}
                              >
                                {code}
                              </span>
                            );
                          })}
                      </span>
                    ) : null}

                    {s.createdAt ? (
                      <>
                        <span className="scoreSep"></span>
                        <span className="scoreAgo">{fmtAgo(s.createdAt)}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="scoreRight">
                  <div className="scoreAcc">{fmtAcc01(s.accuracy)}</div>
                  <div className="scorePp">{s.pp != null ? `${Math.round(s.pp)}pp` : "�"}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function StatTile(props: {
    label: string;
    value: number | null;
    base?: number | null;

    kind?: "int" | "pct" | "rank";
    showDiff?: boolean;
  }) {
    const { label, value, base = null, kind = "int", showDiff = false } = props;

    const canDiff = showDiff && base != null && value != null;

    // 1) честная дельта (то что показываем цифрами)
    const rawDelta = canDiff ? value - base : null;

    // 2) дельта для цвета/стрелки (для rank инвертируем)
    const uiDelta =
      kind === "rank" && rawDelta != null ? -rawDelta : rawDelta;

    const cls = canDiff ? diffClass(uiDelta) : "";
    const arrow = canDiff ? diffArrow(uiDelta) : "";

    // цифра дельты: всегда от rawDelta (без инверта!)
    const delta =
      kind === "pct" ? fmtSignedPct(rawDelta) : fmtSignedInt(rawDelta);
    const main =
      kind === "pct"
        ? fmtPct(value)
        : kind === "rank"
          ? `#${fmtInt(value)}`
          : fmtInt(value);

    return (
      <div className="stat">
        <div className="k">{label}</div>

        <div className={["v", cls].join(" ")}>
          {main}
          {canDiff ? (
            <span className="diffMark">
              {arrow} {delta}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  function GradeChip(props: {
    img: string;
    alt: string;
    value: number | null;
    base?: number | null;
    showDiff?: boolean;
    gradeKey: "ssh" | "ss" | "sh" | "s" | "a";
  }) {
    const { img, alt, value, base = null, showDiff = false, gradeKey } = props;

    const v = value ?? 0;
    const canDiff = showDiff;
    const d = canDiff ? v - (base ?? 0) : null;

    return (
      <div className="grade">
        <img className="gradeImg" data-grade={gradeKey} src={img} alt={alt} />
        <div className={["gradeNum", canDiff ? diffClass(d) : ""].join(" ")}>
          {v}
          {canDiff ? (
            <span className="diffMark">
              {diffArrow(d)} {fmtSignedInt(d)}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div>
            <div className="title">osu!count</div>
            <div className="subtitle">reports</div>
          </div>
        </div>

        <div className="actions">
          <div className="profilesBlock">
            <div className="profileSelectWrap">
              <select
                className="profileSelect"
                value={selectedProfileId ?? ""}
                onChange={async (e) => {
                  const v = e.target.value;
                  const idNum = v === "" ? null : Number(v);

                  setSelectedProfileId(idNum);
                  setSelectedId(null);

                  // ��������� ����� � main.ts (profiles.json)
                  if (idNum != null) {
                    try {
                      await api.profilesSelect(String(idNum));
                    } catch (err) {
                      console.error(err);
                    }
                  }
                }}
              >
                <option value="" disabled>
                  Select profile
                </option>

                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.username}
                  </option>
                ))}
              </select>

              <div className="profileSelectChevron" />
            </div>

            <button
              className="gearBtn"
              type="button"
              onClick={openProfiles}
              aria-label="Profiles"
              title="Profiles"
            >
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
            </button>
          </div>

          <div className="changesSwitch">
            <span className={`modeLabel ${showChanges ? "on" : ""}`}>comparison</span>
            <button
              className={`iosSwitch ${showChanges ? "on" : ""}`}
              onClick={() => {
                setShowChanges((v) => {
                  const next = !v;
                  // при выключении сбрасываем выбор
                  if (!next) {
                    setSourceId(null);
                    setResultId(null);
                  }
                  return next;
                });
              }}
              type="button"
              aria-label="Show changes"
            >
              <span className="knob" />
            </button>
          </div>

          <div className="modeSwitch">
            <span className={`modeLabel ${mode === "osu" ? "on" : ""}`}>osu</span>
            <button
              className={`iosSwitch ${mode === "mania" ? "on" : ""}`}
              onClick={() => setMode((m) => (m === "mania" ? "osu" : "mania"))}
              type="button"
              aria-label="Switch mode"
            >
              <span className="knob" />
            </button>
            <span className={`modeLabel ${mode === "mania" ? "on" : ""}`}>mania</span>
          </div>

          <button className="btn primary" onClick={onCreate} disabled={loading}>
            {loading ? "Creating..." : "Create report"}
          </button>
          <button className="btn danger" onClick={onDelete} disabled={!selectedId || loading}>
            Delete
          </button>
        </div>
      </div>

      <div className="content">
        <div className="list">
          <div className="listHeader">Reports ({fmtMode(mode)})</div>

          <div className="listBody">
            <div className="listBodyScroll">
              {visibleReports.length === 0 && <div className="empty">Empty. Click "Create report".</div>}

              {visibleReports.map((r) => (
                <button
                  key={r.id}
                  className={[
                    "row",
                    !showChanges && r.id === selectedId ? "active" : "",
                    showChanges && r.id === sourceId ? "activeSource" : "",
                    showChanges && r.id === resultId ? "activeResult" : "",
                  ].join(" ")}
                  onClick={() => {
                    if (!showChanges) {
                      setSelectedId(r.id);
                      return;
                    }

                    // режим сравнения
                    if (!sourceId || (sourceId && resultId)) {
                      // начинаем новый выбор
                      setSourceId(r.id);
                      setResultId(null);
                      return;
                    }

                    // source уже выбран, выбираем result
                    if (r.id === sourceId) return; // не даём выбрать тот же
                    setResultId(r.id);
                  }}
                  type="button"
                >
                  <div className="rowMain">
                    <img className="rowAvatar" src={r.avatarUrl} alt="" />
                    <div className="rowText">
                      <div className="rowTitle">
                        <span className="rowTitleText">{r.title}</span>

                        <span className="rowTitleBadges">
                          {showChanges && r.id === sourceId ? (
                            <span className="badge source">BEFORE</span>
                          ) : null}

                          {showChanges && r.id === resultId ? (
                            <span className="badge result">AFTER</span>
                          ) : null}
                        </span>
                      </div>

                      <div className="rowMeta">{fmtDate(r.createdAt)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="preview">
          <div className="previewHeader">Preview</div>

          <div className="previewBody">
            <div className="card">
              {!selected ? (
                <div className="previewEmpty">
                  {showChanges
                    ? !source
                      ? "Pick SOURCE report on the left"
                      : !resultId
                        ? "Pick RESULT report on the left"
                        : "Pick RESULT report on the left"
                    : "Select a report on the left"}
                </div>
              ) : (
                <>
                  <div className="cardTop">
                    <div className="cardTopLeft">
                      <div>
                        <div className="cardTitle">{selected.title}</div>
                        <div className="cardSub">
                          {fmtDate(selected.createdAt)} · {fmtMode(selected.mode)}
                        </div>
                      </div>
                    </div>
                    <div className="cardTopMid">
                      {showChanges ? (() => {
                        const txt = progressText(source?.createdAt, selected?.createdAt);
                        return txt ? <div className="progressChip">{txt}</div> : null;
                      })() : null}
                    </div>


                    <button className="btn ghost" onClick={() => setOpenId(selected.id)}>
                      Open
                    </button>
                  </div>

                  <div className="grid">
                    <StatTile
                      label="World rank"
                      kind="rank"
                      value={selected.stats.globalRank}
                      base={source?.stats.globalRank ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />
                    <StatTile
                      label="Country rank"
                      kind="rank"
                      value={selected.stats.countryRank}
                      base={source?.stats.countryRank ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />

                    <StatTile
                      label="PP"
                      value={selected.stats.pp}
                      base={source?.stats.pp ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />
                    <StatTile
                      label="Accuracy"
                      kind="pct"
                      value={selected.stats.accuracy}
                      base={source?.stats.accuracy ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />

                    <StatTile
                      label="Playcount"
                      value={selected.stats.playcount}
                      base={source?.stats.playcount ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />
                    <StatTile
                      label="Ranked score"
                      value={selected.stats.rankedScore}
                      base={source?.stats.rankedScore ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />
                    <StatTile
                      label="Total score"
                      value={selected.stats.totalScore}
                      base={source?.stats.totalScore ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />
                    <StatTile
                      label="Total hits"
                      value={selected.stats.totalHits}
                      base={source?.stats.totalHits ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />
                    <StatTile
                      label="Max combo"
                      value={selected.stats.maximumCombo}
                      base={source?.stats.maximumCombo ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />
                    <StatTile
                      label="Replays watched"
                      value={selected.stats.replaysWatchedByOthers}
                      base={source?.stats.replaysWatchedByOthers ?? null}
                      showDiff={!!(showChanges && source && resultId)}
                    />

                    <div className="stat wide">
                      <div className="k">Grades</div>

                      <div className="grades">
                        <GradeChip
                          gradeKey="ssh"
                          img={gradeSSSilver}
                          alt="SS Silver"
                          value={selected.stats.grades.ssh}
                          base={source?.stats.grades.ssh ?? null}
                          showDiff={!!(showChanges && source && resultId)}
                        />

                        <GradeChip
                          gradeKey="ss"
                          img={gradeSS}
                          alt="SS"
                          value={selected.stats.grades.ss}
                          base={source?.stats.grades.ss ?? null}
                          showDiff={!!(showChanges && source && resultId)}
                        />

                        <GradeChip
                          gradeKey="sh"
                          img={gradeSSilver}
                          alt="S Silver"
                          value={selected.stats.grades.sh}
                          base={source?.stats.grades.sh ?? null}
                          showDiff={!!(showChanges && source && resultId)}
                        />

                        <GradeChip
                          gradeKey="s"
                          img={gradeS}
                          alt="S"
                          value={selected.stats.grades.s}
                          base={source?.stats.grades.s ?? null}
                          showDiff={!!(showChanges && source && resultId)}
                        />

                        <GradeChip
                          gradeKey="a"
                          img={gradeA}
                          alt="A"
                          value={selected.stats.grades.a}
                          base={source?.stats.grades.a ?? null}
                          showDiff={!!(showChanges && source && resultId)}
                        />
                      </div>
                    </div>

                    {(selected?.bestScores?.length ?? 0) > 0 && (
                      <div className="stat wide">
                        <ScoresBlock title="Best results" items={selected.bestScores} />
                      </div>
                    )}

                    {(selected?.firstScores?.length ?? 0) > 0 && (
                      <div className="stat wide">
                        <ScoresBlock title="First places" items={selected.firstScores} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {openId && openReport && (
        <div className="modalBackdrop" onClick={() => setOpenId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div ref={modalRef} className="modalContent">
              {/* ====== ВОТ ТУТ ОН, НОРМАЛЬНЫЙ КОНТЕНТ МОДАЛКИ КАК БЫЛО ====== */}
              <div className="modalHeader">
                <div className="modalHeaderLeft">
                  <img className="modalAvatar" src={openReport.avatarUrl} alt="" />
                  <div>
                    <div className="modalTitle">{openReport.title}</div>
                    <div className="modalSub">
                      {fmtDate(openReport.createdAt)} · {fmtMode(openReport.mode)}
                    </div>
                  </div>
                </div>
                <div className="modalHeaderMid">
                  {showChanges ? (() => {
                    const txt = progressText(source?.createdAt, openReport?.createdAt);
                    return txt ? <div className="progressChip">{txt}</div> : null;
                  })() : null}
                </div>
                <button className="btn ghost" onClick={() => setOpenId(null)}>
                  Close
                </button>
              </div>

              <div className="modalBody">
                <div className="hero">
                  {/* WORLD */}
                  <div className="heroItem">
                    <div className="heroK">World rank</div>

                    {(() => {
                      const can = showModalDiffs && source?.stats.globalRank != null && openReport.stats.globalRank != null;
                      const raw = can ? openReport.stats.globalRank! - source!.stats.globalRank! : null;

                      // rank: меньше = лучше, значит для цвета/стрелки инверт
                      const ui = raw != null ? -raw : null;

                      const cls = can ? diffClass(ui) : "";
                      const arrow = can ? diffArrow(ui) : "";
                      const deltaTxt = can ? fmtSignedInt(raw) : "";

                      return (
                        <div className={["heroV", cls].join(" ")}>
                          #{fmtInt(openReport.stats.globalRank)}
                          {can ? <span className="diffMark">{arrow} {deltaTxt}</span> : null}
                        </div>
                      );
                    })()}
                  </div>

                  {/* COUNTRY */}
                  <div className="heroItem">
                    <div className="heroK">Country rank</div>

                    {(() => {
                      const can = showModalDiffs && source?.stats.countryRank != null && openReport.stats.countryRank != null;
                      const raw = can ? openReport.stats.countryRank! - source!.stats.countryRank! : null;

                      const ui = raw != null ? -raw : null;

                      const cls = can ? diffClass(ui) : "";
                      const arrow = can ? diffArrow(ui) : "";
                      const deltaTxt = can ? fmtSignedInt(raw) : "";

                      return (
                        <div className={["heroV", cls].join(" ")}>
                          #{fmtInt(openReport.stats.countryRank)}
                          {can ? <span className="diffMark">{arrow} {deltaTxt}</span> : null}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid">
                  <StatTile
                    label="PP"
                    value={openReport.stats.pp}
                    base={source?.stats.pp ?? null}
                    showDiff={showModalDiffs}
                  />
                  <StatTile
                    label="Accuracy"
                    kind="pct"
                    value={openReport.stats.accuracy}
                    base={source?.stats.accuracy ?? null}
                    showDiff={showModalDiffs}
                  />

                  <StatTile
                    label="Playcount"
                    value={openReport.stats.playcount}
                    base={source?.stats.playcount ?? null}
                    showDiff={showModalDiffs}
                  />
                  <StatTile
                    label="Ranked score"
                    value={openReport.stats.rankedScore}
                    base={source?.stats.rankedScore ?? null}
                    showDiff={showModalDiffs}
                  />

                  <StatTile
                    label="Total score"
                    value={openReport.stats.totalScore}
                    base={source?.stats.totalScore ?? null}
                    showDiff={showModalDiffs}
                  />
                  <StatTile
                    label="Total hits"
                    value={openReport.stats.totalHits}
                    base={source?.stats.totalHits ?? null}
                    showDiff={showModalDiffs}
                  />

                  <StatTile
                    label="Max combo"
                    value={openReport.stats.maximumCombo}
                    base={source?.stats.maximumCombo ?? null}
                    showDiff={showModalDiffs}
                  />
                  <StatTile
                    label="Replays watched"
                    value={openReport.stats.replaysWatchedByOthers}
                    base={source?.stats.replaysWatchedByOthers ?? null}
                    showDiff={showModalDiffs}
                  />

                  <div className="stat wide">
                    <div className="k">Grades</div>

                    <div className="grades">
                      <GradeChip
                        gradeKey="ssh"
                        img={gradeSSSilver}
                        alt="SS Silver"
                        value={openReport.stats.grades.ssh}
                        base={source?.stats.grades.ssh ?? null}
                        showDiff={showModalDiffs}
                      />

                      <GradeChip
                        gradeKey="ss"
                        img={gradeSS}
                        alt="SS"
                        value={openReport.stats.grades.ss}
                        base={source?.stats.grades.ss ?? null}
                        showDiff={showModalDiffs}
                      />

                      <GradeChip
                        gradeKey="sh"
                        img={gradeSSilver}
                        alt="S Silver"
                        value={openReport.stats.grades.sh}
                        base={source?.stats.grades.sh ?? null}
                        showDiff={showModalDiffs}
                      />

                      <GradeChip
                        gradeKey="s"
                        img={gradeS}
                        alt="S"
                        value={openReport.stats.grades.s}
                        base={source?.stats.grades.s ?? null}
                        showDiff={showModalDiffs}
                      />

                      <GradeChip
                        gradeKey="a"
                        img={gradeA}
                        alt="A"
                        value={openReport.stats.grades.a}
                        base={source?.stats.grades.a ?? null}
                        showDiff={showModalDiffs}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="loading">Loading stats from osu�</div>}

      {profilesOpen && (
        <div
          className={["overlay", profilesClosing ? "closing" : ""].join(" ")}
          onMouseDown={closeProfiles}
        >
          <div
            className={["profilesModal", profilesClosing ? "closing" : ""].join(" ")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="profilesHeader">
              <div className="profilesTitle">Profiles</div>
              <button className="btn ghost" type="button" onClick={closeProfiles}>
                Close
              </button>
            </div>

            <div className="profilesBody">
              <div className="profilesAddRow">
                <input
                  className="profilesInput"
                  value={profileLink}
                  onChange={(e) => {
                    setProfileLink(e.target.value);
                    setProfileError(null);
                  }}
                  placeholder="Paste osu!profile link"
                />
                <button className="btn primary" type="button" onClick={onAddProfile}>
                  Add
                </button>
              </div>

              {profileError && <div className="profilesError">{profileError}</div>}

              <div className="profilesList">
                {profiles.length === 0 ? (
                  <div className="profilesEmpty">No profiles yet.</div>
                ) : (
                  profiles.map((p) => (
                    <div key={p.id} className="profilesItem">
                      <img className="profilesAvatar" src={p.avatarUrl} alt="" />
                      <div className="profilesName">{p.username}</div>
                      <button className="btn danger tiny" type="button" onClick={() => onRemoveProfile(p.id)}>
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ======= КНОПКА КАМЕРЫ (GLOBAL) ======= */}
      {openId && openReport && (
        <button
          className="shotBtnGlobal"
          type="button"
          onClick={() => setShotAskOpen(true)}
          aria-label="Save screenshot"
          title="Save screenshot"
        >
          <span className="shotIcon" />
        </button>
      )}

      {/* ====== CONFIRM (GLOBAL) ====== */}
      {shotAskOpen && openId && openReport && (
        <div
          className="confirmBackdropGlobal"
          data-html2canvas-ignore="true"
          onMouseDown={() => setShotAskOpen(false)}
        >
          <div
            className="confirmModal"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="confirmTitle">Save screenshot? 🤔</div>
            <div className="confirmSub">Do you want to save this result?</div>

            <div className="confirmActions">
              <button className="btn ghost" type="button" onClick={() => setShotAskOpen(false)}>
                No
              </button>

              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  setShotAskOpen(false);
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      doModalScreenshot().catch(console.error);
                    });
                  });
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
import { useEffect, useMemo, useState } from "react";
import "./app.css";
import { webApi } from "./webApi";

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
  if (n === null || n === undefined) return "Ч";
  return new Intl.NumberFormat("ru-RU").format(n);
}
function fmtPct(n: number | null) {
  if (n === null || n === undefined) return "Ч";
  return `${n.toFixed(2)}%`;
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

function fmtAcc01(n: number | null) {
  if (n == null) return "Ч";
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
  const [profileLink, setProfileLink] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);

  async function refresh() {
    const list = (await api.listReports()) as Report[];
    setReports(list);
  }

  useEffect(() => {
    refresh();
  }, []);

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

    // если профиль не выбран Ч не показываем ничего
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

  const selected = useMemo(
    () => visibleReports.find((r) => r.id === (openId ?? selectedId)) ?? null,
    [visibleReports, selectedId, openId]
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

  async function onCreate() {
    try {
      setLoading(true);
      if (selectedProfileId == null) {
        alert("Select profile first");
        return;
      }

      const r = (await api.createReport({
        mode,
        userId: String(selectedProfileId),
      })) as Report;

      await refresh();
      setSelectedId(r.id);
      setOpenId(r.id);
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
    setSelectedId(null);
    setOpenId(null);
    await refresh();
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
      RL: "Relax",        // важно: RL (а не RX)   [oai_citation:1Зosu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
      AP: "Autopilot",
      SO: "Spun Out",

      // Mania special
      MR: "Mirror",
      RD: "Random",
      CP: "Co-op",        // важно: CP (а не CO)   [oai_citation:2Зosu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)

      // Other
      TD: "Touch Device",
      AT: "Auto",
      CM: "Cinema",       // важно: CM (а не CN)   [oai_citation:3Зosu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
      SV2: "ScoreV2",
      TP: "Target Practice", // legacy/experimental  [oai_citation:4Зosu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
    };

    // нормализаци€ того, что может прилетать как угодно
    function normalizeMod(raw: string) {
      let code = String(raw ?? "").trim().toUpperCase();

      // если вдруг прилетает "K4" -> "4K" (ты про это и говоришь)
      const m = code.match(/^K(\d+)$/);
      if (m) code = `${m[1]}K`;

      // ключи: 1K..9K
      if (/^\dK$/.test(code)) return code;

      // поддержка частых "левых" алиасов из интернета/старых либ:
      if (code === "RX") code = "RL";   // иногда пишут RX, но мод Ч RL  [oai_citation:5Зosu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
      if (code === "CN") code = "CM";   // иногда CN, но мод Ч CM  [oai_citation:6Зosu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)
      if (code === "CO") code = "CP";   // иногда CO, но мод Ч CP  [oai_citation:7Зosu!](https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier)

      return code;
    }

    // им€ дл€ тултипа
    function modFullName(code: string) {
      if (/^\dK$/.test(code)) return `${code[0]} Keys`; // 4K => 4 Keys
      return MOD_NAMES[code] ?? code; // фоллбек
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
        // F Ч нет ссылки, будет фоллбек текстом ниже
      };

      return map[r] ?? null;
    };

    const rankLabel = (rankRaw: string | null) => {
      const r = (rankRaw ?? "").toUpperCase();
      if (!r) return "Ч";
      // osu иногда может отдать X/XH, мы оставим как есть
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
                  <div className="scorePp">{s.pp != null ? `${Math.round(s.pp)}pp` : "Ч"}</div>
                </div>
              </button>
            );
          })}
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

                  // сохранить выбор в main.ts (profiles.json)
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
              onClick={() => setProfilesOpen(true)}
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
          <div className="listHeader">Reports ({mode})</div>

          <div className="listBody">
            <div className="listBodyScroll">
              {visibleReports.length === 0 && <div className="empty">Empty. Click "Create report".</div>}

              {visibleReports.map((r) => (
                <button
                  key={r.id}
                  className={`row ${r.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(r.id)}
                  type="button"
                >
                  <div className="rowMain">
                    <img className="rowAvatar" src={r.avatarUrl} alt="" />
                    <div className="rowText">
                      <div className="rowTitle">{r.title}</div>
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
            {!selected ? (
              <div className="previewEmpty">Select a report on the left</div>
            ) : (
              <div className="card">
                <div className="cardTop">
                  <div className="cardTopLeft">
                    <div>
                      <div className="cardTitle">{selected.title}</div>
                      <div className="cardSub">{fmtDate(selected.createdAt)}</div>
                    </div>
                  </div>

                  <button className="btn ghost" onClick={() => setOpenId(selected.id)}>
                    Open
                  </button>
                </div>

                <div className="grid">
                  <div className="stat">
                    <div className="k">World rank</div>
                    <div className="v">#{fmtInt(selected.stats.globalRank)}</div>
                  </div>
                  <div className="stat">
                    <div className="k">Country rank</div>
                    <div className="v">#{fmtInt(selected.stats.countryRank)}</div>
                  </div>

                  <div className="stat">
                    <div className="k">PP</div>
                    <div className="v">{fmtInt(selected.stats.pp)}</div>
                  </div>
                  <div className="stat">
                    <div className="k">Accuracy</div>
                    <div className="v">{fmtPct(selected.stats.accuracy)}</div>
                  </div>

                  <div className="stat">
                    <div className="k">Playcount</div>
                    <div className="v">{fmtInt(selected.stats.playcount)}</div>
                  </div>
                  <div className="stat">
                    <div className="k">Total score</div>
                    <div className="v">{fmtInt(selected.stats.totalScore)}</div>
                  </div>

                  <div className="stat">
                    <div className="k">Total hits</div>
                    <div className="v">{fmtInt(selected.stats.totalHits)}</div>
                  </div>
                  <div className="stat">
                    <div className="k">Max combo</div>
                    <div className="v">{fmtInt(selected.stats.maximumCombo)}</div>
                  </div>

                  <div className="stat wide">
                    <div className="k">Grades</div>

                    <div className="grades">
                      <div className="grade">
                        <img
                          className="gradeImg"
                          src="https://osu.ppy.sh/assets/images/GradeSmall-SS-Silver.6681366c.svg"
                          alt="SS Silver"
                        />
                        <div className="gradeNum">{selected.stats.grades.ssh ?? 0}</div>
                      </div>

                      <div className="grade">
                        <img
                          className="gradeImg"
                          src="https://osu.ppy.sh/assets/images/GradeSmall-SS.a21de890.svg"
                          alt="SS"
                        />
                        <div className="gradeNum">{selected.stats.grades.ss ?? 0}</div>
                      </div>

                      <div className="grade">
                        <img
                          className="gradeImg"
                          src="https://osu.ppy.sh/assets/images/GradeSmall-S-Silver.811ae28c.svg"
                          alt="S Silver"
                        />
                        <div className="gradeNum">{selected.stats.grades.sh ?? 0}</div>
                      </div>

                      <div className="grade">
                        <img
                          className="gradeImg"
                          src="https://osu.ppy.sh/assets/images/GradeSmall-S.3b4498a9.svg"
                          alt="S"
                        />
                        <div className="gradeNum">{selected.stats.grades.s ?? 0}</div>
                      </div>

                      <div className="grade">
                        <img
                          className="gradeImg"
                          src="https://osu.ppy.sh/assets/images/GradeSmall-A.d785e824.svg"
                          alt="A"
                        />
                        <div className="gradeNum">{selected.stats.grades.a ?? 0}</div>
                      </div>
                    </div>
                  </div>

                  {/* NEW: scores blocks */}
                  {/* NEW: scores blocks */}
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
              </div>
            )}
          </div>
        </div>
      </div>

      {openId && selected && (
        <div className="modalBackdrop" onClick={() => setOpenId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalHeaderLeft">
                <img className="modalAvatar" src={selected.avatarUrl} alt="" />
                <div>
                  <div className="modalTitle">{selected.title}</div>
                  <div className="modalSub">
                    {fmtDate(selected.createdAt)} Х {selected.mode}
                  </div>
                </div>
              </div>
              <button className="btn ghost" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>

            <div className="modalBody">
              <div className="hero">
                <div className="heroItem">
                  <div className="heroK">World rank</div>
                  <div className="heroV">#{fmtInt(selected.stats.globalRank)}</div>
                </div>
                <div className="heroItem">
                  <div className="heroK">Country rank</div>
                  <div className="heroV">#{fmtInt(selected.stats.countryRank)}</div>
                </div>
              </div>

              <div className="grid">
                <div className="stat">
                  <div className="k">PP</div>
                  <div className="v">{fmtInt(selected.stats.pp)}</div>
                </div>
                <div className="stat">
                  <div className="k">Accuracy</div>
                  <div className="v">{fmtPct(selected.stats.accuracy)}</div>
                </div>

                <div className="stat">
                  <div className="k">Playcount</div>
                  <div className="v">{fmtInt(selected.stats.playcount)}</div>
                </div>
                <div className="stat">
                  <div className="k">Total score</div>
                  <div className="v">{fmtInt(selected.stats.totalScore)}</div>
                </div>

                <div className="stat">
                  <div className="k">Total hits</div>
                  <div className="v">{fmtInt(selected.stats.totalHits)}</div>
                </div>
                <div className="stat">
                  <div className="k">Max combo</div>
                  <div className="v">{fmtInt(selected.stats.maximumCombo)}</div>
                </div>

                <div className="stat wide">
                  <div className="k">Grades</div>

                  <div className="grades">
                    <div className="grade">
                      <img className="gradeImg" src="https://osu.ppy.sh/assets/images/GradeSmall-SS-Silver.6681366c.svg" alt="SS Silver" />
                      <div className="gradeNum">{selected.stats.grades.ssh ?? 0}</div>
                    </div>

                    <div className="grade">
                      <img className="gradeImg" src="https://osu.ppy.sh/assets/images/GradeSmall-SS.a21de890.svg" alt="SS" />
                      <div className="gradeNum">{selected.stats.grades.ss ?? 0}</div>
                    </div>

                    <div className="grade">
                      <img className="gradeImg" src="https://osu.ppy.sh/assets/images/GradeSmall-S-Silver.811ae28c.svg" alt="S Silver" />
                      <div className="gradeNum">{selected.stats.grades.sh ?? 0}</div>
                    </div>

                    <div className="grade">
                      <img className="gradeImg" src="https://osu.ppy.sh/assets/images/GradeSmall-S.3b4498a9.svg" alt="S" />
                      <div className="gradeNum">{selected.stats.grades.s ?? 0}</div>
                    </div>

                    <div className="grade">
                      <img className="gradeImg" src="https://osu.ppy.sh/assets/images/GradeSmall-A.d785e824.svg" alt="A" />
                      <div className="gradeNum">{selected.stats.grades.a ?? 0}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="loading">Loading stats from osuЕ</div>}

      {profilesOpen && (
        <div className="overlay" onMouseDown={() => setProfilesOpen(false)}>
          <div className="profilesModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="profilesHeader">
              <div className="profilesTitle">Profiles</div>
              <button className="btn ghost" type="button" onClick={() => setProfilesOpen(false)}>
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
    </div>
  );
}
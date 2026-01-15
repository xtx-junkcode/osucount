import "dotenv/config";
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type OsuMode = "osu" | "mania";

type OsuStats = {
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
  grades: {
    ss: number | null;
    ssh: number | null;
    s: number | null;
    sh: number | null;
    a: number | null;
  };
};

type Profile = {
  id: string;
  username: string;
  avatarUrl: string;
};

type ScoreItem = {
  artist: string;
  title: string;
  difficulty: string;

  rank: string | null;
  accuracy: number | null; // 0..1
  pp: number | null;

  mods?: string[]; // ✅ NEW

  beatmapUrl: string;
  beatmapId: number | null;

  createdAt: string | null;
};

type Report = {
  id: string;
  createdAt: string;
  title: string;
  userId: string;
  username: string;
  avatarUrl: string;
  mode: OsuMode;
  stats: OsuStats;

  bestScores?: ScoreItem[]; // топ 3 "Лучшие результаты"
  firstScores?: ScoreItem[]; // топ 3 "Первые места"
};

const isDev = !app.isPackaged;

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}. Put it into .env in app/`);
  return v;
}

const OSU_CLIENT_ID = getEnv("OSU_CLIENT_ID");
const OSU_CLIENT_SECRET = getEnv("OSU_CLIENT_SECRET");
const DEFAULT_USER_ID = process.env.OSU_USER_ID ?? "36128777";

const userDataDir = app.getPath("userData");
const reportsFile = path.join(userDataDir, "reports.json");
const profilesFile = path.join(userDataDir, "profiles.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
async function writeJson<T>(file: string, data: T) {
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

// ----------------- osu api -----------------
type TokenCache = { token: string; expiresAt: number } | null;
let tokenCache: TokenCache = null;

async function getOsuToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 10_000) return tokenCache.token;

  const body = new URLSearchParams({
    client_id: OSU_CLIENT_ID,
    client_secret: OSU_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "public",
  });

  const resp = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`osu token failed: ${resp.status} ${text}`);
  }

  const json = (await resp.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

async function fetchUser(userId: string, mode: OsuMode) {
  const token = await getOsuToken();
  const url = `https://osu.ppy.sh/api/v2/users/${encodeURIComponent(userId)}/${encodeURIComponent(mode)}`;

  const resp = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`osu user fetch failed: ${resp.status} ${text}`);
  }

  return (await resp.json()) as any;
}

async function fetchProfile(userId: string): Promise<Profile> {
  // avatar/username одинаковы, берем из /osu
  const user = await fetchUser(userId, "osu");
  return {
    id: String(user?.id ?? userId),
    username: String(user?.username ?? `user_${userId}`),
    avatarUrl: String(user?.avatar_url ?? ""),
  };
}

async function fetchUserStats(
  userId: string,
  mode: OsuMode
): Promise<{ profile: Profile; stats: OsuStats }> {
  const user = await fetchUser(userId, mode);
  const s = user?.statistics ?? {};

  const profile: Profile = {
    id: String(user?.id ?? userId),
    username: String(user?.username ?? `user_${userId}`),
    avatarUrl: String(user?.avatar_url ?? ""),
  };

  const stats: OsuStats = {
    globalRank: s?.global_rank ?? null,
    countryRank: s?.country_rank ?? null,
    pp: s?.pp ?? null,
    accuracy: s?.hit_accuracy ?? null,
    playcount: s?.play_count ?? null,
    rankedScore: s?.ranked_score ?? null,
    totalScore: s?.total_score ?? null,
    totalHits: s?.total_hits ?? null,
    maximumCombo: s?.maximum_combo ?? null,
    replaysWatchedByOthers: s?.replays_watched_by_others ?? null,
    grades: {
      ss: s?.grade_counts?.ss ?? null,
      ssh: s?.grade_counts?.ssh ?? null,
      s: s?.grade_counts?.s ?? null,
      sh: s?.grade_counts?.sh ?? null,
      a: s?.grade_counts?.a ?? null,
    },
  };

  return { profile, stats };
}

// ---- scores helpers (ONE TIME, not duplicated) ----
function pickScoreItem(x: any): ScoreItem {
  const bm = x?.beatmap ?? {};
  const bms = x?.beatmapset ?? bm?.beatmapset ?? {};

  const beatmapId = typeof bm?.id === "number" ? bm.id : null;

  // ✅ mods can be ["HD","DT"] or [{acronym:"HD"}, ...] or enabled_mods
  const rawMods = Array.isArray(x?.mods) ? x.mods : Array.isArray(x?.enabled_mods) ? x.enabled_mods : [];
  const mods = (rawMods ?? [])
    .map((m: any) => (typeof m === "string" ? m : m?.acronym))
    .filter(Boolean)
    .map((s: any) => String(s).toUpperCase());

  return {
    artist: String(bms?.artist ?? "—"),
    title: String(bms?.title ?? "—"),
    difficulty: String(bm?.version ?? "—"),

    rank: x?.rank ? String(x.rank) : null,
    accuracy: typeof x?.accuracy === "number" ? x.accuracy : null,
    pp: typeof x?.pp === "number" ? x.pp : null,

    mods: mods.length ? mods : [],

    beatmapId,
    beatmapUrl: beatmapId ? `https://osu.ppy.sh/beatmaps/${beatmapId}` : "https://osu.ppy.sh/",

    createdAt: x?.created_at ? String(x.created_at) : null,
  };
}

async function fetchUserScoresTop3(userId: string, mode: OsuMode) {
  const token = await getOsuToken();

  async function load(type: "best" | "firsts") {
    const url =
      `https://osu.ppy.sh/api/v2/users/${encodeURIComponent(userId)}/scores/${type}` +
      `?mode=${encodeURIComponent(mode)}&limit=3`;

    const resp = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`osu scores fetch failed (${type}): ${resp.status} ${text}`);
    }

    const arr = (await resp.json()) as any[];
    return (Array.isArray(arr) ? arr : []).map(pickScoreItem);
  }

  const [bestScores, firstScores] = await Promise.all([load("best"), load("firsts")]);
  return { bestScores, firstScores };
}

// ----------------- reports storage -----------------
async function readReports(): Promise<Report[]> {
  return readJson<Report[]>(reportsFile, []);
}
async function writeReports(reports: Report[]) {
  await writeJson(reportsFile, reports);
}

function formatTitle(username: string, d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${username} report ${dd}.${mm}.${yyyy}`;
}
function randomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function normalizeMode(mode: any): OsuMode {
  return mode === "osu" ? "osu" : "mania";
}

// ----------------- profiles storage -----------------
type ProfilesState = { profiles: Profile[]; selectedId: string | null };

async function ensureProfilesInitialized() {
  const state = await readJson<ProfilesState>(profilesFile, { profiles: [], selectedId: null });

  // если файл уже есть и норм — ничего не делаем
  if (Array.isArray(state.profiles)) return;

  // если вдруг битый — пересоздаём пустым
  await writeJson(profilesFile, { profiles: [], selectedId: null } as ProfilesState);
}

function parseUserIdFromUrl(url: string): string | null {
  const m = url.match(/osu\.ppy\.sh\/users\/(\d+)/i);
  return m?.[1] ?? null;
}

async function readProfilesState(): Promise<ProfilesState> {
  await ensureProfilesInitialized();
  return readJson<ProfilesState>(profilesFile, { profiles: [], selectedId: null });
}
async function writeProfilesState(state: ProfilesState) {
  await writeJson(profilesFile, state);
}

// ----------------- window -----------------
let mainWindow: BrowserWindow | null = null;

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 1040,
    minHeight: 680,
    center: true,
    backgroundColor: "#120f16",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    // mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

// ----------------- IPC -----------------
ipcMain.handle("reports:list", async () => {
  const reports = await readReports();
  reports.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reports;
});

ipcMain.handle("reports:create", async (_evt, payload: { mode: OsuMode; userId: string }) => {
  const mode = normalizeMode(payload?.mode);
  const userId = String(payload?.userId ?? DEFAULT_USER_ID);

  // топ-3 best + top-3 firsts
  const { bestScores, firstScores } = await fetchUserScoresTop3(userId, mode);

  const { profile, stats } = await fetchUserStats(userId, mode);
  const now = new Date();

  const report: Report = {
    id: randomId(),
    createdAt: now.toISOString(),
    title: formatTitle(profile.username, now),
    userId: profile.id,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    mode,
    stats,
    bestScores,
    firstScores,
  };

  const reports = await readReports();
  reports.push(report);
  await writeReports(reports);

  return report;
});

ipcMain.handle("reports:delete", async (_evt, id: string) => {
  const reports = await readReports();
  const next = reports.filter((r) => r.id !== id);
  await writeReports(next);
  return { ok: true };
});

// profiles
ipcMain.handle("profiles:get", async () => {
  const state = await readProfilesState();
  return state;
});

ipcMain.handle("profiles:select", async (_evt, id: string) => {
  const state = await readProfilesState();
  const exists = state.profiles.some((p) => p.id === id);
  const next: ProfilesState = { ...state, selectedId: exists ? id : state.selectedId };
  await writeProfilesState(next);
  return next;
});

ipcMain.handle("profiles:remove", async (_evt, id: string) => {
  const state = await readProfilesState();
  const profiles = state.profiles.filter((p) => p.id !== id);
  let selectedId = state.selectedId;

  if (selectedId === id) selectedId = profiles[0]?.id ?? null;
  const next: ProfilesState = { profiles, selectedId };
  await writeProfilesState(next);
  return next;
});

ipcMain.handle("profiles:addByUrl", async (_evt, url: string) => {
  const id = parseUserIdFromUrl(String(url ?? ""));
  if (!id) throw new Error("Bad URL. Use like: https://osu.ppy.sh/users/123");

  const state = await readProfilesState();
  const exists = state.profiles.find((p) => p.id === id);
  if (exists) {
    const next = { ...state, selectedId: exists.id };
    await writeProfilesState(next);
    return next;
  }

  const p = await fetchProfile(id);
  const next: ProfilesState = { profiles: [...state.profiles, p], selectedId: p.id };
  await writeProfilesState(next);
  return next;
});

app.whenReady().then(async () => {
  await ensureProfilesInitialized();
  await createMainWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
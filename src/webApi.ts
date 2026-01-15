type Mode = "osu" | "mania";

const API = "https://lively-bonus-8219.jmvmncpgsw.workers.dev";

type PlayerProfile = { id: number; username: string; avatarUrl: string };

type ScoreItem = {
    artist: string;
    title: string;
    difficulty: string;
    rank: string | null;
    accuracy: number | null;
    pp: number | null;
    mods?: string[];
    beatmapUrl: string;
    beatmapId: number | null;
    createdAt: string | null;
};

type Report = {
    id: string;
    createdAt: string;
    title: string;
    userId: string;
    mode: Mode;
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

const LS_PROFILES = "osu_count_profiles_v1";
const LS_SELECTED = "osu_count_selected_profile_v1";
const LS_REPORTS = "osu_count_reports_v1";

function load<T>(k: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(k);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}
function save<T>(k: string, v: T) {
    localStorage.setItem(k, JSON.stringify(v));
}

function extractUserIdFromUrl(url: string): number | null {
    const m = String(url).match(/osu\.ppy\.sh\/users\/(\d+)/i);
    return m ? Number(m[1]) : null;
}

async function fetchUser(userId: number, mode: Mode) {
    const r = await fetch(`${API}/api/users/${userId}/${mode}`);
    if (!r.ok) throw new Error(`User fetch failed (${r.status})`);
    return r.json();
}
async function fetchScores(userId: number, mode: Mode, type: "best" | "firsts", limit = 3) {
    const r = await fetch(`${API}/api/scores/${userId}/${mode}?type=${type}&limit=${limit}`);
    if (!r.ok) throw new Error(`Scores fetch failed (${r.status})`);
    return r.json();
}

function mapReportFromOsu(user: any, mode: Mode, bestScores: any[], firstScores: any[]): Report {
    const stats = user?.statistics ?? {};
    const grade = stats?.grade_counts ?? {};
    const now = new Date();

    return {
        id: String(Date.now()),
        createdAt: now.toISOString(),
        title: `${user?.username ?? "user"} report ${String(now.getDate()).padStart(2, "0")}.${String(
            now.getMonth() + 1
        ).padStart(2, "0")}.${now.getFullYear()}`,
        userId: String(user?.id ?? ""),
        mode,
        username: user?.username ?? "Ч",
        avatarUrl: user?.avatar_url ?? "",
        stats: {
            globalRank: stats?.global_rank ?? null,
            countryRank: stats?.country_rank ?? null,
            pp: stats?.pp ?? null,
            accuracy: stats?.hit_accuracy ?? null,
            playcount: stats?.play_count ?? null,
            rankedScore: stats?.ranked_score ?? null,
            totalScore: stats?.total_score ?? null,
            totalHits: stats?.total_hits ?? null,
            maximumCombo: stats?.maximum_combo ?? null,
            replaysWatchedByOthers: stats?.replays_watched_by_others ?? null,
            grades: {
                ss: grade?.ss ?? null,
                ssh: grade?.ssh ?? null,
                s: grade?.s ?? null,
                sh: grade?.sh ?? null,
                a: grade?.a ?? null,
            },
        },
        bestScores,
        firstScores,
    };
}

export const webApi = {
    // ---- profiles ----
    async profilesGet() {
        const profiles = load<PlayerProfile[]>(LS_PROFILES, []);
        const selectedId = load<string | null>(LS_SELECTED, null);
        return { profiles, selectedId };
    },

    async profilesSelect(id: string) {
        save(LS_SELECTED, id);
        const profiles = load<PlayerProfile[]>(LS_PROFILES, []);
        return { profiles, selectedId: id };
    },

    async profilesAddByUrl(profileUrl: string) {
        const userId = extractUserIdFromUrl(profileUrl);
        if (!userId) throw new Error("Bad profile link. Need https://osu.ppy.sh/users/<id>");

        // mode не важен дл€ username/avatar Ч возьмЄм mania по умолчанию
        const user = await fetchUser(userId, "mania");

        const profiles = load<PlayerProfile[]>(LS_PROFILES, []);
        const next: PlayerProfile = { id: Number(user.id), username: user.username, avatarUrl: user.avatar_url };

        const merged = [next, ...profiles.filter((p) => p.id !== next.id)];
        save(LS_PROFILES, merged);
        save(LS_SELECTED, String(next.id));

        return { profiles: merged, selectedId: String(next.id) };
    },

    async profilesRemove(id: string) {
        const profiles = load<PlayerProfile[]>(LS_PROFILES, []);
        const filtered = profiles.filter((p) => String(p.id) !== String(id));
        save(LS_PROFILES, filtered);

        const sel = load<string | null>(LS_SELECTED, null);
        if (sel === String(id)) {
            const newSel = filtered[0]?.id ? String(filtered[0].id) : null;
            save(LS_SELECTED, newSel);
            return { profiles: filtered, selectedId: newSel };
        }

        return { profiles: filtered, selectedId: sel };
    },

    // ---- reports ----
    async listReports() {
        return load<Report[]>(LS_REPORTS, []);
    },

    async deleteReport(id: string) {
        const reports = load<Report[]>(LS_REPORTS, []);
        save(
            LS_REPORTS,
            reports.filter((r) => r.id !== id)
        );
        return true;
    },

    async createReport({ mode, userId }: { mode: Mode; userId: string }) {
        const uid = Number(userId);

        const user = await fetchUser(uid, mode);
        const best = await fetchScores(uid, mode, "best", 3);
        const firsts = await fetchScores(uid, mode, "firsts", 3);

        const report = mapReportFromOsu(user, mode, best, firsts);

        const reports = load<Report[]>(LS_REPORTS, []);
        const next = [report, ...reports];
        save(LS_REPORTS, next);

        return report;
    },
};
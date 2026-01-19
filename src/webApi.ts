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
        grades: {
            ss: number | null;
            ssh: number | null;
            s: number | null;
            sh: number | null;
            a: number | null;
        };
    };
    bestScores?: ScoreItem[];
    firstScores?: ScoreItem[];
};

const LS_PROFILES = "osu_count_profiles_v1";
const LS_SELECTED = "osu_count_selected_profile_v1";
const LS_DEVICE = "osu_count_device_id_v1";

// (оставляю, чтобы ничего не ломать и можно было мигрировать/откатить)
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

function getDeviceId(): string {
    const cur = load<string | null>(LS_DEVICE, null);
    if (cur) return cur;

    const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    save(LS_DEVICE, id);
    return id;
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

async function fetchScores(
    userId: number,
    mode: Mode,
    type: "best" | "firsts",
    limit = 3
) {
    const r = await fetch(`${API}/api/scores/${userId}/${mode}?type=${type}&limit=${limit}`);
    if (!r.ok) throw new Error(`Scores fetch failed (${r.status})`);
    return r.json();
}

function mapReportFromOsu(user: any, mode: Mode, bestScores: any[], firstScores: any[]): Report {
    const stats = user?.statistics ?? {};
    const grade = stats?.grade_counts ?? {};
    const now = new Date();

    return {
        // ВАЖНО: это локальный id, потом мы заменим на id из D1
        id: String(Date.now()),
        createdAt: now.toISOString(),
        title: `${user?.username ?? "user"} report ${String(now.getDate()).padStart(2, "0")}.${String(
            now.getMonth() + 1
        ).padStart(2, "0")}.${now.getFullYear()}`,
        userId: String(user?.id ?? ""),
        mode,
        username: user?.username ?? "�",
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

function toIsoFromAnyTs(x: any): string | null {
    if (x == null) return null;

    // "1768825099857.0"
    if (typeof x === "string" && /^\d+(\.\d+)?$/.test(x)) {
        const n = Number(x);
        if (!Number.isFinite(n)) return null;
        return new Date(n).toISOString();
    }

    if (typeof x === "number") {
        if (!Number.isFinite(x)) return null;
        return new Date(x).toISOString();
    }

    // уже ISO
    if (typeof x === "string") {
        const d = new Date(x);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    return null;
}

async function d1ListReports(osuUserId: number, mode: Mode): Promise<Report[]> {
    const deviceId = getDeviceId();

    const r = await fetch(
        `${API}/api/reports?deviceId=${encodeURIComponent(deviceId)}&osuUserId=${encodeURIComponent(
            String(osuUserId)
        )}&mode=${encodeURIComponent(mode)}`
    );

    const j = await r.json().catch(() => null);
    if (!r.ok) {
        const msg =
            (j && typeof j === "object" && (j as any).error) || `Reports fetch failed (${r.status})`;
        throw new Error(String(msg));
    }

    const arr = Array.isArray(j) ? j : [];
    return arr.map((it: any) => {
        const iso = toIsoFromAnyTs(it?.createdAt) ?? it?.createdAt;
        return {
            ...it,
            createdAt: iso,
            id: String(it?.id),
            userId: String(it?.userId ?? it?.osuUserId ?? osuUserId),
            mode: (it?.mode as Mode) ?? mode,
        } as Report;
    });
}

async function d1CreateReport(payload: {
    osuUserId: number;
    username: string;
    mode: Mode;
    report: any;
}): Promise<{ id: string; createdAt: string | null }> {
    const deviceId = getDeviceId();

    const r = await fetch(`${API}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, ...payload }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) {
        const msg =
            (j && typeof j === "object" && (j as any).error) || `Save failed (${r.status})`;
        throw new Error(String(msg));
    }

    return {
        id: String((j as any)?.id),
        createdAt: toIsoFromAnyTs((j as any)?.createdAt),
    };
}

async function d1DeleteReport(id: string): Promise<void> {
    const deviceId = getDeviceId();

    const r = await fetch(
        `${API}/api/report/${encodeURIComponent(id)}?deviceId=${encodeURIComponent(deviceId)}`,
        { method: "DELETE" }
    );

    const j = await r.json().catch(() => null);
    if (!r.ok) {
        const msg =
            (j && typeof j === "object" && (j as any).error) || `Delete failed (${r.status})`;
        throw new Error(String(msg));
    }
}

export const webApi = {
    // ---- profiles ----
    async profilesGet() {
        return await d1ProfilesGet();
    },

    async profilesSelect(id: string) {
        await d1ProfilesSelect(id ? Number(id) : null);
        return await d1ProfilesGet();
    },

    async profilesAddByUrl(profileUrl: string) {
        const userId = extractUserIdFromUrl(profileUrl);
        if (!userId) throw new Error("Bad profile link. Need https://osu.ppy.sh/users/<id>");

        // берём mania чтобы всегда был username/avatar
        const user = await fetchUser(userId, "mania");

        await d1ProfilesAdd({
            osuUserId: Number(user.id),
            username: user.username,
            avatarUrl: user.avatar_url,
        });

        return await d1ProfilesGet();
    },

    async profilesRemove(id: string) {
        await d1ProfilesRemove(Number(id));
        return await d1ProfilesGet();
    },

    // ---- reports (D1 через Worker) ----
    async listReports() {
        const selectedId = load<string | null>(LS_SELECTED, null);
        if (!selectedId) return [];

        const uid = Number(selectedId);
        if (!Number.isFinite(uid)) return [];

        const [mania, osu] = await Promise.all([d1ListReports(uid, "mania"), d1ListReports(uid, "osu")]);

        const all = [...mania, ...osu];
        all.sort((a, b) => {
            const ta = new Date(a.createdAt).getTime();
            const tb = new Date(b.createdAt).getTime();
            return tb - ta;
        });

        return all;
    },

    async deleteReport(id: string) {
        await d1DeleteReport(String(id));

        // локальный кеш (на всякий случай)
        try {
            const reports = load<Report[]>(LS_REPORTS, []);
            save(
                LS_REPORTS,
                reports.filter((r) => String(r.id) !== String(id))
            );
        } catch {
            // ignore
        }

        return true;
    },

    async createReport({ mode, userId }: { mode: Mode; userId: string }) {
        const uid = Number(userId);

        const user = await fetchUser(uid, mode);
        const best = await fetchScores(uid, mode, "best", 3);
        const firsts = await fetchScores(uid, mode, "firsts", 3);

        const reportLocal = mapReportFromOsu(user, mode, best, firsts);

        const saved = await d1CreateReport({
            osuUserId: uid,
            username: reportLocal.username,
            mode,
            report: reportLocal,
        });

        const fixed: Report = {
            ...reportLocal,
            id: String(saved.id),
            createdAt: saved.createdAt ?? reportLocal.createdAt,
        };

        // локальный кеш (на всякий случай)
        try {
            const reports = load<Report[]>(LS_REPORTS, []);
            save(LS_REPORTS, [fixed, ...reports]);
        } catch {
            // ignore
        }

        return fixed;
    },
};

// ======================
// Profiles (D1 via Worker)
// ======================

async function d1ProfilesGet() {
    const deviceId = getDeviceId();
    const r = await fetch(`${API}/api/profiles?deviceId=${encodeURIComponent(deviceId)}`);
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(String(j?.error || `Profiles fetch failed (${r.status})`));
    return j as { profiles: PlayerProfile[]; selectedId: string | null };
}

async function d1ProfilesAdd(p: { osuUserId: number; username: string; avatarUrl: string }) {
    const deviceId = getDeviceId();
    const r = await fetch(`${API}/api/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, ...p }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(String(j?.error || `Profiles save failed (${r.status})`));
}

async function d1ProfilesRemove(osuUserId: number) {
    const deviceId = getDeviceId();
    const r = await fetch(
        `${API}/api/profiles/${encodeURIComponent(String(osuUserId))}?deviceId=${encodeURIComponent(deviceId)}`,
        { method: "DELETE" }
    );
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(String(j?.error || `Profiles delete failed (${r.status})`));
}

async function d1ProfilesSelect(osuUserId: number | null) {
    const deviceId = getDeviceId();
    const r = await fetch(`${API}/api/profiles/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, osuUserId }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(String(j?.error || `Profiles select failed (${r.status})`));
    return j as { ok: true; selectedId: string | null };
}
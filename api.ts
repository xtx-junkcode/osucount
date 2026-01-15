const API = "https://lively-bonus-8219.jmvmncpgsw.workers.dev";

export async function fetchUser(userId: number, mode: "osu" | "mania") {
    const r = await fetch(`${API}/api/users/${userId}/${mode}`);
    if (!r.ok) throw new Error("user fetch failed");
    return r.json();
}

export async function fetchScores(
    userId: number,
    mode: "osu" | "mania",
    type: "best" | "firsts",
    limit = 3
) {
    const r = await fetch(
        `${API}/api/scores/${userId}/${mode}?type=${type}&limit=${limit}`
    );
    if (!r.ok) throw new Error("scores fetch failed");
    return r.json();
}
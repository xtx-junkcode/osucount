/// <reference types="vite/client" />

declare global {
    type OsuMode = "osu" | "mania";

    type ProfilesState = {
        profiles: { id: string; username: string; avatarUrl: string }[];
        selectedId: string | null;
    };

    interface Window {
        api: {
            // reports
            listReports: () => Promise<any[]>;
            createReport: (payload: { mode: OsuMode; userId: string }) => Promise<any>;
            deleteReport: (id: string) => Promise<{ ok: boolean }>;

            // profiles
            profilesGet: () => Promise<ProfilesState>;
            profilesAddByUrl: (url: string) => Promise<ProfilesState>;
            profilesSelect: (id: string) => Promise<ProfilesState>;
            profilesRemove: (id: string) => Promise<ProfilesState>;
        };
    }
}
export { };
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  // reports (aliases + new)
  listReports: () => ipcRenderer.invoke("reports:list"),
  deleteReport: (id: string) => ipcRenderer.invoke("reports:delete", id),

  // старый createReport(mode) -> новый reports:create({mode,userId})
  createReport: (payload: { mode: "osu" | "mania"; userId: string }) =>
    ipcRenderer.invoke("reports:create", payload),

  // profiles
  profilesGet: () => ipcRenderer.invoke("profiles:get"),
  profilesAddByUrl: (url: string) => ipcRenderer.invoke("profiles:addByUrl", url),
  profilesSelect: (id: string) => ipcRenderer.invoke("profiles:select", id),
  profilesRemove: (id: string) => ipcRenderer.invoke("profiles:remove", id),

  // images (for screenshots: bypass CORS)
  imgFetchDataUrl: (url: string) => ipcRenderer.invoke("img:fetchDataUrl", url),
});
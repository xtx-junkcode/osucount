import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ? В браузере ipcRenderer нет — поэтому строго через проверку
const ipc = (window as any).ipcRenderer;
if (ipc && typeof ipc.on === "function") {
  ipc.on("main-process-message", (_event: any, message: any) => {
    console.log(message);
  });
}
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Gate } from "./gate/Gate";
import { gateConfig } from "./gate/app-gate-config";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Gate app={gateConfig}>
      <App />
    </Gate>
  </React.StrictMode>,
);

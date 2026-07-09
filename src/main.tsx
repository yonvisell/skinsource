import React from "react";
import ReactDOM from "react-dom/client";
import { Activity } from "lucide-react";
import "uplot/dist/uPlot.min.css";
import "./styles.css";

function App() {
  return (
    <main className="shell">
      <section className="topbar">
        <div className="brand">
          <Activity aria-hidden="true" size={22} />
          <div>
            <h1>SkinSourceSim</h1>
            <p>Static SkinSource vibration workbench</p>
          </div>
        </div>
        <span className="status-pill">Scaffold ready</span>
      </section>
      <section className="placeholder">
        <h2>Workbench scaffold</h2>
        <p>
          Data assets are converted. The next slice wires runtime loading,
          FFT convolution, and MATLAB parity checks.
        </p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

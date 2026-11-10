import React from "react";
import { createRoot } from "react-dom/client";
import App from "./mth/App.jsx";
import "./mth/mth.css";

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

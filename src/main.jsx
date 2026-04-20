import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Dashboard from "./Dashboard.jsx";
import AttorneyPortal from "./pages/AttorneyPortal.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/attorney/:caseId" element={<AttorneyPortal />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);

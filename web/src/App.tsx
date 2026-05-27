import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { DiagnosisPage } from "./pages/DiagnosisPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/d/:id" element={<DiagnosisPage />} />
      </Routes>
    </BrowserRouter>
  );
}

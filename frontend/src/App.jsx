import { BrowserRouter, Routes, Route } from "react-router-dom";
import GuestPage from "./pages/GuestPage.jsx";
import ConfirmationPage from "./pages/ConfirmationPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GuestPage />} />
        <Route path="/confirmation/:orderId" element={<ConfirmationPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

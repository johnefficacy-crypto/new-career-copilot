import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminRoutes from "./routes/adminRoutes";
import AppRoutes from "./routes/appRoutes";
import PublicRoutes from "./routes/publicRoutes";

export default function App() {
  return (
    <Routes>
      <PublicRoutes />
      <AppRoutes />
      <AdminRoutes />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

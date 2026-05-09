import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { adminRouteElements } from "./routes/adminRoutes";
import { appRouteElements } from "./routes/appRoutes";
import { publicRouteElements } from "./routes/publicRoutes";

export default function App() {
  return (
    <Routes>
      {publicRouteElements}
      {appRouteElements}
      {adminRouteElements}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import React from "react";
import { Route, Routes } from "react-router-dom";
import NotFound from "./pages/NotFound";
import { adminRouteElements } from "./routes/adminRoutes";
import { appRouteElements } from "./routes/appRoutes";
import { publicRouteElements } from "./routes/publicRoutes";

export default function App() {
  return (
    <Routes>
      {publicRouteElements}
      {appRouteElements}
      {adminRouteElements}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

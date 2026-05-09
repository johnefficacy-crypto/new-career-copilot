import React from "react";
import { Route } from "react-router-dom";
import Landing from "../pages/Landing";
import Login from "../pages/auth/Login";
import Signup from "../pages/auth/Signup";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import { GuestOnly } from "../lib/ProtectedRoute";

export default function PublicRoutes() {
  return <><Route path="/" element={<Landing />} /><Route path="/login" element={<GuestOnly><Login /></GuestOnly>} /><Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} /><Route path="/forgot-password" element={<ForgotPassword />} /><Route path="/reset-password" element={<ResetPassword />} /></>;
}

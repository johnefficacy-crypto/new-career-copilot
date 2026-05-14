import React from "react";
import { Route } from "react-router-dom";
import Landing from "../pages/Landing";
import Login from "../pages/auth/Login";
import Signup from "../pages/auth/Signup";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import OnboardingChat from "../pages/OnboardingChat";
import FunnelLandingRouter from "../features/funnel/FunnelLandingRouter";
import { GuestOnly } from "../lib/ProtectedRoute";

export const publicRouteElements = (
  <>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
    <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    {/* Unified guided onboarding — both entry modes are publicly reachable
        so a guest can answer 2-3 questions before signing in. */}
    <Route path="/app/onboarding/chat" element={<OnboardingChat />} />
    <Route path="/go/:intent/:recruitmentSlug" element={<FunnelLandingRouter />} />
    <Route path="/go/:intent/:recruitmentSlug/:postSlug" element={<FunnelLandingRouter />} />
  </>
);

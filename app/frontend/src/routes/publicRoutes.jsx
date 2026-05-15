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
import PrototypeIndex from "../prototype/PrototypeIndex";
import PrototypeEligibility from "../prototype/screens/Eligibility";
import PrototypeGroups from "../prototype/screens/Groups";
import PrototypeResources from "../prototype/screens/Resources";
import PrototypeLibrary from "../prototype/screens/Library";
import PrototypeSeller from "../prototype/screens/Seller";
import PrototypeOnboarding from "../prototype/screens/Onboarding";
import PrototypeAdminEligibility from "../prototype/screens/AdminEligibility";
import PrototypeAdminCommunity from "../prototype/screens/AdminCommunity";
import PrototypeAdminMarket from "../prototype/screens/AdminMarket";
import PrototypeAdminFunnel from "../prototype/screens/AdminFunnel";
import PrototypeHandoff from "../prototype/screens/Handoff";

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

    {/* Prototype gallery — read-only visual ports of every prototype
        screen, mounted with mock data. Reachable without auth so design
        reviews and QA against the prototype don't need a login. */}
    <Route path="/prototype" element={<PrototypeIndex />} />
    <Route path="/prototype/eligibility" element={<PrototypeEligibility />} />
    <Route path="/prototype/groups" element={<PrototypeGroups />} />
    <Route path="/prototype/resources" element={<PrototypeResources />} />
    <Route path="/prototype/library" element={<PrototypeLibrary />} />
    <Route path="/prototype/seller" element={<PrototypeSeller />} />
    <Route path="/onboarding" element={<PrototypeOnboarding />} />
    <Route path="/prototype/admin-eligibility" element={<PrototypeAdminEligibility />} />
    <Route path="/prototype/admin-community" element={<PrototypeAdminCommunity />} />
    <Route path="/prototype/admin-marketplace" element={<PrototypeAdminMarket />} />
    <Route path="/prototype/admin-funnel" element={<PrototypeAdminFunnel />} />
    <Route path="/prototype/handoff" element={<PrototypeHandoff />} />
  </>
);

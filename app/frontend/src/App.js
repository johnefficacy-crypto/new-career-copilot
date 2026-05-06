import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Landing from "./pages/Landing";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

import DashShell from "./pages/DashShell";
import Dashboard from "./pages/Dashboard";
import Today from "./pages/Today";
import Profile from "./pages/Profile";
import Onboarding from "./pages/Onboarding";
import Exams from "./pages/Exams";
import ExamDetail from "./pages/ExamDetail";
import Saved from "./pages/Saved";
import Tracker from "./pages/Tracker";
import StudyPlan from "./pages/StudyPlan";
import Focus from "./pages/study/Focus";
import Mocks from "./pages/study/Mocks";
import Subjects from "./pages/study/Subjects";
import WeeklyReview from "./pages/study/WeeklyReview";
import Community from "./pages/Community";
import ThreadDetail from "./pages/ThreadDetail";
import CreateThread from "./pages/CreateThread";
import Marketplace from "./pages/Marketplace";
import ResourceDetail from "./pages/ResourceDetail";
import Mentors from "./pages/Mentors";
import MentorDetail from "./pages/MentorDetail";
import Accountability from "./pages/Accountability";
import AIChat from "./pages/AIChat";

import AdminShell from "./pages/admin/AdminShell";
import AdminOverview from "./pages/admin/Overview";
import AdminRecruitments from "./pages/admin/Recruitments";
import AdminEligibility from "./pages/admin/EligibilityQueue";
import AdminAudit from "./pages/admin/Audit";
import AdminRBAC from "./pages/admin/RBAC";
import AdminMentorsPg from "./pages/admin/Mentors";
import AdminCommunity from "./pages/admin/Community";
import AdminAIPolicy from "./pages/admin/AIPolicy";
import AdminSources from "./pages/admin/Sources";
import AdminScraper from "./pages/admin/Scraper";
import AdminNotifications from "./pages/admin/Notifications";
import AdminMarketplace from "./pages/admin/Marketplace";
import AdminPlans from "./pages/admin/Plans";
import Pricing from "./pages/Pricing";

import { ProtectedRoute, GuestOnly } from "./lib/ProtectedRoute";
import RouteErrorBoundary from "./components/RouteErrorBoundary";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />

      {/* Auth */}
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* User app */}
      <Route element={<ProtectedRoute><DashShell /></ProtectedRoute>}><Route element={<RouteErrorBoundary />}>
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/today" element={<Today />} />
        <Route path="/app/profile" element={<Profile />} />
        <Route path="/app/onboarding" element={<Onboarding />} />
        <Route path="/app/exams" element={<Exams />} />
        <Route path="/app/exams/:slug" element={<ExamDetail />} />
        <Route path="/app/saved" element={<Saved />} />
        <Route path="/app/tracker" element={<Tracker />} />
        <Route path="/app/study-plan" element={<StudyPlan />} />
        <Route path="/app/study/focus" element={<Focus />} />
        <Route path="/app/study/mocks" element={<Mocks />} />
        <Route path="/app/study/subjects" element={<Subjects />} />
        <Route path="/app/study/review" element={<WeeklyReview />} />
        <Route path="/app/community" element={<Community />} />
        <Route path="/app/community/new" element={<CreateThread />} />
        <Route path="/app/community/:slug" element={<ThreadDetail />} />
        <Route path="/app/marketplace" element={<Marketplace />} />
        <Route path="/app/marketplace/:id" element={<ResourceDetail />} />
        <Route path="/app/mentors" element={<Mentors />} />
        <Route path="/app/mentors/:id" element={<MentorDetail />} />
        <Route path="/app/accountability" element={<Accountability />} />
        <Route path="/app/ai" element={<AIChat />} />
        <Route path="/app/pricing" element={<Pricing />} />
      </Route>
      </Route>

      {/* Admin */}
      <Route element={
        <ProtectedRoute role={["admin", "super_admin"]}>
          <AdminShell />
        </ProtectedRoute>
      }>
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/recruitments" element={<AdminRecruitments />} />
        <Route path="/admin/eligibility-queue" element={<AdminEligibility />} />
        <Route path="/admin/sources" element={<AdminSources />} />
        <Route path="/admin/scraper" element={<AdminScraper />} />
        <Route path="/admin/notifications" element={<AdminNotifications />} />
        <Route path="/admin/marketplace" element={<AdminMarketplace />} />
        <Route path="/admin/plans" element={<AdminPlans />} />
        <Route path="/admin/audit" element={<AdminAudit />} />
        <Route path="/admin/rbac" element={<AdminRBAC />} />
        <Route path="/admin/mentors" element={<AdminMentorsPg />} />
        <Route path="/admin/community" element={<AdminCommunity />} />
        <Route path="/admin/ai-policy" element={<AdminAIPolicy />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

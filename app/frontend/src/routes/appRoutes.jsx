import React from "react";
import { Route } from "react-router-dom";
import RouteErrorBoundary from "../components/RouteErrorBoundary";
import { ProtectedRoute } from "../lib/ProtectedRoute";
import DashShell from "../pages/DashShell";
import Dashboard from "../pages/Dashboard";
import Today from "../pages/Today";
import Profile from "../pages/Profile";
import Onboarding from "../pages/Onboarding";
import Exams from "../pages/Exams";
import ExamDetail from "../pages/ExamDetail";
import Saved from "../pages/Saved";
import Tracker from "../pages/Tracker";
import StudyPlan from "../pages/StudyPlan";
import Focus from "../pages/study/Focus";
import Mocks from "../pages/study/Mocks";
import Subjects from "../pages/study/Subjects";
import WeeklyReview from "../pages/study/WeeklyReview";
import Community from "../pages/Community";
import CreateThread from "../pages/CreateThread";
import ThreadDetail from "../pages/ThreadDetail";
import Marketplace from "../pages/Marketplace";
import ResourceDetail from "../pages/ResourceDetail";
import Mentors from "../pages/Mentors";
import MentorDetail from "../pages/MentorDetail";
import Accountability from "../pages/Accountability";
import AIChat from "../pages/AIChat";
import Notifications from "../pages/Notifications";
import NotificationPreferences from "../pages/NotificationPreferences";
import Pricing from "../pages/Pricing";

export const appRouteElements = (
  <Route element={<ProtectedRoute><DashShell /></ProtectedRoute>}>
    <Route element={<RouteErrorBoundary />}>
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
      <Route path="/app/notifications" element={<Notifications />} />
      <Route path="/app/notifications/preferences" element={<NotificationPreferences />} />
      <Route path="/app/pricing" element={<Pricing />} />
    </Route>
  </Route>
);

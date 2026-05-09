import React from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "../lib/ProtectedRoute";
import AdminShell from "../pages/admin/AdminShell";
import AdminOverview from "../pages/admin/Overview";
import AdminRecruitments from "../pages/admin/Recruitments";
import AdminEligibility from "../pages/admin/EligibilityQueue";
import AdminSources from "../pages/admin/Sources";
import AdminOrganizations from "../pages/admin/Organizations";
import AdminScraper from "../pages/admin/Scraper";
import AdminNotifications from "../pages/admin/Notifications";
import AdminMarketplace from "../pages/admin/Marketplace";
import AdminPlans from "../pages/admin/Plans";
import AdminAudit from "../pages/admin/Audit";
import AdminRBAC from "../pages/admin/RBAC";
import AdminMentorsPg from "../pages/admin/Mentors";
import AdminCommunity from "../pages/admin/Community";
import AdminAIPolicy from "../pages/admin/AIPolicy";

export default function AdminRoutes() {
  return <Route element={<ProtectedRoute role={["admin", "super_admin"]}><AdminShell /></ProtectedRoute>}><Route path="/admin" element={<AdminOverview />} /><Route path="/admin/recruitments" element={<AdminRecruitments />} /><Route path="/admin/eligibility-queue" element={<AdminEligibility />} /><Route path="/admin/sources" element={<AdminSources />} /><Route path="/admin/organizations" element={<AdminOrganizations />} /><Route path="/admin/scraper" element={<AdminScraper />} /><Route path="/admin/notifications" element={<AdminNotifications />} /><Route path="/admin/marketplace" element={<AdminMarketplace />} /><Route path="/admin/plans" element={<AdminPlans />} /><Route path="/admin/audit" element={<AdminAudit />} /><Route path="/admin/rbac" element={<AdminRBAC />} /><Route path="/admin/mentors" element={<AdminMentorsPg />} /><Route path="/admin/community" element={<AdminCommunity />} /><Route path="/admin/ai-policy" element={<AdminAIPolicy />} /></Route>;
}

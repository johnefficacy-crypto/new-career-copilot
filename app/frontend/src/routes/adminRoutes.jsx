import React from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "../lib/ProtectedRoute";
import { ADMIN_ROLES } from "../lib/rbac";
import AdminShell from "../pages/admin/AdminShell";
import AdminOverview from "../pages/admin/Overview";
import AdminRecruitments from "../pages/admin/Recruitments";
import AdminEligibility from "../pages/admin/EligibilityQueue";
import AdminOperationsConsole from "../pages/admin/OperationsConsole";
import AdminEligibilityOps from "../pages/admin/EligibilityOps";
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
import AdminPersona from "../pages/admin/Persona";
import AdminExamIntelligence from "../pages/admin/ExamIntelligence";
import AdminModerationQueue from "../pages/admin/ModerationQueue";
import AdminKPIs from "../pages/admin/KPIs";
import AdminCopyright from "../pages/admin/Copyright";
import AdminBlogs from "../pages/admin/Blogs";
import AdminUserStudyInspector from "../pages/admin/studyos/UserStudyInspector";
import AdminStudyOsPlanOps from "../pages/admin/studyos/PlanOps";
import AdminStudyOsArtifacts from "../pages/admin/studyos/Artifacts";
import AdminStudyOsMockTrust from "../pages/admin/studyos/MockTrust";
import AdminStudyOsReports from "../pages/admin/studyos/Reports";

export const adminRouteElements = (
  <Route element={<ProtectedRoute role={ADMIN_ROLES} requireBackend><AdminShell /></ProtectedRoute>}>
    <Route path="/admin" element={<AdminOverview />} />
    <Route path="/admin/operations" element={<AdminOperationsConsole />} />
    <Route path="/admin/recruitments" element={<AdminRecruitments />} />
    <Route path="/admin/eligibility-queue" element={<AdminEligibility />} />
    <Route path="/admin/promotion-queue" element={<AdminEligibility />} />
    <Route path="/admin/eligibility-ops" element={<AdminEligibilityOps />} />
    <Route path="/admin/sources" element={<AdminSources />} />
    <Route path="/admin/organizations" element={<AdminOrganizations />} />
    <Route path="/admin/scraper" element={<AdminScraper />} />
    <Route path="/admin/notifications" element={<AdminNotifications />} />
    <Route path="/admin/marketplace" element={<AdminMarketplace />} />
    <Route path="/admin/plans" element={<AdminPlans />} />
    <Route path="/admin/audit" element={<AdminAudit />} />
    <Route path="/admin/rbac" element={<AdminRBAC />} />
    <Route path="/admin/mentors" element={<AdminMentorsPg />} />
    <Route path="/admin/community" element={<AdminCommunity />} />
    <Route path="/admin/ai-policy" element={<AdminAIPolicy />} />
    <Route path="/admin/persona" element={<AdminPersona />} />
    <Route path="/admin/exam-intelligence" element={<AdminExamIntelligence />} />
    <Route path="/admin/moderation" element={<AdminModerationQueue />} />
    <Route path="/admin/kpis" element={<AdminKPIs />} />
    <Route path="/admin/copyright" element={<AdminCopyright />} />
    <Route path="/admin/blogs" element={<AdminBlogs />} />
    <Route path="/admin/study-os" element={<AdminUserStudyInspector />} />
    <Route path="/admin/study-os/plan-ops" element={<AdminStudyOsPlanOps />} />
    <Route path="/admin/study-os/artifacts" element={<AdminStudyOsArtifacts />} />
    <Route path="/admin/study-os/mocks" element={<AdminStudyOsMockTrust />} />
    <Route path="/admin/study-os/reports" element={<AdminStudyOsReports />} />
  </Route>
);

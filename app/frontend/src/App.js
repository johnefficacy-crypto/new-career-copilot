"import React from \"react\";
import { Routes, Route } from \"react-router-dom\";
import Landing from \"./pages/Landing\";
import Dashboard from \"./pages/Dashboard\";
import ExamsPage from \"./pages/Exams\";
import StudyPlanPage from \"./pages/StudyPlan\";
import CommunityPage from \"./pages/Community\";
import AdminShell from \"./pages/admin/AdminShell\";
import AdminRecruitments from \"./pages/admin/Recruitments\";
import AdminEligibilityQueue from \"./pages/admin/EligibilityQueue\";
import AdminAudit from \"./pages/admin/Audit\";
import AdminRBAC from \"./pages/admin/RBAC\";
import AdminMentors from \"./pages/admin/Mentors\";
import AdminCommunity from \"./pages/admin/Community\";
import AdminAIPolicy from \"./pages/admin/AIPolicy\";
import AdminOverview from \"./pages/admin/Overview\";
import DashShell from \"./pages/DashShell\";

export default function App() {
  return (
    <div className=\"min-h-screen bg-background text-foreground\">
      <Routes>
        <Route path=\"/\" element={<Landing />} />
        <Route element={<DashShell />}>
          <Route path=\"/app\" element={<Dashboard />} />
          <Route path=\"/app/exams\" element={<ExamsPage />} />
          <Route path=\"/app/study-plan\" element={<StudyPlanPage />} />
          <Route path=\"/app/community\" element={<CommunityPage />} />
        </Route>
        <Route element={<AdminShell />}>
          <Route path=\"/admin\" element={<AdminOverview />} />
          <Route path=\"/admin/recruitments\" element={<AdminRecruitments />} />
          <Route path=\"/admin/eligibility-queue\" element={<AdminEligibilityQueue />} />
          <Route path=\"/admin/audit\" element={<AdminAudit />} />
          <Route path=\"/admin/rbac\" element={<AdminRBAC />} />
          <Route path=\"/admin/mentors\" element={<AdminMentors />} />
          <Route path=\"/admin/community\" element={<AdminCommunity />} />
          <Route path=\"/admin/ai-policy\" element={<AdminAIPolicy />} />
        </Route>
      </Routes>
    </div>
  );
}
"
import React from "react";
import { Navigate, Route } from "react-router-dom";
import RouteErrorBoundary from "../components/RouteErrorBoundary";
import { ProtectedRoute } from "../lib/ProtectedRoute";
import DashShell from "../pages/DashShell";
import Today from "../pages/Today";
import Profile from "../pages/Profile";
import Exams from "../pages/Exams";
import ExamDetail from "../pages/ExamDetail";
import Saved from "../pages/Saved";
import Tracker from "../pages/Tracker";
import StudyPlan from "../pages/StudyPlan";
import Focus from "../pages/study/Focus";
import Mocks from "../pages/study/Mocks";
import Subjects from "../pages/study/Subjects";
import WeeklyReview from "../pages/study/WeeklyReview";
import StudyCompare from "../pages/study/Compare";
import Notes from "../pages/Notes";
import Flashcards from "../pages/study/Flashcards";
import FlashcardsDeck from "../pages/study/FlashcardsDeck";
import Mistakes from "../pages/study/Mistakes";
import Revision from "../pages/study/Revision";
import Reports from "../pages/Reports";
import CommunityScreen from "../features/community/CommunityScreen";
import StudyGroupsScreen from "../features/community/StudyGroupsScreen";
import PartnersScreen from "../features/community/PartnersScreen";
import MentorsScreen from "../features/community/MentorsScreen";
import ResourcesScreen from "../features/community/ResourcesScreen";
import Marketplace from "../pages/Marketplace";
import ResourceDetail from "../pages/ResourceDetail";
import CoursePlayer from "../pages/CoursePlayer";
import MentorDetail from "../pages/MentorDetail";
import AIChat from "../pages/AIChat";
import Notifications from "../pages/Notifications";
import NotificationPreferences from "../pages/NotificationPreferences";
import Pricing from "../pages/Pricing";
import EligibilityShell from "../pages/eligibility/EligibilityShell";
import EligibleExamsPage from "../pages/eligibility/EligibleExamsPage";
import EligibleRecruitmentsPage from "../pages/eligibility/EligibleRecruitmentsPage";
import EligibilityTrackerPage from "../pages/eligibility/EligibilityTrackerPage";
import StudyShell from "../pages/study/StudyShell";
import StudyHome from "../pages/study/StudyHome";
import StudyLearningHub from "../pages/study/StudyLearningHub";
import StudyProgressHub from "../pages/study/StudyProgressHub";

export const appRouteElements = (
  <Route element={<ProtectedRoute requireBackend><DashShell /></ProtectedRoute>}>
    <Route element={<RouteErrorBoundary />}>
      <Route path="/app" element={<Navigate to="/app/today" replace />} />
      <Route path="/app/dashboard" element={<Navigate to="/app/today" replace />} />
      <Route path="/app/today" element={<Today />} />
      <Route path="/app/profile" element={<Profile />} />
      <Route path="/app/onboarding" element={<Navigate to="/app/onboarding/chat?mode=discovery" replace />} />
      <Route path="/app/exams" element={<Exams />} />
      <Route path="/app/exams/:slug" element={<ExamDetail />} />
      <Route path="/app/saved" element={<Saved />} />
      <Route path="/app/tracker" element={<Tracker />} />
      <Route path="/app/study-plan" element={<StudyPlan />} />

      {/*
        Canonical aspirant areas (PR1 of the Today / Eligibility / Study
        reorg). Routes are live so the new shells can be reached directly,
        but the sidebar is not flipped until PR4 and legacy paths above
        keep working until PR2 turns them into <Navigate> aliases.

        Param convention:
          :slug  on /eligibility/exams/:slug      — stable catalogue entity
                                                    (matches existing
                                                    /app/exams/:slug usage).
          :id    on /eligibility/recruitments/:id — transient cycle entity
                                                    keyed by DB id.
      */}
      <Route path="/app/eligibility" element={<EligibilityShell />}>
        <Route index element={<Navigate to="/app/eligibility/exams" replace />} />
        <Route path="exams" element={<EligibleExamsPage />} />
        <Route path="exams/:slug" element={<ExamDetail />} />
        <Route path="recruitments" element={<EligibleRecruitmentsPage />} />
        <Route path="recruitments/:id" element={<EligibleRecruitmentsPage />} />
        <Route path="tracker" element={<EligibilityTrackerPage />} />
      </Route>

      <Route path="/app/study" element={<StudyShell />}>
        <Route index element={<StudyHome />} />
        <Route path="plan" element={<StudyPlan />} />
        <Route path="learning" element={<StudyLearningHub />} />
        <Route path="progress" element={<StudyProgressHub />} />
      </Route>
      <Route path="/app/study/focus" element={<Focus />} />
      <Route path="/app/study/mocks" element={<Mocks />} />
      <Route path="/app/study/subjects" element={<Subjects />} />
      <Route path="/app/study/review" element={<WeeklyReview />} />
      <Route path="/app/study/compare" element={<StudyCompare />} />
      <Route path="/app/notes" element={<Notes />} />
      <Route path="/app/flashcards" element={<Flashcards />} />
      <Route path="/app/flashcards/:deckId" element={<FlashcardsDeck />} />
      <Route path="/app/study/mistakes" element={<Mistakes />} />
      <Route path="/app/study/revision" element={<Revision />} />
      <Route path="/app/reports" element={<Reports />} />
      <Route path="/app/community" element={<CommunityScreen />} />
      <Route path="/app/community/:spaceId" element={<CommunityScreen />} />
      <Route path="/app/community/:spaceId/:channelId" element={<CommunityScreen />} />
      <Route path="/app/community/:spaceId/:channelId/:threadId" element={<CommunityScreen />} />
      <Route path="/app/groups" element={<StudyGroupsScreen />} />
      <Route path="/app/partners" element={<PartnersScreen />} />
      <Route path="/app/resources" element={<ResourcesScreen />} />
      <Route path="/app/marketplace" element={<Marketplace />} />
      <Route path="/app/marketplace/:id" element={<ResourceDetail />} />
      <Route path="/app/marketplace/:id/learn" element={<CoursePlayer />} />
      <Route path="/app/mentors" element={<MentorsScreen />} />
      <Route path="/app/mentors/:id" element={<MentorDetail />} />
      <Route path="/app/accountability" element={<PartnersScreen />} />
      <Route path="/app/ai" element={<AIChat />} />
      <Route path="/app/notifications" element={<Notifications />} />
      <Route path="/app/notifications/preferences" element={<NotificationPreferences />} />
      <Route path="/app/pricing" element={<Pricing />} />
    </Route>
  </Route>
);

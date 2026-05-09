import { api } from "../lib/api";

export const dashboardService = {
  getRecommendations: () => api.get("/api/recommendations/me"),
  getRecruitments: () => api.get("/api/recruitments"),
  getStudyPlan: () => api.get("/api/study/plan"),
  getFocusSummary: () => api.get("/api/study/focus/summary"),
  getWeeklyReview: () => api.get("/api/study/weekly-review"),
  getApplications: () => api.get("/api/applications/me"),
  getProfileCompletion: () => api.get("/api/profile/completion"),
};

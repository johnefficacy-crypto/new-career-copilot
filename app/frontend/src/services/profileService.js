import { api } from "../lib/api";

export const profileService = {
  getProfile: () => api.get("/api/profile/me"),
  updateProfile: (body) => api.put("/api/profile/me", body),
  getProfileCompletion: () => api.get("/api/profile/completion"),
  getCertifications: () => api.get("/api/profile/certifications"),
  addCertification: (body) => api.post("/api/profile/certifications", body),
  deleteCertification: (id) => api.delete(`/api/profile/certifications/${id}`),
  getExperience: () => api.get("/api/profile/experience"),
  addExperience: (body) => api.post("/api/profile/experience", body),
  deleteExperience: (id) => api.delete(`/api/profile/experience/${id}`),
  getExamAttempts: () => api.get("/api/profile/exam-attempts"),
  addExamAttempt: (body) => api.post("/api/profile/exam-attempts", body),
  deleteExamAttempt: (id) => api.delete(`/api/profile/exam-attempts/${id}`),
  getCertificationMetadata: () => api.get("/api/metadata/certifications"),
};

import { api } from "../lib/api";

export const notesService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/notes${qs ? `?${qs}` : ""}`);
  },
  get: (id) => api.get(`/api/notes/${id}`),
  create: (body) => api.post("/api/notes", body),
  update: (id, body) => api.patch(`/api/notes/${id}`, body),
  remove: (id) => api.delete(`/api/notes/${id}`),
};

export const flashcardsService = {
  listDecks: () => api.get("/api/flashcards/decks"),
  createDeck: (body) => api.post("/api/flashcards/decks", body),
  updateDeck: (id, body) => api.patch(`/api/flashcards/decks/${id}`, body),
  deleteDeck: (id) => api.delete(`/api/flashcards/decks/${id}`),
  listCards: (deckId, { dueOnly = false } = {}) =>
    api.get(`/api/flashcards/decks/${deckId}/cards${dueOnly ? "?due_only=true" : ""}`),
  createCard: (deckId, body) => api.post(`/api/flashcards/decks/${deckId}/cards`, body),
  updateCard: (id, body) => api.patch(`/api/flashcards/cards/${id}`, body),
  deleteCard: (id) => api.delete(`/api/flashcards/cards/${id}`),
  review: (cardId, body) => api.post(`/api/flashcards/cards/${cardId}/review`, body),
  dueSummary: () => api.get("/api/flashcards/due-summary"),
};

export const mistakesService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/mistakes${qs ? `?${qs}` : ""}`);
  },
  summary: () => api.get("/api/mistakes/summary"),
  create: (body) => api.post("/api/mistakes", body),
  update: (id, body) => api.patch(`/api/mistakes/${id}`, body),
  remove: (id) => api.delete(`/api/mistakes/${id}`),
  review: (id, body) => api.post(`/api/mistakes/${id}/review`, body),
  promote: (id, body) => api.post(`/api/mistakes/${id}/promote`, body),
};

export const revisionService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/revision${qs ? `?${qs}` : ""}`);
  },
  today: () => api.get("/api/revision/today"),
  create: (body) => api.post("/api/revision", body),
  complete: (id, body) => api.post(`/api/revision/${id}/complete`, body),
  skip: (id) => api.post(`/api/revision/${id}/skip`),
  cancel: (id) => api.delete(`/api/revision/${id}`),
};

export const reportsService = {
  listTypes: () => api.get("/api/reports/types"),
  list: () => api.get("/api/reports"),
  request: (body) => api.post("/api/reports", body),
  get: (id) => api.get(`/api/reports/${id}`),
  download: (id) => api.get(`/api/reports/${id}/download`),
};

export const moderationService = {
  fileReport: (body) => api.post("/api/moderation/report", body),
  myReports: () => api.get("/api/moderation/my-reports"),
};

export const adminModerationService = {
  queue: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/admin/moderation/queue${qs ? `?${qs}` : ""}`);
  },
  stats: () => api.get("/api/admin/moderation/stats"),
  get: (id) => api.get(`/api/admin/moderation/items/${id}`),
  claim: (id) => api.post(`/api/admin/moderation/items/${id}/claim`),
  assign: (id, body) => api.post(`/api/admin/moderation/items/${id}/assign`, body),
  status: (id, body) => api.post(`/api/admin/moderation/items/${id}/status`, body),
  resolve: (id, body) => api.post(`/api/admin/moderation/items/${id}/resolve`, body),
};

export const adminKpiService = {
  dashboard: (days = 14) => api.get(`/api/admin/kpis?days=${days}`),
  recompute: () => api.post("/api/admin/kpis/recompute"),
};

export const copyrightService = {
  submit: (body) => api.post("/api/copyright/submit", body),
};

export const adminCopyrightService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/api/admin/copyright${qs ? `?${qs}` : ""}`);
  },
  stats: () => api.get("/api/admin/copyright/stats"),
  get: (id) => api.get(`/api/admin/copyright/${id}`),
  triage: (id, body) => api.post(`/api/admin/copyright/${id}/triage`, body),
  resolve: (id, body) => api.post(`/api/admin/copyright/${id}/resolve`, body),
  counterNotice: (id, body) => api.post(`/api/admin/copyright/${id}/counter-notice`, body),
};

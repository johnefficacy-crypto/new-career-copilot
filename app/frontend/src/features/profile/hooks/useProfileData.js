import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function useProfileData() {
  const [form, setForm] = useState({});
  const [completion, setCompletion] = useState({});
  const [certs, setCerts] = useState([]);
  const [expRows, setExpRows] = useState([]);
  const [attemptRows, setAttemptRows] = useState([]);
  const [certRegistry, setCertRegistry] = useState([]);
  const [newCert, setNewCert] = useState({ certification_name: "", issuing_body: "", year_completed: "" });
  const [newExp, setNewExp] = useState({ sector: "", role: "", organization: "", start_date: "", end_date: "" });
  const [newAttempt, setNewAttempt] = useState({ exam_id: "", attempts_used: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [u, c, cs, ex, at, reg] = await Promise.all([
        api.get("/api/profile/me"),
        api.get("/api/profile/completion"),
        api.get("/api/profile/certifications"),
        api.get("/api/profile/experience"),
        api.get("/api/profile/exam-attempts"),
        api.get("/api/metadata/certifications").catch(() => ({ items: [] })),
      ]);
      setForm({
        name: u.name || "", email: u.email || "", phone: u.profile?.phone || "", gender: u.profile?.gender || "", date_of_birth: u.profile?.date_of_birth || "",
        category: u.profile?.category || "", pwbd_status: u.profile?.pwbd_status || "none", state: u.profile?.domicile_state || "", nationality: u.profile?.nationality || "",
        ex_serviceman: !!u.profile?.ex_serviceman, service_years: u.profile?.service_years ?? "", govt_employee: !!u.profile?.govt_employee,
        qualification: u.profile?.qualification || "", education_level: u.profile?.education_level || "", stream: u.profile?.stream || "", qualification_year: u.profile?.qualification_year || "",
        percentage: u.profile?.percentage || "", cgpa: u.profile?.cgpa || "", goal_exams: u.profile?.goal_exams || [], preferred_states: u.profile?.preferred_states || [], preferred_sectors: u.profile?.preferred_sectors || [],
        willing_to_relocate: u.profile?.willing_to_relocate ?? true, study_mode: u.profile?.study_mode || "", weekly_hours_goal: u.profile?.weekly_hours_goal || "", target_exam_year: u.profile?.target_exam_year || "",
      });
      setCompletion(c || {}); setCerts(cs?.items || []); setExpRows(ex?.items || []); setAttemptRows(at?.items || []); setCertRegistry(reg?.items || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { form, setForm, completion, setCompletion, certs, setCerts, expRows, setExpRows, attemptRows, setAttemptRows, certRegistry, newCert, setNewCert, newExp, setNewExp, newAttempt, setNewAttempt, loading, error, reload };
}

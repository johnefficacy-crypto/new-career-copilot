from __future__ import annotations

from app.db.utils import require_select, safe_select

def _norm_cat(v):
    return (v or "").strip().lower() or None

def build_user_eligibility_profile(supabase, user_id: str) -> dict:
    p = (require_select(supabase, "profiles", "*", id=user_id) or [{}])[0]
    loc = (require_select(supabase, "aspirant_location", "state,district,is_rural,domicile_certificate", user_id=user_id) or [{}])[0]
    res = (require_select(supabase, "aspirant_reservations", "category,sub_category,is_pwd,pwd_type,is_ex_serviceman", user_id=user_id) or [{}])[0]
    edu = require_select(supabase, "aspirant_education", "level,degree,stream,graduation_year,percentage,cgpa,is_completed", user_id=user_id)
    certs = safe_select(supabase, "aspirant_certifications", "certification_name,issuing_body,year_completed,is_active", user_id=user_id)
    exp = safe_select(supabase, "aspirant_experience", "sector,role,organization,start_date,end_date,years_experience", user_id=user_id)
    prefs = (safe_select(supabase, "aspirant_preferences", "target_exams,preferred_states,preferred_sectors,willing_to_relocate,study_mode,study_hours_per_day", user_id=user_id) or [{}])[0]
    attempts = safe_select(supabase, "aspirant_exam_attempts", "exam_id,attempts_used", user_id=user_id)
    creds = safe_select(supabase, "aspirant_exam_credentials", "exam_key,score,percentile,rank_text,exam_year", user_id=user_id)
    return {
        "user_id": user_id,
        "identity": {
            "full_name": p.get("full_name"), "dob": p.get("dob") or p.get("date_of_birth"), "nationality": p.get("nationality"),
        },
        "location": {"state": loc.get("state") or p.get("domicile_state"), "district": loc.get("district")},
        "reservations": {
            "category": _norm_cat(res.get("category") or p.get("category")),
            "is_pwd": bool(res.get("is_pwd") or p.get("pwbd_status")),
            "pwd_type": res.get("pwd_type") or p.get("pwbd_status"),
            "is_ex_serviceman": bool(res.get("is_ex_serviceman") if res.get("is_ex_serviceman") is not None else p.get("ex_serviceman")),
            "govt_employee": bool(p.get("govt_employee")),
        },
        "education": [{**r, "percentage": float(r["percentage"]) if r.get("percentage") is not None else None, "cgpa": float(r["cgpa"]) if r.get("cgpa") is not None else None} for r in edu],
        "certifications": [{**r, "certification_name": (r.get("certification_name") or "").strip().lower()} for r in certs if r.get("is_active", True)],
        "experience": [{**r, "years_experience": float(r["years_experience"]) if r.get("years_experience") is not None else None} for r in exp],
        "preferences": {
            "target_exams": prefs.get("target_exams") or [], "preferred_states": prefs.get("preferred_states") or [], "preferred_sectors": prefs.get("preferred_sectors") or [], "willing_to_relocate": prefs.get("willing_to_relocate"), "study_mode": prefs.get("study_mode")
        },
        "attempts": [{"exam_id": a.get("exam_id"), "attempts_used": int(a.get("attempts_used") or 0)} for a in attempts],
        "credentials": creds,
    }

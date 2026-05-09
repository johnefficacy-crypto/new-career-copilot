import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { CheckboxField, ErrorState, InputField, LoadingSkeleton, SelectField, useToast } from "../shared/ui";

const TYPES = ["complete_profile","continue_application","submit_form","prepare_after_submission","study_backlog_recovery","weekly_review_ready","monitor_result","apply_deadline_urgent"];

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => { api.get('/api/notifications/preferences/me').then((d) => setPrefs(d.preferences || {})).catch(setError); }, []);
  if (!prefs && !error) return <LoadingSkeleton variant="form" className="max-w-3xl" />;
  if (error) return <ErrorState title="Unable to load notification preferences" message={error.message || "Please try again."} onRetry={() => window.location.reload()} />;

  const toggleType = (key, type) => {
    const current = new Set(prefs[key] || []);
    if (current.has(type)) current.delete(type); else current.add(type);
    setPrefs({ ...prefs, [key]: Array.from(current) });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/api/notifications/preferences/me', prefs);
      toast.success("Notification preferences saved.");
    } catch (err) {
      setError(err);
      toast.error(err.message || "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-4"><h1 className="font-heading text-3xl">Notification preferences</h1>
    <div className="soft-card rounded-2xl p-4 space-y-2"><div className="font-semibold">In-app by type</div>{TYPES.map((t)=><CheckboxField key={t} label={t} checked={!(prefs.in_app_types_disabled||[]).includes(t)} onChange={()=>toggleType('in_app_types_disabled', t)} />)}</div>
    <div className="soft-card rounded-2xl p-4 space-y-2"><div className="font-semibold">Email by type (preference only)</div>{TYPES.map((t)=><CheckboxField key={t+':e'} label={t} checked={!(prefs.email_types_disabled||[]).includes(t)} onChange={()=>toggleType('email_types_disabled', t)} />)}</div>
    <div className="soft-card rounded-2xl p-4 grid md:grid-cols-3 gap-3">
      <div><SelectField label="Digest" value={prefs.digest_preference||'off'} onChange={(e)=>setPrefs({...prefs,digest_preference:e.target.value})}><option value="off">off</option><option value="daily">daily</option><option value="weekly">weekly</option></SelectField><p className="text-xs text-muted-foreground">Choose summary cadence for reminder rollups.</p></div>
      <div><SelectField label="Min priority" value={prefs.min_priority_in_app||'low'} onChange={(e)=>setPrefs({...prefs,min_priority_in_app:e.target.value})}><option>low</option><option>medium</option><option>high</option></SelectField><p className="text-xs text-muted-foreground">Hide low-importance notices from in-app feed.</p></div>
      <div><SelectField label="Deadline reminders" multiple value={prefs.deadline_reminder_windows||[]} onChange={(e)=>setPrefs({...prefs,deadline_reminder_windows:Array.from(e.target.selectedOptions).map(o=>o.value)})}><option value="48h">48h</option><option value="24h">24h</option><option value="6h">6h</option></SelectField><p className="text-xs text-muted-foreground">When to remind you before deadlines.</p></div>
      <div><InputField label="Quiet start hour" type="number" min="0" max="23" value={prefs.quiet_hours_start ?? ''} onChange={(e)=>setPrefs({...prefs,quiet_hours_start:e.target.value===''?null:Number(e.target.value)})} /><p className="text-xs text-muted-foreground">No non-urgent notifications after this hour.</p></div>
      <div><InputField label="Quiet end hour" type="number" min="0" max="23" value={prefs.quiet_hours_end ?? ''} onChange={(e)=>setPrefs({...prefs,quiet_hours_end:e.target.value===''?null:Number(e.target.value)})} /><p className="text-xs text-muted-foreground">Notifications resume after this hour.</p></div>
    </div>
    <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</button>
  </div>;
}

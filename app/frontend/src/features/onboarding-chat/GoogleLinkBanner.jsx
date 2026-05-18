import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "../../lib/authContext";

// Sticky-ish top banner shown only while the user is anonymous. Calls
// supabase.auth.linkIdentity({provider:'google'}) which keeps the
// same user_id and flips is_anonymous=false on success. If the email
// is already attached to a different account we sign the anonymous
// user out and route them to the normal login flow so they don't
// fork their data into two rows.
export default function GoogleLinkBanner() {
  const { linkGoogleIdentity, logout, user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (!user?.is_anonymous) return null;

  const handleLink = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await linkGoogleIdentity();
      if (result?.ok) {
        // Supabase will redirect — nothing else to do here.
        return;
      }
      if (result?.conflict) {
        await logout();
        navigate("/login?conflict=true");
        return;
      }
      setError(result?.error || "Couldn't link your Google account");
    } catch (e) {
      setError(e?.message || "Couldn't link your Google account");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      data-testid="google-link-banner"
      className="soft-card rounded-2xl p-3 flex items-center gap-2 border border-clay-200"
    >
      <Sparkles className="h-4 w-4 text-clay-500 shrink-0" aria-hidden="true" />
      <div className="flex-1 text-xs text-clay-800">
        Sign in with Google to save your progress permanently.
      </div>
      <button
        type="button"
        onClick={handleLink}
        disabled={pending}
        className="btn btn-primary text-xs"
        data-testid="google-link-button"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sign in with Google"}
      </button>
      {error && <p className="text-xs text-amber-700 ml-2">{error}</p>}
    </div>
  );
}

'use client';
import { useApp } from '../context/AppContext';

export function TierBadgeInner() {
  const { userTier, setUserTier } = useApp();
  const labels: Record<string, string> = { free: 'Free', pro: 'Pro', elite: 'Elite' };
  const icons: Record<string, string>  = { free: '○', pro: '◆', elite: '★' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span className={`tier-badge tier-${userTier}`}>
        {icons[userTier]} {labels[userTier]}
      </span>
      <select
        value={userTier}
        onChange={e => setUserTier(e.target.value as any)}
        title="Switch tier (demo)"
        style={{
          fontSize: '0.72rem', border: '1px solid #e5e7eb', borderRadius: 6,
          padding: '0.2rem 0.4rem', background: '#f9fafb', color: '#6b7280', cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="free">Free</option>
        <option value="pro">Pro</option>
        <option value="elite">Elite</option>
      </select>
    </div>
  );
}

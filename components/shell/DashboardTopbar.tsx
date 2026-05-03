import { TierBadgeInner } from '../../app/components/TierBadge';

export default function DashboardTopbar(){
  return <header className="cc-topbar cc-card"><div><h1 className="cc-page-title">Career Copilot</h1><p className="cc-page-subtitle">Light dashboard shell</p></div><TierBadgeInner /></header>;
}

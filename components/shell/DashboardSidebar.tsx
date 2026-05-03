'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  ['Today','/dashboard'],['Discover','/dashboard/discover'],['Recruitments','/dashboard/recruitments'],['Eligibility','/dashboard/eligibility'],['Study','/dashboard/study'],['Progress','/dashboard/progress'],['Community','/dashboard/community'],['Marketplace','/dashboard/marketplace'],['AI Copilot','/dashboard/ai-copilot'],['Profile','/dashboard/profile'],['Settings','/dashboard/settings'],
] as const;

export default function DashboardSidebar(){
  const pathname = usePathname();
  return <aside className="cc-sidebar cc-card">{NAV.map(([label,href])=> <Link key={href} href={href} className={`cc-nav ${pathname===href?'active':''}`}>{label}</Link>)}</aside>;
}

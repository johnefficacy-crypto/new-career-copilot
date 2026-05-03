import React from 'react';
import DashboardSidebar from './DashboardSidebar';
import DashboardTopbar from './DashboardTopbar';

export default function AppShell({children}:{children:React.ReactNode}){
  return <div className="cc-shell"><DashboardSidebar /><div className="cc-shell-main"><DashboardTopbar /><div>{children}</div></div></div>;
}

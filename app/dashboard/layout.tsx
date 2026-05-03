import React from 'react';
import AppShell from '../../components/shell/AppShell';

export default function DashboardLayout({children}:{children:React.ReactNode}){
  return <main className="page"><AppShell>{children}</AppShell></main>;
}

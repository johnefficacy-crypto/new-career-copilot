import Link from 'next/link';
export default function ExamsLanding(){
  return <div className="page"><div className="cc-card"><h2>Exams moved</h2><p>Use the new sections:</p><ul><li><Link href="/dashboard/discover">Discover</Link></li><li><Link href="/dashboard/recruitments">Recruitments</Link></li><li><Link href="/dashboard/eligibility">Eligibility</Link></li></ul></div></div>;
}

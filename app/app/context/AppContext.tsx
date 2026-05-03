'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

export type UserTier = 'free' | 'pro' | 'elite';

export type StudyTask = {
  id: number; day: string; subject: string; topic: string; done: boolean; hours: number;
};

export type ApplicationStatus =
  | 'not_started' | 'applied' | 'admit_card' | 'appeared' | 'result_out' | 'notification_awaited';

export type Exam = {
  name: string; body: string; stage: string; date: string; deadline: string;
  status: string; applicationStatus: ApplicationStatus; statusTag: string;
  eligibility: string; eligibilityReason: string; posts: string;
  officialUrl: string; documents: string[];
};

export type Reply = {
  author: string; initials: string; text: string; time: string; verifiedTopper: boolean;
};

export type ThreadFlair = 'Question' | 'Strategy' | 'Resource' | 'Discussion' | 'Success';

export type Thread = {
  id: number; author: string; initials: string; title: string; preview: string; body: string;
  tags: string[]; flair: ThreadFlair; replies: Reply[]; likes: number; liked: boolean;
  time: string; pinned: boolean; verifiedTopper: boolean; reported: boolean;
  spaceId: string; channelId: string;
};

export type Resource = { title: string; type: string; progress: number };

export type StudyPlan = {
  generated: boolean; direction: string; weeklyTarget: string; tradeOff: string; macroGoal: string;
};

export type PartnerStatus = 'active' | 'pending' | 'invited';

export type WeeklyCommitment = { id: number; task: string; done: boolean };

export type SnapshotCommitment = { task: string; done: boolean };

export type WeekSnapshot = {
  weekLabel: string;
  myCommitments: SnapshotCommitment[];
  partnerCommitments: SnapshotCommitment[];
  myRate: number;
  partnerRate: number;
  penaltyOwed: number;
  penaltyRecovered: number;
};

export type AccountabilityPartner = {
  id: number;
  name: string;
  initials: string;
  exam: string;
  sharedGoal: string;
  status: PartnerStatus;
  nudged: boolean;
  lastActive: string;
  streak: number;
  myCommitments: WeeklyCommitment[];
  partnerCommitments: SnapshotCommitment[];
  checkedInThisWeek: boolean;
  partnerCheckedIn: boolean;
  penaltyType: 'ngo' | 'partner';
  penaltyAmount: number;
  penaltyNgo: string;
  weekHistory: WeekSnapshot[];
};

type AppContextType = {
  userTier: UserTier;
  setUserTier: (t: UserTier) => void;
  postsToday: number;
  incrementPostCount: () => void;

  tasks: StudyTask[];
  toggleTask: (id: number) => void;
  addTask: (task: Omit<StudyTask, 'id' | 'done'>) => void;

  exams: Exam[];
  updateExamStatus: (idx: number, status: string) => void;
  updateApplicationStatus: (idx: number, status: ApplicationStatus) => void;
  addExam: (exam: Omit<Exam, 'statusTag' | 'applicationStatus' | 'eligibilityReason' | 'officialUrl' | 'documents'>) => void;

  threads: Thread[];
  toggleLike: (id: number) => void;
  addReply: (threadId: number, text: string) => void;
  addThread: (thread: Omit<Thread, 'id' | 'likes' | 'liked' | 'replies' | 'pinned' | 'verifiedTopper' | 'reported'>) => void;
  reportThread: (id: number) => void;

  resources: Resource[];
  updateResourceProgress: (idx: number, val: number) => void;

  studyPlan: StudyPlan;
  generateStudyPlan: () => void;

  partners: AccountabilityPartner[];
  addPartner: (name: string, exam: string, sharedGoal: string, penaltyType: 'ngo' | 'partner', penaltyAmount: number, penaltyNgo: string) => void;
  removePartner: (id: number) => void;
  nudgePartner: (id: number) => void;
  updateSharedGoal: (id: number, goal: string) => void;
  toggleMyCommitment: (partnerId: number, commitmentId: number) => void;
  addMyCommitment: (partnerId: number, task: string) => void;
  removeMyCommitment: (partnerId: number, commitmentId: number) => void;
  submitCheckIn: (partnerId: number, weekLabel: string) => void;
  setPenalty: (partnerId: number, type: 'ngo' | 'partner', amount: number, ngo: string) => void;

  profileCompletion: number;
  missingFields: string[];
};

const statusTagMap = (status: string) =>
  status === 'Applied' ? 'tag-green'
  : status === 'Admit card ready' ? 'tag-yellow'
  : status === 'Notification awaited' ? 'tag-blue'
  : 'tag-gray';

const defaultTasks: StudyTask[] = [
  { id: 1, day: 'Mon', subject: 'Polity',        topic: 'Constitutional Amendments',       done: true,  hours: 2   },
  { id: 2, day: 'Tue', subject: 'Economics',     topic: 'Monetary Policy & RBI',           done: true,  hours: 2   },
  { id: 3, day: 'Wed', subject: 'History',       topic: 'Modern India — Freedom Movement', done: true,  hours: 2.5 },
  { id: 4, day: 'Thu', subject: 'Geography',     topic: 'Indian Climate & Monsoon',        done: false, hours: 2   },
  { id: 5, day: 'Fri', subject: 'Current Affairs', topic: 'April 2026 Monthly Digest',    done: false, hours: 1.5 },
  { id: 6, day: 'Sat', subject: 'Mock Test',     topic: 'UPSC GS Paper I — Full Length',  done: false, hours: 3   },
  { id: 7, day: 'Sun', subject: 'Revision',      topic: 'Weekly Review & Weak Areas',     done: false, hours: 2   },
];

const defaultExams: Exam[] = [
  {
    name: 'UPSC Civil Services 2026', body: 'Union Public Service Commission', stage: 'Prelims',
    date: 'Jun 1, 2026', deadline: '2026-06-01', status: 'Applied', statusTag: 'tag-green',
    applicationStatus: 'applied', eligibility: 'Eligible',
    eligibilityReason: 'Age (28) within limit. General category. B.Tech qualification meets Graduate requirement. Attempts remaining: 4 of 6.',
    posts: '1,056 vacancies', officialUrl: 'https://upsc.gov.in',
    documents: ['10th Certificate', '12th Certificate', 'Graduation Degree', 'Category Certificate', 'Photo ID'],
  },
  {
    name: 'SSC CGL Tier I 2026', body: 'Staff Selection Commission', stage: 'Tier I',
    date: 'Jul 14, 2026', deadline: '2026-07-14', status: 'Admit card ready', statusTag: 'tag-yellow',
    applicationStatus: 'admit_card', eligibility: 'Eligible',
    eligibilityReason: 'Age (28) within 18–32 limit for General. Graduate qualification met. Domicile: Delhi (no restriction).',
    posts: '17,727 vacancies', officialUrl: 'https://ssc.nic.in',
    documents: ['10th Certificate', 'Graduation Certificate', 'Photo ID', 'Admit Card'],
  },
  {
    name: 'RBI Grade B 2026', body: 'Reserve Bank of India', stage: 'Phase I',
    date: 'Aug 3, 2026', deadline: '2026-08-03', status: 'Not applied', statusTag: 'tag-gray',
    applicationStatus: 'not_started', eligibility: 'Eligible',
    eligibilityReason: 'Age (28) within 21–30 limit. Graduate with 60%+ required — met. General category applies.',
    posts: '102 vacancies', officialUrl: 'https://rbi.org.in',
    documents: ['Graduation Marksheets (all years)', '10th Certificate', 'Photo ID', 'Caste Certificate if applicable'],
  },
  {
    name: 'IBPS PO 2026', body: 'Institute of Banking Personnel Selection', stage: 'Prelims',
    date: 'Oct 4, 2026', deadline: '2026-10-04', status: 'Notification awaited', statusTag: 'tag-blue',
    applicationStatus: 'notification_awaited', eligibility: 'Eligible',
    eligibilityReason: 'Expected eligibility: age 20–30, Graduate. Based on IBPS PO 2025 pattern.',
    posts: '~4,000 expected', officialUrl: 'https://ibps.in',
    documents: ['Graduation Certificate', '10th Certificate', 'Photo ID'],
  },
  {
    name: 'UPSC CMS 2026', body: 'Union Public Service Commission', stage: 'Written',
    date: 'Sep 7, 2026', deadline: '2026-09-07', status: 'Not applied', statusTag: 'tag-gray',
    applicationStatus: 'not_started', eligibility: 'Not eligible',
    eligibilityReason: 'Requires MBBS or equivalent medical degree. Your qualification (B.Tech, CS) does not meet the essential medical qualification.',
    posts: '827 vacancies', officialUrl: 'https://upsc.gov.in',
    documents: ['MBBS Certificate', 'Internship Completion Certificate'],
  },
  {
    name: 'SBI Clerk 2026', body: 'State Bank of India', stage: 'Prelims',
    date: 'Nov 2026', deadline: '2026-11-01', status: 'Notification awaited', statusTag: 'tag-blue',
    applicationStatus: 'notification_awaited', eligibility: 'Eligible',
    eligibilityReason: 'Expected: age 20–28, Graduate. Based on SBI Clerk 2025 pattern. Local language proficiency may be required.',
    posts: '~8,000 expected', officialUrl: 'https://sbi.co.in',
    documents: ['Graduation Certificate', '10th Certificate', 'Local Language Proof'],
  },
];

const defaultThreads: Thread[] = [
  {
    id: 1, author: 'Priya S.', initials: 'PS', pinned: true, liked: false, likes: 112, time: '2h ago',
    verifiedTopper: true, reported: false, spaceId: 'upsc', channelId: 'preparation', flair: 'Resource',
    title: 'Sharing my complete Polity revision notes (Laxmikanth + PYQs)',
    preview: "Hey everyone! I've compiled chapter-wise notes with PYQs mapped to each topic...",
    body: "Hey everyone! I've compiled chapter-wise notes with previous year questions mapped to each topic. Covers all 22 parts of the Constitution plus schedules. PM me for the link or comment below!",
    tags: ['UPSC', 'Polity', 'Notes'],
    replies: [
      { author: 'Arjun K.', initials: 'AK', text: 'This is amazing Priya! Could you share the link?', time: '1h ago', verifiedTopper: false },
      { author: 'Meera R.', initials: 'MR', text: 'Thank you so much! This is exactly what I needed.', time: '45m ago', verifiedTopper: false },
    ],
  },
  {
    id: 2, author: 'Arjun K.', initials: 'AK', pinned: false, liked: false, likes: 47, time: '4h ago',
    verifiedTopper: false, reported: false, spaceId: 'ssc', channelId: 'preparation', flair: 'Discussion',
    title: "SSC CGL 2026 — Who's attempting? Let's form a study group",
    preview: "Last year I missed the cut by 3 marks. This time I'm going all in...",
    body: "Last year I missed the cut by 3 marks. This time I'm going all in. Would love to find 4-5 serious aspirants to form a study group. Planning daily 2-hour sessions over video call. DM if interested!",
    tags: ['SSC CGL', 'Study Group'],
    replies: [{ author: 'Dev M.', initials: 'DM', text: "I'm in! Let's connect.", time: '3h ago', verifiedTopper: false }],
  },
  {
    id: 3, author: 'Meera R.', initials: 'MR', pinned: false, liked: true, likes: 231, time: '6h ago',
    verifiedTopper: true, reported: false, spaceId: 'ibps', channelId: 'preparation', flair: 'Success',
    title: "Cleared IBPS PO Prelims! Here's my 6-week strategy",
    preview: "I focused heavily on quant and reasoning in the first 3 weeks, then shifted to mocks...",
    body: "Week 1-3: Quant and Reasoning basics + 30 questions daily. Week 4-5: Full-length mocks every alternate day + analysis. Week 6: Only revision and light practice. Scored 87/100!",
    tags: ['IBPS PO', 'Strategy', 'Success'],
    replies: [
      { author: 'Sneha P.', initials: 'SP', text: 'Congratulations Meera! Huge inspiration!', time: '5h ago', verifiedTopper: false },
      { author: 'Rahul T.', initials: 'RT', text: 'Please share your resources list!', time: '4h ago', verifiedTopper: false },
    ],
  },
  {
    id: 4, author: 'Rahul T.', initials: 'RT', pinned: false, liked: false, likes: 15, time: '8h ago',
    verifiedTopper: false, reported: false, spaceId: 'general', channelId: 'preparation', flair: 'Discussion',
    title: 'Daily current affairs discussion thread — May 3, 2026',
    preview: 'Key headlines: RBI monetary policy review, India-ASEAN summit outcomes...',
    body: 'Key headlines today: 1. RBI keeps repo rate unchanged at 6.5%. 2. India signs new ASEAN trade pact. 3. NEP implementation update. 4. New ISRO satellite launched. Discuss below!',
    tags: ['Current Affairs', 'Daily'],
    replies: [],
  },
  {
    id: 5, author: 'Admin', initials: 'AD', pinned: true, liked: false, likes: 0, time: '1d ago',
    verifiedTopper: false, reported: false, spaceId: 'upsc', channelId: 'official_updates', flair: 'Discussion',
    title: 'UPSC CSE 2026 — Official Notification Released',
    preview: 'UPSC has released the official notification for Civil Services Examination 2026. Vacancies: 1,056.',
    body: 'UPSC has officially released the Civil Services Examination 2026 notification. Vacancies: 1,056. Application window: Feb 14 – Mar 4, 2026. Prelims: June 1, 2026. Official source: upsc.gov.in',
    tags: ['UPSC', 'Official'],
    replies: [],
  },
  {
    id: 6, author: 'Dev M.', initials: 'DM', pinned: false, liked: false, likes: 34, time: '5h ago',
    verifiedTopper: false, reported: false, spaceId: 'upsc', channelId: 'pyq_discussion', flair: 'Question',
    title: 'UPSC 2025 GS Paper I Q.14 — need help understanding the answer',
    preview: 'The question on Monsoon trough — official answer is (b) but I think (c) is also correct...',
    body: 'The question on Monsoon trough mechanism — official answer key says (b) but I think (c) is also technically correct based on IMD definition. Has anyone found the source for (b)?',
    tags: ['UPSC', 'PYQ', 'Geography'],
    replies: [
      { author: 'Priya S.', initials: 'PS', text: 'I checked the NCERT XI source — (b) is specifically about the monsoon trough position over the Gangetic plains. The IMD source confirms it.', time: '4h ago', verifiedTopper: true },
    ],
  },
  {
    id: 7, author: 'Sneha P.', initials: 'SP', pinned: false, liked: false, likes: 22, time: '3h ago',
    verifiedTopper: false, reported: false, spaceId: 'ssc', channelId: 'form_help', flair: 'Question',
    title: 'SSC CGL 2026 form — documents required for OBC NCL certificate?',
    preview: 'My OBC certificate was issued in 2021. Is it still valid for SSC CGL 2026 or do I need a fresh one?',
    body: 'My OBC NCL certificate was issued in March 2021 from Delhi. SSC notification says certificate should be within 1 year — does that mean I need a fresh one? My last application had no issue with this certificate.',
    tags: ['SSC CGL', 'Form Help', 'OBC'],
    replies: [],
  },
  {
    id: 8, author: 'Kartik M.', initials: 'KM', pinned: false, liked: false, likes: 58, time: '1d ago',
    verifiedTopper: false, reported: false, spaceId: 'ssc', channelId: 'cutoffs_results', flair: 'Discussion',
    title: 'SSC CGL 2025 Tier I cutoffs — category wise analysis',
    preview: 'General: 161.5, OBC: 155.25, SC: 144.0, ST: 131.75. Slight increase from 2024...',
    body: 'Final Tier I cutoffs: General: 161.5, OBC: 155.25, SC: 144.0, ST: 131.75, EWS: 156.0. This is a ~2 mark increase from 2024. Quant section average dropped but English and GK were tougher this year.',
    tags: ['SSC CGL', 'Cutoff', '2025'],
    replies: [],
  },
];

const defaultResources: Resource[] = [
  { title: 'Laxmikanth — Indian Polity', type: 'Book', progress: 72 },
  { title: 'NCERT Class 11 Economy', type: 'Book', progress: 100 },
  { title: 'Shankar IAS Environment', type: 'Book', progress: 45 },
  { title: 'Vision IAS Current Affairs Apr 2026', type: 'PDF', progress: 30 },
];

const defaultStudyPlan: StudyPlan = {
  generated: false, direction: '', weeklyTarget: '', tradeOff: '', macroGoal: '',
};

const defaultPartners: AccountabilityPartner[] = [
  {
    id: 1, name: 'Priya Sharma', initials: 'PS', exam: 'UPSC CSE 2026',
    status: 'active', nudged: false, lastActive: '2h ago', streak: 21,
    sharedGoal: 'Complete GS Paper I syllabus by May 20 and attempt 2 full mocks before Prelims',
    myCommitments: [
      { id: 1, task: 'Complete Indian Polity chapters 15–18 (Laxmikanth)', done: true  },
      { id: 2, task: 'Attempt 1 full UPSC CSE mock test',                  done: false },
      { id: 3, task: 'Revise April 2026 current affairs digest',           done: true  },
      { id: 4, task: 'Complete Geography — Climate & Monsoon notes',       done: false },
    ],
    partnerCommitments: [
      { task: 'Complete Laxmikanth Part II revision', done: true  },
      { task: 'Attempt 2 full UPSC mocks',           done: true  },
      { task: 'Write 5 GS answer practice sets',     done: false },
      { task: 'Revise Modern History timeline',       done: true  },
    ],
    checkedInThisWeek: false,
    partnerCheckedIn: true,
    penaltyType: 'ngo',
    penaltyAmount: 100,
    penaltyNgo: 'CRY India',
    weekHistory: [
      {
        weekLabel: 'Apr 21–27',
        myCommitments: [
          { task: 'Economy chapters 10–12',    done: true  },
          { task: 'UPSC full mock test',       done: true  },
          { task: 'PYQ 2023 analysis session', done: false },
          { task: 'Polity Part I revision',    done: true  },
        ],
        partnerCommitments: [
          { task: 'Laxmikanth Part I',     done: true },
          { task: '2 full mock tests',     done: true },
          { task: 'Answer writing ×5',     done: true },
          { task: 'Current affairs digest',done: true },
        ],
        myRate: 75, partnerRate: 100, penaltyOwed: 100, penaltyRecovered: 0,
      },
      {
        weekLabel: 'Apr 14–20',
        myCommitments: [
          { task: 'History — Modern India Part II', done: true  },
          { task: 'UPSC mock test',                 done: true  },
          { task: 'Geography basics',               done: true  },
          { task: 'Science & Tech digest',          done: false },
        ],
        partnerCommitments: [
          { task: 'Polity chapters 1–8',   done: true  },
          { task: 'Mock test',             done: false },
          { task: 'Answer writing ×3',     done: true  },
          { task: 'Environment notes',     done: true  },
        ],
        myRate: 75, partnerRate: 75, penaltyOwed: 100, penaltyRecovered: 100,
      },
    ],
  },
  {
    id: 2, name: 'Arjun Kumar', initials: 'AK', exam: 'SSC CGL 2026',
    status: 'pending', nudged: false, lastActive: 'Invited', streak: 0,
    sharedGoal: 'Score 160+ in Tier I — focus on Quant and English daily',
    myCommitments: [], partnerCommitments: [],
    checkedInThisWeek: false, partnerCheckedIn: false,
    penaltyType: 'partner', penaltyAmount: 50, penaltyNgo: '',
    weekHistory: [],
  },
];

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [userTier,  setUserTier]  = useState<UserTier>('free');
  const [postsToday, setPostsToday] = useState(0);
  const [tasks,     setTasks]     = useState<StudyTask[]>(defaultTasks);
  const [exams,     setExams]     = useState<Exam[]>(defaultExams);
  const [threads,   setThreads]   = useState<Thread[]>(defaultThreads);
  const [resources, setResources] = useState<Resource[]>(defaultResources);
  const [studyPlan, setStudyPlan] = useState<StudyPlan>(defaultStudyPlan);
  const [partners,  setPartners]  = useState<AccountabilityPartner[]>(defaultPartners);

  const profileCompletion = 70;
  const missingFields = ['State domicile', 'PwBD status', 'Ex-serviceman status'];

  const incrementPostCount = useCallback(() => setPostsToday(p => p + 1), []);

  const toggleTask = useCallback((id: number) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }, []);

  const addTask = useCallback((task: Omit<StudyTask, 'id' | 'done'>) => {
    setTasks(prev => [...prev, { ...task, id: Date.now(), done: false }]);
  }, []);

  const updateExamStatus = useCallback((idx: number, status: string) => {
    setExams(prev => prev.map((e, i) => i !== idx ? e : { ...e, status, statusTag: statusTagMap(status) }));
  }, []);

  const updateApplicationStatus = useCallback((idx: number, status: ApplicationStatus) => {
    const statusToLabel: Record<ApplicationStatus, string> = {
      not_started: 'Not applied', applied: 'Applied', admit_card: 'Admit card ready',
      appeared: 'Appeared', result_out: 'Result out', notification_awaited: 'Notification awaited',
    };
    setExams(prev => prev.map((e, i) => i !== idx ? e : {
      ...e, applicationStatus: status, status: statusToLabel[status],
      statusTag: statusTagMap(statusToLabel[status]),
    }));
  }, []);

  const addExam = useCallback((exam: Omit<Exam, 'statusTag' | 'applicationStatus' | 'eligibilityReason' | 'officialUrl' | 'documents'>) => {
    setExams(prev => [...prev, {
      ...exam, statusTag: statusTagMap(exam.status), applicationStatus: 'not_started',
      eligibilityReason: 'Check official notification for detailed eligibility criteria.',
      officialUrl: '#', documents: ['10th Certificate', 'Graduation Certificate', 'Photo ID'],
    }]);
  }, []);

  const toggleLike = useCallback((id: number) => {
    setThreads(prev => prev.map(t => t.id !== id ? t : {
      ...t, liked: !t.liked, likes: t.liked ? t.likes - 1 : t.likes + 1,
    }));
  }, []);

  const addReply = useCallback((threadId: number, text: string) => {
    setThreads(prev => prev.map(t => t.id !== threadId ? t : {
      ...t, replies: [...t.replies, { author: 'You', initials: 'RV', text, time: 'Just now', verifiedTopper: false }],
    }));
  }, []);

  const addThread = useCallback((thread: Omit<Thread, 'id' | 'likes' | 'liked' | 'replies' | 'pinned' | 'verifiedTopper' | 'reported'>) => {
    setThreads(prev => [{
      ...thread, id: Date.now(), likes: 0, liked: false, replies: [], pinned: false, verifiedTopper: false, reported: false,
    }, ...prev]);
  }, []);

  const reportThread = useCallback((id: number) => {
    setThreads(prev => prev.map(t => t.id !== id ? t : { ...t, reported: true }));
  }, []);

  const updateResourceProgress = useCallback((idx: number, val: number) => {
    setResources(prev => prev.map((r, i) => i !== idx ? r : { ...r, progress: Math.max(0, Math.min(100, val)) }));
  }, []);

  const generateStudyPlan = useCallback(() => {
    setStudyPlan({
      generated: true,
      macroGoal: 'Clear UPSC CSE 2026 Prelims (June 1) and SSC CGL 2026 Tier I (July 14)',
      direction: 'Prioritise GS Paper I: History + Geography + Polity. Maintain current Quant pace for SSC. Add 1 full-length mock every 10 days.',
      weeklyTarget: '14 study hours · 1 mock test · 3 revision slots · ≥80% task completion',
      tradeOff: 'Reducing Geography hours by 1/week increases risk in UPSC GS Paper I (~5% weightage). Current plan keeps both exams balanced.',
    });
  }, []);

  const addPartner = useCallback((name: string, exam: string, sharedGoal: string, penaltyType: 'ngo' | 'partner', penaltyAmount: number, penaltyNgo: string) => {
    const initials = name.trim().split(' ').map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2);
    setPartners(prev => [...prev, {
      id: Date.now(), name, initials, exam, sharedGoal, status: 'invited', nudged: false,
      lastActive: 'Invited', streak: 0,
      myCommitments: [], partnerCommitments: [],
      checkedInThisWeek: false, partnerCheckedIn: false,
      penaltyType, penaltyAmount, penaltyNgo, weekHistory: [],
    }]);
  }, []);

  const removePartner = useCallback((id: number) => {
    setPartners(prev => prev.filter(p => p.id !== id));
  }, []);

  const nudgePartner = useCallback((id: number) => {
    setPartners(prev => prev.map(p => p.id !== id ? p : { ...p, nudged: true }));
  }, []);

  const updateSharedGoal = useCallback((id: number, goal: string) => {
    setPartners(prev => prev.map(p => p.id !== id ? p : { ...p, sharedGoal: goal }));
  }, []);

  const toggleMyCommitment = useCallback((partnerId: number, commitmentId: number) => {
    setPartners(prev => prev.map(p => p.id !== partnerId ? p : {
      ...p, myCommitments: p.myCommitments.map(c => c.id === commitmentId ? { ...c, done: !c.done } : c),
    }));
  }, []);

  const addMyCommitment = useCallback((partnerId: number, task: string) => {
    setPartners(prev => prev.map(p => p.id !== partnerId ? p : {
      ...p, myCommitments: [...p.myCommitments, { id: Date.now(), task, done: false }],
    }));
  }, []);

  const removeMyCommitment = useCallback((partnerId: number, commitmentId: number) => {
    setPartners(prev => prev.map(p => p.id !== partnerId ? p : {
      ...p, myCommitments: p.myCommitments.filter(c => c.id !== commitmentId),
    }));
  }, []);

  const submitCheckIn = useCallback((partnerId: number, weekLabel: string) => {
    setPartners(prev => prev.map(p => {
      if (p.id !== partnerId) return p;
      const total   = p.myCommitments.length;
      const done    = p.myCommitments.filter(c => c.done).length;
      const missed  = total - done;
      const myRate  = total > 0 ? Math.round((done / total) * 100) : 0;
      const partnerDone    = p.partnerCommitments.filter(c => c.done).length;
      const partnerTotal   = p.partnerCommitments.length;
      const partnerMissed  = partnerTotal - partnerDone;
      const partnerRate    = partnerTotal > 0 ? Math.round((partnerDone / partnerTotal) * 100) : 0;
      const snapshot: WeekSnapshot = {
        weekLabel,
        myCommitments:      p.myCommitments.map(c => ({ task: c.task, done: c.done })),
        partnerCommitments: p.partnerCommitments,
        myRate,
        partnerRate,
        penaltyOwed:      missed      * p.penaltyAmount,
        penaltyRecovered: partnerMissed * p.penaltyAmount,
      };
      return { ...p, checkedInThisWeek: true, weekHistory: [snapshot, ...p.weekHistory] };
    }));
  }, []);

  const setPenalty = useCallback((partnerId: number, type: 'ngo' | 'partner', amount: number, ngo: string) => {
    setPartners(prev => prev.map(p => p.id !== partnerId ? p : { ...p, penaltyType: type, penaltyAmount: amount, penaltyNgo: ngo }));
  }, []);

  return (
    <AppContext.Provider value={{
      userTier, setUserTier,
      postsToday, incrementPostCount,
      tasks, toggleTask, addTask,
      exams, updateExamStatus, updateApplicationStatus, addExam,
      threads, toggleLike, addReply, addThread, reportThread,
      resources, updateResourceProgress,
      studyPlan, generateStudyPlan,
      partners, addPartner, removePartner, nudgePartner, updateSharedGoal,
      toggleMyCommitment, addMyCommitment, removeMyCommitment, submitCheckIn, setPenalty,
      profileCompletion, missingFields,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

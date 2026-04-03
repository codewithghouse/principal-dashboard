import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, Star, Edit2, Send, GraduationCap, Award,
  Calendar, FileText, UserCheck, RefreshCw, Mail, Phone,
  BookOpen, Users, Clock, CheckCircle, TrendingUp,
  MessageSquare, Loader2, X, AlertTriangle, ChevronDown,
  BarChart2, Target, ThumbsUp, Save, Printer
} from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot, addDoc, getDocs,
  serverTimestamp, updateDoc, doc, Timestamp, orderBy
} from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell
} from 'recharts';
import { toast } from 'sonner';

interface TeacherProfileProps {
  teacher: any;
  onBack: () => void;
}

// ─── helpers ────────────────────────────────────────────────────────────────
const today = new Date();
const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const pct = (num: number, total: number) =>
  total === 0 ? 0 : Math.round((num / total) * 100);

const getInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

const ProgressBar = ({
  value, color = '#1e3a8a', label, rightLabel,
}: {
  value: number; color?: string; label: string; rightLabel: string;
}) => (
  <div className="mb-4">
    <div className="flex justify-between items-center mb-1.5">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <span className="text-sm font-black" style={{ color }}>{rightLabel}</span>
    </div>
    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, value)}%`, background: color }}
      />
    </div>
  </div>
);

const StarRow = ({ rating }: { rating: number }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
      />
    ))}
  </div>
);

// ─── main component ──────────────────────────────────────────────────────────
const TeacherProfile = ({ teacher, onBack }: TeacherProfileProps) => {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState('Profile');
  const tabs = ['Profile', 'Classes', 'Performance', 'Attendance', 'Reviews'];

  // ── refs (cross-listener data) ───────────────────────────────────────────
  const classesRef   = useRef<any[]>([]);
  const enrollRef    = useRef<any[]>([]);
  const resultsRef   = useRef<any[]>([]);
  const reviewsRef   = useRef<any[]>([]);
  const tAttRef      = useRef<any[]>([]);
  const meetingsRef  = useRef<any[]>([]);

  // ── state ────────────────────────────────────────────────────────────────
  const [assignedClasses, setAssignedClasses] = useState<any[]>([]);
  const [perfMetrics,     setPerfMetrics]     = useState({ classAvg: 0, passRate: 0, satisfaction: 0 });
  const [reviews,         setReviews]         = useState<any[]>([]);
  const [avgRating,       setAvgRating]       = useState(parseFloat(teacher.rating || '5.0'));
  const [thisMonth,       setThisMonth]       = useState({ classesTaken: 0, totalClasses: 0, attPct: 0, testsCount: 0, meetingsCount: 0 });
  const [subjectData,     setSubjectData]     = useState<{ name: string; avg: number }[]>([]);
  const [attTrend,        setAttTrend]        = useState<{ day: string; value: number }[]>([]);
  const [studentRankings, setStudentRankings] = useState<any[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [tAttRecords,     setTAttRecords]     = useState<any[]>([]);

  // Mark attendance state
  const [showMarkAtt,   setShowMarkAtt]   = useState(false);
  const [attForm,       setAttForm]       = useState({ date: new Date().toISOString().split('T')[0], status: 'present', remarks: '' });
  const [savingAtt,     setSavingAtt]     = useState(false);

  // Edit profile state
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editForm,        setEditForm]        = useState({ phone: '', experience: '', bio: '', status: 'Active' });
  const [savingProfile,   setSavingProfile]   = useState(false);

  // Reassign modal state
  const [showReassign,     setShowReassign]     = useState(false);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [reassignClassId,  setReassignClassId]  = useState('');
  const [savingReassign,   setSavingReassign]   = useState(false);

  const schoolId = userData?.schoolId || userData?.school || '';
  const branchId = userData?.branchId || '';

  // ── safe display values ──────────────────────────────────────────────────
  const name       = teacher.name       || 'Unknown Teacher';
  const subject    = teacher.subject    || 'N/A';
  const experience = teacher.experience || 'N/A';
  const email      = teacher.email      || '—';
  const phone      = teacher.phone      || '—';
  const status     = teacher.status     || 'Active';
  const initials   = teacher.initials   || getInitials(name);

  const statusBadge = (s: string) => {
    if (s === 'Active')    return 'bg-green-50 text-green-600 border border-green-100';
    if (s === 'Invited')   return 'bg-blue-50 text-blue-600 border border-blue-100';
    if (s === 'On Leave')  return 'bg-amber-50 text-amber-600 border border-amber-100';
    return 'bg-slate-50 text-slate-500 border border-slate-100';
  };

  const classStatusColor = (s: string) => {
    if (s === 'Good')    return 'text-green-600';
    if (s === 'Average') return 'text-amber-600';
    if (s === 'Weak')    return 'text-rose-600';
    return 'text-slate-400';
  };

  // ── compute (called by every listener) ───────────────────────────────────
  const compute = () => {
    const classes   = classesRef.current;
    const enrolls   = enrollRef.current;
    const results   = resultsRef.current;
    const rvList    = reviewsRef.current;
    const tAtt      = tAttRef.current;
    const meetings  = meetingsRef.current;

    // Multi-shape score extractor — handles different Firestore field naming conventions
    const getScore = (r: any): number => {
      if (typeof r.percentage === 'number' && r.percentage > 0) return Math.round(r.percentage);
      const rawScore = r.marksObtained ?? r.marks ?? r.score ?? r.obtainedMarks ?? r.obtained ?? r.marksScored ?? null;
      if (rawScore === null || rawScore === undefined) return 0;
      const hasTotal = r.totalMarks != null || r.maxMarks != null || r.totalScore != null || r.fullMarks != null || r.total != null || r.outOf != null;
      if (!hasTotal) {
        // score is already a direct value (out of 100) — e.g. score: "85"
        return Math.min(100, Math.round(Number(rawScore)));
      }
      const total = r.totalMarks ?? r.maxMarks ?? r.totalScore ?? r.fullMarks ?? r.total ?? r.outOf ?? 100;
      return total > 0 ? Math.round((Number(rawScore) / Number(total)) * 100) : 0;
    };

    // 1. Assigned classes with student counts + performance status
    const withData = classes.map((c) => {
      const stuCount   = enrolls.filter((e) => e.classId === c.id).length;
      const classRes   = results.filter((r) => r.classId === c.id);
      const avgScoreRaw = classRes.length
        ? classRes.reduce((s, r) => s + getScore(r), 0) / classRes.length
        : null;
      const avgScore = avgScoreRaw !== null ? Math.round(avgScoreRaw) : null;
      const perf = avgScore === null ? 'No Data' : avgScore >= 75 ? 'Good' : avgScore >= 55 ? 'Average' : 'Weak';
      return { ...c, stuCount, avgScore, perf };
    });
    setAssignedClasses(withData);

    // 2. Performance metrics
    const classAvg = results.length
      ? Math.round(results.reduce((s, r) => s + getScore(r), 0) / results.length)
      : 0;
    const passRate = results.length
      ? Math.round(results.filter((r) => getScore(r) >= 40).length / results.length * 100)
      : 0;
    const satisfaction = rvList.length
      ? Math.round(rvList.reduce((s, r) => s + (r.rating || 0), 0) / rvList.length * 20)
      : 0;
    setPerfMetrics({ classAvg, passRate, satisfaction });

    // 3. Reviews
    const sorted = [...rvList].sort(
      (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );
    setReviews(sorted);
    const avgR = rvList.length
      ? Math.round(rvList.reduce((s, r) => s + (r.rating || 0), 0) / rvList.length * 10) / 10
      : parseFloat(teacher.rating || '5.0');
    setAvgRating(avgR);

    // 4. This Month
    const thisMonthAtt = tAtt.filter((a) => (a.date?.toMillis?.() || 0) >= startOfMonth.getTime());
    const classesTaken = thisMonthAtt.filter((a) => a.status === 'present').length;
    const totalClasses = thisMonthAtt.length;
    const attPct = totalClasses ? pct(classesTaken, totalClasses) : 0;
    const testsThisMonth = new Set(
      results
        .filter((r) => (r.createdAt?.toMillis?.() || 0) >= startOfMonth.getTime())
        .map((r) => r.testId || r.examName || r.subject)
    ).size;
    const meetingsCount = meetings.filter(
      (m) => (m.date?.toMillis?.() || m.createdAt?.toMillis?.() || 0) >= startOfMonth.getTime()
    ).length;
    setThisMonth({ classesTaken, totalClasses, attPct, testsCount: testsThisMonth, meetingsCount });

    // 5. Subject averages
    const subMap = new Map<string, number[]>();
    results.forEach((r) => {
      const sub = r.subjectName || r.subject || subject;
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(getScore(r));
    });
    const subData = Array.from(subMap.entries()).map(([n, scores]) => ({
      name: n.length > 10 ? n.slice(0, 10) + '…' : n,
      avg:  Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));
    setSubjectData(subData);

    // 6. Attendance trend (last 7 days using student attendance data)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    // For teacher-side, trend shows how many students were present in teacher's classes each day
    const classIds = new Set(classes.map((c) => c.id));
    const trend = days.map((d) => {
      const dayStr = d.toLocaleDateString('en-US', { weekday: 'short' });
      // Use teacher_attendance records for this teacher on this day
      const dayRec = tAtt.filter((a) => {
        const aDate = a.date?.toDate?.() || a.date?.toMillis?.() ? new Date(a.date.toMillis()) : null;
        return aDate && aDate.toDateString() === d.toDateString();
      });
      const val = dayRec.length
        ? pct(dayRec.filter((a) => a.status === 'present').length, dayRec.length)
        : 0;
      return { day: dayStr, value: val };
    });
    setAttTrend(trend);
    setTAttRecords([...tAtt].sort((a, b) => (b.date?.toMillis?.() || 0) - (a.date?.toMillis?.() || 0)));

    // 7. Student rankings
    const stuMap = new Map<string, { name: string; className: string; scores: number[] }>();
    results.forEach((r) => {
      const sid = r.studentId || r.studentEmail || '';
      if (!sid) return;
      const cls = classes.find((c) => c.id === r.classId);
      if (!stuMap.has(sid)) stuMap.set(sid, { name: r.studentName || sid, className: cls?.name || '—', scores: [] });
      stuMap.get(sid)!.scores.push(getScore(r));
    });
    const rankings = Array.from(stuMap.values())
      .map((s) => ({ ...s, avg: Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
    setStudentRankings(rankings);

    setLoading(false);
  };

  // ── listeners ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!teacher.id || !schoolId) return;
    const unsubs: (() => void)[] = [];

    // Fetch teaching_assignments first to get classIds
    let enrollUnsub: (() => void) | null = null;
    getDocs(
      query(collection(db, 'teaching_assignments'), where('teacherId', '==', teacher.id))
    ).then((snap) => {
      const assignedClassIds = [...new Set(snap.docs.map((d) => d.data().classId).filter(Boolean))];

      // Classes listener
      const classFilter = assignedClassIds.length > 0
        ? query(collection(db, 'classes'), where('__name__', 'in', assignedClassIds.slice(0, 10)))
        : query(collection(db, 'classes'), where('teacherId', '==', teacher.id), where('schoolId', '==', schoolId));

      unsubs.push(onSnapshot(classFilter, (snap) => {
        classesRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        compute();

        // Dynamic enrollments listener based on current classIds
        const cIds = classesRef.current.map((c) => c.id);
        if (cIds.length > 0) {
          if (enrollUnsub) enrollUnsub();
          enrollUnsub = onSnapshot(
            query(collection(db, 'enrollments'), where('classId', 'in', cIds.slice(0, 10))),
            (s2) => {
              enrollRef.current = s2.docs.map((d) => ({ id: d.id, ...d.data() }));
              compute();
            }
          );
        }
      }));
    });

    // Results for this teacher
    unsubs.push(
      onSnapshot(
        query(collection(db, 'results'), where('teacherId', '==', teacher.id)),
        (snap) => { resultsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); compute(); },
        () => {
          // Fallback: by schoolId
          onSnapshot(
            query(collection(db, 'results'), where('schoolId', '==', schoolId)),
            (snap) => { resultsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); compute(); }
          );
        }
      )
    );

    // Reviews
    unsubs.push(
      onSnapshot(
        query(collection(db, 'teacher_reviews'), where('teacherId', '==', teacher.id)),
        (snap) => { reviewsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); compute(); }
      )
    );

    // Teacher's own attendance — try teacher_attendance, fallback to attendance collection
    unsubs.push(
      onSnapshot(
        query(collection(db, 'teacher_attendance'), where('teacherId', '==', teacher.id)),
        (snap) => {
          if (!snap.empty) {
            tAttRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            compute();
          } else {
            // Fallback: generic attendance collection
            getDocs(query(collection(db, 'attendance'), where('teacherId', '==', teacher.id)))
              .then((s2) => {
                tAttRef.current = s2.docs.map((d) => ({ id: d.id, ...d.data() }));
                compute();
              });
          }
        }
      )
    );

    // Parent meetings involving this teacher
    unsubs.push(
      onSnapshot(
        query(collection(db, 'parent_meetings'), where('teacherId', '==', teacher.id)),
        (snap) => { meetingsRef.current = snap.docs.map((d) => ({ id: d.id, ...d.data() })); compute(); }
      )
    );

    // Available classes for reassignment
    getDocs(
      query(collection(db, 'classes'), where('schoolId', '==', schoolId))
    ).then((snap) => {
      setAvailableClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    setTimeout(() => setLoading(false), 3000); // fallback

    return () => {
      unsubs.forEach((u) => u());
      if (enrollUnsub) enrollUnsub();
    };
  }, [teacher.id, schoolId]);

  // ── Quick Actions ─────────────────────────────────────────────────────────
  const handleGenerateReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>Teacher Report - ${name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; }
        h1 { color: #1e3a8a; } h2 { color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { background: #1e3a8a; color: white; padding: 10px; text-align: left; font-size: 12px; }
        td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .stat { display: inline-block; margin: 8px 16px 8px 0; }
        .stat-val { font-size: 28px; font-weight: 900; color: #1e3a8a; }
        .stat-lbl { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: bold; }
      </style></head><body>
      <h1>${name}</h1>
      <p>${subject} Teacher &bull; ${experience} Experience &bull; ${teacher.email || ''}</p>
      <h2>Performance Overview</h2>
      <div>
        <div class="stat"><div class="stat-val">${perfMetrics.classAvg}%</div><div class="stat-lbl">Class Average</div></div>
        <div class="stat"><div class="stat-val">${perfMetrics.passRate}%</div><div class="stat-lbl">Pass Rate</div></div>
        <div class="stat"><div class="stat-val">${avgRating}/5</div><div class="stat-lbl">Parent Rating</div></div>
        <div class="stat"><div class="stat-val">${assignedClasses.length}</div><div class="stat-lbl">Classes</div></div>
      </div>
      <h2>Assigned Classes</h2>
      <table>
        <thead><tr><th>Class</th><th>Students</th><th>Avg Score</th><th>Status</th></tr></thead>
        <tbody>
          ${assignedClasses.map((c) => `<tr><td>${c.name || c.id}</td><td>${c.stuCount}</td><td>${c.avgScore ?? 'N/A'}%</td><td>${c.perf}</td></tr>`).join('')}
          ${assignedClasses.length === 0 ? '<tr><td colspan="4" style="color:#94a3b8">No class data</td></tr>' : ''}
        </tbody>
      </table>
      <h2>Recent Reviews (${reviews.length})</h2>
      <table>
        <thead><tr><th>Parent</th><th>Rating</th><th>Review</th><th>Date</th></tr></thead>
        <tbody>
          ${reviews.slice(0, 10).map((r) => `<tr><td>${r.parentName || r.studentName || 'Parent'}</td><td>${r.rating}/5</td><td>${r.review || '—'}</td><td>${r.createdAt?.toDate?.().toLocaleDateString() || '—'}</td></tr>`).join('')}
          ${reviews.length === 0 ? '<tr><td colspan="4" style="color:#94a3b8">No reviews yet</td></tr>' : ''}
        </tbody>
      </table>
      <p style="color:#94a3b8;font-size:11px;margin-top:40px">Generated ${new Date().toLocaleString()} &bull; EduIntellect</p>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const handleReassignSave = async () => {
    if (!reassignClassId || !teacher.id) return;
    setSavingReassign(true);
    try {
      // 1. Remove old assignment
      const oldQ = query(collection(db, 'teaching_assignments'), where('teacherId', '==', teacher.id));
      const oldSnap = await getDocs(oldQ);
      for (const d of oldSnap.docs) {
        await updateDoc(doc(db, 'teaching_assignments', d.id), { teacherId: null });
      }
      // 2. Add new assignment
      await addDoc(collection(db, 'teaching_assignments'), {
        teacherId: teacher.id,
        classId: reassignClassId,
        subjectId: subject,
        status: 'active',
        createdAt: serverTimestamp(),
      });
      // 3. Update class doc
      await updateDoc(doc(db, 'classes', reassignClassId), {
        teacherId: teacher.id,
        teacherName: name,
      });
      toast.success('Class reassigned successfully.');
      setShowReassign(false);
    } catch {
      toast.error('Reassignment failed.');
    } finally {
      setSavingReassign(false);
    }
  };

  // ── Edit Profile ──────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!teacher.id) return;
    setSavingProfile(true);
    try {
      const updates: Record<string, any> = { updatedAt: serverTimestamp() };
      if (editForm.phone)      updates.phone      = editForm.phone.trim();
      if (editForm.experience) updates.experience = editForm.experience.trim();
      if (editForm.bio)        updates.bio        = editForm.bio.trim();
      if (editForm.status)     updates.status     = editForm.status;
      await updateDoc(doc(db, 'teachers', teacher.id), updates);
      toast.success('Profile updated successfully.');
      setShowEditProfile(false);
    } catch {
      toast.error('Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Mark Attendance ───────────────────────────────────────────────────────
  const handleMarkAttendance = async () => {
    if (!teacher.id || !attForm.date) return;
    setSavingAtt(true);
    try {
      await addDoc(collection(db, 'teacher_attendance'), {
        teacherId:   teacher.id,
        teacherName: name,
        schoolId,
        branchId,
        date:        Timestamp.fromDate(new Date(attForm.date)),
        status:      attForm.status,
        remarks:     attForm.remarks.trim(),
        markedBy:    userData?.name || userData?.email || 'Principal',
        createdAt:   serverTimestamp(),
      });
      toast.success('Attendance marked successfully.');
      setShowMarkAtt(false);
      setAttForm({ date: new Date().toISOString().split('T')[0], status: 'present', remarks: '' });
    } catch {
      toast.error('Failed to mark attendance.');
    } finally {
      setSavingAtt(false);
    }
  };

  // ── render helpers ────────────────────────────────────────────────────────
  const barColor = (v: number) => v >= 75 ? '#22c55e' : v >= 55 ? '#f59e0b' : '#ef4444';

  const QuickActionBtn = ({
    icon: Icon, label, onClick, variant = 'default',
  }: { icon: any; label: string; onClick: () => void; variant?: string }) => (
    <button
      onClick={onClick}
      className="w-full p-4 border border-border rounded-xl flex items-center gap-4 hover:bg-secondary hover:shadow-sm transition-all text-left group"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
        variant === 'primary' ? 'bg-[#1e3a8a] text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-[#1e3a8a]/10 group-hover:text-[#1e3a8a]'
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-sm font-bold text-foreground">{label}</span>
    </button>
  );

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="animate-in fade-in duration-500 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Teachers</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Teacher Profile</span>
      </div>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className={`w-[76px] h-[76px] rounded-2xl ${teacher.color || 'bg-[#1e3a8a]'} flex items-center justify-center text-white text-2xl font-bold shadow-lg shrink-0`}>
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{name}</h1>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-base font-bold text-foreground">{avgRating}</span>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${statusBadge(status)}`}>
                  {status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-medium mb-2.5">
                {subject} Teacher &nbsp;•&nbsp; {experience} Experience
              </p>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /><span className="font-semibold text-foreground">Email:</span><span>{email}</span></span>
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /><span className="font-semibold text-foreground">Phone:</span><span>{phone}</span></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                setEditForm({ phone: teacher.phone || '', experience: teacher.experience || '', bio: teacher.bio || '', status: teacher.status || 'Active' });
                setShowEditProfile(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors"
            >
              <Edit2 className="w-4 h-4" /> Edit
            </button>
            <button
              onClick={handleGenerateReport}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary transition-colors"
            >
              <Printer className="w-4 h-4" /> Report
            </button>
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:opacity-90 transition-opacity shadow-md"
            >
              <Send className="w-4 h-4" /> Message
            </a>
          </div>
        </div>
      </div>

      {/* ── TABS ─────────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-border mb-8 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap ${
              activeTab === tab ? 'text-[#1e3a8a]' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {tab === 'Reviews' && reviews.length > 0 && (
              <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-black">
                {reviews.length}
              </span>
            )}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#1e3a8a] rounded-full" />}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" />
        </div>
      )}

      {!loading && (
        <>
          {/* ══════════════════════ PROFILE TAB ══════════════════════════════ */}
          {activeTab === 'Profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* LEFT */}
              <div className="space-y-6">
                {/* ── QUALIFICATIONS ──────────────────────────────────────── */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-foreground mb-5">Qualifications</h3>
                  {(() => {
                    // Support multiple data shapes from Firestore:
                    // 1. teacher.qualifications = [{degree, institution, year}, ...]
                    // 2. teacher.degree + teacher.university + teacher.graduationYear
                    // 3. Fallback: show subject + experience as qualification info
                    const quals: { degree: string; institution: string; year?: string; icon: string }[] = [];

                    if (Array.isArray(teacher.qualifications) && teacher.qualifications.length > 0) {
                      teacher.qualifications.forEach((q: any) => {
                        quals.push({
                          degree:      q.degree      || q.title || '—',
                          institution: q.institution || q.university || q.college || '—',
                          year:        q.year        || q.graduationYear || '',
                          icon:        q.type === 'teaching' ? 'teaching' : 'academic',
                        });
                      });
                    } else {
                      // Build from individual fields
                      if (teacher.degree || teacher.university) {
                        quals.push({
                          degree:      teacher.degree      || 'Degree',
                          institution: teacher.university  || teacher.college || '—',
                          year:        teacher.graduationYear || teacher.yearOfGraduation || '',
                          icon:        'academic',
                        });
                      }
                      if (teacher.teachingDegree || teacher.teachingCertification) {
                        quals.push({
                          degree:      teacher.teachingDegree || teacher.teachingCertification,
                          institution: teacher.teachingInstitution || '—',
                          year:        teacher.teachingYear || '',
                          icon:        'teaching',
                        });
                      }
                    }

                    if (quals.length === 0) {
                      // Graceful fallback — show subject expertise as qualification
                      quals.push({
                        degree:      `${subject} Specialist`,
                        institution: teacher.schoolName || 'Qualified Educator',
                        year:        '',
                        icon:        'academic',
                      });
                    }

                    return (
                      <div className="space-y-4">
                        {quals.map((q, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                              q.icon === 'teaching' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#1e3a8a]'
                            }`}>
                              {q.icon === 'teaching'
                                ? <Award className="w-4 h-4" />
                                : <GraduationCap className="w-4 h-4" />
                              }
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground">{q.degree}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {q.institution}{q.year ? `, ${q.year}` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Assigned Classes */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-foreground mb-5">Assigned Classes</h3>
                  {assignedClasses.length === 0 ? (
                    <div className="text-center py-8">
                      <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 font-bold">No classes assigned</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assignedClasses.map((c) => (
                        <div key={c.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                          <div>
                            <p className="text-sm font-bold text-foreground">{c.name || c.id}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{c.stuCount} students</p>
                          </div>
                          <span className={`text-xs font-black ${classStatusColor(c.perf)}`}>{c.perf}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* MIDDLE */}
              <div className="space-y-6">
                {/* Performance Metrics */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-foreground mb-5">Performance Metrics</h3>
                  <ProgressBar
                    label="Class Average"
                    value={perfMetrics.classAvg}
                    rightLabel={`${perfMetrics.classAvg}%`}
                    color={barColor(perfMetrics.classAvg)}
                  />
                  <ProgressBar
                    label="Pass Rate"
                    value={perfMetrics.passRate}
                    rightLabel={`${perfMetrics.passRate}%`}
                    color={barColor(perfMetrics.passRate)}
                  />
                  <ProgressBar
                    label="Student Satisfaction"
                    value={perfMetrics.satisfaction}
                    rightLabel={`${(perfMetrics.satisfaction / 20).toFixed(1)}/5`}
                    color="#f59e0b"
                  />
                  {perfMetrics.classAvg === 0 && perfMetrics.passRate === 0 && (
                    <p className="text-xs text-slate-400 text-center mt-2">Data will appear once results are recorded</p>
                  )}
                </div>

                {/* Recent Reviews */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-bold text-foreground">Recent Reviews</h3>
                    {reviews.length > 0 && (
                      <span className="text-xs text-muted-foreground font-semibold">{reviews.length} total</span>
                    )}
                  </div>
                  {reviews.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 font-bold">No reviews yet</p>
                      <p className="text-[10px] text-slate-300 mt-1">Parents can submit reviews from their dashboard</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {reviews.slice(0, 3).map((r) => (
                        <div key={r.id} className="p-4 bg-amber-50/50 rounded-xl border border-amber-100">
                          <StarRow rating={r.rating || 5} />
                          {r.review && (
                            <p className="text-sm text-slate-700 mt-2 italic">"{r.review}"</p>
                          )}
                          <p className="text-[10px] text-slate-400 font-bold mt-2">
                            — {r.parentName || r.studentName || 'Parent'}
                            {r.createdAt?.toDate?.() && (
                              <span className="ml-2">{r.createdAt.toDate().toLocaleDateString()}</span>
                            )}
                          </p>
                        </div>
                      ))}
                      {reviews.length > 3 && (
                        <button
                          onClick={() => setActiveTab('Reviews')}
                          className="text-xs font-bold text-[#1e3a8a] hover:underline"
                        >
                          View all {reviews.length} reviews →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT */}
              <div className="space-y-6">
                {/* Quick Actions */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-foreground mb-5">Quick Actions</h3>
                  <div className="space-y-3">
                    <QuickActionBtn icon={Edit2}      label="Edit Profile"   onClick={() => { setEditForm({ phone: teacher.phone || '', experience: teacher.experience || '', bio: teacher.bio || '', status: teacher.status || 'Active' }); setShowEditProfile(true); }} />
                    <QuickActionBtn icon={RefreshCw} label="Reassign Class"  onClick={() => setShowReassign(true)} />
                    <QuickActionBtn icon={FileText}   label="Generate Report" onClick={handleGenerateReport} variant="primary" />
                    <QuickActionBtn icon={UserCheck}  label="View Attendance" onClick={() => setActiveTab('Attendance')} />
                  </div>
                </div>

                {/* This Month */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-foreground mb-5">This Month</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Classes Taken',   val: thisMonth.classesTaken ? `${thisMonth.classesTaken}/${thisMonth.totalClasses}` : '—',     color: 'text-foreground' },
                      { label: 'Attendance',       val: thisMonth.attPct ? `${thisMonth.attPct}%` : '—',                                          color: thisMonth.attPct >= 80 ? 'text-green-600' : 'text-amber-600' },
                      { label: 'Tests Conducted',  val: thisMonth.testsCount || '0',                                                              color: 'text-foreground' },
                      { label: 'Parent Meetings',  val: thisMonth.meetingsCount || '0',                                                           color: 'text-foreground' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="flex justify-between items-center py-1 border-b border-slate-50 last:border-0">
                        <span className="text-sm font-medium text-muted-foreground">{label}</span>
                        <span className={`text-sm font-black ${color}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rating Summary */}
                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-bold text-foreground mb-4">Rating Summary</h3>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-4xl font-black text-amber-500">{avgRating}</div>
                    <div>
                      <StarRow rating={avgRating} />
                      <p className="text-xs text-muted-foreground mt-1">{reviews.length} reviews</p>
                    </div>
                  </div>
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = reviews.filter((r) => Math.round(r.rating || 0) === star).length;
                    const pctVal = reviews.length ? pct(count, reviews.length) : 0;
                    return (
                      <div key={star} className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold text-slate-500 w-4">{star}</span>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pctVal}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-6">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════ CLASSES TAB ══════════════════════════════ */}
          {activeTab === 'Classes' && (
            <div className="space-y-4">
              {assignedClasses.length === 0 ? (
                <div className="text-center py-24 bg-card rounded-2xl border border-dashed border-slate-200">
                  <BookOpen className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-sm font-bold text-slate-400">No classes assigned</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignedClasses.map((c) => (
                    <div key={c.id} className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-black text-foreground">{c.name || c.id}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.grade ? `Grade ${c.grade} — Section ${c.section}` : 'Class'}</p>
                        </div>
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${
                          c.perf === 'Good' ? 'bg-green-50 text-green-600' :
                          c.perf === 'Average' ? 'bg-amber-50 text-amber-600' :
                          c.perf === 'Weak' ? 'bg-rose-50 text-rose-600' :
                          'bg-slate-50 text-slate-400'
                        }`}>
                          {c.perf}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Students</span>
                          <span className="font-bold text-foreground">{c.stuCount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Avg Score</span>
                          <span className={`font-bold ${c.avgScore !== null ? classStatusColor(c.perf) : 'text-slate-400'}`}>
                            {c.avgScore !== null ? `${c.avgScore}%` : 'N/A'}
                          </span>
                        </div>
                        {c.avgScore !== null && (
                          <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${c.avgScore}%`, background: barColor(c.avgScore) }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════ PERFORMANCE TAB ══════════════════════════ */}
          {activeTab === 'Performance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'Class Average',   val: `${perfMetrics.classAvg}%`, icon: BarChart2,  color: 'text-[#1e3a8a] bg-blue-50' },
                  { label: 'Pass Rate',        val: `${perfMetrics.passRate}%`, icon: Target,     color: 'text-green-600 bg-green-50' },
                  { label: 'Parent Feedback',  val: `${avgRating}/5`,           icon: ThumbsUp,   color: 'text-amber-600 bg-amber-50' },
                ].map(({ label, val, icon: Icon, color }) => (
                  <div key={label} className="bg-card border border-border rounded-2xl p-6 shadow-sm flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center shrink-0`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{label}</p>
                      <p className="text-2xl font-black text-foreground mt-0.5">{val}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Subject breakdown */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-bold text-foreground mb-6">Performance by Subject</h3>
                {subjectData.length === 0 ? (
                  <div className="text-center py-16"><Award className="w-10 h-10 text-slate-200 mx-auto mb-2" /><p className="text-sm text-slate-400 font-bold">No results data yet</p></div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={subjectData} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Avg Score']} />
                      <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                        {subjectData.map((s, i) => (
                          <Cell key={i} fill={barColor(s.avg)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Student rankings */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-bold text-foreground mb-4">Top Students</h3>
                {studentRankings.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No student result data yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-50">
                          <th className="py-3 px-4 text-left text-[10px] font-black uppercase text-slate-400">Rank</th>
                          <th className="py-3 px-4 text-left text-[10px] font-black uppercase text-slate-400">Student</th>
                          <th className="py-3 px-4 text-left text-[10px] font-black uppercase text-slate-400">Class</th>
                          <th className="py-3 px-4 text-right text-[10px] font-black uppercase text-slate-400">Avg Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {studentRankings.map((s, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                                i === 0 ? 'bg-amber-100 text-amber-700' :
                                i === 1 ? 'bg-slate-100 text-slate-600' :
                                i === 2 ? 'bg-orange-100 text-orange-700' : 'text-slate-400'
                              }`}>
                                {i + 1}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-foreground">{s.name}</td>
                            <td className="py-3 px-4 text-muted-foreground">{s.className}</td>
                            <td className="py-3 px-4 text-right">
                              <span className={`font-black ${barColor(s.avg) === '#22c55e' ? 'text-green-600' : barColor(s.avg) === '#f59e0b' ? 'text-amber-600' : 'text-rose-600'}`}>
                                {s.avg}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════ ATTENDANCE TAB ═══════════════════════════ */}
          {activeTab === 'Attendance' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground">Teacher Attendance</h2>
                <button
                  onClick={() => setShowMarkAtt(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:opacity-90 transition-opacity shadow-sm"
                >
                  <CheckCircle className="w-4 h-4" /> Mark Attendance
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'This Month',  val: thisMonth.attPct ? `${thisMonth.attPct}%` : '—',                    color: 'text-green-600' },
                  { label: 'Classes',     val: thisMonth.classesTaken ? `${thisMonth.classesTaken}/${thisMonth.totalClasses}` : '—', color: 'text-[#1e3a8a]' },
                  { label: 'On Leave',    val: status === 'On Leave' ? 'Yes' : 'No',                               color: status === 'On Leave' ? 'text-amber-600' : 'text-green-600' },
                  { label: 'Status',      val: status,                                                             color: 'text-foreground' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-card border border-border rounded-2xl p-5 shadow-sm text-center">
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">{label}</p>
                    <p className={`text-2xl font-black ${color}`}>{val}</p>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <h3 className="text-base font-bold text-foreground mb-6">7-Day Presence Trend</h3>
                {tAttRecords.length === 0 ? (
                  <div className="text-center py-16">
                    <UserCheck className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 font-bold">No attendance records yet</p>
                    <p className="text-xs text-slate-300 mt-1">Records appear once teacher marks attendance or is marked by admin</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={attTrend}>
                      <defs>
                        <linearGradient id="tAtt" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Attendance']} />
                      <Area type="monotone" dataKey="value" stroke="#1e3a8a" strokeWidth={2.5} fill="url(#tAtt)" dot={{ fill: '#1e3a8a', r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Attendance Records Table */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-bold text-foreground">Attendance Records</h3>
                  {tAttRecords.length > 0 && (
                    <span className="text-xs text-muted-foreground font-semibold">{tAttRecords.length} records</span>
                  )}
                </div>
                {tAttRecords.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400 font-bold">No attendance records found</p>
                    <p className="text-xs text-slate-300 mt-1">Records appear once attendance is marked for this teacher</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="py-3 px-4 text-left text-[10px] font-black uppercase text-slate-400">Date</th>
                          <th className="py-3 px-4 text-left text-[10px] font-black uppercase text-slate-400">Day</th>
                          <th className="py-3 px-4 text-left text-[10px] font-black uppercase text-slate-400">Status</th>
                          <th className="py-3 px-4 text-left text-[10px] font-black uppercase text-slate-400">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {tAttRecords.slice(0, 30).map((rec, i) => {
                          const d = rec.date?.toDate?.() || (rec.date?.toMillis ? new Date(rec.date.toMillis()) : null);
                          const isPresent = rec.status === 'present' || rec.status === 'Present';
                          const isLate    = rec.status === 'late'    || rec.status === 'Late';
                          return (
                            <tr key={rec.id || i} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-4 font-bold text-foreground">
                                {d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </td>
                              <td className="py-3 px-4 text-muted-foreground">
                                {d ? d.toLocaleDateString('en-IN', { weekday: 'short' }) : '—'}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                                  isPresent ? 'bg-green-50 text-green-600' :
                                  isLate    ? 'bg-amber-50 text-amber-600' :
                                              'bg-rose-50 text-rose-600'
                                }`}>
                                  {rec.status || 'Absent'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-muted-foreground text-xs">{rec.remarks || rec.note || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {tAttRecords.length > 30 && (
                      <p className="text-xs text-slate-400 text-center pt-4 font-semibold">
                        Showing latest 30 of {tAttRecords.length} records
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════ REVIEWS TAB ══════════════════════════════ */}
          {activeTab === 'Reviews' && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-8">
                  <div className="text-center">
                    <p className="text-5xl font-black text-amber-500">{avgRating}</p>
                    <StarRow rating={avgRating} />
                    <p className="text-xs text-muted-foreground mt-1.5">{reviews.length} reviews</p>
                  </div>
                  <div className="flex-1 space-y-2">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = reviews.filter((r) => Math.round(r.rating || 0) === star).length;
                      const pctVal = reviews.length ? pct(count, reviews.length) : 0;
                      return (
                        <div key={star} className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-500 w-4">{star}</span>
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pctVal}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* All reviews */}
              {reviews.length === 0 ? (
                <div className="text-center py-24 bg-card rounded-2xl border border-dashed border-slate-200">
                  <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-sm font-bold text-slate-400">No reviews yet</p>
                  <p className="text-xs text-slate-300 mt-1">Parents can submit reviews from their dashboard</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-sm font-bold text-foreground">{r.parentName || r.studentName || 'Parent'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.studentName ? `Parent of ${r.studentName}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <StarRow rating={r.rating || 5} />
                          {r.createdAt?.toDate?.() && (
                            <p className="text-[10px] text-muted-foreground mt-1">{r.createdAt.toDate().toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                      {r.review && (
                        <p className="text-sm text-slate-600 italic">"{r.review}"</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── BACK ─────────────────────────────────────────────────────────────── */}
      <div className="mt-8">
        <button onClick={onBack} className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" /> Back to Teachers
        </button>
      </div>

      {/* ── MARK ATTENDANCE MODAL ───────────────────────────────────────────── */}
      {showMarkAtt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-foreground">Mark Attendance</h3>
              <button onClick={() => setShowMarkAtt(false)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">Marking attendance for <strong>{name}</strong></p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Date</label>
                <input
                  type="date"
                  value={attForm.date}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setAttForm((p) => ({ ...p, date: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['present', 'absent', 'late'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setAttForm((p) => ({ ...p, status: s }))}
                      className={`py-2.5 rounded-xl text-sm font-bold capitalize border transition-all ${
                        attForm.status === s
                          ? s === 'present' ? 'bg-green-600 text-white border-green-600'
                          : s === 'absent'  ? 'bg-rose-500 text-white border-rose-500'
                          :                   'bg-amber-500 text-white border-amber-500'
                          : 'border-border text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Remarks (optional)</label>
                <input
                  type="text"
                  value={attForm.remarks}
                  onChange={(e) => setAttForm((p) => ({ ...p, remarks: e.target.value }))}
                  placeholder="e.g. Medical leave, Training..."
                  className="w-full h-11 px-4 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowMarkAtt(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition-colors">Cancel</button>
              <button
                onClick={handleMarkAttendance}
                disabled={savingAtt || !attForm.date}
                className="flex-1 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingAtt ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {savingAtt ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT PROFILE MODAL ──────────────────────────────────────────────── */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-foreground">Edit Profile</h3>
              <button onClick={() => setShowEditProfile(false)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Phone</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder={phone === '—' ? 'Enter phone number' : phone}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Experience</label>
                <input
                  type="text"
                  value={editForm.experience}
                  onChange={(e) => setEditForm((p) => ({ ...p, experience: e.target.value }))}
                  placeholder={experience === 'N/A' ? 'e.g. 5 years' : experience}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-secondary text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20"
                >
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Invited">Invited</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Bio / Notes</label>
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm((p) => ({ ...p, bio: e.target.value }))}
                  placeholder="Short note about this teacher..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEditProfile(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition-colors">Cancel</button>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex-1 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REASSIGN MODAL ───────────────────────────────────────────────────── */}
      {showReassign && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-foreground">Reassign Class</h3>
              <button onClick={() => setShowReassign(false)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Select a class to assign to <strong>{name}</strong>. Their previous assignments will be removed.
            </p>
            <select
              value={reassignClassId}
              onChange={(e) => setReassignClassId(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-border bg-secondary text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 mb-5"
            >
              <option value="">— Select a class —</option>
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.id}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setShowReassign(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition-colors">Cancel</button>
              <button
                onClick={handleReassignSave}
                disabled={!reassignClassId || savingReassign}
                className="flex-1 py-2.5 rounded-xl bg-[#1e3a8a] text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingReassign ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingReassign ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherProfile;

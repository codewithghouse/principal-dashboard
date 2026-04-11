import React, { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc, getDoc, query, where } from 'firebase/firestore';
import { Database, AlertTriangle, CheckCircle2, Loader2, Play, RefreshCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

const COLLECTIONS = [
  'assignments',
  'attendance',
  'gradebook_columns',
  'gradebook_scores',
  'submissions',
  'results'
];

export default function MigrationEngine() {
  const { userData } = useAuth();
  const [analyzing, setAnalyzing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [debugLogs, setDebugLogs] = useState<any[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // ── Validate principal context before any DB operation ──────────────────────
  const getContext = (): { schoolId: string; branchId: string } | null => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId) { toast.error("Principal schoolId not found. Cannot proceed."); return null; }
    if (!branchId) { toast.error("Principal branchId not found. Cannot proceed."); return null; }
    return { schoolId, branchId };
  };

  const analyzeDatabase = async () => {
    const ctx = getContext();
    if (!ctx) return;
    const { schoolId, branchId } = ctx;

    setAnalyzing(true);
    setReport(null);
    setDebugLogs([]);
    const logs: any[] = [];
    try {
      const stats: any = {};
      let totalToMigrate = 0;
      let totalValid = 0;
      let totalOrphaned = 0;

      // Scope all queries to this school + branch only
      const scope = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];

      // 1. Fetch truth map (teaching_assignments) — scoped
      const taSnap = await getDocs(query(collection(db, "teaching_assignments"), ...scope));
      const teachingAssignments = taSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      if (teachingAssignments.length === 0) {
          logs.push({ type: 'error', msg: 'Zero teaching_assignments found for this branch. Cannot map data.' });
      } else {
          logs.push({ type: 'info', msg: `Truth Map: ${teachingAssignments.length} teaching_assignments found.` });
      }

      const getMatchedAssignment = (classId: string, teacherId: string, subject?: string) => {
         const matches = teachingAssignments.filter(t => t.classId === classId && t.teacherId === teacherId);
         if (matches.length === 0) return null;
         if (matches.length === 1) return matches[0].id;
         if (subject) {
            const cleanSubject = subject.toLowerCase().trim();
            const subjectMatch = matches.find(t =>
                t.subjectId?.toLowerCase().trim() === cleanSubject ||
                t.subjectName?.toLowerCase().trim() === cleanSubject ||
                t.subject?.toLowerCase().trim() === cleanSubject
            );
            if (subjectMatch) return subjectMatch.id;
         }
         return matches[0].id;
      };

      // 2. gradebook_columns — scoped
      const colSnap = await getDocs(query(collection(db, "gradebook_columns"), ...scope));
      const columnMap = new Map();
      colSnap.docs.forEach(d => {
         const data = d.data();
         columnMap.set(d.id, data.assignmentId || getMatchedAssignment(data.classId, data.teacherId, data.subject));
      });

      // 3. assignments — scoped
      const taskSnap = await getDocs(query(collection(db, "assignments"), ...scope));
      const taskMap = new Map();
      taskSnap.docs.forEach(d => taskMap.set(d.id, d.data()));

      const updateQueue: any[] = [];

      // 4. Each collection — scoped to this school + branch
      for (const colName of COLLECTIONS) {
         const snap = await getDocs(query(collection(db, colName), ...scope));
         let colMigrate = 0;
         let colValid = 0;
         let colOrphan = 0;

         snap.docs.forEach(d => {
             const data = d.data();
             const isLegacySubRes = (colName === "submissions" || colName === "results") && !data.homeworkId;

             if (data.assignmentId && !isLegacySubRes && data.assignmentId !== "legacy") {
                  if (teachingAssignments.some(ta => ta.id === data.assignmentId)) {
                     colValid++;
                     totalValid++;
                     return;
                  }
             }

             let resolvedAssignmentId = null;
             let extraPayload = {};
             let failReason = "";

             if (colName === "gradebook_scores") {
                 resolvedAssignmentId = columnMap.get(data.columnId);
                 if (!resolvedAssignmentId) failReason = `Column ${data.columnId} not found or unmapped.`;
             } else if (isLegacySubRes) {
                 const oldTaskId = data.assignmentId;
                 const taskObj = taskMap.get(oldTaskId);
                 if (taskObj) {
                     resolvedAssignmentId = taskObj.assignmentId || getMatchedAssignment(taskObj.classId, taskObj.teacherId, taskObj.title);
                     if (resolvedAssignmentId) extraPayload = { homeworkId: oldTaskId };
                     else failReason = `Task ${oldTaskId} exists but failed to map to an assignment.`;
                 } else {
                    failReason = `Parent Task ${oldTaskId} not found in database.`;
                 }
             } else {
                 const subject = data.subject || data.subjectName || data.title || "";
                 resolvedAssignmentId = getMatchedAssignment(data.classId, data.teacherId, subject);
                 if (!resolvedAssignmentId && data.classId) {
                    const classMatches = teachingAssignments.filter(t => t.classId === data.classId);
                    if (classMatches.length === 1) resolvedAssignmentId = classMatches[0].id;
                    else if (classMatches.length > 1) failReason = `Ambiguous mapping: ${classMatches.length} assignments for Class ${data.classId}.`;
                    else failReason = `No teaching assignments found for Class ${data.classId}.`;
                 } else if (!data.classId && !data.teacherId) {
                    failReason = "Record missing both classId and teacherId.";
                 }
             }

             if (resolvedAssignmentId && resolvedAssignmentId !== "legacy") {
                 colMigrate++;
                 totalToMigrate++;
                 updateQueue.push({ collection: colName, id: d.id, updatePayload: { ...extraPayload, assignmentId: resolvedAssignmentId } });
             } else {
                 colOrphan++;
                 totalOrphaned++;
                 if (logs.length < 100) {
                    logs.push({ type: 'warning', col: colName, id: d.id, reason: failReason || "Mapping Logic Exhausted", meta: { classId: data.classId, teacherId: data.teacherId } });
                 }
             }
         });
         stats[colName] = { toMigrate: colMigrate, valid: colValid, orphan: colOrphan };
      }

      setReport({ stats, totalToMigrate, totalValid, totalOrphaned, updateQueue });
      setDebugLogs(logs);
      toast.success("Database Analysis Complete");
    } catch (e: any) {
      console.error(e);
      toast.error("Analysis Failed: " + e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const repairInstitutionalContext = async () => {
    const ctx = getContext();
    if (!ctx) return;
    const { schoolId, branchId } = ctx;

    setMigrating(true);
    try {
        // 0. Get School Name for injection
        let schoolName = userData?.schoolName || "School";
        try {
          const schoolSnap = await getDoc(doc(db, "schools", schoolId));
          if (schoolSnap.exists()) schoolName = schoolSnap.data().name || schoolName;
        } catch { /* school doc optional */ }

        // 1. Fetch teachers scoped to this school+branch (server-side filter, no full scan)
        const tSnap = await getDocs(
          query(collection(db, "teachers"), where("schoolId", "==", schoolId), where("branchId", "==", branchId))
        );
        const myTeacherIds = tSnap.docs.map(d => d.id);

        if (myTeacherIds.length === 0) {
            toast.error("No teachers found for this school/branch. Link teachers first.");
            return;
        }

        let totalRepaired = 0;
        const collectionsToRepair = ['students', 'enrollments', 'attendance', 'test_scores', 'gradebook_scores'];

        // 2. Process in chunks of 10 (Firestore "in" limit)
        // schoolId filter prevents touching records from other schools with same teacherId
        for (const col of collectionsToRepair) {
            const chunkSize = 10;
            let colCount = 0;
            for (let i = 0; i < myTeacherIds.length; i += chunkSize) {
                const chunk = myTeacherIds.slice(i, i + chunkSize);
                const snap = await getDocs(
                  query(collection(db, col), where("schoolId", "==", schoolId), where("teacherId", "in", chunk))
                );
                const batch = writeBatch(db);

                snap.docs.forEach(d => {
                    const data = d.data();
                    const hasSchoolId = data.schoolId || data.school || data.schoolID || data.school_id;
                    if (!hasSchoolId) {
                        batch.update(doc(db, col, d.id), {
                            schoolId,
                            branchId,
                            school: schoolId,
                            schoolName,
                        });
                        colCount++;
                        totalRepaired++;
                    }
                });
                if (colCount > 0) await batch.commit();
            }
        }
        toast.success(`Successfully healed ${totalRepaired} ghost records! Refresh to see data.`);
        analyzeDatabase();
    } catch (e: any) {
        toast.error("Repair failed: " + e.message);
    } finally {
        setMigrating(false);
    }
  };

  const executeMigration = async () => {
    if (!report || report.updateQueue.length === 0) return;
    if (!confirm(`Run production migration for ${report.totalToMigrate} documents?`)) return;
    setMigrating(true);
    try {
        const queue = [...report.updateQueue];
        const chunkSize = 400;
        for (let i = 0; i < queue.length; i += chunkSize) {
            const chunk = queue.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach(op => batch.update(doc(db, op.collection, op.id), op.updatePayload));
            await batch.commit();
        }
        toast.success(`Successfully migrated to Phase 2 Architecture!`);
        analyzeDatabase();
    } catch (e: any) {
        toast.error("Migration failed: " + e.message);
    } finally {
        setMigrating(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-12 shadow-2xl text-white relative overflow-hidden text-left">
       <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

       <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-white/10 pb-8">
             <div>
                <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-4">
                   <Database className="w-8 h-8 text-indigo-400" /> Infrastructure Maintenance Engine
                </h2>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-3 max-w-2xl leading-relaxed">
                   Repair institutional context and migrate legacy architecture to Phase 2/3 Assignment-based systems.
                </p>
             </div>

             <div className="flex items-center gap-3">
                <button
                    onClick={repairInstitutionalContext}
                    disabled={analyzing || migrating}
                    className="shrink-0 px-8 py-4 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 disabled:opacity-50"
                 >
                    <ShieldCheck className="w-4 h-4"/> Heal Ghost Records
                 </button>
                <button
                    onClick={analyzeDatabase}
                    disabled={analyzing || migrating}
                    className="shrink-0 px-8 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-indigo-900/50 flex items-center gap-3 disabled:opacity-50"
                 >
                    {analyzing ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCcw className="w-4 h-4"/>}
                    Run Full Audit
                 </button>
             </div>
          </div>

          {!report && !analyzing && (
              <div className="py-20 text-center border-2 border-dashed border-white/10 rounded-[2rem] bg-white/5">
                 <ShieldCheck className="w-16 h-16 text-slate-600 mx-auto mb-6" />
                 <h3 className="text-lg font-black tracking-tight mb-2">Systems Ready for Inspection</h3>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Execute an Audit or Heal Ghost records to restore institutional visibility.</p>
              </div>
          )}

          {analyzing && (
              <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-indigo-500/30 rounded-[2rem] bg-indigo-500/5">
                 <Loader2 className="w-16 h-16 text-indigo-400 animate-spin mb-6" />
                 <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest animate-pulse">Scanning production schema structures...</p>
              </div>
          )}

          {report && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-md">
                       <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Valid Architecture</p>
                       <p className="text-5xl font-black">{report.totalValid}</p>
                       <p className="text-[9px] font-bold text-slate-400 mt-2">Documents already aligned with Phase 2</p>
                    </div>
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-3xl p-8 backdrop-blur-md">
                       <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Play className="w-3 h-3"/> Pending Migration</p>
                       <p className="text-5xl font-black text-indigo-300">{report.totalToMigrate}</p>
                       <p className="text-[9px] font-bold text-slate-400 mt-2">Ready for Assignment ID injection</p>
                    </div>
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-8 backdrop-blur-md">
                       <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-2"><AlertTriangle className="w-3 h-3"/> Orphaned Data</p>
                       <p className="text-5xl font-black text-rose-300">{report.totalOrphaned}</p>
                       <p className="text-[9px] font-bold text-slate-400 mt-2">Missing origin class or teacher</p>
                    </div>
                 </div>

                 <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-sm">
                    <table className="w-full text-left">
                       <thead className="bg-white/5">
                          <tr>
                             <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-white/5">Collection Matrix</th>
                             <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center border-b border-white/5">Healthy</th>
                             <th className="py-5 px-6 text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] text-center border-b border-white/5">To Upgrade</th>
                             <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center border-b border-white/5">Ignored</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-white/5">
                          {COLLECTIONS.map(col => (
                             <tr key={col} className="hover:bg-white/5 transition-colors">
                                <td className="py-4 px-6 text-sm font-black text-slate-200">{col}</td>
                                <td className="py-4 px-6 text-center text-emerald-400 text-sm font-bold">{report.stats[col].valid}</td>
                                <td className="py-4 px-6 text-center text-indigo-300 text-sm font-black">{report.stats[col].toMigrate}</td>
                                <td className="py-4 px-6 text-center text-slate-500 text-xs font-bold">{report.stats[col].orphan}</td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>

                 <div className="flex items-center justify-between pt-6 border-t border-white/10">
                    <button onClick={() => setShowDebug(!showDebug)} className="text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors">
                       {showDebug ? "Hide Trace Logs" : "Show Trace Logs & Orphan Details"}
                    </button>
                    <button
                       onClick={executeMigration}
                       disabled={report.totalToMigrate === 0 || migrating}
                       className="px-10 py-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-indigo-900/50 flex items-center gap-3 disabled:opacity-50 disabled:bg-slate-700"
                    >
                       {migrating ? <Loader2 className="w-5 h-5 animate-spin"/> : <CheckCircle2 className="w-5 h-5"/>}
                       {migrating ? "Processing..." : "Complete Architecture Migration"}
                    </button>
                 </div>

                 {showDebug && (
                    <div className="mt-10 space-y-6 animate-in slide-in-from-top-4 duration-500">
                       <h4 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"> Trace Logs</h4>
                       <div className="bg-black/20 border border-white/5 rounded-2xl p-4 max-h-[400px] overflow-y-auto space-y-2">
                          {debugLogs.map((log, i) => (
                             <div key={i} className={`p-4 rounded-xl text-[10px] font-mono ${log.type === 'error' ? 'bg-rose-500/10 text-rose-300' : 'bg-indigo-500/10 text-indigo-300'}`}>
                                <b>[{log.type.toUpperCase()}]</b> {log.col ? `${log.col} • ${log.id}` : log.msg}
                             </div>
                          ))}
                       </div>
                    </div>
                 )}
              </div>
          )}
       </div>
    </div>
  );
}

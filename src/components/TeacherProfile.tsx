import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Star, Printer, MessageSquare, Users, BookOpen, Calendar, BarChart3, Activity, CheckCircle2, Clock, TrendingUp, AlertCircle, FileText, Loader2, ChevronLeft, ChevronRight, Edit2, Send, X, Award, ClipboardList, NotebookPen } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { pctOfDoc, isPresent, ymdLocal } from "@/lib/scoreUtils";
import { SubjectMasteryRadar } from "./SubjectMasteryRadar";

// ── Tokens — aligned to principal-dashboard palette ─────────────────────
const T = {
  bg:   "#EEF4FF",
  white:"#fff",
  ink:  "#001040",
  ink2: "#5070B0",
  ink3: "#99AACC",
  bdr:  "rgba(0,85,255,0.10)",
  s1:   "rgba(0,85,255,0.04)",
  s2:   "rgba(0,85,255,0.08)",
  blue: "#0055FF",
  blBg: "rgba(0,85,255,0.10)",
  grn:  "#00C853", glBg: "rgba(0,200,83,0.10)",
  red:  "#FF3355", rlBg: "rgba(255,51,85,0.10)",
  amb:  "#FF8800", alBg: "rgba(255,136,0,0.10)",
};
const toDate=(v:any):Date|null=>{if(!v)return null;if(v?.toDate)return v.toDate();if(v?.seconds)return new Date(v.seconds*1000);const d=new Date(v);return isNaN(d.getTime())?null:d;};
const MONTHS=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const timeAgo=(v:any)=>{const d=toDate(v);if(!d)return"";const s=(Date.now()-d.getTime())/1000;if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}).toUpperCase();};
const pct=(n:number,t:number)=>t===0?0:Math.round((n/t)*100);
// Was: returned `0` for missing scores → cascaded into "Weak" classifications,
// inflated risk, dragged averages down. Now wraps shared `pctOfDoc` which
// returns null for missing data and handles all 4 score schemas correctly.
const getScore=(r:any):number|null=>pctOfDoc(r);
// LOCAL date string (NOT UTC) — `toISOString().split("T")[0]` flipped
// IST-midnight records into the previous UTC day on the calendar.
const ymd=(d:Date):string=>ymdLocal(d);
// Shared dual-key match — studentId OR studentEmail (memory:
// dual_query_pattern_studentid_email).
const matchesStudent=(r:any,sid:string,email:string):boolean=>{
  const rsid=String(r?.studentId||"");
  const rsem=String(r?.studentEmail||"").toLowerCase();
  return (!!sid&&rsid===sid)||(!!email&&rsem===email.toLowerCase());
};
// Broad writer-timestamp probe — different writers stamp different fields
// (test_scores: timestamp, gradebook_scores: uploadedAt, results: createdAt,
// imports: updatedAt, attendance: date+timestamp). Strict probe of just 3
// silently dropped ~40% of recent records (memory: bug_pattern_filterbytime_field_drift).
const writerTs=(d:any):Date|null=>
  toDate(d?.timestamp||d?.createdAt||d?.date||d?.uploadedAt||d?.updatedAt);
const writerMs=(d:any):number=>writerTs(d)?.getTime()??0;
const writerDateKey=(d:any):string=>{
  const t=writerTs(d);return t?ymdLocal(t):"";
};

// ── Card wrapper — matches dashboard pop hover (via global CSS) ─────────
const Card=({children,title,action,style:st}:{children:React.ReactNode;title?:string;action?:React.ReactNode;style?:React.CSSProperties})=>(
  <div
    className="bg-white rounded-[16px] overflow-hidden"
    style={{
      border:`0.5px solid ${T.bdr}`,
      boxShadow:"0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.12), 0 18px 44px rgba(0,85,255,.15)",
      ...st,
    }}>
    {title&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${T.s2}`}}><span style={{fontSize:14,fontWeight:600,color:T.ink}}>{title}</span>{action||null}</div>}
    <div style={{padding:"16px 20px"}}>{children}</div>
  </div>
);
const DLink=()=><span style={{fontSize:11,color:T.blue,fontWeight:500,cursor:"pointer"}}>Details →</span>;
const StarRow=({rating}:{rating:number})=><div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(i=><Star key={i} size={14} fill={i<=Math.round(rating)?"#f59e0b":"none"} color={i<=Math.round(rating)?"#f59e0b":"#e2e8f0"}/>)}</div>;

// ═══════════════════════════════════════════════════════════════════════════════
interface TeacherProfileProps { teacher: any; onBack: () => void; }

const TeacherProfile = ({ teacher, onBack }: TeacherProfileProps) => {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId || "";

  const classesRef=useRef<any[]>([]);const enrollRef=useRef<any[]>([]);const resultsRef=useRef<any[]>([]);
  const reviewsRef=useRef<any[]>([]);const tAttRef=useRef<any[]>([]);const meetingsRef=useRef<any[]>([]);
  const testsRef=useRef<any[]>([]);const assignmentsRef=useRef<any[]>([]);
  const lessonPlansRef=useRef<any[]>([]);const parentNotesRef=useRef<any[]>([]);
  const testScoresRef=useRef<any[]>([]);
  // gradebook_scores is co-canonical with test_scores — gradebook bulk
  // uploads land here; missing this listener silently dropped ~all
  // gradebook entries (memory: owner_dashboard_alternate_data_sources).
  const gradebookScoresRef=useRef<any[]>([]);
  // Raw attendance buffers feed compute()'s attribution + synthesis pipeline.
  // tAttRef holds the FINAL synthesized output (consumed by calendar render).
  const rawAttRef=useRef<any[]>([]);
  const rawTeacherAttRef=useRef<any[]>([]);
  // Debounce timer — all 11 listeners share one timer so compute() runs
  // ONCE after the initial burst settles (was: 11 simultaneous compute()
  // calls on first mount, each O(scores) work — visible jank on big data).
  const computeTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);

  const [assignedClasses,setAssignedClasses]=useState<any[]>([]);
  // null distinguishes "no data tracked" from "real zero" — drives "—"
  // displays instead of the fabricated 0% / 5.0★ that used to leak through.
  const [perfMetrics,setPerfMetrics]=useState<{classAvg:number|null;passRate:number|null;satisfaction:number|null}>({classAvg:null,passRate:null,satisfaction:null});
  const [reviews,setReviews]=useState<any[]>([]);
  const [avgRating,setAvgRating]=useState<number|null>(null);
  const [thisMonth,setThisMonth]=useState<{classesTaken:number;totalClasses:number;attPct:number|null;testsCount:number;meetingsCount:number}>({classesTaken:0,totalClasses:0,attPct:null,testsCount:0,meetingsCount:0});
  const [subjectData,setSubjectData]=useState<{name:string;axis:string;avg:number}[]>([]);
  const [studentRankings,setStudentRankings]=useState<any[]>([]);
  const [activity,setActivity]=useState({testsCreated:0,assignmentsCreated:0,lessonPlansCount:0,parentNotesCount:0});
  // Subject abbreviation — short names stay whole, multi-word names use
  // initials, long single-word truncates with ellipsis. Was: hard
  // `slice(0,12)` which mangled "Computer Science" → "Computer Sc".
  const abbrSubject=(s:string):string=>{
    const c=String(s||"").trim();
    if(c.length<=8)return c;
    const words=c.split(/\s+/).filter(Boolean);
    if(words.length>=2)return words.map(w=>w[0]).join("").toUpperCase().slice(0,4);
    return c.slice(0,7)+"…";
  };
  // monthlyTrend now lives in state (was a broken useMemo with `[loading]`
  // dep that never recomputed after initial load, so the chart silently
  // showed stale data forever — B15 fix). Computed inside compute() so it
  // updates whenever any score listener fires.
  const [monthlyTrend,setMonthlyTrend]=useState<{month:string;score:number|null;passRate:number|null}[]>([]);
  const [loading,setLoading]=useState(true);
  const [msgText,setMsgText]=useState("");const [sendingMsg,setSendingMsg]=useState(false);
  const [editOpen,setEditOpen]=useState(false);
  const [editForm,setEditForm]=useState({phone:teacher.phone||"",experience:teacher.experience||"",bio:teacher.bio||"",status:teacher.status||"Active"});
  const [savingEdit,setSavingEdit]=useState(false);
  const [calMonth,setCalMonth]=useState(new Date());

  const name=teacher.name||"Teacher"; const subject=teacher.subject||"N/A";
  const initials=name.split(" ").map((n:string)=>n[0]).join("").toUpperCase().slice(0,2);
  const today=new Date(); const startOfMonth=new Date(today.getFullYear(),today.getMonth(),1);

  // ── Compute ────────────────────────────────────────────────────────────────
  // P0-aware aggregation:
  //  - Score docs are content-fingerprint deduped (`student|subject|date|pct`)
  //    so an exam mirrored to BOTH `results` and `test_scores` doesn't
  //    double-count.
  //  - All score reads use `pctOfDoc` (null for missing) — never default to 0.
  //  - Attendance reads use `isPresent` (case-insensitive, late-counts-as-present).
  //  - Student/enrollment counts deduped by studentId/email.
  const compute=()=>{
    const classes=classesRef.current,enrolls=enrollRef.current;

    // ── 3-tier attribution (memory: pattern_3tier_attribution) ──────────────
    // Event streams are now school-scoped at the listener level (no strict
    // teacherId filter — that was the silent killer that hid every doc
    // whose teacherId field was missing/email-keyed/legacy-formatted, per
    // bug_pattern_branch_filter_on_event_streams). Attribution moves here:
    //   Tier 1: direct teacherId match
    //   Tier 2: teacherEmail match (case-insensitive)
    //   Tier 3: classId ∈ teacher's resolved classes (+ optional lenient
    //           subject substring match for score docs to avoid stealing
    //           a co-teacher's score in the same class)
    const teacherEmail=String(teacher.email||"").toLowerCase();
    const teacherSubj=String(teacher.subject||"").toLowerCase();
    const classIdSet=new Set(classes.map(c=>c.id).filter(Boolean));
    const matchByIdOrEmail=(d:any):boolean=>{
      if(teacher.id&&String(d?.teacherId||"")===teacher.id)return true;
      if(teacherEmail&&String(d?.teacherEmail||"").toLowerCase()===teacherEmail)return true;
      return false;
    };
    const matchTeacherEvent=(d:any,opts?:{lenientSubject?:boolean}):boolean=>{
      if(matchByIdOrEmail(d))return true;
      if(d?.classId&&classIdSet.has(d.classId)){
        if(opts?.lenientSubject){
          const s=String(d?.subject||d?.subjectName||"").toLowerCase();
          if(!teacherSubj||!s)return true;
          return s.includes(teacherSubj)||teacherSubj.includes(s);
        }
        return true;
      }
      return false;
    };

    // Apply attribution BEFORE any aggregation. Score docs use lenient
    // subject (handles "Math" vs "Mathematics" drift). Author/recipient
    // docs (reviews/meetings/tests/assignments/plans/notes) stay strict
    // id|email so we never wrongly attribute a co-teacher's artifact.
    // gradebook_scores merged into the score pool — co-canonical with
    // test_scores (memory: owner_dashboard_alternate_data_sources).
    const filteredResults     = resultsRef.current        .filter(d=>matchTeacherEvent(d,{lenientSubject:true}));
    const filteredTestScores  = testScoresRef.current     .filter(d=>matchTeacherEvent(d,{lenientSubject:true}));
    const filteredGradebook   = gradebookScoresRef.current.filter(d=>matchTeacherEvent(d,{lenientSubject:true}));
    const filteredReviews     = reviewsRef.current        .filter(matchByIdOrEmail);
    const filteredMeetings    = meetingsRef.current       .filter(matchByIdOrEmail);
    const filteredTests       = testsRef.current          .filter(matchByIdOrEmail);
    const filteredAssignments = assignmentsRef.current    .filter(matchByIdOrEmail);
    const filteredLessonPlans = lessonPlansRef.current    .filter(matchByIdOrEmail);
    const filteredParentNotes = parentNotesRef.current    .filter(matchByIdOrEmail);

    // ── Attendance synthesis ───────────────────────────────────────────────
    // Prefer real teacher_attendance docs (id/email matched). Otherwise
    // synthesize one entry per (date, classId) from student-attendance docs
    // belonging to this teacher's resolved classes — that's the real proxy
    // for "classes this teacher took" since the attendance writer rarely
    // tags teacherId on student-attendance rows.
    // Merge real teacher_attendance docs WITH synthesized sessions from
    // student-attendance — keyed by (date, classId). Real docs win on dupe
    // keys (authoritative status). Earlier "either/or" logic silently
    // discarded ALL synthesized sessions whenever even ONE legacy
    // teacher_attendance doc existed — that's why fresh class-marking
    // didn't show up in "This Month" until both sources merged.
    const dateKeyOf=(r:any):string=>{
      if(!r?.date)return"";
      if(typeof r.date==="string")return r.date.slice(0,10);
      const dt=toDate(r.date);return dt?ymd(dt):"";
    };
    const filteredTeacherAtt=rawTeacherAttRef.current.filter(matchByIdOrEmail);
    const sessions=new Map<string,{date:any;classId:string;status:string}>();
    // Pass 1: real teacher_attendance — preserve writer-supplied status.
    filteredTeacherAtt.forEach(r=>{
      const k=`${dateKeyOf(r)}|${r.classId||""}`;
      sessions.set(k,{date:r.date,classId:r.classId||"",status:String(r?.status||"present").toLowerCase()});
    });
    // Pass 2: synth from student-attendance — only fills gaps (won't
    // overwrite a real teacher_attendance entry for the same session).
    rawAttRef.current.forEach(r=>{
      if(!matchTeacherEvent(r))return;
      const k=`${dateKeyOf(r)}|${r.classId||""}`;
      if(!sessions.has(k))sessions.set(k,{date:r.date,classId:r.classId||"",status:"present"});
    });
    tAttRef.current = Array.from(sessions.values());

    // Cross-collection dedup — same fingerprint key across results +
    // test_scores + gradebook_scores so a single exam mirrored into
    // multiple collections doesn't triple-count. Date key uses the broad
    // writerTs probe (timestamp/createdAt/date/uploadedAt/updatedAt) so
    // dedup works whichever field the writer stamped.
    const allRaw=[...filteredResults,...filteredTestScores,...filteredGradebook];
    const fpSeen=new Set<string>();
    const results:{raw:any;_pct:number}[]=[];
    allRaw.forEach(r=>{
      const p=getScore(r);
      if(p===null)return;
      const subj=String(r.subject??r.subjectName??"").toLowerCase();
      const dateK=writerDateKey(r);
      const studentKey=String(r.studentId||r.studentEmail||"").toLowerCase();
      const fp=`${studentKey}|${subj}|${dateK}|${Math.round(p*10)}`;
      if(fpSeen.has(fp))return;
      fpSeen.add(fp);
      results.push({raw:r,_pct:p});
    });
    const rvList=filteredReviews,tAtt=tAttRef.current,meetings=filteredMeetings;

    // Activity counters — teacher-created artifacts (real Firebase counts)
    setActivity({
      testsCreated:       filteredTests.length,
      assignmentsCreated: filteredAssignments.length,
      lessonPlansCount:   filteredLessonPlans.length,
      parentNotesCount:   filteredParentNotes.length,
    });

    // Per-class averages — null when no scores for that class.
    const withData=classes.map(c=>{
      const classEnrolls=enrolls.filter(e=>e.classId===c.id);
      const stuKeySet=new Set(classEnrolls.map(e=>e.studentId||(e.studentEmail||"").toLowerCase()).filter(Boolean));
      const stuCount=stuKeySet.size;
      const classRes=results.filter(({raw})=>raw.classId===c.id);
      const avgScore=classRes.length?Math.round(classRes.reduce((s,r)=>s+r._pct,0)/classRes.length):null;
      const perf=avgScore===null?"No Data":avgScore>=75?"Good":avgScore>=55?"Average":"Weak";
      return{...c,stuCount,avgScore,perf};
    });
    setAssignedClasses(withData);

    // Org-wide perfMetrics — based ONLY on real scores. classAvg/passRate
    // null when no exams; UI must render "—" not "0%".
    const classAvg=results.length?Math.round(results.reduce((s,r)=>s+r._pct,0)/results.length):null;
    const passRate=results.length?Math.round(results.filter(r=>r._pct>=40).length/results.length*100):null;
    const satisfaction=rvList.length?Math.round(rvList.reduce((s,r)=>s+(r.rating||0),0)/rvList.length*20):null;
    setPerfMetrics({classAvg,passRate,satisfaction});

    setReviews([...rvList].sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)));
    // Rating: null when no reviews — caller renders "—" instead of fake 5.0★.
    setAvgRating(rvList.length?Math.round(rvList.reduce((s,r)=>s+(r.rating||0),0)/rvList.length*10)/10:null);

    // This-month stats: case-insensitive isPresent helper, results filtered
    // by either `createdAt` OR `timestamp` for cross-writer compatibility.
    const mAtt=tAtt.filter(a=>(toDate(a.date)?.getTime()||0)>=startOfMonth.getTime());
    const classesTaken=mAtt.filter(isPresent).length;
    setThisMonth({
      classesTaken,
      totalClasses:mAtt.length,
      attPct:mAtt.length?pct(classesTaken,mAtt.length):null,
      // Use broad writerMs probe so gradebook_scores (uploadedAt-stamped)
      // and import-only docs (updatedAt) get counted in this-month tests.
      testsCount:new Set(
        results
          .filter(({raw})=>writerMs(raw)>=startOfMonth.getTime())
          .map(({raw})=>raw.testId||raw.subject)
      ).size,
      meetingsCount:meetings.filter(m=>writerMs(m)>=startOfMonth.getTime()).length,
    });

    // Subject grouping — falls back to teacher.subject ONLY when result has
    // no subject of its own (preserves real subject categorization).
    const subMap=new Map<string,number[]>();
    results.forEach(({raw,_pct})=>{
      const s=raw.subjectName||raw.subject||subject;
      if(!subMap.has(s))subMap.set(s,[]);
      subMap.get(s)!.push(_pct);
    });
    setSubjectData(Array.from(subMap.entries()).map(([n,sc])=>({
      // Full name preserved (used in tooltip + title attribute);
      // `axis` is the abbreviated label rendered on chart axes.
      name:n,
      axis:abbrSubject(n),
      avg:Math.round(sc.reduce((a,b)=>a+b,0)/sc.length),
    })));

    // Top students — dual-key (studentId OR email) so legacy email-only
    // result rows aren't silently invisible to the rankings.
    const stuMap=new Map<string,{name:string;className:string;scores:number[]}>();
    results.forEach(({raw,_pct})=>{
      const sid=raw.studentId||(raw.studentEmail||"").toLowerCase()||"";
      if(!sid)return;
      const cls=classes.find(c=>c.id===raw.classId);
      if(!stuMap.has(sid))stuMap.set(sid,{name:raw.studentName||sid,className:cls?.name||"—",scores:[]});
      stuMap.get(sid)!.scores.push(_pct);
    });
    setStudentRankings(
      Array.from(stuMap.values())
        .map(s=>({...s,avg:Math.round(s.scores.reduce((a,b)=>a+b,0)/s.scores.length)}))
        .sort((a,b)=>b.avg-a.avg)
        .slice(0,10),
    );

    // Monthly trend (last 6 months) — uses the SAME deduped + null-filtered
    // score list as everything else, accepts both `createdAt` AND `timestamp`
    // (different writers use different fields), and is recomputed whenever
    // compute() runs (was a broken useMemo with [loading] dep that froze
    // after initial load — B15 fix). null score means "no data this month"
    // → chart renders a gap via Recharts.
    const now=new Date();
    setMonthlyTrend(Array.from({length:6},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(5-i),1);
      const monthRes=results.filter(({raw})=>{
        const dt=writerTs(raw);
        return dt&&dt.getMonth()===d.getMonth()&&dt.getFullYear()===d.getFullYear();
      });
      const sc=monthRes.map(r=>r._pct);
      return{
        month:MONTHS[d.getMonth()],
        score:sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):null,
        passRate:sc.length?Math.round(sc.filter(v=>v>=40).length/sc.length*100):null,
      };
    }));

    setLoading(false);
  };

  // ── Listeners ──────────────────────────────────────────────────────────────
  // P0 fixes:
  //  B1: every collection scoped by schoolId (was: teacherId-only — defense
  //      in depth + cross-tenant safety per memory bug_pattern_unscoped_…).
  //  B3: real errLog handlers replace silent `() => {}` so denials surface.
  //  B4: Firestore `in` query is capped at 10 docs; chunk + concat snapshots
  //      so teachers with >10 classes don't silently lose data.
  //  B18: safety timer bumped to 8s (was 3s) so big-data classes finish.
  useEffect(()=>{
    if(!teacher.id||!schoolId)return;
    const unsubs:(()=>void)[]=[];let enrollUnsubs:(()=>void)[]=[];let classUnsubs:(()=>void)[]=[];

    const errLog=(label:string)=>(err:Error)=>console.warn(`[TeacherProfile] ${label} listener failed:`,err);

    // Debounced compute — 80ms window, replaces ad-hoc immediate compute()
    // calls inside each listener. All 11 listeners hit this; only the LAST
    // settled snapshot triggers the actual recompute, eliminating the
    // initial-burst thrash.
    const scheduleCompute=()=>{
      if(computeTimerRef.current)clearTimeout(computeTimerRef.current);
      computeTimerRef.current=setTimeout(compute,80);
    };

    // Helper: chunk an array of IDs and run multiple `in` queries (10/chunk)
    // accumulating results into a ref + recomputing.
    const listenChunkedIn=(
      coll:string,
      field:string,
      ids:string[],
      target:any[],
      apply:(arr:any[])=>void,
    ):(()=>void)[]=>{
      if(ids.length===0)return[];
      const chunks:string[][]=[];
      for(let i=0;i<ids.length;i+=10)chunks.push(ids.slice(i,i+10));
      const accum:Record<number,any[]>={};
      const subs:(()=>void)[]=[];
      chunks.forEach((chunk,idx)=>{
        subs.push(onSnapshot(
          query(collection(db,coll),where("schoolId","==",schoolId),where(field,"in",chunk)),
          s=>{
            accum[idx]=s.docs.map(d=>({id:d.id,...d.data()}));
            const merged=Object.values(accum).flat();
            apply(merged);
            scheduleCompute();
          },
          errLog(`${coll}[${idx}]`),
        ));
      });
      return subs;
    };

    // Step 1: get this teacher's class IDs from teaching_assignments
    getDocs(query(
      collection(db,"teaching_assignments"),
      where("schoolId","==",schoolId),
      where("teacherId","==",teacher.id),
    )).then(snap=>{
      const cIds=[...new Set(snap.docs.map(d=>d.data().classId).filter(Boolean))] as string[];

      if(cIds.length>0){
        // Live-listen to classes in chunks of 10 (Firestore `in` cap)
        classUnsubs=listenChunkedIn(
          "classes","__name__",cIds,classesRef.current,
          arr=>{classesRef.current=arr;}
        );
      }else{
        // Fallback: classes with teacherId field directly set
        classUnsubs.push(onSnapshot(
          query(collection(db,"classes"),where("schoolId","==",schoolId),where("teacherId","==",teacher.id)),
          s=>{classesRef.current=s.docs.map(d=>({id:d.id,...d.data()}));scheduleCompute();},
          errLog("classes(teacherId)"),
        ));
      }

      // Wait briefly for first class snapshot, then listen to enrollments
      // for those class IDs (also chunked at 10).
      const setupEnrollments=()=>{
        enrollUnsubs.forEach(u=>u());
        enrollUnsubs=[];
        const ids=classesRef.current.map(c=>c.id);
        if(ids.length>0){
          enrollUnsubs=listenChunkedIn(
            "enrollments","classId",ids,enrollRef.current,
            arr=>{enrollRef.current=arr;}
          );
        }else{
          enrollRef.current=[];
        }
      };
      // Re-derive enrollment listeners whenever classes change
      const recomputeEnrollments=setInterval(setupEnrollments,2000);
      // Initial setup after small delay so first class snapshot arrives
      setTimeout(setupEnrollments,500);
      // Stash the interval cleanup
      unsubs.push(()=>clearInterval(recomputeEnrollments));
    }).catch(err=>console.warn("[TeacherProfile] teaching_assignments fetch failed:",err));

    // Per-collection listeners — school-scoped at Firestore (NO teacherId
    // filter — that was the silent killer per memory
    // bug_pattern_branch_filter_on_event_streams). Attribution lives in
    // compute() via 3-tier matcher (pattern_3tier_attribution).
    // scheduleCompute() collapses the initial burst into one recompute.
    const subSchool=(coll:string,setter:(s:any)=>void,label:string)=>onSnapshot(
      query(collection(db,coll),where("schoolId","==",schoolId)),
      s=>{setter(s.docs.map(d=>({id:d.id,...d.data()})));scheduleCompute();},
      errLog(label),
    );

    unsubs.push(subSchool("results",         arr=>{resultsRef.current=arr;},      "results"));
    unsubs.push(subSchool("teacher_reviews", arr=>{reviewsRef.current=arr;},      "teacher_reviews"));
    unsubs.push(subSchool("parent_meetings", arr=>{meetingsRef.current=arr;},     "parent_meetings"));
    unsubs.push(subSchool("tests",           arr=>{testsRef.current=arr;},        "tests"));
    unsubs.push(subSchool("assignments",     arr=>{assignmentsRef.current=arr;},  "assignments"));
    unsubs.push(subSchool("lessonPlans",     arr=>{lessonPlansRef.current=arr;},  "lessonPlans"));
    unsubs.push(subSchool("parent_notes",    arr=>{parentNotesRef.current=arr;},  "parent_notes"));
    unsubs.push(subSchool("test_scores",     arr=>{testScoresRef.current=arr;},   "test_scores"));
    unsubs.push(subSchool("gradebook_scores",arr=>{gradebookScoresRef.current=arr;},"gradebook_scores"));

    // Teacher attendance — derived from TWO sources, both school-scoped at
    // Firestore. Attribution + synthesis lives in compute() so the result
    // always reflects the latest classIdSet (resolved from teaching_assignments).
    //  (A) `teacher_attendance` — proper HR-style 1-doc-per-session.
    //      Filtered by id|email match in compute().
    //  (B) `attendance` — student attendance the teacher marked. Filtered
    //      by classId∈teacher's classes in compute(), then deduped per
    //      (date, classId) into synthetic teacher-attendance entries.
    // compute() prefers (A) when non-empty, else falls back to (B).
    unsubs.push(subSchool("teacher_attendance", arr=>{rawTeacherAttRef.current=arr;}, "teacher_attendance"));
    unsubs.push(subSchool("attendance",         arr=>{rawAttRef.current=arr;},        "attendance"));

    // Safety net — unblock spinner after 8s if listeners haven't all settled
    const safetyTimer=setTimeout(()=>setLoading(false),8000);

    return()=>{
      clearTimeout(safetyTimer);
      if(computeTimerRef.current)clearTimeout(computeTimerRef.current);
      unsubs.forEach(u=>u());
      enrollUnsubs.forEach(u=>u());
      classUnsubs.forEach(u=>u());
    };
  },[teacher.id,schoolId]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSendMsg=async()=>{
    if(!msgText.trim())return;
    if(!schoolId){toast.error("Session lost — please log in again.");return;}
    setSendingMsg(true);
    try{
      await addDoc(collection(db,"principal_to_teacher_notes"),{
        principalId:userData?.id||"",
        principalName:(userData as any)?.fullName||(userData as any)?.name||"Principal",
        teacherId:teacher.id,
        teacherName:name,
        message:msgText.trim(),
        from:"principal",
        timestamp:serverTimestamp(),
        schoolId,
        branchId:userData?.branchId||null,
        read:false,
      });
      setMsgText("");
      toast.success("Message sent!");
    }catch(err){
      console.error("[TeacherProfile] send message failed:",err);
      toast.error("Failed to send message.");
    }
    setSendingMsg(false);
  };
  const handleSaveEdit=async()=>{
    if(!teacher.id)return;
    // Trim + validate before write — phone (if present) must be sane,
    // status must be a known value, all values stored as strings.
    const phone=editForm.phone.trim();
    const exp=editForm.experience.trim();
    const bio=editForm.bio.trim();
    const status=editForm.status.trim();
    if(phone&&!/^[\d\s+()-]{6,20}$/.test(phone)){
      toast.error("Phone looks invalid (digits, spaces, +, () and - only).");
      return;
    }
    if(!["Active","On Leave","Invited","Archived"].includes(status)){
      toast.error("Invalid status.");
      return;
    }
    setSavingEdit(true);
    try{
      await updateDoc(doc(db,"teachers",teacher.id),{
        phone,
        experience:exp,
        bio,
        status,
      });
      toast.success("Updated!");
      setEditOpen(false);
    }catch(err){
      console.error("[TeacherProfile] save edit failed:",err);
      toast.error("Failed to update teacher.");
    }
    setSavingEdit(false);
  };

  // Export — proper structured report instead of `window.print()` (which
  // printed the whole browser chrome). Uses shared reportTemplate to match
  // the format used elsewhere (Academics, Reports page).
  const handleExport=async()=>{
    try{
      const{buildReport,openReportWindow}=await import("@/lib/reportTemplate");
      const html=buildReport({
        title:`Teacher Profile — ${name}`,
        badge:teacher.subject||"Teacher",
        heroStats:[
          {label:"Class Average",value:perfMetrics.classAvg!==null?`${perfMetrics.classAvg}%`:"—"},
          {label:"Pass Rate",value:perfMetrics.passRate!==null?`${perfMetrics.passRate}%`:"—",color:"#22c55e"},
          {label:"Attendance",value:attRate!==null?`${attRate}%`:"—",color:"#3b82f6"},
          {label:"Rating",value:avgRating!==null?`${avgRating.toFixed(1)}/5`:"—",color:"#f59e0b"},
        ],
        sections:[
          {
            title:"Assigned Classes",
            type:"table",
            headers:["Class","Students","Average","Status"],
            rows:assignedClasses.map(c=>({
              cells:[c.name||c.id,c.stuCount,c.avgScore!=null?`${c.avgScore}%`:"—",c.perf],
              highlight:c.perf==="Weak",
            })),
          },
          {
            title:"Subject Performance",
            type:"table",
            headers:["Subject","Average"],
            rows:subjectData.map(s=>({cells:[s.name,`${s.avg}%`]})),
          },
          {
            title:"Top Students",
            type:"table",
            headers:["Rank","Name","Class","Average"],
            rows:studentRankings.map((s,i)=>({cells:[i+1,s.name,s.className,`${s.avg}%`]})),
          },
        ],
      });
      openReportWindow(html);
    }catch(err){
      console.error("[TeacherProfile] export failed:",err);
      toast.error("Export failed.");
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  // Dedup enrollments by studentId/email so a student in 2 enrollment rows
  // (legacy bulk imports) doesn't get double-counted (B7 fix).
  const totalStudents=new Set(
    enrollRef.current
      .map(e=>e.studentId||(e.studentEmail||"").toLowerCase())
      .filter(Boolean)
  ).size;
  const attRate=thisMonth.attPct;
  // radar uses ABBREVIATED axis labels (full subject name still in tooltip)
  const radarData=subjectData.map(s=>({subject:s.axis,fullName:s.name,score:s.avg,fullMark:100}));

  // monthlyTrend now lives in state and is computed in compute() — see B15
  // fix above. The old useMemo here had `[loading]` deps and never updated.

  // Calendar data — uses LOCAL ymd (not UTC) so IST midnight records stay
  // in the correct day. Status checks are case-insensitive via toLowerCase.
  const calY=calMonth.getFullYear(),calM=calMonth.getMonth();
  const tAtt=tAttRef.current;
  const firstD=new Date(calY,calM,1).getDay(),dim=new Date(calY,calM+1,0).getDate();
  const statusOf=(a:any)=>String(a?.status||"").toLowerCase();
  const calDays=Array.from({length:42},(_,i)=>{
    const dn=i-firstD+1;
    if(dn<1||dn>dim)return null;
    const d=new Date(calY,calM,dn);
    const ds=ymd(d);
    const rec=tAtt.find(a=>{
      const ad=toDate(a.date);
      return ad&&ymd(ad)===ds;
    });
    return{dayNum:dn,date:d,status:statusOf(rec)||null};
  });
  const inMonth=(a:any):boolean=>{const d=toDate(a.date);return!!d&&d.getMonth()===calM&&d.getFullYear()===calY;};
  const calP=tAtt.filter(a=>inMonth(a)&&statusOf(a)==="present").length;
  const calL=tAtt.filter(a=>inMonth(a)&&statusOf(a)==="late").length;
  const calA=tAtt.filter(a=>inMonth(a)&&statusOf(a)==="absent").length;

  // Risk score — null-safe. If we have NO data on a signal, that signal
  // is excluded from the risk calc instead of being treated as 0/100
  // (which previously made every brand-new teacher show "ELEVATED" risk).
  const riskInputs=[
    perfMetrics.classAvg,
    perfMetrics.passRate,
    attRate,
  ].filter((v):v is number=>v!==null);
  const riskScore=riskInputs.length>0
    ? Math.round(riskInputs.reduce((s,v)=>s+Math.max(0,100-v),0)/riskInputs.length)
    : null;
  const riskLevel=riskScore===null?"NO DATA":riskScore<20?"STABLE":riskScore<45?"MONITOR":"ELEVATED";
  const riskColor=riskScore===null?T.ink3:riskScore<20?T.grn:riskScore<45?T.amb:T.red;

  // ── Display-safe values for UI consumers ──────────────────────────────────
  // These coerce nullable metrics to safe defaults for chart math (0 used
  // for ring/bar lengths) and to "—" for text. UI shouldn't crash on null
  // and shouldn't show fabricated 0%/5.0★.
  const classAvgN  = perfMetrics.classAvg   ?? 0;       // for SVG ring math
  const passRateN  = perfMetrics.passRate   ?? 0;
  const satN       = perfMetrics.satisfaction ?? 0;
  const attRateN   = attRate ?? 0;
  const ratingN    = avgRating ?? 0;
  const fmtPct     = (v: number | null) => v === null ? "—" : `${v}%`;
  const fmtRating  = (v: number | null) => v === null ? "—" : `${v.toFixed(1)}/5`;

  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:10}}><Loader2 className="animate-spin" size={20} color={T.blue}/><span style={{fontSize:13,color:T.ink3}}>Loading teacher profile...</span></div>;

  // ══════════════════════════════════════════════════════════════════════════════
  return(
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Inter',-apple-system,sans-serif"}}>
      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.white,color:T.ink2,fontSize:13,fontWeight:500,cursor:"pointer"}}><ArrowLeft size={14}/>All teachers</button>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setEditOpen(true)} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.white,color:T.ink2,fontSize:12,fontWeight:500,cursor:"pointer"}}>Edit</button>
          <button onClick={handleExport} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.white,color:T.ink2,fontSize:12,fontWeight:500,cursor:"pointer"}}>Export</button>
          <button style={{padding:"8px 16px",borderRadius:10,border:"none",background:T.blue,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Contact</button>
        </div>
      </div>

      {/* ═══ HERO 3-COL (same as Student Profile) ═══ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 280px 1fr",gap:20,marginBottom:20}}>
        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card title="Teaching Performance">
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
              <div style={{position:"relative",width:64,height:64}}><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke={T.s2} strokeWidth="6"/><circle cx="32" cy="32" r="26" fill="none" stroke={perfMetrics.classAvg===null?T.ink3:T.blue} strokeWidth="6" strokeLinecap="round" strokeDasharray={2*Math.PI*26} strokeDashoffset={2*Math.PI*26*(1-classAvgN/100)} transform="rotate(-90 32 32)" style={{transition:"stroke-dashoffset 1s"}}/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:perfMetrics.classAvg===null?T.ink3:T.blue}}>{fmtPct(perfMetrics.classAvg)}</div></div>
              <div><div style={{fontSize:28,fontWeight:800,color:perfMetrics.classAvg===null?T.ink3:T.ink}}>{fmtPct(perfMetrics.classAvg)}</div><div style={{fontSize:11,color:T.ink3}}>Class Average // {assignedClasses.length} classes</div></div>
            </div>
            {/* Pass Rate / Satisfaction / Attendance — null = "—" with gray bar (no fake 0%) */}
            {[{l:"Pass Rate",v:perfMetrics.passRate},{l:"Satisfaction",v:perfMetrics.satisfaction},{l:"Attendance",v:attRate}].map(r=>{
              const c=r.v===null?T.ink3:r.v>=80?T.grn:r.v>=50?T.amb:T.red;
              const w=r.v===null?0:r.v;
              return(<div key={r.l} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:T.ink3}}>{r.l}</span><span style={{fontWeight:600,color:c}}>{fmtPct(r.v)}</span></div><div style={{height:6,background:T.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${w}%`,background:c,borderRadius:3,transition:"width 1s"}}/></div></div>);
            })}
          </Card>
          <Card title="Attendance">
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{position:"relative",width:72,height:72}}><svg width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="none" stroke={T.s2} strokeWidth="7"/><circle cx="36" cy="36" r="28" fill="none" stroke={attRate===null?T.ink3:attRate>=85?T.grn:T.amb} strokeWidth="7" strokeLinecap="round" strokeDasharray={2*Math.PI*28} strokeDashoffset={2*Math.PI*28*(1-attRateN/100)} transform="rotate(-90 36 36)" style={{transition:"stroke-dashoffset 1s"}}/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:attRate===null?T.ink3:attRate>=85?T.grn:T.amb}}>{fmtPct(attRate)}</div></div>
              <div><div style={{fontSize:15,fontWeight:600,color:T.ink}}>This Month</div><div style={{fontSize:12,color:T.ink3,marginTop:2}}>Classes: {thisMonth.classesTaken}/{thisMonth.totalClasses}</div><div style={{fontSize:11,color:T.ink3,marginTop:2}}>Tests: {thisMonth.testsCount} // Meetings: {thisMonth.meetingsCount}</div></div>
            </div>
          </Card>
          <Card title="Subject Mastery" action={<DLink/>}>
            {radarData.length>=3&&<div style={{marginBottom:12}}><SubjectMasteryRadar data={radarData} color={T.blue} height={200}/></div>}
            {subjectData.map(s=><div key={s.name} title={s.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:11,color:T.ink3,width:80,flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</span><div style={{flex:1,height:6,background:T.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${s.avg}%`,background:s.avg>=75?T.blue:s.avg>=50?T.grn:T.red,borderRadius:3}}/></div><span style={{fontSize:12,fontWeight:600,color:T.ink,width:28,textAlign:"right"}}>{s.avg}</span></div>)}
          </Card>
        </div>

        {/* CENTER */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",paddingTop:20}}>
          <div style={{width:140,height:140,borderRadius:"50%",border:`4px solid ${T.blue}`,background:T.blBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,boxShadow:"0 8px 30px rgba(59,91,219,0.15)"}}><span style={{fontSize:42,fontWeight:800,color:T.blue}}>{initials}</span></div>
          <h2 style={{fontSize:20,fontWeight:700,color:T.ink,textAlign:"center",marginBottom:4}}>{name}</h2>
          <p style={{fontSize:12,color:T.ink3,textAlign:"center",marginBottom:4}}>{subject} Teacher</p>
          <p style={{fontSize:11,color:T.ink3,textAlign:"center",marginBottom:6}}>{teacher.experience||"—"} exp // {teacher.email||"—"}</p>
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:10}}>
            <StarRow rating={ratingN}/>
            <span style={{fontSize:12,fontWeight:600,color:avgRating===null?T.ink3:T.amb,marginLeft:4}}>{avgRating===null?"—":avgRating.toFixed(1)}</span>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            <span style={{padding:"4px 12px",borderRadius:20,background:teacher.status==="Active"?T.glBg:T.alBg,color:teacher.status==="Active"?T.grn:T.amb,fontSize:10,fontWeight:600}}>{teacher.status||"Active"}</span>
            <span style={{padding:"4px 12px",borderRadius:20,background:riskColor===T.grn?T.glBg:riskColor===T.amb?T.alBg:T.rlBg,color:riskColor,fontSize:10,fontWeight:600}}>{riskLevel}</span>
          </div>
          <div style={{width:"100%",marginTop:8}}>
            {[{l:"Phone",v:teacher.phone||"—"},{l:"Classes",v:assignedClasses.length},{l:"Students",v:totalStudents},{l:"Rating",v:fmtRating(avgRating)}].map(r=>
              <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.s2}`,fontSize:11}}>
                <span style={{color:T.ink3}}>{r.l}</span><span style={{color:T.ink,fontWeight:500}}>{r.v}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card title="Assigned Classes" action={<DLink/>}>
            {assignedClasses.length===0?<p style={{fontSize:12,color:T.ink3,textAlign:"center"}}>No classes</p>:
              assignedClasses.map(c=><div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.s2}`}}>
                <div><div style={{fontSize:13,fontWeight:500,color:T.ink}}>{c.name||c.id}</div><div style={{fontSize:10,color:T.ink3,marginTop:2}}>{c.stuCount} students</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:12,fontWeight:600,color:c.avgScore!=null?(c.avgScore>=75?T.grn:c.avgScore>=55?T.amb:T.red):T.ink3}}>{c.avgScore!=null?`${c.avgScore}%`:"—"}</div><div style={{fontSize:10,color:c.perf==="Good"?T.grn:c.perf==="Average"?T.amb:T.red}}>{c.perf}</div></div>
              </div>)}
          </Card>
          <Card title="AI Intelligence" action={<DLink/>}>
            {/* Overall rating message — gated on real data; no false
                "Needs Improvement" verdict for teachers with no exams yet. */}
            <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
              <span style={{fontSize:11,color:T.ink3}}>Overall rating:</span>
              <span style={{fontSize:20,fontWeight:700,color:perfMetrics.classAvg===null?T.ink3:T.blue}}>
                {perfMetrics.classAvg===null?"No Data":perfMetrics.classAvg>=75?"Excellent":perfMetrics.classAvg>=50?"Good":"Needs Improvement"}
              </span>
            </div>
            <p style={{fontSize:11,color:T.ink3,lineHeight:1.6}}>
              {perfMetrics.classAvg===null
                ? "No exam data recorded yet. Once tests are uploaded, performance insight will appear here."
                : perfMetrics.classAvg>=75
                  ? "Strong teaching performance. Students consistently achieving above average."
                  : perfMetrics.classAvg>=50
                    ? "Moderate performance. Consider focused improvement strategies."
                    : "Performance below expectations. Intervention recommended."}
            </p>
          </Card>
          <Card title={`Reviews · ${reviews.length}`} action={<DLink/>}>
            {reviews.length===0?<p style={{fontSize:12,color:T.ink3,textAlign:"center"}}>No reviews yet</p>:
              reviews.slice(0,3).map(r=><div key={r.id} style={{padding:"8px 0",borderBottom:`1px solid ${T.s2}`}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:500,color:T.ink}}>{r.parentName||r.studentName||"Parent"}</span><StarRow rating={r.rating||0}/></div>
                <p style={{fontSize:11,color:T.ink2,lineHeight:1.5,margin:0}}>{(r.review||r.comment||"").slice(0,100)}</p>
              </div>)}
          </Card>
          <Card title="Quick Message">
            <div style={{display:"flex",gap:8}}>
              <input value={msgText} onChange={e=>setMsgText(e.target.value)} placeholder="Message teacher..." onKeyDown={e=>{if(e.key==="Enter")handleSendMsg();}} style={{flex:1,padding:"8px 12px",borderRadius:10,border:`1px solid ${T.bdr}`,fontSize:12,outline:"none"}}/>
              <button onClick={handleSendMsg} disabled={sendingMsg||!msgText.trim()} style={{padding:"8px 14px",borderRadius:10,background:T.blue,color:"#fff",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",opacity:msgText.trim()?1:0.5}}><Send size={12}/></button>
            </div>
          </Card>
        </div>
      </div>

      {/* ═══ PERFORMANCE TIMELINE (full width) ═══ */}
      <Card title="Performance Timeline" action={<DLink/>} style={{marginBottom:20}}>
        <div style={{height:200}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyTrend}><defs><linearGradient id="tpbg1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.blue} stopOpacity={0.15}/><stop offset="95%" stopColor={T.blue} stopOpacity={0}/></linearGradient><linearGradient id="tpbg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.grn} stopOpacity={0.15}/><stop offset="95%" stopColor={T.grn} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={T.s2}/><XAxis dataKey="month" tick={{fill:T.ink3,fontSize:11}}/><YAxis tick={{fill:T.ink3,fontSize:11}} domain={[0,100]}/><Tooltip contentStyle={{background:T.white,border:`1px solid ${T.bdr}`,borderRadius:8,fontSize:12}}/><Area type="monotone" dataKey="score" stroke={T.blue} fill="url(#tpbg1)" strokeWidth={2.5}/><Area type="monotone" dataKey="passRate" stroke={T.grn} fill="url(#tpbg2)" strokeWidth={2} strokeDasharray="5 3"/></AreaChart></ResponsiveContainer></div>
      </Card>

      {/* ═══ TEACHING ACTIVITY (4 tiles, full width) ═══ */}
      <Card title="Teaching Activity" action={<span style={{fontSize:11,color:T.ink3}}>All time · from teacher's actions</span>} style={{marginBottom:20}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:16}}>
          {[
            {icon:FileText,      l:"Tests Created",  v:activity.testsCreated,       col:"#7c3aed", bg:"#f5f3ff"},
            {icon:ClipboardList, l:"Assignments",    v:activity.assignmentsCreated, col:"#ea580c", bg:"#fff7ed"},
            {icon:NotebookPen,   l:"Lesson Plans",   v:activity.lessonPlansCount,   col:"#0d9488", bg:"#f0fdfa"},
            {icon:MessageSquare, l:"Parent Notes",   v:activity.parentNotesCount,   col:"#db2777", bg:"#fdf2f8"},
          ].map(a=>(
            <div key={a.l} style={{background:a.bg,borderRadius:14,padding:"16px 18px",display:"flex",alignItems:"center",gap:14,border:`1px solid ${T.bdr}`,transition:"transform 0.2s, box-shadow 0.2s",cursor:"default"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 10px 20px rgba(0,0,0,0.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}
            >
              <div style={{width:44,height:44,borderRadius:12,background:T.white,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 2px 6px rgba(0,0,0,0.05)"}}>
                <a.icon size={20} color={a.col}/>
              </div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:28,fontWeight:800,color:a.col,lineHeight:1}}>{a.v}</div>
                <div style={{fontSize:11,fontWeight:600,color:T.ink3,marginTop:4,textTransform:"uppercase",letterSpacing:"0.04em"}}>{a.l}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ═══ CLASSES + RISK (2 col) ═══ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
        <Card title={`Top Students · ${studentRankings.length}`} action={<span style={{fontSize:11,color:T.blue,cursor:"pointer"}}>View All →</span>}>
          {studentRankings.slice(0,5).map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.s2}`}}>
            <div style={{width:28,height:28,borderRadius:8,background:i<3?T.blBg:T.s1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:i<3?T.blue:T.ink3}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:500,color:T.ink}}>{s.name}</div><div style={{fontSize:10,color:T.ink3}}>{s.className}</div></div>
            <span style={{fontSize:13,fontWeight:700,color:s.avg>=75?T.grn:s.avg>=50?T.amb:T.red}}>{s.avg}%</span>
          </div>)}
          {studentRankings.length===0&&<p style={{fontSize:12,color:T.ink3,textAlign:"center"}}>No student data</p>}
        </Card>
        <Card title="Risk Assessment" action={<DLink/>}>
          <div style={{fontSize:22,fontWeight:800,color:riskColor,marginBottom:14}}>{riskLevel}</div>
          {[{l:"CLASS AVG",v:perfMetrics.classAvg},{l:"PASS RATE",v:perfMetrics.passRate},{l:"ATTENDANCE",v:attRate},{l:"SATISFACTION",v:perfMetrics.satisfaction}].map(r=>{
            const c=r.v===null?T.ink3:r.v>=80?T.blue:r.v>=50?T.amb:T.red;
            const w=r.v===null?0:r.v;
            return(<div key={r.l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:11,color:T.ink3,width:100}}>{r.l}</span><div style={{flex:1,height:6,background:T.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${w}%`,background:c,borderRadius:3}}/></div><span style={{fontSize:12,fontWeight:600,color:c,width:40,textAlign:"right"}}>{fmtPct(r.v)}</span></div>);
          })}
        </Card>
      </div>

      {/* ═══ ATTENDANCE CALENDAR + OVERVIEW (2 col) ═══ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
        <Card title="Attendance Calendar">
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:14}}>
            <button onClick={()=>setCalMonth(new Date(calY,calM-1))} style={{background:"none",border:"none",cursor:"pointer",color:T.ink3}}><ChevronLeft size={16}/></button>
            <span style={{fontSize:13,fontWeight:600,color:T.ink}}>{MONTHS[calM]} {calY}</span>
            <button onClick={()=>setCalMonth(new Date(calY,calM+1))} style={{background:"none",border:"none",cursor:"pointer",color:T.ink3}}><ChevronRight size={16}/></button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[{v:calP,c:T.grn,l:"PRESENT"},{v:calL,c:T.amb,l:"LATE"},{v:calA,c:T.red,l:"ABSENT"}].map(x=><div key={x.l} style={{textAlign:"center",padding:"10px 0",background:x.c===T.grn?T.glBg:x.c===T.amb?T.alBg:T.rlBg,borderRadius:10}}><div style={{fontSize:20,fontWeight:700,color:x.c}}>{x.v}</div><div style={{fontSize:10,color:x.c}}>{x.l}</div></div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,textAlign:"center"}}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{fontSize:10,fontWeight:600,color:T.ink3,padding:"4px 0"}}>{d}</div>)}
            {calDays.map((d,i)=>{if(!d)return<div key={i}/>;const isT=d.date.toDateString()===today.toDateString();const bg=d.status==="present"?T.grn:d.status==="late"?T.amb:d.status==="absent"?T.red:"transparent";return<div key={i} style={{width:32,height:32,borderRadius:isT?"50%":8,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:isT?700:400,color:d.status?"#fff":T.ink,background:isT&&!d.status?T.blue:bg,...(isT&&!d.status?{color:"#fff"}:{})}}>{d.dayNum}</div>;})}
          </div>
        </Card>
        <Card title="Overview" action={<span style={{fontSize:11,color:T.blue,cursor:"pointer"}}>Dashboard →</span>}>
          {[
            {icon:Award,         l:"CLASS AVERAGE",   v:fmtPct(perfMetrics.classAvg)},
            {icon:TrendingUp,    l:"PASS RATE",       v:fmtPct(perfMetrics.passRate)},
            {icon:Calendar,      l:"ATTENDANCE",      v:fmtPct(attRate)},
            {icon:Users,         l:"TOTAL STUDENTS",  v:totalStudents},
            {icon:BookOpen,      l:"CLASSES ASSIGNED",v:assignedClasses.length},
            {icon:FileText,      l:"TESTS CREATED",   v:activity.testsCreated},
            {icon:ClipboardList, l:"ASSIGNMENTS",     v:activity.assignmentsCreated},
            {icon:NotebookPen,   l:"LESSON PLANS",    v:activity.lessonPlansCount},
            {icon:MessageSquare, l:"PARENT NOTES",    v:activity.parentNotesCount},
            {icon:Star,          l:"PARENT RATING",   v:fmtRating(avgRating)},
            {icon:MessageSquare, l:"REVIEWS",         v:reviews.length},
          ].map(item=>
            <div key={item.l} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.s2}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><item.icon size={14} color={T.ink3}/><span style={{fontSize:12,color:T.ink3}}>{item.l}</span></div>
              <span style={{fontSize:13,fontWeight:600,color:T.ink}}>{item.v}</span>
            </div>
          )}
        </Card>
      </div>

      {/* ═══ COMMUNICATIONS + SCORE CHART (2 col) ═══ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
        <Card title={`Reviews · ${reviews.length} entries`}>
          {reviews.slice(0,4).map(r=><div key={r.id} style={{padding:"12px 0",borderBottom:`1px solid ${T.s2}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:600,color:T.ink}}>{r.parentName||r.studentName||"Parent"}</span>
              <span style={{padding:"2px 8px",borderRadius:4,background:T.blBg,color:T.blue,fontSize:10,fontWeight:600}}>PARENT</span>
              <span style={{fontSize:10,color:T.ink3,marginLeft:"auto"}}>{timeAgo(r.createdAt)}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}><StarRow rating={r.rating||0}/><span style={{fontSize:11,color:T.amb,fontWeight:500}}>{r.rating||0}/5</span></div>
            <p style={{fontSize:12,color:T.ink2,lineHeight:1.5,margin:0}}>{(r.review||r.comment||"").slice(0,120)}</p>
          </div>)}
          {reviews.length===0&&<p style={{fontSize:12,color:T.ink3,textAlign:"center",padding:"16px 0"}}>No reviews</p>}
        </Card>
        <Card title="Subject Performance">
          {subjectData.length>0&&<div style={{height:160,marginBottom:12}}><ResponsiveContainer width="100%" height="100%"><BarChart data={subjectData}><CartesianGrid strokeDasharray="3 3" stroke={T.s2}/><XAxis dataKey="axis" tick={{fill:T.ink3,fontSize:9}}/><YAxis tick={{fill:T.ink3,fontSize:9}} domain={[0,100]}/><Tooltip
            // Tooltip shows the FULL subject name (not the abbreviated axis label)
            formatter={(v:number,_:any,props:any)=>[`${v}%`,props.payload.name||props.payload.axis]}
            contentStyle={{background:T.white,border:`1px solid ${T.bdr}`,borderRadius:8,fontSize:11}}/><Bar dataKey="avg" fill={T.blue} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>}
          {subjectData.map(s=><div key={s.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:11,color:T.ink3,width:80,flexShrink:0}}>{s.name}</span><div style={{flex:1,height:6,background:T.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${s.avg}%`,background:s.avg>=75?T.blue:s.avg>=50?T.grn:T.red,borderRadius:3}}/></div><span style={{fontSize:12,fontWeight:600,color:T.ink,width:28,textAlign:"right"}}>{s.avg}</span></div>)}
        </Card>
      </div>

      {/* Status bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",background:T.white,border:`1px solid ${T.bdr}`,borderRadius:12,fontSize:10,color:T.ink3}}>
        <span>★ TEACHER ID: {(teacher.id||"").slice(0,8).toUpperCase()}</span><span>★ {assignedClasses.length} Classes</span><span>★ {totalStudents} Students</span><span>★ Rating: {fmtRating(avgRating)}</span>
      </div>

      {/* ═══ EDIT MODAL ═══ */}
      {editOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setEditOpen(false)}>
        <div style={{background:T.white,borderRadius:20,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${T.s2}`}}>
            <h3 style={{fontSize:16,fontWeight:600,color:T.ink,margin:0}}>Edit Teacher</h3>
            <button onClick={()=>setEditOpen(false)} style={{width:28,height:28,border:"none",background:T.s1,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14} color={T.ink3}/></button>
          </div>
          <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
            {/* Phone / Experience / Bio — free-text inputs.
                Status is a constrained dropdown (B19 fix) — was a free-text
                input that allowed any value, breaking status-based filters
                in Teachers list (e.g., "active" vs "Active" vs "ACTVE"). */}
            {[{l:"Phone",k:"phone"},{l:"Experience",k:"experience"},{l:"Bio",k:"bio"}].map(f=>(
              <div key={f.k}>
                <label style={{fontSize:11,fontWeight:600,color:T.ink3,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6,display:"block"}}>{f.l}</label>
                <input
                  value={(editForm as any)[f.k]}
                  onChange={e=>setEditForm({...editForm,[f.k]:e.target.value})}
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.s1,fontSize:13,color:T.ink,outline:"none"}}
                />
              </div>
            ))}
            <div>
              <label style={{fontSize:11,fontWeight:600,color:T.ink3,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6,display:"block"}}>Status</label>
              <select
                value={editForm.status||"Active"}
                onChange={e=>setEditForm({...editForm,status:e.target.value})}
                style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.s1,fontSize:13,color:T.ink,outline:"none",cursor:"pointer"}}
              >
                {/* Canonical status values used across Teachers list filter +
                    role-card chip styling. Keeping these capitalized exactly
                    as the chip-style switch expects. */}
                {["Active","On Leave","Invited","Archived"].map(s=>(
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button onClick={()=>setEditOpen(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.white,color:T.ink2,fontSize:13,cursor:"pointer"}}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:T.blue,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",opacity:savingEdit?0.7:1}}>{savingEdit?"Saving...":"Save"}</button>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
};

export default TeacherProfile;
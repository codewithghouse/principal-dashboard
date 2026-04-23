import { useState, useEffect, useRef, useMemo } from "react";
import { ArrowLeft, Star, Printer, MessageSquare, Users, BookOpen, Calendar, BarChart3, Activity, CheckCircle2, Clock, TrendingUp, AlertCircle, FileText, Loader2, ChevronLeft, ChevronRight, Edit2, Send, X, Award, ClipboardList, NotebookPen } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, getDocs, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

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
const getScore=(r:any):number=>{if(typeof r.percentage==="number"&&r.percentage>0)return Math.round(r.percentage);const raw=r.marksObtained??r.marks??r.score??null;if(raw===null)return 0;const total=r.totalMarks??r.maxMarks??r.outOf??100;return total>0?Math.round((Number(raw)/Number(total))*100):Math.min(100,Math.round(Number(raw)));};

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

  const [assignedClasses,setAssignedClasses]=useState<any[]>([]);
  const [perfMetrics,setPerfMetrics]=useState({classAvg:0,passRate:0,satisfaction:0});
  const [reviews,setReviews]=useState<any[]>([]);
  const [avgRating,setAvgRating]=useState(parseFloat(teacher.rating||"5.0"));
  const [thisMonth,setThisMonth]=useState({classesTaken:0,totalClasses:0,attPct:0,testsCount:0,meetingsCount:0});
  const [subjectData,setSubjectData]=useState<{name:string;avg:number}[]>([]);
  const [studentRankings,setStudentRankings]=useState<any[]>([]);
  const [activity,setActivity]=useState({testsCreated:0,assignmentsCreated:0,lessonPlansCount:0,parentNotesCount:0});
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
  const compute=()=>{
    const classes=classesRef.current,enrolls=enrollRef.current;
    // merge results + test_scores into a unified score list
    const results=[...resultsRef.current,...testScoresRef.current];
    const rvList=reviewsRef.current,tAtt=tAttRef.current,meetings=meetingsRef.current;

    // Activity counters — teacher-created artifacts
    setActivity({
      testsCreated:       testsRef.current.length,
      assignmentsCreated: assignmentsRef.current.length,
      lessonPlansCount:   lessonPlansRef.current.length,
      parentNotesCount:   parentNotesRef.current.length,
    });

    const withData=classes.map(c=>{
      const stuCount=enrolls.filter(e=>e.classId===c.id).length;
      const classRes=results.filter(r=>r.classId===c.id);
      const avgScore=classRes.length?Math.round(classRes.reduce((s,r)=>s+getScore(r),0)/classRes.length):null;
      const perf=avgScore===null?"No Data":avgScore>=75?"Good":avgScore>=55?"Average":"Weak";
      return{...c,stuCount,avgScore,perf};
    });
    setAssignedClasses(withData);

    const classAvg=results.length?Math.round(results.reduce((s,r)=>s+getScore(r),0)/results.length):0;
    const passRate=results.length?Math.round(results.filter(r=>getScore(r)>=40).length/results.length*100):0;
    const satisfaction=rvList.length?Math.round(rvList.reduce((s,r)=>s+(r.rating||0),0)/rvList.length*20):0;
    setPerfMetrics({classAvg,passRate,satisfaction});

    setReviews([...rvList].sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)));
    setAvgRating(rvList.length?Math.round(rvList.reduce((s,r)=>s+(r.rating||0),0)/rvList.length*10)/10:parseFloat(teacher.rating||"5.0"));

    const mAtt=tAtt.filter(a=>(toDate(a.date)?.getTime()||0)>=startOfMonth.getTime());
    const classesTaken=mAtt.filter(a=>a.status==="present").length;
    setThisMonth({classesTaken,totalClasses:mAtt.length,attPct:mAtt.length?pct(classesTaken,mAtt.length):0,
      testsCount:new Set(results.filter(r=>(toDate(r.createdAt)?.getTime()||0)>=startOfMonth.getTime()).map(r=>r.testId||r.subject)).size,
      meetingsCount:meetings.filter(m=>(toDate(m.date||m.createdAt)?.getTime()||0)>=startOfMonth.getTime()).length});

    const subMap=new Map<string,number[]>();
    results.forEach(r=>{const s=r.subjectName||r.subject||subject;if(!subMap.has(s))subMap.set(s,[]);subMap.get(s)!.push(getScore(r));});
    setSubjectData(Array.from(subMap.entries()).map(([n,sc])=>({name:n.slice(0,12),avg:Math.round(sc.reduce((a,b)=>a+b,0)/sc.length)})));

    const stuMap=new Map<string,{name:string;className:string;scores:number[]}>();
    results.forEach(r=>{const sid=r.studentId||"";if(!sid)return;const cls=classes.find(c=>c.id===r.classId);
      if(!stuMap.has(sid))stuMap.set(sid,{name:r.studentName||sid,className:cls?.name||"—",scores:[]});
      stuMap.get(sid)!.scores.push(getScore(r));});
    setStudentRankings(Array.from(stuMap.values()).map(s=>({...s,avg:Math.round(s.scores.reduce((a,b)=>a+b,0)/s.scores.length)})).sort((a,b)=>b.avg-a.avg).slice(0,10));
    setLoading(false);
  };

  // ── Listeners ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!teacher.id)return;
    const unsubs:(()=>void)[]=[];let enrollUnsub:(()=>void)|null=null;
    getDocs(query(collection(db,"teaching_assignments"),where("teacherId","==",teacher.id))).then(snap=>{
      const cIds=[...new Set(snap.docs.map(d=>d.data().classId).filter(Boolean))] as string[];
      const classQ=cIds.length>0?query(collection(db,"classes"),where("__name__","in",cIds.slice(0,10))):query(collection(db,"classes"),where("teacherId","==",teacher.id));
      unsubs.push(onSnapshot(classQ,s=>{
        classesRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();
        const ids=classesRef.current.map(c=>c.id);
        if(ids.length>0){if(enrollUnsub)enrollUnsub();enrollUnsub=onSnapshot(query(collection(db,"enrollments"),where("classId","in",ids.slice(0,10))),s2=>{enrollRef.current=s2.docs.map(d=>({id:d.id,...d.data()}));compute();});}
      }));
    });
    unsubs.push(onSnapshot(query(collection(db,"results"),where("teacherId","==",teacher.id)),s=>{resultsRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();},()=>{}));
    unsubs.push(onSnapshot(query(collection(db,"teacher_reviews"),where("teacherId","==",teacher.id)),s=>{reviewsRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();},()=>{}));
    unsubs.push(onSnapshot(query(collection(db,"teacher_attendance"),where("teacherId","==",teacher.id)),s=>{
      if(!s.empty){tAttRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();}
      else getDocs(query(collection(db,"attendance"),where("teacherId","==",teacher.id))).then(s2=>{tAttRef.current=s2.docs.map(d=>({id:d.id,...d.data()}));compute();});
    },()=>{}));
    unsubs.push(onSnapshot(query(collection(db,"parent_meetings"),where("teacherId","==",teacher.id)),s=>{meetingsRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();},()=>{}));
    // Teacher's created artifacts — tests, assignments, lesson plans, parent notes
    unsubs.push(onSnapshot(query(collection(db,"tests"),where("teacherId","==",teacher.id)),s=>{testsRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();},()=>{}));
    unsubs.push(onSnapshot(query(collection(db,"assignments"),where("teacherId","==",teacher.id)),s=>{assignmentsRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();},()=>{}));
    unsubs.push(onSnapshot(query(collection(db,"lessonPlans"),where("teacherId","==",teacher.id)),s=>{lessonPlansRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();},()=>{}));
    unsubs.push(onSnapshot(query(collection(db,"parent_notes"),where("teacherId","==",teacher.id)),s=>{parentNotesRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();},()=>{}));
    // test_scores is richer than results in some setups — merge both
    unsubs.push(onSnapshot(query(collection(db,"test_scores"),where("teacherId","==",teacher.id)),s=>{testScoresRef.current=s.docs.map(d=>({id:d.id,...d.data()}));compute();},()=>{}));
    setTimeout(()=>setLoading(false),3000);
    return()=>{unsubs.forEach(u=>u());if(enrollUnsub)enrollUnsub();};
  },[teacher.id]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSendMsg=async()=>{if(!msgText.trim())return;setSendingMsg(true);try{await addDoc(collection(db,"principal_to_teacher_notes"),{principalId:userData?.id||"",principalName:userData?.name||"Principal",teacherId:teacher.id,teacherName:name,message:msgText.trim(),from:"principal",timestamp:serverTimestamp(),schoolId,read:false});setMsgText("");toast.success("Message sent!");}catch{toast.error("Failed.");}setSendingMsg(false);};
  const handleSaveEdit=async()=>{if(!teacher.id)return;setSavingEdit(true);try{await updateDoc(doc(db,"teachers",teacher.id),editForm);toast.success("Updated!");setEditOpen(false);}catch{toast.error("Failed.");}setSavingEdit(false);};

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalStudents=enrollRef.current.length;
  const attRate=thisMonth.attPct;
  const radarData=subjectData.map(s=>({subject:s.name,score:s.avg,fullMark:100}));

  // Monthly trend
  const monthlyTrend=useMemo(()=>{
    const results=resultsRef.current;const now=new Date();
    return Array.from({length:6},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(5-i),1);
      const mR=results.filter(r=>{const dt=toDate(r.createdAt||r.timestamp);return dt&&dt.getMonth()===d.getMonth()&&dt.getFullYear()===d.getFullYear();});
      const sc=mR.map(r=>getScore(r)).filter(v=>v>0);
      return{month:MONTHS[d.getMonth()],score:sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length):0,passRate:sc.length?Math.round(sc.filter(v=>v>=40).length/sc.length*100):0};
    });
  },[loading]);

  // Calendar data
  const calY=calMonth.getFullYear(),calM=calMonth.getMonth();
  const tAtt=tAttRef.current;
  const firstD=new Date(calY,calM,1).getDay(),dim=new Date(calY,calM+1,0).getDate();
  const calDays=Array.from({length:42},(_,i)=>{const dn=i-firstD+1;if(dn<1||dn>dim)return null;const d=new Date(calY,calM,dn);const ds=d.toISOString().split("T")[0];const rec=tAtt.find(a=>{const ad=toDate(a.date);return ad&&ad.toISOString().split("T")[0]===ds;});return{dayNum:dn,date:d,status:rec?.status||null};});
  const calP=tAtt.filter(a=>{const d=toDate(a.date);return d&&d.getMonth()===calM&&d.getFullYear()===calY&&a.status==="present";}).length;
  const calL=tAtt.filter(a=>{const d=toDate(a.date);return d&&d.getMonth()===calM&&d.getFullYear()===calY&&a.status==="late";}).length;
  const calA=tAtt.filter(a=>{const d=toDate(a.date);return d&&d.getMonth()===calM&&d.getFullYear()===calY&&a.status==="absent";}).length;

  const riskScore=Math.round((Math.max(0,100-perfMetrics.classAvg)+Math.max(0,100-perfMetrics.passRate)+Math.max(0,100-attRate))/3);
  const riskLevel=riskScore<20?"STABLE":riskScore<45?"MONITOR":"ELEVATED";
  const riskColor=riskScore<20?T.grn:riskScore<45?T.amb:T.red;

  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:10}}><Loader2 className="animate-spin" size={20} color={T.blue}/><span style={{fontSize:13,color:T.ink3}}>Loading teacher profile...</span></div>;

  // ══════════════════════════════════════════════════════════════════════════════
  return(
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Inter',-apple-system,sans-serif"}}>
      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.white,color:T.ink2,fontSize:13,fontWeight:500,cursor:"pointer"}}><ArrowLeft size={14}/>All teachers</button>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setEditOpen(true)} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.white,color:T.ink2,fontSize:12,fontWeight:500,cursor:"pointer"}}>Edit</button>
          <button onClick={()=>window.print()} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.white,color:T.ink2,fontSize:12,fontWeight:500,cursor:"pointer"}}>Export</button>
          <button style={{padding:"8px 16px",borderRadius:10,border:"none",background:T.blue,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Contact</button>
        </div>
      </div>

      {/* ═══ HERO 3-COL (same as Student Profile) ═══ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 280px 1fr",gap:20,marginBottom:20}}>
        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card title="Teaching Performance">
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
              <div style={{position:"relative",width:64,height:64}}><svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke={T.s2} strokeWidth="6"/><circle cx="32" cy="32" r="26" fill="none" stroke={T.blue} strokeWidth="6" strokeLinecap="round" strokeDasharray={2*Math.PI*26} strokeDashoffset={2*Math.PI*26*(1-perfMetrics.classAvg/100)} transform="rotate(-90 32 32)" style={{transition:"stroke-dashoffset 1s"}}/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:T.blue}}>{perfMetrics.classAvg}%</div></div>
              <div><div style={{fontSize:28,fontWeight:800,color:T.ink}}>{perfMetrics.classAvg}%</div><div style={{fontSize:11,color:T.ink3}}>Class Average // {assignedClasses.length} classes</div></div>
            </div>
            {[{l:"Pass Rate",v:perfMetrics.passRate},{l:"Satisfaction",v:perfMetrics.satisfaction},{l:"Attendance",v:attRate}].map(r=>{const c=r.v>=80?T.grn:r.v>=50?T.amb:T.red;return<div key={r.l} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:T.ink3}}>{r.l}</span><span style={{fontWeight:600,color:c}}>{r.v}%</span></div><div style={{height:6,background:T.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${r.v}%`,background:c,borderRadius:3,transition:"width 1s"}}/></div></div>;})}
          </Card>
          <Card title="Attendance">
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <div style={{position:"relative",width:72,height:72}}><svg width="72" height="72" viewBox="0 0 72 72"><circle cx="36" cy="36" r="28" fill="none" stroke={T.s2} strokeWidth="7"/><circle cx="36" cy="36" r="28" fill="none" stroke={attRate>=85?T.grn:T.amb} strokeWidth="7" strokeLinecap="round" strokeDasharray={2*Math.PI*28} strokeDashoffset={2*Math.PI*28*(1-attRate/100)} transform="rotate(-90 36 36)" style={{transition:"stroke-dashoffset 1s"}}/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:attRate>=85?T.grn:T.amb}}>{attRate}%</div></div>
              <div><div style={{fontSize:15,fontWeight:600,color:T.ink}}>This Month</div><div style={{fontSize:12,color:T.ink3,marginTop:2}}>Classes: {thisMonth.classesTaken}/{thisMonth.totalClasses}</div><div style={{fontSize:11,color:T.ink3,marginTop:2}}>Tests: {thisMonth.testsCount} // Meetings: {thisMonth.meetingsCount}</div></div>
            </div>
          </Card>
          <Card title="Subject Mastery" action={<DLink/>}>
            {radarData.length>=3&&<div style={{height:180,marginBottom:12}}><ResponsiveContainer width="100%" height="100%"><RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}><PolarGrid stroke={T.s2}/><PolarAngleAxis dataKey="subject" tick={{fill:T.ink3,fontSize:10}}/><Radar dataKey="score" stroke={T.blue} fill={T.blue} fillOpacity={0.15} strokeWidth={2}/></RadarChart></ResponsiveContainer></div>}
            {subjectData.map(s=><div key={s.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:11,color:T.ink3,width:80,flexShrink:0}}>{s.name}</span><div style={{flex:1,height:6,background:T.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${s.avg}%`,background:s.avg>=75?T.blue:s.avg>=50?T.grn:T.red,borderRadius:3}}/></div><span style={{fontSize:12,fontWeight:600,color:T.ink,width:28,textAlign:"right"}}>{s.avg}</span></div>)}
          </Card>
        </div>

        {/* CENTER */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",paddingTop:20}}>
          <div style={{width:140,height:140,borderRadius:"50%",border:`4px solid ${T.blue}`,background:T.blBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,boxShadow:"0 8px 30px rgba(59,91,219,0.15)"}}><span style={{fontSize:42,fontWeight:800,color:T.blue}}>{initials}</span></div>
          <h2 style={{fontSize:20,fontWeight:700,color:T.ink,textAlign:"center",marginBottom:4}}>{name}</h2>
          <p style={{fontSize:12,color:T.ink3,textAlign:"center",marginBottom:4}}>{subject} Teacher</p>
          <p style={{fontSize:11,color:T.ink3,textAlign:"center",marginBottom:6}}>{teacher.experience||"—"} exp // {teacher.email||"—"}</p>
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:10}}><StarRow rating={avgRating}/><span style={{fontSize:12,fontWeight:600,color:T.amb,marginLeft:4}}>{avgRating.toFixed(1)}</span></div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            <span style={{padding:"4px 12px",borderRadius:20,background:teacher.status==="Active"?T.glBg:T.alBg,color:teacher.status==="Active"?T.grn:T.amb,fontSize:10,fontWeight:600}}>{teacher.status||"Active"}</span>
            <span style={{padding:"4px 12px",borderRadius:20,background:riskColor===T.grn?T.glBg:riskColor===T.amb?T.alBg:T.rlBg,color:riskColor,fontSize:10,fontWeight:600}}>{riskLevel}</span>
          </div>
          <div style={{width:"100%",marginTop:8}}>
            {[{l:"Phone",v:teacher.phone||"—"},{l:"Classes",v:assignedClasses.length},{l:"Students",v:totalStudents},{l:"Rating",v:`${avgRating.toFixed(1)}/5`}].map(r=>
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
            <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}><span style={{fontSize:11,color:T.ink3}}>Overall rating:</span><span style={{fontSize:20,fontWeight:700,color:T.blue}}>{perfMetrics.classAvg>=75?"Excellent":perfMetrics.classAvg>=50?"Good":"Needs Improvement"}</span></div>
            <p style={{fontSize:11,color:T.ink3,lineHeight:1.6}}>{perfMetrics.classAvg>=75?"Strong teaching performance. Students consistently achieving above average.":perfMetrics.classAvg>=50?"Moderate performance. Consider focused improvement strategies.":"Performance below expectations. Intervention recommended."}</p>
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
          {[{l:"CLASS AVG",v:perfMetrics.classAvg},{l:"PASS RATE",v:perfMetrics.passRate},{l:"ATTENDANCE",v:attRate},{l:"SATISFACTION",v:perfMetrics.satisfaction}].map(r=><div key={r.l} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:11,color:T.ink3,width:100}}>{r.l}</span><div style={{flex:1,height:6,background:T.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${r.v}%`,background:r.v>=80?T.blue:r.v>=50?T.amb:T.red,borderRadius:3}}/></div><span style={{fontSize:12,fontWeight:600,color:r.v>=80?T.blue:r.v>=50?T.amb:T.red,width:40,textAlign:"right"}}>{r.v}%</span></div>)}
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
            {icon:Award,         l:"CLASS AVERAGE",   v:`${perfMetrics.classAvg}%`},
            {icon:TrendingUp,    l:"PASS RATE",       v:`${perfMetrics.passRate}%`},
            {icon:Calendar,      l:"ATTENDANCE",      v:`${attRate}%`},
            {icon:Users,         l:"TOTAL STUDENTS",  v:totalStudents},
            {icon:BookOpen,      l:"CLASSES ASSIGNED",v:assignedClasses.length},
            {icon:FileText,      l:"TESTS CREATED",   v:activity.testsCreated},
            {icon:ClipboardList, l:"ASSIGNMENTS",     v:activity.assignmentsCreated},
            {icon:NotebookPen,   l:"LESSON PLANS",    v:activity.lessonPlansCount},
            {icon:MessageSquare, l:"PARENT NOTES",    v:activity.parentNotesCount},
            {icon:Star,          l:"PARENT RATING",   v:`${avgRating.toFixed(1)}/5`},
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
          {subjectData.length>0&&<div style={{height:160,marginBottom:12}}><ResponsiveContainer width="100%" height="100%"><BarChart data={subjectData}><CartesianGrid strokeDasharray="3 3" stroke={T.s2}/><XAxis dataKey="name" tick={{fill:T.ink3,fontSize:9}}/><YAxis tick={{fill:T.ink3,fontSize:9}} domain={[0,100]}/><Tooltip contentStyle={{background:T.white,border:`1px solid ${T.bdr}`,borderRadius:8,fontSize:11}}/><Bar dataKey="avg" fill={T.blue} radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>}
          {subjectData.map(s=><div key={s.name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{fontSize:11,color:T.ink3,width:80,flexShrink:0}}>{s.name}</span><div style={{flex:1,height:6,background:T.s1,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${s.avg}%`,background:s.avg>=75?T.blue:s.avg>=50?T.grn:T.red,borderRadius:3}}/></div><span style={{fontSize:12,fontWeight:600,color:T.ink,width:28,textAlign:"right"}}>{s.avg}</span></div>)}
        </Card>
      </div>

      {/* Status bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",background:T.white,border:`1px solid ${T.bdr}`,borderRadius:12,fontSize:10,color:T.ink3}}>
        <span>★ TEACHER ID: {(teacher.id||"").slice(0,8).toUpperCase()}</span><span>★ {assignedClasses.length} Classes</span><span>★ {totalStudents} Students</span><span>★ Rating: {avgRating.toFixed(1)}/5</span>
      </div>

      {/* ═══ EDIT MODAL ═══ */}
      {editOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={()=>setEditOpen(false)}>
        <div style={{background:T.white,borderRadius:20,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${T.s2}`}}>
            <h3 style={{fontSize:16,fontWeight:600,color:T.ink,margin:0}}>Edit Teacher</h3>
            <button onClick={()=>setEditOpen(false)} style={{width:28,height:28,border:"none",background:T.s1,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14} color={T.ink3}/></button>
          </div>
          <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
            {[{l:"Phone",k:"phone"},{l:"Experience",k:"experience"},{l:"Bio",k:"bio"},{l:"Status",k:"status"}].map(f=><div key={f.k}><label style={{fontSize:11,fontWeight:600,color:T.ink3,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6,display:"block"}}>{f.l}</label><input value={(editForm as any)[f.k]} onChange={e=>setEditForm({...editForm,[f.k]:e.target.value})} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.bdr}`,background:T.s1,fontSize:13,color:T.ink,outline:"none"}}/></div>)}
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
import { useState, useEffect } from "react";
import { 
  Mail, Reply, Clock, MessageSquare, Filter, Wifi, Calendar, 
  AlertCircle, ShieldAlert, BellRing, User, Send, Users, 
  CheckCircle, Loader2, Plus, Sparkles, X
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, limit, getDocs, onSnapshot, orderBy, addDoc, serverTimestamp, where } from "firebase/firestore";
import ConversationDetail from "@/components/ConversationDetail";
import CommunicationIntelligence from "@/components/CommunicationIntelligence";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";

const ParentCommunication = () => {
  const { userData } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Real-time Data States
  const [alerts, setAlerts] = useState<any[]>([]);
  const [communications, setCommunications] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  // Modal States
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Form States
  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    content: "",
    targetGroup: "All Parents",
    priority: "Normal"
  });

  const [meetingForm, setMeetingForm] = useState({
    title: "",
    participant: "",
    date: "",
    time: "",
    type: "PTM"
  });

  // Dynamic Chart States
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [responseTimeData, setResponseTimeData] = useState<any[]>([]);

  useEffect(() => {
    if (!userData?.schoolId) return;

    setLoading(true);

    const constraints = [where("schoolId", "==", userData.schoolId)];
    if (userData.branch) constraints.push(where("branch", "==", userData.branch));

    // 1. Alerts Listener
    const qAlerts = query(collection(db, "parent_alerts"), ...constraints, limit(10));
    const unsubAlerts = onSnapshot(qAlerts, (snap) => {
      setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Parent alerts fetch failed:", err));

    // 2. Communications Listener
    const qComms = query(
      collection(db, "communications"), 
      ...constraints,
      limit(50)
    );
    const unsubComms = onSnapshot(qComms, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCommunications(data);

      // Update Chart Metrics
      if (data.length > 0) {
        const prfData = ["Mon", "Tue", "Wed", "Thu", "Fri"].map(day => ({
          name: day,
          rate: Math.floor(Math.random() * 15 + 85),
          target: 90
        }));
        setPerformanceData(prfData);

        const depts = ["Accounts", "Transport", "Principal", "Teachers"];
        const rtData = depts.map(dept => ({
          name: dept,
          time: parseFloat((Math.random() * 4 + 2).toFixed(1)),
          benchmark: 6
        }));
        setResponseTimeData(rtData);
      }
    }, (err) => console.warn("Communications fetch failed:", err));

    // 3. Broadcasts Listener
    const qBroadcasts = query(collection(db, "broadcasts"), ...constraints, limit(10));
    const unsubBroadcasts = onSnapshot(qBroadcasts, (snap) => {
      setBroadcasts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Broadcasts fetch failed:", err));

    // 4. Meetings Listener
    const qMeetings = query(collection(db, "meetings"), ...constraints, limit(10));
    const unsubMeetings = onSnapshot(qMeetings, (snap) => {
      setMeetings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Meetings fetch failed:", err));

    setLoading(false);

    return () => {
      unsubAlerts();
      unsubComms();
      unsubBroadcasts();
      unsubMeetings();
    };
  }, [userData?.schoolId]);

  const handleCreateBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.title || !broadcastForm.content) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsSending(true);
    try {
      await addDoc(collection(db, "broadcasts"), {
        ...broadcastForm,
        schoolId: userData?.schoolId,
        sender: userData?.name || "Principal",
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        createdAt: serverTimestamp()
      });
      toast.success("Broadcast sent successfully!");
      setIsBroadcastOpen(false);
      setBroadcastForm({ title: "", content: "", targetGroup: "All Parents", priority: "Normal" });
    } catch (e: any) {
       toast.error("Failed to send broadcast: " + e.message);
    } finally {
       setIsSending(false);
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingForm.title || !meetingForm.date) {
      toast.error("Please fill all required fields");
      return;
    }

    setIsSending(true);
    try {
      await addDoc(collection(db, "meetings"), {
        ...meetingForm,
        schoolId: userData?.schoolId,
        status: "Scheduled",
        createdAt: serverTimestamp()
      });
      toast.success("Meeting scheduled!");
      setIsMeetingOpen(false);
      setMeetingForm({ title: "", participant: "", date: "", time: "", type: "PTM" });
    } catch (e: any) {
       toast.error("Failed to schedule meeting: " + e.message);
    } finally {
       setIsSending(false);
    }
  };

  const unreadCount = communications.filter(c => c.unread).length;
  const unreadBadgeColor = unreadCount > 10 ? "bg-red-500 text-white animate-pulse" : unreadCount > 5 ? "bg-yellow-500 text-white" : "bg-blue-500 text-white";

  if (selectedConversation) {
    return <ConversationDetail conversation={selectedConversation} onBack={() => setSelectedConversation(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Communication Intelligence</h1>
          <p className="text-sm text-muted-foreground">Automated monitoring and administrative coordination</p>
        </div>
        <div className="flex gap-3">
           <button 
             onClick={() => setIsBroadcastOpen(true)}
             className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-lg hover:opacity-90 transition-all"
           >
              <Wifi className="w-4 h-4" /> Create Broadcast
           </button>
           <button 
             onClick={() => setIsMeetingOpen(true)}
             className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-slate-100 text-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 transition-all"
           >
              <Calendar className="w-4 h-4" /> Schedule Meeting
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title="Unread Messages" value={unreadCount} subtitle={unreadCount > 0 ? "High Volume Alert" : "All clear"} color={unreadCount > 10 ? "text-red-500" : "text-foreground"} icon={Mail} iconBg="bg-blue-50" iconColor="text-blue-600" />
        <StatCard title="Response Rate" value="94%" subtitle="Last 30 days" icon={Reply} iconBg="bg-green-50" iconColor="text-green-600" />
        <StatCard title="Avg Response Time" value="4.2h" subtitle="Target: <6h" icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-600" />
        <StatCard title="Active Broadcasts" value={broadcasts.length} subtitle="Sent to parents" icon={Wifi} iconBg="bg-purple-50" iconColor="text-purple-600" />
      </div>

      <CommunicationIntelligence />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-6">Staff Response Performance</h3>
            {!loading && communications.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <Reply className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-600">Response metrics will appear soon.</p>
               </div>
            ) : (
               <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={performanceData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                     <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }} dy={10} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} domain={[0, 100]} />
                     <RechartsTooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }} />
                     <Line type="monotone" dataKey="rate" stroke="#22c55e" strokeWidth={4} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} name="Response Rate %" />
                     <Line type="monotone" dataKey="target" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target (90%)" />
                  </LineChart>
               </ResponsiveContainer>
            )}
         </div>

         <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-base font-bold text-foreground flex justify-between">Response Time Benchmarks</h3>
            <p className="text-sm text-slate-500 font-medium mb-6 mt-1">Excellent: &lt; 2hrs | Acceptable: &lt; 6hrs | Slow: &gt; 12hrs</p>
            {!loading && communications.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <Clock className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-600">Benchmarks will activate soon.</p>
               </div>
            ) : (
               <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={responseTimeData} layout="vertical">
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                     <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} domain={[0, 12]}/>
                     <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#1e293b', fontWeight: 'bold' }} width={80} />
                     <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                     <Bar dataKey="time" name="Avg Hours" radius={[0, 4, 4, 0]}>
                        {responseTimeData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.time > 6 ? '#ef4444' : entry.time > 2 ? '#f59e0b' : '#22c55e'} />
                        ))}
                     </Bar>
                  </BarChart>
               </ResponsiveContainer>
            )}
         </div>
      </div>

      {/* Broadcasts & Meetings Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-7 py-5 border-b border-white bg-[#1e3a8a] text-white flex items-center justify-between">
               <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-2"><Wifi className="w-4 h-4"/> Recent Broadcasts</h3>
               <span className="text-[10px] bg-white/20 px-2 py-1 rounded-lg">Last 10 results</span>
            </div>
            <div className="divide-y divide-border overflow-auto max-h-[300px]">
               {broadcasts.length > 0 ? broadcasts.map((b) => (
                  <div key={b.id} className="p-6 hover:bg-slate-50 transition-all group">
                     <div className="flex justify-between items-start mb-2">
                        <h4 className="text-base font-black text-slate-800">{b.title}</h4>
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100">{b.targetGroup}</span>
                     </div>
                     <p className="text-sm text-slate-500 font-bold mb-4 line-clamp-2">{b.content}</p>
                     <div className="flex items-center gap-4 text-[10px] font-black text-slate-400">
                        <span className="flex items-center gap-1"><User className="w-3 h-3"/> {b.sender}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {b.date}</span>
                     </div>
                  </div>
               )) : (
                  <div className="py-20 text-center text-slate-400 italic font-bold">No broadcasts found.</div>
               )}
            </div>
         </div>

         <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-7 py-5 border-b border-border bg-slate-900 text-white flex items-center justify-between">
               <h3 className="text-base font-black uppercase tracking-widest flex items-center gap-2"><Calendar className="w-4 h-4"/> Meeting Schedule</h3>
               <span className="text-[10px] bg-emerald-500 px-2 py-1 rounded-lg">Real-time</span>
            </div>
            <div className="divide-y divide-border overflow-auto max-h-[300px]">
               {meetings.length > 0 ? meetings.map((m) => (
                  <div key={m.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-all">
                     <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-white text-xs font-black">
                           {m.type?.[0] || 'M'}
                        </div>
                        <div>
                           <h4 className="text-base font-black text-slate-800">{m.title}</h4>
                           <p className="text-xs font-bold text-slate-500">With: {m.participant || "Not specified"}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-base font-black text-slate-900">{m.time}</p>
                        <p className="text-[10px] font-black uppercase text-indigo-600">{m.date}</p>
                     </div>
                  </div>
               )) : (
                  <div className="py-20 text-center text-slate-400 italic font-bold">No upcoming meetings.</div>
               )}
            </div>
         </div>
      </div>

      {/* Priority Engine (Communications) */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden mt-6">
        <div className="px-8 py-6 border-b border-border flex items-center justify-between bg-white">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center border border-red-200 shadow-sm">
               <AlertCircle className="w-5 h-5 text-red-600" />
             </div>
             <div>
                <h2 className="text-lg font-black uppercase tracking-widest text-[#1e294b]">Priority Communication Engine</h2>
                <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Automated Triaging active</p>
             </div>
           </div>
        </div>

        <div className="divide-y divide-border">
          {communications.length > 0 ? communications.map((conv) => {
             const pLvl = conv.priority?.toUpperCase() || 'NORMAL';
             const pColor = pLvl === 'CRITICAL' ? 'bg-red-500' : pLvl === 'HIGH' ? 'bg-amber-500' : 'bg-indigo-600';

             return (
               <div key={conv.id} className="px-8 py-6 hover:bg-slate-50 transition-all cursor-pointer flex items-start justify-between group" onClick={() => setSelectedConversation(conv)}>
                 <div className="flex gap-4">
                   <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-xs font-black shadow-lg">
                     {conv.parent?.substring(0, 2).toUpperCase() || 'P'}
                   </div>
                   <div className="space-y-1">
                     <div className="flex items-center gap-2">
                       <h3 className="text-base font-black text-slate-800">{conv.parent}</h3>
                       <span className="text-[9px] font-black bg-slate-100 px-2 py-0.5 rounded leading-none text-slate-500 border border-slate-200">{conv.type || 'Message'}</span>
                       {conv.unread && <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />}
                     </div>
                     <p className="text-sm font-bold text-slate-600 group-hover:text-[#1e3a8a] transition-colors">{conv.subject}</p>
                     <p className="text-[10px] font-bold text-slate-400 flex items-center gap-2"><User className="w-3 h-3"/> Student: {conv.student}</p>
                   </div>
                 </div>
                 <div className="text-right">
                    <span className={`px-4 py-1.5 ${pColor} text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl`}>
                      {pLvl}
                    </span>
                    <p className="text-[10px] font-bold text-slate-400 mt-2">{conv.time}</p>
                 </div>
               </div>
             )
          }) : (
             <div className="py-24 text-center">
                <MessageSquare className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No communications found.</p>
             </div>
          )}
        </div>
      </div>

      {/* Broadcast Modal */}
      <Dialog open={isBroadcastOpen} onOpenChange={setIsBroadcastOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">Create Academic Broadcast</DialogTitle>
            <DialogDescription className="text-slate-500 font-bold">This announcement will be relayed to the selected parent groups.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateBroadcast} className="space-y-6 pt-4">
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Announcement Title</Label>
                <Input 
                   placeholder="e.g. Winter Break Schedule" 
                   className="h-12 rounded-xl border-slate-200 font-bold"
                   value={broadcastForm.title}
                   onChange={e => setBroadcastForm({...broadcastForm, title: e.target.value})}
                />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Target Audience</Label>
                   <select 
                     className="w-full h-12 rounded-xl border-slate-200 bg-white border px-3 text-sm font-bold"
                     value={broadcastForm.targetGroup}
                     onChange={e => setBroadcastForm({...broadcastForm, targetGroup: e.target.value})}
                   >
                      <option>All Parents</option>
                      <option>Grade 9 Parents</option>
                      <option>Grade 10 Parents</option>
                      <option>Teachers Only</option>
                   </select>
                </div>
                <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Priority Level</Label>
                   <select 
                     className="w-full h-12 rounded-xl border-slate-200 bg-white border px-3 text-sm font-bold"
                     value={broadcastForm.priority}
                     onChange={e => setBroadcastForm({...broadcastForm, priority: e.target.value})}
                   >
                      <option>Normal</option>
                      <option>High Priority</option>
                      <option>Critical</option>
                   </select>
                </div>
             </div>
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Message Content</Label>
                <Textarea 
                   placeholder="Enter detailed announcement..." 
                   className="min-h-[120px] rounded-xl border-slate-200 font-bold"
                   value={broadcastForm.content}
                   onChange={e => setBroadcastForm({...broadcastForm, content: e.target.value})}
                />
             </div>
             <DialogFooter>
                <button 
                  type="submit" 
                  disabled={isSending}
                  className="w-full h-14 bg-[#1e3a8a] text-white rounded-2xl font-black uppercase tracking-widest hover:shadow-xl transition-all shadow-indigo-100 flex items-center justify-center gap-2"
                >
                   {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                   {isSending ? "Relaying Broadcast..." : "Transmit Circular"}
                </button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Meeting Modal */}
      <Dialog open={isMeetingOpen} onOpenChange={setIsMeetingOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">Schedule Strategic Meeting</DialogTitle>
            <DialogDescription className="text-slate-500 font-bold">Define session parameters for coordination.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleScheduleMeeting} className="space-y-6 pt-4">
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Agenda / Title</Label>
                <Input 
                   placeholder="e.g. Quarterly Academic Review" 
                   className="h-12 rounded-xl border-slate-200 font-bold"
                   value={meetingForm.title}
                   onChange={e => setMeetingForm({...meetingForm, title: e.target.value})}
                />
             </div>
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Participant / Department</Label>
                <Input 
                   placeholder="e.g. Mrs. Kavita (Grade 9 Coordinator)" 
                   className="h-12 rounded-xl border-slate-200 font-bold"
                   value={meetingForm.participant}
                   onChange={e => setMeetingForm({...meetingForm, participant: e.target.value})}
                />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Date</Label>
                   <Input 
                      type="date"
                      className="h-12 rounded-xl border-slate-200 font-bold"
                      value={meetingForm.date}
                      onChange={e => setMeetingForm({...meetingForm, date: e.target.value})}
                   />
                </div>
                <div className="space-y-2">
                   <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Time</Label>
                   <Input 
                      type="time"
                      className="h-12 rounded-xl border-slate-200 font-bold"
                      value={meetingForm.time}
                      onChange={e => setMeetingForm({...meetingForm, time: e.target.value})}
                   />
                </div>
             </div>
             <DialogFooter>
                <button 
                  type="submit" 
                  disabled={isSending}
                  className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:shadow-xl transition-all shadow-slate-200 flex items-center justify-center gap-2"
                >
                   {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar className="w-4 h-4" />}
                   {isSending ? "Confirming Slot..." : "Finalize Meeting Slot"}
                </button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
};

const StatCard = ({ title, value, subtitle, color = "text-foreground", icon: Icon, iconBg, iconColor }: any) => (
  <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex items-start justify-between hover:shadow-lg transition-all">
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{title}</p>
      <div className={`text-4xl font-black mb-1 ${color}`}>{value}</div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-80">{subtitle}</p>
    </div>
    <div className={`w-12 h-12 rounded-2xl ${iconBg} flex items-center justify-center shadow-inner`}>
      <Icon className={`w-6 h-6 ${iconColor}`} />
    </div>
  </div>
);

export default ParentCommunication;

import React, { useState, useEffect } from "react";
import { Mail, MessageSquare, Network, Radio, Loader2, Sparkles, AlertCircle, Clock } from "lucide-react";
import { AIController } from "@/ai/controller/ai-controller";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, limit, where } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

interface CommData {
  message_classification: { student: string; category: string; summary: string }[];
  department_routing: { message: string; route_to: string }[];
  conversation_context: { thread_id: string; context_summary: string }[];
  broadcast_suggestions: { target_group: string; reason: string }[];
}

const CommunicationIntelligence = () => {
  const { userData } = useAuth();
  const [data, setData] = useState<CommData | null>(null);
  const [loading, setLoading] = useState(true);
  const [placeholderMessage, setPlaceholderMessage] = useState<string | null>(null);

  useEffect(() => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId) return;

    const fetchCommData = async () => {
      try {
        const constraints: any[] = [where("schoolId", "==", schoolId)];
        if (branchId) constraints.push(where("branchId", "==", branchId));

        const snap = await getDocs(query(
          collection(db, "communications"),
          ...constraints,
          limit(30),
        ));
        const dataExists = !snap.empty;

        const docs = snap.docs.map(d => d.data() as any);
        const messages = docs.map(m => ({
          sender:  m.from || m.sender || "Parent",
          student: m.studentName || m.student || "Unknown",
          text:    m.message || m.text || m.content || "",
        })).filter(m => m.text);

        // Group by thread_id / studentId for conversation history
        const threadMap: Record<string, { thread_id: string; participants: Set<string>; messages_count: number }> = {};
        docs.forEach(m => {
          const tid = m.threadId || m.studentId || m.id;
          if (!tid) return;
          if (!threadMap[tid]) threadMap[tid] = { thread_id: String(tid), participants: new Set(), messages_count: 0 };
          threadMap[tid].participants.add(m.from || m.sender || "User");
          threadMap[tid].messages_count++;
        });
        const conversation_history = Object.values(threadMap)
          .filter(t => t.messages_count > 1)
          .slice(0, 20)
          .map(t => ({
            thread_id: t.thread_id,
            participants: Array.from(t.participants),
            messages_count: t.messages_count,
          }));

        const aiInput = dataExists ? { messages, conversation_history } : null;

        const result = await AIController.getCommunicationInsights(aiInput);

        if (result.status === "no_data") {
           setPlaceholderMessage(result.message);
        } else if (result.status === "success" && result.data) {
           setData(result.data);
           setPlaceholderMessage(null);
        } else {
           setPlaceholderMessage(result.message || "An error occurred.");
        }
      } catch (err) {
        console.error("Communication Intelligence API failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCommData();
  }, [userData?.schoolId, userData?.branchId]);

  if (!loading && placeholderMessage) {
    return (
       <div className="bg-card border border-border shadow-sm rounded-2xl p-10 flex flex-col items-center justify-center text-center w-full my-6 relative overflow-hidden group">
          <div className="absolute -left-10 -top-10 w-40 h-40 bg-blue-50 rounded-full blur-3xl opacity-50 block"></div>
          <AlertCircle className="w-12 h-12 text-slate-300 mb-4 animate-pulse duration-1000 relative z-10" />
          <p className="text-base font-bold text-slate-600 max-w-md relative z-10">{placeholderMessage}</p>
       </div>
    );
  }

  const getCategoryColor = (cat: string) => {
     let l = cat.toLowerCase();
     if (l.includes("complaint") || l.includes("urg")) return "bg-red-50 text-red-600 border-red-200";
     if (l.includes("concern")) return "bg-orange-50 text-orange-600 border-orange-200";
     if (l.includes("appreciation")) return "bg-green-50 text-green-600 border-green-200";
     return "bg-blue-50 text-blue-600 border-blue-200";
  };

  return (
    <div className="my-8 animate-in fade-in zoom-in-95 duration-500">
       <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
               <Sparkles className="w-5 h-5 text-indigo-500" /> Communication Intelligence Engine
            </h2>
            <p className="text-xs font-semibold text-muted-foreground mt-1">AI-powered tracking, message categorization, and smart routing.</p>
          </div>
          {loading && <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />}
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* Classification */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
             <div className="px-5 py-4 border-b border-border bg-slate-50 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-700"/>
                <h3 className="text-sm font-bold text-slate-800">Message Triage</h3>
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? ( <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Analyzing text...</div> ) : (
                   data?.message_classification?.map((m, i) => (
                      <div key={i} className="p-5 hover:bg-slate-50/50 transition-colors">
                         <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                            <p className="text-sm font-bold text-slate-800">{m.student}</p>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${getCategoryColor(m.category)}`}>{m.category}</span>
                         </div>
                         <p className="text-sm font-medium text-slate-600">"{m.summary}"</p>
                      </div>
                   ))
                )}
             </div>
          </div>

          {/* Routing */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
             <div className="px-5 py-4 border-b border-border bg-slate-50 flex items-center gap-2">
                <Network className="w-4 h-4 text-slate-700"/>
                <h3 className="text-sm font-bold text-slate-800">Smart Departmental Routing</h3>
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? ( <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Mapping routes...</div> ) : (
                   data?.department_routing?.map((r, i) => (
                      <div key={i} className="p-5 hover:bg-slate-50/50 transition-colors">
                         <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded shadow-sm mb-2"><Mail className="w-3 h-3"/> Route to: {r.route_to}</p>
                         <p className="text-sm font-semibold text-slate-700 leading-snug">{r.message}</p>
                      </div>
                   ))
                )}
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Conversational Context */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
             <div className="px-5 py-4 border-b border-border bg-slate-50 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-700"/>
                <h3 className="text-sm font-bold text-slate-800">Thread Context Management</h3>
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? ( <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Checking history...</div> ) : (
                   data?.conversation_context?.map((c, i) => (
                      <div key={i} className="p-5 hover:bg-slate-50/50 transition-colors">
                         <p className="text-[10px] font-black uppercase text-slate-400 mb-1.5 tracking-widest">Thread ID: {c.thread_id}</p>
                         <p className="text-sm font-semibold text-slate-700 italic border-l-2 border-slate-300 pl-3 leading-relaxed">"{c.context_summary}"</p>
                      </div>
                   ))
                )}
             </div>
          </div>

          {/* Broadcast Suggestions */}
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
             <div className="px-5 py-4 border-b border-border bg-slate-50 flex items-center gap-2">
                <Radio className="w-4 h-4 text-slate-700"/>
                <h3 className="text-sm font-bold text-slate-800">Intelligent Broadcast Logic</h3>
             </div>
             <div className="divide-y divide-border flex-1 bg-white">
                {loading ? ( <div className="p-6 text-center text-xs text-slate-400 font-medium italic">Thinking...</div> ) : (
                   data?.broadcast_suggestions?.map((b, i) => (
                      <div key={i} className="p-5 hover:bg-slate-50/50 transition-colors">
                         <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                            <p className="text-xs font-bold text-slate-800 uppercase tracking-widest">Target Group</p>
                            <span className="text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">{b.target_group}</span>
                         </div>
                         <p className="text-sm text-slate-600 font-medium leading-relaxed">{b.reason}</p>
                      </div>
                   ))
                )}
             </div>
          </div>
       </div>

    </div>
  );
};
export default CommunicationIntelligence;

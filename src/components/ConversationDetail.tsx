import React from 'react';
import { ChevronLeft, CheckCircle2, Clock, User, Phone, Mail, Send, Reply, MoreVertical } from 'lucide-react';

interface ConversationDetailProps {
  conversation: {
    parent: string;
    initials: string;
    color: string;
    type: string;
    subject: string;
    student: string;
    time: string;
    priority: string;
    message: string;
    contact: string;
    id: string;
    thread: {
      sender: string;
      initials: string;
      color: string;
      message: string;
      time: string;
      isSystem?: boolean;
    }[];
    status: {
      label: string;
      time: string;
      completed: boolean;
      subtext?: string;
    }[];
    assignedTo: {
      name: string;
      role: string;
      initials: string;
    };
  };
  onBack: () => void;
}

const ConversationDetail = ({ conversation, onBack }: ConversationDetailProps) => {
  return (
    <div className="animate-in fade-in slide-in-from-top-4 duration-500 pb-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <span className="hover:underline cursor-pointer" onClick={onBack}>Parent Communication</span>
        <span>/</span>
        <span className="text-foreground font-medium">Message Detail</span>
      </div>

      <div className="bg-[#fff1f2] border border-red-100 rounded-3xl p-8 mb-8 relative shadow-sm">
        <div className="flex justify-between items-start">
           <div className="flex gap-6">
              <div className={`w-16 h-16 ${conversation.color} rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-black/5`}>
                 {conversation.initials}
              </div>
              <div>
                 <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-black text-[#1e293b]">{conversation.parent}</h1>
                    <span className="px-2.5 py-0.5 bg-red-50 text-red-500 rounded-full text-[10px] font-bold">{conversation.type}</span>
                    <span className="px-3 py-1 bg-red-600 text-white text-[10px] font-black rounded-full uppercase tracking-tighter shadow-sm">
                       {conversation.priority} PRIORITY
                    </span>
                 </div>
                 <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-slate-500">
                    <span className="flex items-center gap-2">Student: {conversation.student}</span>
                    <span className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                    <span className="flex items-center gap-2">Parent Contact: {conversation.contact}</span>
                 </div>
              </div>
           </div>
           <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Received</p>
              <p className="text-sm font-black text-[#1e293b]">{conversation.time}</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Message Thread */}
        <div className="lg:col-span-8 space-y-8">
           <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-8">Message Thread</h3>
              <div className="space-y-10">
                 {conversation.thread.map((t, i) => (
                   <div key={i} className="flex gap-6">
                      <div className={`w-12 h-12 shrink-0 ${t.color} rounded-2xl flex items-center justify-center text-white text-lg font-black shadow-sm`}>
                         {t.initials}
                      </div>
                      <div className={`flex-1 p-6 rounded-3xl ${t.isSystem ? 'bg-blue-50/50 border border-blue-50' : 'bg-slate-50/50 border border-slate-50'}`}>
                         <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-black text-[#1e293b]">{t.sender}</h4>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">{t.time}</span>
                         </div>
                         <p className="text-sm font-medium text-slate-600 leading-relaxed italic">
                           {t.message}
                         </p>
                      </div>
                   </div>
                 ))}
              </div>

              <div className="mt-12 pt-10 border-t border-slate-50">
                 <h4 className="text-sm font-black text-[#1e293b] mb-4">Reply</h4>
                 <div className="relative">
                    <textarea 
                      placeholder="Write your response here..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl p-6 text-sm font-medium focus:ring-2 focus:ring-[#1e3a8a]/10 focus:border-[#1e3a8a] outline-none transition-all placeholder:text-slate-300 min-h-[120px] resize-none"
                    />
                    <div className="absolute bottom-4 right-4">
                       <button className="bg-[#1e3a8a] text-white p-3 rounded-2xl shadow-lg shadow-blue-100 hover:scale-105 active:scale-95 transition-all">
                          <Send className="w-5 h-5" />
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Right Column: Status & Assignment */}
        <div className="lg:col-span-4 space-y-8">
           <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-8">Status Tracker</h3>
              <div className="space-y-8 relative">
                 <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-50" />
                 {conversation.status.map((s, i) => (
                   <div key={i} className="relative pl-12">
                      <div className={`absolute left-0 top-0 w-8 h-8 rounded-full ${s.completed ? 'bg-green-500' : s.subtext ? 'bg-orange-500' : 'bg-slate-100'} ring-4 ring-white flex items-center justify-center z-10 shadow-sm`}>
                         {s.completed ? <CheckCircle2 className="w-4 h-4 text-white" /> : s.subtext ? <Clock className="w-4 h-4 text-white" /> : <div className="w-2 h-2 bg-slate-300 rounded-full" />}
                      </div>
                      <div>
                         <p className="text-sm font-black text-[#1e293b] leading-tight">{s.label}</p>
                         <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{s.time}</p>
                         {s.subtext && <p className="text-[10px] font-bold text-orange-500 mt-1 tracking-tight">{s.subtext}</p>}
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-6">Assigned To</h3>
              <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl">
                 <div className="w-12 h-12 bg-[#1e3a8a] rounded-2xl flex items-center justify-center text-white text-sm font-black shadow-sm">
                   {conversation.assignedTo.initials}
                 </div>
                 <div>
                    <h4 className="text-sm font-black text-[#1e293b]">{conversation.assignedTo.name}</h4>
                    <p className="text-xs font-bold text-slate-400">{conversation.assignedTo.role}</p>
                 </div>
              </div>
           </div>

           <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="text-lg font-black text-[#1e293b] mb-6">Quick Actions</h3>
              <button className="w-full flex items-center justify-center gap-3 py-4 bg-[#22c55e] text-white rounded-2xl text-sm font-black shadow-lg shadow-green-100 group hover:opacity-90 transition-all">
                 <CheckCircle2 className="w-5 h-5" /> Mark Resolved
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationDetail;

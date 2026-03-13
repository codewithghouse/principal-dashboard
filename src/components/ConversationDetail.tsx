import React from 'react';
import { ChevronLeft, CheckCircle2, Clock, Phone, Send, Reply, MoreVertical, Paperclip, Calendar, User, ArrowUpRight, FileText } from 'lucide-react';

interface ConversationDetailProps {
  conversation: {
    parent: string;
    initials: string;
    avatarBg: string;
    type: string;
    typeStyle: string;
    subject: string;
    student: string;
    time: string;
    priority: string;
    priorityColor: string;
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
  // Mocking status data to match the image exactly
  const statusItems = [
    { label: "Received", time: "Jan 17, 10:30 AM", completed: true, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500" },
    { label: "Under Review", time: "Assigned to: Accounts Dept", completed: false, active: true, icon: Clock, color: "text-amber-500", bg: "bg-amber-500" },
    { label: "Resolved", time: "Pending", completed: false, icon: null, color: "text-slate-300", bg: "bg-slate-100" },
  ];

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Parent Communication</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Message Detail</span>
      </div>

      {/* ===== HEADER CARD ===== */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm" style={{ borderLeft: '4px solid #ef4444' }}>
        <div className="flex justify-between items-start">
          <div className="flex gap-5">
            <div className={`w-14 h-14 ${conversation.avatarBg || 'bg-red-500'} rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-sm`}>
              {conversation.initials}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-foreground">{conversation.parent}</h1>
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${conversation.typeStyle || 'text-red-500 border border-red-100 bg-red-50'}`}>
                  {conversation.type}
                </span>
                <span className="px-3 py-1 bg-red-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                  HIGH PRIORITY
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                <span>Student: {conversation.student}</span>
                <span className="opacity-30">•</span>
                <span>Parent Contact: {conversation.contact}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 opacity-60">Received</p>
            <p className="text-sm font-bold text-foreground">Jan 17, 2026 • 10:30 AM</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ===== LEFT COLUMN: MESSAGE THREAD & REPLY ===== */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-8">Message Thread</h3>
            
            <div className="space-y-8">
              {/* Parent Message */}
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
                  {conversation.initials}
                </div>
                <div className="flex-1 bg-secondary/20 border border-border/50 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-foreground">{conversation.parent}</h4>
                    <span className="text-[10px] font-medium text-muted-foreground">Jan 17, 10:30 AM</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed font-medium capitalize">
                    Dear Principal, I am writing to bring to your attention a serious issue regarding fee payment. I have been double-charged for the month of January 2026. My son Aarav Gupta (Grade 8A) has only one admission, but the system shows two separate charges of ₹15,000 each. I have already paid once on January 5th, but received another payment reminder yesterday. This is causing unnecessary confusion and stress. Please look into this matter urgently and resolve it at the earliest. I have attached the payment receipt for your reference.
                  </p>
                </div>
              </div>

              {/* System Message */}
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-[#1e3a8a] rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
                  E
                </div>
                <div className="flex-1 bg-blue-50/50 border border-blue-100/50 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-[#1e3a8a]">EDUINTELLECT System</h4>
                    <span className="text-[10px] font-medium text-muted-foreground">Jan 17, 10:31 AM</span>
                  </div>
                  <p className="text-sm text-[#1e3a8a]/80 leading-relaxed font-medium">
                    Thank you for reaching out. Your complaint has been registered with ID #COMP-2026-0117. Our team will investigate and respond within 24 hours.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Reply Section */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-6">Reply</h3>
            <div className="space-y-4">
              <textarea 
                placeholder="Write your response here..."
                className="w-full bg-secondary/20 border border-border rounded-xl p-5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 min-h-[140px] resize-none"
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-secondary transition-colors">
                    <Paperclip className="w-4 h-4 text-muted-foreground" /> Attach
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-secondary transition-colors">
                    <Calendar className="w-4 h-4 text-muted-foreground" /> Schedule
                  </button>
                </div>
                <button className="flex items-center gap-2 px-6 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#1e4fc0]">
                  <Send className="w-4 h-4" /> Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT COLUMN: STATUS, ASSIGNMENT & ACTIONS ===== */}
        <div className="lg:col-span-4 space-y-6">
          {/* Status Tracker */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-6">Status Tracker</h3>
            <div className="space-y-6 relative">
              <div className="absolute left-[15px] top-6 bottom-6 w-0.5 bg-secondary" />
              {statusItems.map((s, i) => (
                <div key={i} className="flex gap-4 items-start relative z-10">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${s.bg}`}>
                    {s.icon ? <s.icon className="w-4 h-4 text-white" /> : <div className="w-2 h-2 bg-slate-200 rounded-full" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground leading-tight">{s.label}</h4>
                    <p className={`text-[11px] font-medium mt-0.5 ${s.active ? 'text-amber-500' : 'text-muted-foreground'}`}>{s.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Assigned To */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Assigned To</h3>
            <div className="flex items-center gap-4 bg-secondary/20 p-4 rounded-xl border border-secondary">
              <div className="w-10 h-10 bg-[#1e3a8a] rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
                AS
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Mr. Ashok Sharma</h4>
                <p className="text-xs text-muted-foreground font-medium">Accounts Manager</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-[#22c55e] text-white rounded-xl text-sm font-bold shadow-md hover:bg-green-600">
                <CheckCircle2 className="w-4 h-4" /> Mark Resolved
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-card border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors">
                <ArrowUpRight className="w-4 h-4 text-muted-foreground" /> Escalate
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-card border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors text-slate-600">
                <Phone className="w-4 h-4 text-muted-foreground" /> Schedule Call
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-3 bg-card border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors text-slate-600">
                <User className="w-4 h-4 text-muted-foreground" /> View Student Profile
              </button>
            </div>
          </div>

          {/* Attachments */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Attachments</h3>
            <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-xl border border-border hover:bg-secondary transition-colors cursor-pointer group">
              <FileText className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="text-sm font-medium text-foreground">Payment_Receipt_Jan.pdf</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationDetail;

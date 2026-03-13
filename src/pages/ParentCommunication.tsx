import { useState } from "react";
import { Mail, Reply, Clock, MessageSquare, Filter, Wifi, Calendar, AlertCircle } from "lucide-react";
import ConversationDetail from "@/components/ConversationDetail";

const communicationStats = [
  { label: "Unread Messages", value: "5", subtitle: "Require attention", icon: Mail, valueColor: "text-red-500", iconColor: "text-red-500", iconBg: "bg-red-50" },
  { label: "Response Rate", value: "94%", subtitle: "Last 30 days", icon: Reply, valueColor: "text-green-500", iconColor: "text-green-500", iconBg: "bg-green-50" },
  { label: "Avg Response Time", value: "4.2h", subtitle: "Target: <6h", icon: Clock, valueColor: "text-foreground", iconColor: "text-blue-600", iconBg: "bg-blue-50" },
  { label: "Total This Month", value: "127", subtitle: "↑ 12% vs last month", icon: MessageSquare, valueColor: "text-foreground", iconColor: "text-amber-500", iconBg: "bg-amber-50", subtitleColor: "text-green-500" },
];

const conversationsData = [
  {
    id: "#COMP-2026-0117",
    parent: "Mr. Gupta",
    initials: "MG",
    avatarBg: "bg-[#ef4444]",
    type: "Complaint",
    typeStyle: "text-red-500 border border-red-100 bg-red-50/50",
    subject: "Fee Payment Issue - Double charged for January",
    student: "Aarav Gupta (8A)",
    time: "2 hours ago",
    priority: "HIGH",
    priorityColor: "bg-[#ef4444]",
    unread: true,
    message: "Dear Principal, I am writing to bring to your attention a serious issue regarding fee payment...",
    thread: [],
    status: [],
    assignedTo: { name: "Accounts Dept", role: "Manager", initials: "AD" }
  },
  {
    id: "#MSG-2026-0116",
    parent: "Mrs. Reddy",
    initials: "SR",
    avatarBg: "bg-[#f59e0b]",
    type: "Urgent",
    typeStyle: "text-amber-500 border border-amber-100 bg-amber-50/50",
    subject: "Bus Route Change Request",
    student: "Priya Reddy (7B)",
    time: "4 hours ago",
    priority: "MEDIUM",
    priorityColor: "bg-[#f59e0b]",
    unread: true,
    message: "Requesting a change in the bus route due to relocation.",
    thread: [],
    status: [],
    assignedTo: { name: "Transport Dept", role: "Manager", initials: "TD" }
  },
  {
    id: "#MSG-2026-0115",
    parent: "Mr. Kumar",
    initials: "VK",
    avatarBg: "bg-[#22c55e]",
    type: "Appreciation",
    typeStyle: "text-green-600 bg-green-50",
    subject: "Thank you for excellent teaching staff",
    student: "Vikram Kumar (10A)",
    time: "1 day ago",
    priority: "LOW",
    priorityColor: "bg-[#22c55e]",
    unread: false,
    message: "Very happy with the progress Vikram is making.",
    thread: [],
    status: [],
    assignedTo: { name: "Principal Office", role: "Secretary", initials: "PO" }
  }
];

const ParentCommunication = () => {
  const [selectedConversation, setSelectedConversation] = useState<typeof conversationsData[0] | null>(null);

  if (selectedConversation) {
    return <ConversationDetail conversation={selectedConversation as any} onBack={() => setSelectedConversation(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Parent Communication</h1>
        <p className="text-sm text-muted-foreground">Manage all parent communications and complaints</p>
      </div>

      {/* ===== 4 STAT CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {communicationStats.map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-6 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-4">{stat.label}</p>
              <div className={`text-4xl font-black mb-1 ${stat.valueColor}`}>{stat.value}</div>
              <p className={`text-xs font-bold ${stat.subtitleColor || 'text-muted-foreground'}`}>
                {stat.subtitle}
              </p>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.iconBg}`}>
              <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
            </div>
          </div>
        ))}
      </div>

      {/* ===== TABS ===== */}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button className="px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-md">All (24)</button>
        <button className="px-5 py-2.5 bg-card border border-border text-muted-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors">General (8)</button>
        <div className="relative">
          <button className="px-5 py-2.5 bg-card border border-border text-muted-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors">
            Complaints (5)
          </button>
          <span className="absolute -right-1.5 -top-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-md border-2 border-background">3</span>
        </div>
        <button className="px-5 py-2.5 bg-card border border-border text-muted-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors">Urgent (4)</button>
        <button className="px-5 py-2.5 bg-card border border-border text-muted-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors">Appreciation (7)</button>
      </div>

      {/* ===== CONVERSATIONS SECTION ===== */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Recent Conversations</h2>
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-bold text-foreground hover:bg-secondary transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>

        <div className="divide-y divide-border">
          {conversationsData.map((conv, i) => (
            <div 
              key={i} 
              className="px-8 py-6 hover:bg-secondary/20 transition-all cursor-pointer group"
              onClick={() => setSelectedConversation(conv)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 ${conv.avatarBg} rounded-full flex items-center justify-center text-white text-base font-bold shadow-sm shrink-0`}>
                    {conv.initials}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground">{conv.parent}</h3>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-tight ${conv.typeStyle}`}>
                        {conv.type}
                      </span>
                      {conv.unread && <div className="w-2.5 h-2.5 bg-[#ef4444] rounded-full border-2 border-background" />}
                    </div>
                    <p className="text-base font-bold text-slate-600 group-hover:text-[#1e3a8a] transition-colors">{conv.subject}</p>
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 pt-1 italic">
                      Student: {conv.student} <span className="mx-1">•</span> {conv.time}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 opacity-60">Priority</p>
                  <span className={`px-4 py-1.5 ${conv.priorityColor} text-white rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm`}>
                    {conv.priority}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== BOTTOM ACTION BUTTONS ===== */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#1e4fc0] transition-colors">
          <Wifi className="w-4 h-4" /> Send Broadcast
        </button>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-card border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors shadow-sm">
          <Calendar className="w-4 h-4 text-muted-foreground" /> Schedule Meeting
        </button>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-card border border-border text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors shadow-sm">
          <AlertCircle className="w-4 h-4 text-muted-foreground" /> View Complaints
        </button>
      </div>
    </div>
  );
};

export default ParentCommunication;

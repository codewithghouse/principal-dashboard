import { useState } from "react";
import { MessageSquare, Mail, Reply, Clock, TrendingUp, Search, Filter } from "lucide-react";
import ConversationDetail from "@/components/ConversationDetail";

const communicationStats = [
  { label: "Unread Messages", value: "5", subtitle: "Require attention", icon: Mail, color: "text-red-500", bg: "bg-red-50" },
  { label: "Response Rate", value: "94%", subtitle: "Last 30 days", icon: Reply, color: "text-green-500", bg: "bg-green-50" },
  { label: "Avg Response Time", value: "4.2h", subtitle: "Target: <6h", icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "Total This Month", value: "127", subtitle: "↑ 12% vs last month", icon: TrendingUp, color: "text-orange-500", bg: "bg-orange-50" },
];

const conversationsData = [
  {
    id: "#COMP-2026-0117",
    parent: "Mr. Manoj Gupta",
    initials: "MG",
    color: "bg-red-500",
    type: "Complaint",
    subject: "Fee Payment Issue - Double charged for January",
    student: "Aarav Gupta (Grade 8A)",
    contact: "+91 98765 43230",
    time: "Jan 17, 2026 • 10:30 AM",
    priority: "HIGH",
    unread: true,
    message: "Dear Principal, I am writing to bring to your attention a serious issue regarding fee payment...",
    thread: [
      {
        sender: "Mr. Manoj Gupta",
        initials: "MG",
        color: "bg-red-500",
        message: "Dear Principal, I am writing to bring to your attention a serious issue regarding fee payment. I have been double-charged for the month of January 2026. My son Aarav Gupta (Grade 8A) has only one admission, but the system shows two separate charges of ₹15,000 each. I have already paid once on January 5th, but received another payment reminder yesterday. This is causing unnecessary confusion and stress. Please look into this matter urgently and resolve it at the earliest. I have attached the payment receipt for your reference.",
        time: "Jan 17, 10:30 AM"
      },
      {
        sender: "EDUINTELLECT System",
        initials: "E",
        color: "bg-[#1e3a8a]",
        message: "Thank you for reaching out. Your complaint has been registered with ID #COMP-2026-0117. Our team will investigate and respond within 24 hours.",
        time: "Jan 17, 10:31 AM",
        isSystem: true
      }
    ],
    status: [
      { label: "Received", time: "Jan 17, 10:30 AM", completed: true },
      { label: "Under Review", time: "Assigned to: Accounts Dept", completed: false, subtext: "Assigned to: Accounts Dept" },
      { label: "Resolved", time: "Pending", completed: false }
    ],
    assignedTo: {
      name: "Mr. Ashok Sharma",
      role: "Accounts Manager",
      initials: "AS"
    }
  },
  {
    id: "#MSG-2026-0116",
    parent: "Mrs. Reddy",
    initials: "SR",
    color: "bg-orange-500",
    type: "Urgent",
    subject: "Bus Route Change Request",
    student: "Priya Reddy (7B)",
    contact: "+91 98765 43231",
    time: "4 hours ago",
    priority: "MEDIUM",
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
    color: "bg-green-500",
    type: "Appreciation",
    subject: "Thank you for excellent teaching staff",
    student: "Vikram Kumar (10A)",
    contact: "+91 98765 43232",
    time: "1 day ago",
    priority: "LOW",
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
    return <ConversationDetail conversation={selectedConversation} onBack={() => setSelectedConversation(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-[#1e293b]">Parent Communication</h1>
        <p className="text-sm text-slate-400 font-medium">Manage all parent communications and complaints</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {communicationStats.map((stat, i) => (
          <div key={i} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-tight mb-4">{stat.label}</p>
              <div className="text-4xl font-black text-[#1e293b] mb-1">{stat.value}</div>
              <p className={`text-xs font-bold ${stat.label === 'Total This Month' ? 'text-green-500' : 'text-slate-400'}`}>
                {stat.subtitle}
              </p>
            </div>
            <div className={`p-3 ${stat.bg} ${stat.color} rounded-2xl`}>
              <stat.icon className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="px-6 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-black shadow-lg shadow-blue-100">All (24)</button>
        <button className="px-6 py-2.5 bg-white border border-slate-100 text-slate-500 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">General (8)</button>
        <div className="relative">
          <button className="px-6 py-2.5 bg-white border border-slate-100 text-slate-500 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">
            Complaints (5)
          </button>
          <span className="absolute -right-2 -top-2 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-lg shadow-md ring-2 ring-white">3</span>
        </div>
        <button className="px-6 py-2.5 bg-white border border-slate-100 text-slate-500 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">Urgent (4)</button>
        <button className="px-6 py-2.5 bg-white border border-slate-100 text-slate-500 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">Appreciation (7)</button>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden min-h-[500px]">
        <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between">
          <h2 className="text-xl font-black text-[#1e293b]">Recent Conversations</h2>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-[#1e293b] rounded-xl text-xs font-black uppercase tracking-widest border border-slate-100 hover:bg-slate-100 transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>

        <div className="divide-y divide-slate-50">
          {conversationsData.map((conv, i) => (
            <div 
              key={i} 
              className="px-10 py-8 hover:bg-slate-50/50 transition-all cursor-pointer group relative"
              onClick={() => setSelectedConversation(conv)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-6">
                  <div className={`w-14 h-14 ${conv.color} rounded-[1.25rem] flex items-center justify-center text-white text-xl font-black shadow-lg shadow-black/5`}>
                    {conv.initials}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-black text-[#1e293b]">{conv.parent}</h3>
                      <span className={`px-2.5 py-0.5 ${
                        conv.type === 'Complaint' ? 'bg-red-50 text-red-500' : 
                        conv.type === 'Urgent' ? 'bg-orange-50 text-orange-500' : 
                        'bg-green-50 text-green-500'
                      } rounded-full text-[10px] font-bold`}>
                        {conv.type}
                      </span>
                      {conv.unread && <div className="w-2 h-2 bg-red-500 rounded-full" />}
                    </div>
                    <p className="text-base font-bold text-slate-600 group-hover:text-[#1e3a8a] transition-colors">{conv.subject}</p>
                    <p className="text-xs font-bold text-slate-400 flex items-center gap-2 pt-1 uppercase tracking-tight">
                      Student: {conv.student} • {conv.time}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Priority</p>
                  <span className={`px-4 py-1.5 ${
                    conv.priority === 'HIGH' ? 'bg-red-500 text-white shadow-red-100' : 
                    conv.priority === 'MEDIUM' ? 'bg-orange-500 text-white shadow-orange-100' : 
                    'bg-green-500 text-white shadow-green-100'
                  } rounded-xl text-[10px] font-black shadow-lg uppercase tracking-tight`}>
                    {conv.priority}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ParentCommunication;

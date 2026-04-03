import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, MessageSquare, Search, Send, User, ChevronLeft, CheckCheck, Users, Mail, Smile, GraduationCap } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const TeacherNotes = () => {
  const { userData } = useAuth();
  const [selectedTeacher, setSelectedTeacher]   = useState<any>(null);
  const [allMessages, setAllMessages]           = useState<any[]>([]);
  const [teachers, setTeachers]                 = useState<any[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [teachersLoading, setTeachersLoading]   = useState(true);
  const [searchQuery, setSearchQuery]           = useState("");
  const [messageContent, setMessageContent]     = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userData?.schoolId) return;
    setTeachersLoading(true);
    const c: any[] = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) c.push(where("branchId", "==", userData.branchId));
    return onSnapshot(query(collection(db, "teachers"), ...c), snap => {
      setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTeachersLoading(false);
    });
  }, [userData?.schoolId, userData?.branchId]);

  useEffect(() => {
    if (!userData?.schoolId) return;
    setLoading(true);
    const c: any[] = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) c.push(where("branchId", "==", userData.branchId));
    return onSnapshot(query(collection(db, "principal_to_teacher_notes"), ...c), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      data.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      setAllMessages(data);
      setLoading(false);
    });
  }, [userData?.schoolId, userData?.branchId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [allMessages, selectedTeacher]);

  const lastMessages = useMemo(() => {
    const map = new Map<string, any>();
    [...allMessages].reverse().forEach(n => { if (n.teacherId && !map.has(n.teacherId)) map.set(n.teacherId, n); });
    return map;
  }, [allMessages]);

  const unreadPerTeacher = useMemo(() => {
    const map = new Map<string, number>();
    allMessages.filter(m => m.read === false && m.from === "teacher").forEach(m => {
      map.set(m.teacherId, (map.get(m.teacherId) || 0) + 1);
    });
    return map;
  }, [allMessages]);

  const teacherMessages = useMemo(() => {
    if (!selectedTeacher) return [];
    return allMessages.filter(n => n.teacherId === selectedTeacher.id);
  }, [allMessages, selectedTeacher]);

  const filteredTeachers = useMemo(() => teachers
    .filter(t =>
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (lastMessages.get(b.id)?.timestamp?.toMillis?.() || 0) - (lastMessages.get(a.id)?.timestamp?.toMillis?.() || 0)),
  [teachers, searchQuery, lastMessages]);

  const stats = useMemo(() => ({
    total:     allMessages.length,
    unread:    allMessages.filter(m => m.read === false && m.from === "teacher").length,
    contacted: new Set(allMessages.map(m => m.teacherId)).size,
  }), [allMessages]);

  const handleSend = async () => {
    if (!selectedTeacher || !messageContent.trim()) return;
    const content = messageContent.trim();
    setMessageContent("");
    try {
      await addDoc(collection(db, "principal_to_teacher_notes"), {
        principalId:   userData?.uid || userData?.id || "",
        principalName: userData?.name || "Principal",
        teacherId:     selectedTeacher.id || "",
        teacherName:   selectedTeacher.name || "",
        className:     selectedTeacher.assignedClass || selectedTeacher.className || "",
        message: content, from: "principal",
        timestamp: serverTimestamp(),
        schoolId: userData?.schoolId || "",
        branchId: userData?.branchId || "",
        read: false,
      });
    } catch { toast.error("Failed to send."); setMessageContent(content); }
  };

  const fmtTime = (ts: any) =>
    new Date(ts?.toDate?.() || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const fmtDate = (ts: any) => {
    const d = ts?.toDate?.() || new Date();
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: any[] }[] = [];
    teacherMessages.forEach(msg => {
      const label = fmtDate(msg.timestamp);
      const last  = groups[groups.length - 1];
      if (last && last.date === label) last.messages.push(msg);
      else groups.push({ date: label, messages: [msg] });
    });
    return groups;
  }, [teacherMessages]);

  return (
    <div className="h-screen flex flex-col" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
        .wa-sidebar::-webkit-scrollbar { width: 4px; }
        .wa-sidebar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
        .wa-chat::-webkit-scrollbar { width: 6px; }
        .wa-chat::-webkit-scrollbar-thumb { background: #c8b89a; border-radius: 4px; }
        .wa-input::-webkit-scrollbar { display: none; }
        .bubble-sent { border-radius: 8px 0 8px 8px; position: relative; }
        .bubble-sent::before { content:''; position:absolute; top:0; right:-8px; width:0; height:0; border:8px solid transparent; border-top-color:#d9fdd3; border-right:0; }
        .bubble-recv { border-radius: 0 8px 8px 8px; position: relative; }
        .bubble-recv::before { content:''; position:absolute; top:0; left:-8px; width:0; height:0; border:8px solid transparent; border-top-color:#ffffff; border-left:0; }
        .wa-bg { background-color:#efeae2; }
        .chat-item:hover { background: #f5f6f6; }
      `}</style>

      {/* Stat strip */}
      <div className="flex gap-4 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        {[
          { label: "Total Messages",    val: stats.total,     icon: MessageSquare, color: "text-blue-600" },
          { label: "Unread Replies",    val: stats.unread,    icon: Mail,          color: "text-amber-500" },
          { label: "Teachers Contacted",val: stats.contacted, icon: Users,         color: "text-green-600" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-3 bg-gray-50 rounded-xl px-5 py-3 flex-1 border border-gray-100">
            <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
            <div>
              <p className="text-xs font-semibold text-gray-400">{s.label}</p>
              <p className="text-xl font-black text-gray-800">{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden border-t border-gray-200">

        {/* Left sidebar */}
        <div className={`w-[380px] shrink-0 flex flex-col border-r border-gray-200 bg-white ${selectedTeacher ? "hidden md:flex" : "flex"}`}>
          <div className="flex items-center gap-3 px-4 py-3 bg-[#1e3a8a]">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-sm flex-1">Teacher Notes</span>
          </div>

          <div className="px-3 py-2 bg-white">
            <div className="flex items-center bg-[#f0f2f5] rounded-full px-4 gap-2 h-9">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search teachers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto wa-sidebar">
            {teachersLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
              </div>
            ) : filteredTeachers.length === 0 ? (
              <p className="text-center text-xs text-gray-400 font-medium py-10">No teachers found</p>
            ) : filteredTeachers.map(t => {
              const last   = lastMessages.get(t.id);
              const unread = unreadPerTeacher.get(t.id) || 0;
              const active = selectedTeacher?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTeacher(t)}
                  className={`w-full flex items-center gap-3 px-3 py-3 border-b border-gray-100 transition-colors chat-item ${active ? "bg-[#f0f2f5]" : ""}`}
                >
                  <div className="w-12 h-12 rounded-full bg-[#1e3a8a] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(t.name || "TC").substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-semibold text-gray-900 truncate">{t.name}</span>
                      {last && <span className={`text-[11px] font-medium shrink-0 ml-1 ${unread > 0 ? "text-[#25d366]" : "text-gray-400"}`}>{fmtTime(last.timestamp)}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 truncate">
                        {last ? (last.from === "principal" ? `✓ ${last.message}` : last.message) : "No messages yet"}
                      </p>
                      {unread > 0 && (
                        <span className="ml-1 bg-[#25d366] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">{unread}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{t.subject || "Teacher"}{t.assignedClass ? ` • ${t.assignedClass}` : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right chat panel */}
        <div className={`flex-1 flex flex-col ${!selectedTeacher ? "hidden md:flex" : "flex"}`}>
          {selectedTeacher ? (
            <>
              <div className="flex items-center gap-3 px-4 py-2 bg-[#1e3a8a] shrink-0">
                <button onClick={() => setSelectedTeacher(null)} className="md:hidden text-white p-1">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
                  {(selectedTeacher.name || "TC").substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm leading-none">{selectedTeacher.name}</p>
                  <p className="text-blue-200 text-xs mt-0.5">{selectedTeacher.subject || "Teacher"}{selectedTeacher.assignedClass ? ` • ${selectedTeacher.assignedClass}` : ""}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto wa-chat wa-bg px-4 py-4 flex flex-col gap-1">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
                  </div>
                ) : teacherMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="bg-white/80 rounded-lg px-6 py-3 shadow-sm">
                      <p className="text-sm text-gray-500 font-medium">No messages yet</p>
                      <p className="text-xs text-gray-400 mt-1">Send a message to start the conversation</p>
                    </div>
                  </div>
                ) : groupedMessages.map(group => (
                  <div key={group.date}>
                    <div className="flex justify-center my-3">
                      <span className="bg-white/90 text-gray-500 text-[11px] font-medium px-3 py-1 rounded-full shadow-sm">{group.date}</span>
                    </div>
                    {group.messages.map(n => {
                      const isSent = n.from === "principal";
                      return (
                        <div key={n.id} className={`flex mb-1 ${isSent ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[70%] px-3 py-2 shadow-sm ${isSent ? "bubble-sent bg-[#d9fdd3]" : "bubble-recv bg-white"}`}>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{n.message}</p>
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className="text-[11px] text-gray-400">{fmtTime(n.timestamp)}</span>
                              {isSent && <CheckCheck className="w-4 h-4 text-[#53bdeb]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="flex items-center gap-2 px-3 py-2 bg-[#f0f2f5] shrink-0">
                <button className="w-10 h-10 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded-full transition-colors">
                  <Smile className="w-6 h-6" />
                </button>
                <div className="flex-1 bg-white rounded-full px-4 py-2 flex items-center min-h-[42px]">
                  <textarea
                    rows={1}
                    value={messageContent}
                    onChange={e => setMessageContent(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Type a message"
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-800 resize-none wa-input outline-none placeholder:text-gray-400 leading-relaxed"
                    style={{ fontFamily: "'Montserrat', sans-serif" }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!messageContent.trim()}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${messageContent.trim() ? "bg-[#1e3a8a] text-white" : "bg-gray-300 text-gray-400"}`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center wa-bg text-center px-8">
              <div className="bg-white/80 rounded-2xl p-10 shadow-sm max-w-xs">
                <GraduationCap className="w-16 h-16 text-[#1e3a8a]/20 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-700 mb-2">Teacher Notes</h3>
                <p className="text-sm text-gray-400 font-medium">Select a teacher from the left to start a conversation</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherNotes;

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, MessageSquare, Search, Send, User, ChevronLeft, CheckCheck, Users, Mail, Smile, Plus, MoreVertical, Sparkles, Check } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

const ParentCommunication = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [allMessages, setAllMessages]         = useState<any[]>([]);
  const [students, setStudents]               = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [searchQuery, setSearchQuery]         = useState("");
  const [messageContent, setMessageContent]   = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userData?.schoolId) return;
    setStudentsLoading(true);
    const c: any[] = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) c.push(where("branchId", "==", userData.branchId));
    return onSnapshot(query(collection(db, "enrollments"), ...c), snap => {
      const map = new Map<string, any>();
      snap.docs.forEach(d => {
        const data = { id: d.id, ...d.data() } as any;
        const key  = data.studentId || d.id;
        if (!map.has(key)) map.set(key, data);
      });
      setStudents(Array.from(map.values()));
      setStudentsLoading(false);
    });
  }, [userData?.schoolId, userData?.branchId]);

  useEffect(() => {
    if (!userData?.schoolId) return;
    setLoading(true);
    const c: any[] = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) c.push(where("branchId", "==", userData.branchId));
    return onSnapshot(query(collection(db, "principal_to_parent_notes"), ...c), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      data.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      setAllMessages(data);
      setLoading(false);
    });
  }, [userData?.schoolId, userData?.branchId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [allMessages, selectedStudent]);

  const lastMessages = useMemo(() => {
    const map = new Map<string, any>();
    [...allMessages].reverse().forEach(n => { const k = n.studentId; if (k && !map.has(k)) map.set(k, n); });
    return map;
  }, [allMessages]);

  const unreadPerStudent = useMemo(() => {
    const map = new Map<string, number>();
    allMessages.filter(m => m.read === false && m.from === "parent").forEach(m => {
      map.set(m.studentId, (map.get(m.studentId) || 0) + 1);
    });
    return map;
  }, [allMessages]);

  const studentMessages = useMemo(() => {
    if (!selectedStudent) return [];
    const key = selectedStudent.studentId || selectedStudent.id;
    return allMessages.filter(n => n.studentId === key);
  }, [allMessages, selectedStudent]);

  const filteredStudents = useMemo(() => students
    .filter(s =>
      s.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.parentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.className?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const ka = a.studentId || a.id; const kb = b.studentId || b.id;
      return (lastMessages.get(kb)?.timestamp?.toMillis?.() || 0) - (lastMessages.get(ka)?.timestamp?.toMillis?.() || 0);
    }),
  [students, searchQuery, lastMessages]);

  const stats = useMemo(() => ({
    total:     allMessages.length,
    unread:    allMessages.filter(m => m.read === false && m.from === "parent").length,
    contacted: new Set(allMessages.map(m => m.studentId)).size,
  }), [allMessages]);

  const handleSend = async () => {
    if (!selectedStudent || !messageContent.trim()) return;
    const content = messageContent.trim();
    setMessageContent("");
    try {
      await addDoc(collection(db, "principal_to_parent_notes"), {
        principalId:   userData?.uid || userData?.id || "",
        principalName: userData?.name || "Principal",
        studentId:     selectedStudent.studentId || selectedStudent.id || "",
        studentName:   selectedStudent.studentName || "",
        parentName:    selectedStudent.parentName || `Parent of ${selectedStudent.studentName}`,
        className:     selectedStudent.className || "",
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
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: any[] }[] = [];
    studentMessages.forEach(msg => {
      const label = fmtDate(msg.timestamp);
      const last  = groups[groups.length - 1];
      if (last && last.date === label) last.messages.push(msg);
      else groups.push({ date: label, messages: [msg] });
    });
    return groups;
  }, [studentMessages]);

  // ───────────────────────── MOBILE RETURN ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const B3 = "#2277FF";
    const GREEN = "#00C853";
    const ORANGE = "#FF8800";
    const T1 = "#001040";
    const T2 = "#002080";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const avatarGrads = [
      `linear-gradient(135deg, ${B1}, ${B3})`,
      `linear-gradient(135deg, #002DBB, ${B1})`,
      `linear-gradient(135deg, #7B3FF4, #AA77FF)`,
      `linear-gradient(135deg, ${GREEN}, #22EE66)`,
      `linear-gradient(135deg, ${ORANGE}, #FFCC55)`,
    ];

    const initials = (userData?.fullName || userData?.name || userData?.email || "AD")
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const handleNewMessage = () => {
      if (filteredStudents.length === 0) {
        toast.info("No students found. Add enrollments to start messaging.");
        return;
      }
      toast.info("Tap a parent below to start messaging.", {
        description: "Or use the search box to find a specific student.",
      });
      requestAnimationFrame(() => {
        document.getElementById("mobile-pc-search")?.focus();
      });
    };

    // ── CHAT VIEW ──
    if (selectedStudent) {
      const key = selectedStudent.studentId || selectedStudent.id;
      const studentInitials = (selectedStudent.studentName || "ST").substring(0, 2).toUpperCase();
      const readCount = studentMessages.filter((m: any) => m.from === "principal" && m.read).length;
      const replyCount = studentMessages.filter((m: any) => m.from === "parent").length;

      return (
        <div
          style={{
            fontFamily: "'DM Sans', -apple-system, sans-serif",
            background: "#EEF4FF",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* CHAT HEADER */}
          <div
            style={{
              flexShrink: 0,
              background: "linear-gradient(135deg,#0033CC 0%,#0055FF 50%,#2277FF 100%)",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -24,
                right: -16,
                width: 110,
                height: 110,
                background: "radial-gradient(circle, rgba(255,255,255,.14) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <button
              onClick={() => setSelectedStudent(null)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "rgba(255,255,255,.20)",
                border: "0.5px solid rgba(255,255,255,.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                position: "relative",
                zIndex: 1,
              }}
              aria-label="Back"
            >
              <ChevronLeft size={14} color="rgba(255,255,255,.88)" strokeWidth={2.5} />
            </button>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                background: "linear-gradient(135deg,rgba(255,255,255,.22),rgba(255,255,255,.10))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
                position: "relative",
                zIndex: 1,
                border: "2px solid rgba(255,255,255,.26)",
              }}
            >
              {studentInitials}
            </div>
            <div style={{ flex: 1, position: "relative", zIndex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedStudent.studentName || "Student"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 5, height: 5, background: "#00EE88", borderRadius: "50%" }} />
                Parent{selectedStudent.className ? ` · ${selectedStudent.className}` : ""} · Online
              </div>
            </div>
            <button
              onClick={() => toast.info(`${selectedStudent.studentName || "Student"} · ${studentMessages.length} message${studentMessages.length === 1 ? "" : "s"}`)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "rgba(255,255,255,.18)",
                border: "0.5px solid rgba(255,255,255,.26)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                position: "relative",
                zIndex: 1,
                flexShrink: 0,
              }}
              aria-label="More"
            >
              <MoreVertical size={14} color="rgba(255,255,255,.88)" strokeWidth={2.3} />
            </button>
          </div>

          {/* STATS STRIP */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              gap: 0,
              margin: "10px 16px 0",
              background: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
              border: "0.5px solid rgba(0,85,255,.10)",
            }}
          >
            {[
              { val: studentMessages.length, lbl: "Messages", color: B1 },
              { val: readCount > 0 ? "✓✓" : "—", lbl: "Read", color: GREEN },
              { val: replyCount, lbl: "Replies", color: T4 },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  position: "relative",
                  borderRight: i < 2 ? "0.5px solid rgba(0,85,255,.10)" : "none",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.4px", lineHeight: 1, color: s.color }}>
                  {s.val}
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4 }}>
                  {s.lbl}
                </div>
              </div>
            ))}
          </div>

          {/* MESSAGES */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 0,
              background: "#EEF4FF",
            }}
          >
            {loading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={28} color={B1} style={{ animation: "spin 1s linear infinite" }} />
                <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : studentMessages.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                <div style={{ width: 60, height: 60, borderRadius: 20, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)" }}>
                  <MessageSquare size={28} color="rgba(0,85,255,.35)" strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T1, marginBottom: 4 }}>No messages yet</div>
                <div style={{ fontSize: 11, color: T4 }}>Type below to start the conversation.</div>
              </div>
            ) : (
              groupedMessages.map((group) => (
                <div key={group.date}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                    <div
                      style={{
                        padding: "4px 13px",
                        borderRadius: 100,
                        background: "rgba(0,85,255,.08)",
                        border: "0.5px solid rgba(0,85,255,.14)",
                        fontSize: 10,
                        fontWeight: 600,
                        color: T3,
                      }}
                    >
                      {group.date}
                    </div>
                  </div>
                  {group.messages.map((n: any) => {
                    const isSent = n.from === "principal";
                    if (isSent) {
                      return (
                        <div key={n.id} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                          <div style={{ maxWidth: "88%" }}>
                            <div
                              style={{
                                background: `linear-gradient(135deg, ${B1}, ${B2})`,
                                borderRadius: "18px 4px 18px 18px",
                                padding: "12px 14px",
                                fontSize: 13,
                                color: "#fff",
                                lineHeight: 1.65,
                                boxShadow: "0 3px 12px rgba(0,85,255,.24)",
                                position: "relative",
                                overflow: "hidden",
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  background: "linear-gradient(135deg, rgba(255,255,255,.12) 0%, transparent 52%)",
                                  pointerEvents: "none",
                                }}
                              />
                              <span style={{ position: "relative", zIndex: 1 }}>{n.message}</span>
                            </div>
                            <div style={{ fontSize: 9, color: "rgba(80,112,176,.7)", fontWeight: 600, textAlign: "right", marginTop: 4, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                              <span>{fmtTime(n.timestamp)}</span>
                              <CheckCheck size={12} color={GREEN} strokeWidth={2.5} />
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const senderName = n.senderName || selectedStudent.parentName || "Parent";
                    const senderInit = senderName.substring(0, 2).toUpperCase();
                    return (
                      <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, maxWidth: "88%", marginBottom: 8 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            background: avatarGrads[(senderName.charCodeAt(0) || 0) % avatarGrads.length],
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#fff",
                            flexShrink: 0,
                            alignSelf: "flex-end",
                          }}
                        >
                          {senderInit}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              background: "#fff",
                              borderRadius: "4px 18px 18px 18px",
                              padding: "12px 14px",
                              fontSize: 13,
                              color: T1,
                              lineHeight: 1.65,
                              boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                              border: "0.5px solid rgba(0,85,255,.10)",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: B1, marginBottom: 5 }}>{senderName}</div>
                            <div>{n.message}</div>
                          </div>
                          <div style={{ fontSize: 9, color: T4, fontWeight: 600, textAlign: "right", marginTop: 4, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <span>{fmtTime(n.timestamp)}</span>
                            <Check size={12} color={GREEN} strokeWidth={2.5} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* INPUT BAR */}
          <div
            style={{
              flexShrink: 0,
              padding: "10px 16px 14px",
              background: "rgba(238,244,255,.94)",
              backdropFilter: "saturate(220%) blur(24px)",
              WebkitBackdropFilter: "saturate(220%) blur(24px)",
              borderTop: "0.5px solid rgba(0,85,255,.10)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              onClick={() => setMessageContent((c) => c + "🙂")}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: "#fff",
                border: "0.5px solid rgba(0,85,255,.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                flexShrink: 0,
                fontSize: 18,
              }}
              aria-label="Emoji"
            >
              <Smile size={18} color={T3} strokeWidth={2} />
            </button>
            <input
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Reply to parent..."
              style={{
                flex: 1,
                padding: "10px 14px",
                background: "#fff",
                borderRadius: 14,
                border: "0.5px solid rgba(0,85,255,.14)",
                fontFamily: "inherit",
                fontSize: 13,
                color: T1,
                fontWeight: 400,
                outline: "none",
                boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!messageContent.trim()}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: messageContent.trim() ? `linear-gradient(135deg, ${B1}, ${B2})` : "rgba(0,85,255,.20)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: messageContent.trim() ? "pointer" : "not-allowed",
                boxShadow: messageContent.trim() ? "0 3px 12px rgba(0,85,255,.30)" : "none",
                flexShrink: 0,
                border: "none",
                opacity: messageContent.trim() ? 1 : 0.65,
              }}
              aria-label="Send"
            >
              <Send size={14} color="#fff" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      );
    }

    // ── LIST VIEW ──
    return (
      <div
        style={{
          fontFamily: "'DM Sans', -apple-system, sans-serif",
          background: "#EEF4FF",
          minHeight: "100vh",
          paddingBottom: 24,
        }}
      >
        {/* STAT STRIP */}
        <div
          style={{
            display: "flex",
            gap: 0,
            margin: "12px 20px 0",
            background: "#fff",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
            border: "0.5px solid rgba(0,85,255,.10)",
          }}
        >
          {[
            {
              label: "Total Messages",
              value: stats.total,
              color: B1,
              icon: <MessageSquare size={12} color={B1} strokeWidth={2.4} />,
              bg: "rgba(0,85,255,.10)",
              border: "rgba(0,85,255,.18)",
            },
            {
              label: "Unread Replies",
              value: stats.unread,
              color: ORANGE,
              icon: <Mail size={12} color={ORANGE} strokeWidth={2.4} />,
              bg: "rgba(255,136,0,.10)",
              border: "rgba(255,136,0,.22)",
            },
            {
              label: "Parents Contacted",
              value: stats.contacted,
              color: GREEN,
              icon: <Users size={12} color={GREEN} strokeWidth={2.4} />,
              bg: "rgba(0,200,83,.10)",
              border: "rgba(0,200,83,.22)",
            },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                padding: "13px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                position: "relative",
                borderRight: i < 2 ? "0.5px solid rgba(0,85,255,.10)" : "none",
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  background: s.bg,
                  border: `0.5px solid ${s.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 3,
                }}
              >
                {s.icon}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T4, lineHeight: 1.3 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* HERO BANNER */}
        <div
          style={{
            margin: "12px 20px 0",
            background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
            borderRadius: 22,
            padding: "16px 18px",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 26px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -30,
              right: -20,
              width: 130,
              height: 130,
              background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "rgba(255,255,255,.18)",
              border: "0.5px solid rgba(255,255,255,.26)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              position: "relative",
              zIndex: 1,
            }}
          >
            <MessageSquare size={22} color="rgba(255,255,255,.95)" strokeWidth={2.1} />
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px", marginBottom: 2 }}>
              Parent Communication
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.60)", fontWeight: 400 }}>
              Direct messaging with parents & guardians
            </div>
          </div>
        </div>

        {/* SEARCH */}
        <div style={{ margin: "12px 20px 0", position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <Search size={15} color="rgba(0,85,255,.42)" strokeWidth={2.2} />
          </div>
          <input
            id="mobile-pc-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
            style={{
              width: "100%",
              padding: "12px 14px 12px 42px",
              background: "#fff",
              borderRadius: 14,
              border: "0.5px solid rgba(0,85,255,.12)",
              fontFamily: "inherit",
              fontSize: 13,
              color: T1,
              fontWeight: 400,
              outline: "none",
              boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
            }}
          />
        </div>

        {/* NEW MESSAGE BTN */}
        <button
          onClick={handleNewMessage}
          style={{
            margin: "12px 20px 0",
            width: "calc(100% - 40px)",
            height: 50,
            borderRadius: 16,
            background: `linear-gradient(135deg, ${B1}, ${B2})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            cursor: "pointer",
            border: "none",
            boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          New Message to Parent
        </button>

        {/* SECTION LABEL */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: T4,
            padding: "16px 20px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Conversations</span>
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 100,
              background: "rgba(0,85,255,.10)",
              border: "0.5px solid rgba(0,85,255,.16)",
              fontSize: 9,
              fontWeight: 700,
              color: B1,
              textTransform: "none",
              letterSpacing: "0.04em",
            }}
          >
            {filteredStudents.length} parent{filteredStudents.length === 1 ? "" : "s"}
          </span>
          <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
        </div>

        {/* CHAT LIST */}
        <div
          style={{
            margin: "12px 20px 0",
            background: "#fff",
            borderRadius: 22,
            overflow: "hidden",
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
            border: "0.5px solid rgba(0,85,255,.10)",
          }}
        >
          {studentsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <Loader2 size={26} color={B1} style={{ animation: "spin 1s linear infinite" }} />
              <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <User size={36} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
              <div style={{ fontSize: 13, fontWeight: 700, color: T1 }}>No students found</div>
              <div style={{ fontSize: 11, color: T4 }}>Try a different search term.</div>
            </div>
          ) : (
            filteredStudents.map((s, i) => {
              const sKey = s.studentId || s.id;
              const last = lastMessages.get(sKey);
              const unread = unreadPerStudent.get(sKey) || 0;
              const initText = (s.studentName || "ST").substring(0, 2).toUpperCase();
              const sender = last?.from === "principal" ? (last?.principalName || "Principal") : (s.parentName || s.studentName || "");
              const timeLabel = last ? fmtTime(last.timestamp) : "";
              const preview = last
                ? (last.from === "principal" ? `✓ ${last.message}` : last.message)
                : s.className || "No messages yet";

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 13,
                    padding: "14px 18px",
                    borderBottom: i === filteredStudents.length - 1 ? "none" : `0.5px solid ${SEP}`,
                    background: unread > 0 ? "rgba(0,85,255,.03)" : "#fff",
                    border: "none",
                    borderRadius: 0,
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 15,
                      background: avatarGrads[i % avatarGrads.length],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                      position: "relative",
                      boxShadow: "0 3px 10px rgba(0,85,255,.24)",
                    }}
                  >
                    {initText}
                    {unread > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: -1,
                          right: -1,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: GREEN,
                          border: "2px solid #fff",
                          boxShadow: "0 0 0 1px rgba(0,200,83,.20)",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 3, display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                        {s.studentName || "Student"}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 100,
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          background: "rgba(0,85,255,.10)",
                          color: B1,
                          border: "0.5px solid rgba(0,85,255,.16)",
                          flexShrink: 0,
                        }}
                      >
                        Parent
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: unread > 0 ? T2 : T3,
                        fontWeight: unread > 0 ? 600 : 400,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 210,
                      }}
                    >
                      {preview}
                    </div>
                    <div style={{ fontSize: 10, color: T4, fontWeight: 600, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.className || ""}{sender ? ` · ${sender}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    {timeLabel && <span style={{ fontSize: 10, fontWeight: 600, color: T4 }}>{timeLabel}</span>}
                    {unread > 0 ? (
                      <div
                        style={{
                          minWidth: 18,
                          height: 18,
                          padding: "0 5px",
                          borderRadius: "50%",
                          background: B1,
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 0 0 2px rgba(0,85,255,.18)",
                        }}
                      >
                        {unread}
                      </div>
                    ) : last && last.from === "principal" ? (
                      <CheckCheck size={12} color={GREEN} strokeWidth={2.5} />
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* AI CARD */}
        {!loading && (
          <div
            style={{
              margin: "12px 20px 0",
              background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)",
              borderRadius: 22,
              padding: "18px 20px",
              boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -34,
                right: -22,
                width: 140,
                height: 140,
                background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, position: "relative", zIndex: 1 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "rgba(255,255,255,.18)",
                  border: "0.5px solid rgba(255,255,255,.26)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={13} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
                AI Communication Summary
              </span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
              <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.total} message{stats.total === 1 ? "" : "s"}</strong> sent to{" "}
              <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.contacted} parent{stats.contacted === 1 ? "" : "s"}</strong>.{" "}
              <strong style={{ color: "#fff", fontWeight: 700 }}>{stats.unread} unread repl{stats.unread === 1 ? "y" : "ies"}</strong>.{" "}
              {allMessages.length > 0 && allMessages[allMessages.length - 1]?.studentName && (
                <>
                  Last message to{" "}
                  <strong style={{ color: "#fff", fontWeight: 700 }}>
                    {allMessages[allMessages.length - 1].studentName}
                  </strong>
                  .
                </>
              )}
              {stats.total === 0 && "Tap 'New Message to Parent' to start the first conversation."}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 1,
                background: "rgba(255,255,255,.12)",
                borderRadius: 14,
                overflow: "hidden",
                position: "relative",
                zIndex: 1,
                marginTop: 12,
              }}
            >
              {[
                { v: stats.total, l: "Messages" },
                { v: stats.contacted, l: "Parents" },
                { v: stats.unread, l: "Unread" },
              ].map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>
                    {s.v}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 16 }} />
        <span style={{ display: "none" }}>{initials}</span>
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6 md:-m-8 flex flex-col" style={{ fontFamily: "'Montserrat', sans-serif", height: "calc(100vh - 56px)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
        .wa-sidebar::-webkit-scrollbar { width: 4px; }
        .wa-sidebar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
        .wa-chat::-webkit-scrollbar { width: 6px; }
        .wa-chat::-webkit-scrollbar-thumb { background: #c8b89a; border-radius: 4px; }
        .wa-input::-webkit-scrollbar { display: none; }
        .bubble-sent   { border-radius: 8px 0 8px 8px; position: relative; }
        .bubble-sent::before  { content:''; position:absolute; top:0; right:-8px; width:0; height:0; border:8px solid transparent; border-top-color:#d9fdd3; border-right:0; }
        .bubble-recv   { border-radius: 0 8px 8px 8px; position: relative; }
        .bubble-recv::before  { content:''; position:absolute; top:0; left:-8px; width:0; height:0; border:8px solid transparent; border-top-color:#ffffff; border-left:0; }
        .wa-bg { background-color:#efeae2; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M0 0h80v80H0z' fill='%23efeae2'/%3E%3Cpath opacity='.03' d='M40 0L0 40 40 80 80 40z'/%3E%3C/svg%3E"); }
        .chat-item-active { background: #f0f2f5; }
        .chat-item:hover  { background: #f5f6f6; }
      `}</style>

      {/* ─── STAT STRIP ─────────────────────────────────────────── */}
      <div className="flex gap-2 sm:gap-4 px-3 sm:px-4 py-3 bg-white border-b border-gray-200 shrink-0 overflow-x-auto">
        {[
          { label: "Total Messages", val: stats.total,     icon: MessageSquare, color: "text-blue-600"  },
          { label: "Unread Replies", val: stats.unread,    icon: Mail,          color: "text-amber-500" },
          { label: "Parents Contacted", val: stats.contacted, icon: Users,      color: "text-green-600" },
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

      {/* ─── MAIN CHAT LAYOUT ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden border-t border-gray-200">

        {/* LEFT SIDEBAR */}
        <div className={`w-[380px] shrink-0 flex flex-col border-r border-gray-200 bg-white ${selectedStudent ? "hidden md:flex" : "flex"}`}>
          {/* Sidebar header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#1e3a8a]">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-sm flex-1">Parent Communication</span>
          </div>

          {/* Search */}
          <div className="px-3 py-2 bg-white">
            <div className="flex items-center bg-[#f0f2f5] rounded-full px-4 gap-2 h-9">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search or start new chat"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Student List */}
          <div className="flex-1 overflow-y-auto wa-sidebar">
            {studentsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <p className="text-center text-xs text-gray-400 font-medium py-10">No students found</p>
            ) : filteredStudents.map(s => {
              const key    = s.studentId || s.id;
              const last   = lastMessages.get(key);
              const unread = unreadPerStudent.get(key) || 0;
              const active = (selectedStudent?.studentId || selectedStudent?.id) === key;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className={`w-full flex items-center gap-3 px-3 py-3 border-b border-gray-100 transition-colors chat-item ${active ? "chat-item-active" : ""}`}
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-[#1e3a8a] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(s.studentName || "ST").substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-semibold text-gray-900 truncate">{s.studentName}</span>
                      {last && <span className={`text-[11px] font-medium shrink-0 ml-1 ${unread > 0 ? "text-[#25d366]" : "text-gray-400"}`}>{fmtTime(last.timestamp)}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 truncate">
                        {last ? (last.from === "principal" ? `✓ ${last.message}` : last.message) : s.className || "No messages yet"}
                      </p>
                      {unread > 0 && (
                        <span className="ml-1 bg-[#25d366] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">{unread}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{s.className}{s.parentName ? ` • ${s.parentName}` : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT CHAT PANEL */}
        <div className={`flex-1 flex flex-col ${!selectedStudent ? "hidden md:flex" : "flex"}`}>
          {selectedStudent ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-[#1e3a8a] shrink-0">
                <button onClick={() => setSelectedStudent(null)} className="md:hidden text-white p-1">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
                  {(selectedStudent.studentName || "ST").substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm leading-none">{selectedStudent.studentName}</p>
                  <p className="text-blue-200 text-xs mt-0.5">{selectedStudent.className}{selectedStudent.parentName ? ` • ${selectedStudent.parentName}` : ""}</p>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto wa-chat wa-bg px-4 py-4 flex flex-col gap-1">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
                  </div>
                ) : studentMessages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="bg-white/80 rounded-lg px-6 py-3 shadow-sm">
                      <p className="text-sm text-gray-500 font-medium">No messages yet</p>
                      <p className="text-xs text-gray-400 mt-1">Send a message to start the conversation</p>
                    </div>
                  </div>
                ) : (
                  groupedMessages.map(group => (
                    <div key={group.date}>
                      {/* Date badge */}
                      <div className="flex justify-center my-3">
                        <span className="bg-white/90 text-gray-500 text-[11px] font-medium px-3 py-1 rounded-full shadow-sm">{group.date}</span>
                      </div>
                      {group.messages.map(n => {
                        const isSent = n.from === "principal";
                        return (
                          <div key={n.id} className={`flex mb-1 ${isSent ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[70%] px-3 py-2 shadow-sm ${isSent ? "bubble-sent bg-[#d9fdd3]" : "bubble-recv bg-white"}`}
                            >
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
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input bar */}
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
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center wa-bg text-center px-8">
              <div className="bg-white/80 rounded-2xl p-10 shadow-sm max-w-xs">
                <MessageSquare className="w-16 h-16 text-[#1e3a8a]/20 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-700 mb-2">Parent Communication</h3>
                <p className="text-sm text-gray-400 font-medium">Select a student from the left to start messaging their parent</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentCommunication;

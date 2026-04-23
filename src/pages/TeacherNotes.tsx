import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, MessageSquare, Search, Send, User, ChevronLeft, CheckCheck, Mail, Smile, GraduationCap, Plus, MoreVertical, Phone, Sparkles, Check, Clock, FileText } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

const TeacherNotes = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
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

  // ───────────────────────── MOBILE RETURN ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const B3 = "#2277FF";
    const GREEN = "#00C853";
    const RED = "#FF3355";
    const ORANGE = "#FF8800";
    const GOLD = "#FFAA00";
    const T1 = "#001040";
    const T2 = "#002080";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const subjectStyle = (subject: string) => {
      const s = (subject || "").toLowerCase();
      if (s.includes("math")) {
        return {
          avBg: `linear-gradient(135deg, ${ORANGE}, #FFCC22)`,
          avShadow: "0 3px 10px rgba(255,136,0,.24)",
          tagBg: "rgba(255,136,0,.10)",
          tagColor: "#884400",
          tagBorder: "rgba(255,136,0,.22)",
        };
      }
      if (s.includes("english") || s.includes("lang")) {
        return {
          avBg: `linear-gradient(135deg, ${GREEN}, #22EE66)`,
          avShadow: "0 3px 10px rgba(0,200,83,.24)",
          tagBg: "rgba(0,85,255,.10)",
          tagColor: B1,
          tagBorder: "rgba(0,85,255,.16)",
        };
      }
      if (s.includes("sci") || s.includes("chem") || s.includes("phy") || s.includes("bio")) {
        return {
          avBg: `linear-gradient(135deg, #7B3FF4, #AA77FF)`,
          avShadow: "0 3px 10px rgba(123,63,244,.24)",
          tagBg: "rgba(123,63,244,.10)",
          tagColor: "#7B3FF4",
          tagBorder: "rgba(123,63,244,.22)",
        };
      }
      if (s.includes("social") || s.includes("hist") || s.includes("geo")) {
        return {
          avBg: `linear-gradient(135deg, ${GOLD}, #FFCC55)`,
          avShadow: "0 3px 10px rgba(255,170,0,.24)",
          tagBg: "rgba(255,170,0,.10)",
          tagColor: "#884400",
          tagBorder: "rgba(255,170,0,.22)",
        };
      }
      return {
        avBg: `linear-gradient(135deg, ${B1}, ${B3})`,
        avShadow: "0 3px 10px rgba(0,85,255,.24)",
        tagBg: "rgba(0,85,255,.10)",
        tagColor: B1,
        tagBorder: "rgba(0,85,255,.16)",
      };
    };

    const handleNewNote = () => {
      if (filteredTeachers.length === 0) {
        toast.info("No teachers found. Add teachers to start messaging.");
        return;
      }
      toast.info("Tap a teacher below to start a note.", {
        description: "Or use the search box to find a specific teacher.",
      });
      requestAnimationFrame(() => {
        document.getElementById("mobile-tn-search")?.focus();
      });
    };

    // ── CHAT VIEW ──
    if (selectedTeacher) {
      const tInitials = (selectedTeacher.name || "TC").substring(0, 2).toUpperCase();
      const tStyle = subjectStyle(selectedTeacher.subject || "");
      const unreadCount = teacherMessages.filter((m: any) => m.read === false && m.from === "teacher").length;

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
              onClick={() => setSelectedTeacher(null)}
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
                background: tStyle.avBg,
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
              {tInitials}
            </div>
            <div style={{ flex: 1, position: "relative", zIndex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedTeacher.name || "Teacher"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 5, height: 5, background: "#00EE88", borderRadius: "50%" }} />
                {selectedTeacher.subject || "Teacher"}
                {selectedTeacher.assignedClass ? ` · ${selectedTeacher.assignedClass}` : ""} · Active
              </div>
            </div>
            <div style={{ display: "flex", gap: 7, flexShrink: 0, position: "relative", zIndex: 1 }}>
              <button
                onClick={() => {
                  const phone = selectedTeacher.phone || selectedTeacher.mobile || "";
                  if (phone) {
                    window.location.href = `tel:${phone}`;
                  } else {
                    toast.info(`${selectedTeacher.name || "Teacher"} ka phone number saved nahi hai.`);
                  }
                }}
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
                }}
                aria-label="Call"
              >
                <Phone size={13} color="rgba(255,255,255,.88)" strokeWidth={2.3} />
              </button>
              <button
                onClick={() =>
                  toast.info(
                    `${selectedTeacher.name || "Teacher"} · ${teacherMessages.length} message${teacherMessages.length === 1 ? "" : "s"}${unreadCount > 0 ? ` · ${unreadCount} unread` : ""}`
                  )
                }
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
                }}
                aria-label="More"
              >
                <MoreVertical size={13} color="rgba(255,255,255,.88)" strokeWidth={2.3} />
              </button>
            </div>
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
              { val: teacherMessages.length, lbl: "Messages", color: B1 },
              { val: unreadCount, lbl: "Unread", color: unreadCount > 0 ? ORANGE : T4 },
              { val: "Active", lbl: "Status", color: GREEN },
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
            ) : teacherMessages.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 20,
                    background: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                    boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                  }}
                >
                  <FileText size={28} color="rgba(0,85,255,.35)" strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T1, marginBottom: 4 }}>No notes yet</div>
                <div style={{ fontSize: 11, color: T4 }}>Type below to send the first note.</div>
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
                      const metaText = n.read ? "Read" : "Delivered";
                      const metaIcon = n.read ? (
                        <CheckCheck size={12} color="#99DDFF" strokeWidth={2.5} />
                      ) : (
                        <Check size={12} color="rgba(255,255,255,.55)" strokeWidth={2.5} />
                      );
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
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, marginTop: 4, fontSize: 9, color: "rgba(80,112,176,.7)", fontWeight: 600 }}>
                              <span>{fmtTime(n.timestamp)}</span>
                              <span>·</span>
                              <span>{metaIcon}</span>
                              <span>{metaText}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const senderName = n.teacherName || selectedTeacher.name || "Teacher";
                    return (
                      <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, maxWidth: "88%", marginBottom: 8 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            background: tStyle.avBg,
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
                          {senderName.substring(0, 2).toUpperCase()}
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
                            <div style={{ fontSize: 11, fontWeight: 700, color: B1, marginBottom: 5 }}>
                              {senderName}
                              {selectedTeacher.subject ? ` · ${selectedTeacher.subject}` : ""}
                            </div>
                            <div>{n.message}</div>
                          </div>
                          <div style={{ fontSize: 9, color: n.read === false ? B1 : T4, fontWeight: 600, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={10} strokeWidth={2.3} />
                            <span>{fmtTime(n.timestamp)}</span>
                            {n.read === false && (
                              <>
                                <span>·</span>
                                <span>Unread</span>
                              </>
                            )}
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
              onClick={() => setMessageContent((c) => c + "📝 ")}
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
              placeholder={`Write a note to ${selectedTeacher.name || "teacher"}...`}
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
              label: "Teachers Contacted",
              value: stats.contacted,
              color: GREEN,
              icon: <GraduationCap size={12} color={GREEN} strokeWidth={2.4} />,
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
                gap: 4,
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
            <GraduationCap size={22} color="rgba(255,255,255,.95)" strokeWidth={2.1} />
          </div>
          <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px", marginBottom: 2 }}>
              Teacher Notes
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.60)", fontWeight: 400 }}>
              Direct notes with your teaching staff
            </div>
          </div>
          <div
            style={{
              position: "relative",
              zIndex: 1,
              marginLeft: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: stats.unread > 0 ? "#FF8899" : "rgba(255,255,255,.8)",
                letterSpacing: "-0.6px",
                lineHeight: 1,
              }}
            >
              {stats.unread}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>
              Unread
            </div>
          </div>
        </div>

        {/* SEARCH */}
        <div style={{ margin: "12px 20px 0", position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <Search size={15} color="rgba(0,85,255,.42)" strokeWidth={2.2} />
          </div>
          <input
            id="mobile-tn-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search teachers..."
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

        {/* NEW NOTE BTN */}
        <button
          onClick={handleNewNote}
          style={{
            margin: "10px 20px 0",
            width: "calc(100% - 40px)",
            height: 48,
            borderRadius: 15,
            background: `linear-gradient(135deg, ${B1}, ${B2})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 14,
            fontWeight: 700,
            color: "#fff",
            cursor: "pointer",
            border: "none",
            boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          New Note to Teacher
        </button>

        {/* SECTION LABEL */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: T4,
            padding: "14px 20px 0",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>Teacher Conversations</span>
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
            {filteredTeachers.length} teacher{filteredTeachers.length === 1 ? "" : "s"}
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
          {teachersLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <Loader2 size={26} color={B1} style={{ animation: "spin 1s linear infinite" }} />
              <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <User size={36} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
              <div style={{ fontSize: 13, fontWeight: 700, color: T2 }}>No teachers found</div>
              <div style={{ fontSize: 11, color: T4 }}>Try a different search term.</div>
            </div>
          ) : (
            filteredTeachers.map((t, i) => {
              const last = lastMessages.get(t.id);
              const unread = unreadPerTeacher.get(t.id) || 0;
              const tStyle = subjectStyle(t.subject || "");
              const initText = (t.name || "TC").substring(0, 2).toUpperCase();
              const hasLast = !!last;
              const isOnline = unread === 0 && !hasLast;
              const timeLabel = last ? fmtTime(last.timestamp) : "";
              const preview = last
                ? (last.from === "principal" ? `✓ ${last.message}` : last.message)
                : null;

              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTeacher(t)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 13,
                    padding: "15px 18px",
                    borderBottom: i === filteredTeachers.length - 1 ? "none" : `0.5px solid ${SEP}`,
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
                      background: tStyle.avBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                      position: "relative",
                      boxShadow: tStyle.avShadow,
                    }}
                  >
                    {initText}
                    {isOnline && (
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
                        }}
                      />
                    )}
                    {unread > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: -4,
                          right: -4,
                          minWidth: 18,
                          height: 18,
                          padding: "0 4px",
                          background: RED,
                          borderRadius: 9,
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "2px solid #fff",
                          boxShadow: "0 2px 6px rgba(255,51,85,.28)",
                        }}
                      >
                        {unread}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 3, display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                        {t.name || "Teacher"}
                      </span>
                      {t.subject && (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 100,
                            fontSize: 9,
                            fontWeight: 700,
                            background: tStyle.tagBg,
                            color: tStyle.tagColor,
                            border: `0.5px solid ${tStyle.tagBorder}`,
                            flexShrink: 0,
                          }}
                        >
                          {t.subject}
                        </span>
                      )}
                    </div>
                    {preview ? (
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
                    ) : (
                      <div
                        style={{
                          fontSize: 12,
                          color: T4,
                          fontStyle: "italic",
                        }}
                      >
                        No messages yet
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: T4, fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                      {hasLast ? (
                        <>
                          <Clock size={10} strokeWidth={2.4} />
                          <span>{timeLabel}</span>
                        </>
                      ) : isOnline ? (
                        <span style={{ color: "#007830", fontWeight: 700 }}>● Online</span>
                      ) : (
                        <>
                          <GraduationCap size={10} strokeWidth={2.4} />
                          <span>{t.subject || "Teacher"}</span>
                        </>
                      )}
                      {t.assignedClass && (
                        <>
                          <span>·</span>
                          <span>{t.assignedClass}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    {hasLast ? (
                      <>
                        <span style={{ fontSize: 10, fontWeight: unread > 0 ? 700 : 600, color: unread > 0 ? B1 : T4 }}>
                          {timeLabel}
                        </span>
                        {unread > 0 ? (
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: B1,
                              boxShadow: "0 0 0 2px rgba(0,85,255,.18)",
                            }}
                          />
                        ) : last && last.from === "principal" ? (
                          <CheckCheck size={12} color={GREEN} strokeWidth={2.5} />
                        ) : null}
                      </>
                    ) : (
                      <span style={{ fontSize: 10, color: T4, fontStyle: "italic" }}>Start chat →</span>
                    )}
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
                AI Notes Intelligence
              </span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
              <strong style={{ color: "#fff", fontWeight: 700 }}>
                {stats.total} message{stats.total === 1 ? "" : "s"}
              </strong>{" "}
              exchanged with{" "}
              <strong style={{ color: "#fff", fontWeight: 700 }}>
                {stats.contacted} teacher{stats.contacted === 1 ? "" : "s"}
              </strong>
              .{" "}
              {stats.unread > 0 ? (
                <>
                  <strong style={{ color: "#FF8899", fontWeight: 700 }}>
                    {stats.unread} unread repl{stats.unread === 1 ? "y" : "ies"}
                  </strong>{" "}
                  require your attention.
                </>
              ) : (
                <>No unread replies right now.</>
              )}
              {teachers.length - stats.contacted > 0 && (
                <>
                  {" "}
                  <strong style={{ color: "#fff", fontWeight: 700 }}>
                    {teachers.length - stats.contacted} teacher{teachers.length - stats.contacted === 1 ? "" : "s"}
                  </strong>{" "}
                  have no active conversations — consider initiating a performance check-in.
                </>
              )}
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
                { v: stats.total, l: "Messages", color: "#fff" },
                { v: stats.unread, l: "Unread", color: stats.unread > 0 ? "#FF8899" : "#fff" },
                { v: stats.contacted, l: "Teachers", color: "#fff" },
              ].map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: s.color, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>
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
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESKTOP — mirrors the mobile aesthetic (blue palette + gradient hero)
  // ═══════════════════════════════════════════════════════════════════════════
  const B1 = "#0055FF", B2 = "#1166FF", B3 = "#2277FF";
  const GREEN = "#00C853", GREEN_D = "#007830";
  const ORANGE = "#FF8800";
  const GOLD = "#FFAA00";
  const RED = "#FF3355";
  const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
  const SEP = "rgba(0,85,255,.08)";
  const SH_CARD = "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)";

  const subjectStyleD = (subject: string) => {
    const s = (subject || "").toLowerCase();
    if (s.includes("math")) return { avBg: `linear-gradient(135deg, ${ORANGE}, #FFCC22)`, tagBg: "rgba(255,136,0,.10)", tagColor: "#884400", tagBorder: "rgba(255,136,0,.22)", shadow: "0 3px 10px rgba(255,136,0,.24)" };
    if (s.includes("english") || s.includes("lang")) return { avBg: `linear-gradient(135deg, ${GREEN}, #22EE66)`, tagBg: "rgba(0,200,83,.10)", tagColor: GREEN_D, tagBorder: "rgba(0,200,83,.22)", shadow: "0 3px 10px rgba(0,200,83,.24)" };
    if (s.includes("sci") || s.includes("chem") || s.includes("phy") || s.includes("bio")) return { avBg: "linear-gradient(135deg, #7B3FF4, #AA77FF)", tagBg: "rgba(123,63,244,.10)", tagColor: "#5B2FC4", tagBorder: "rgba(123,63,244,.22)", shadow: "0 3px 10px rgba(123,63,244,.24)" };
    if (s.includes("social") || s.includes("hist") || s.includes("geo")) return { avBg: `linear-gradient(135deg, ${GOLD}, #FFCC55)`, tagBg: "rgba(255,170,0,.10)", tagColor: "#884400", tagBorder: "rgba(255,170,0,.22)", shadow: "0 3px 10px rgba(255,170,0,.24)" };
    return { avBg: `linear-gradient(135deg, ${B1}, ${B3})`, tagBg: "rgba(0,85,255,.10)", tagColor: B1, tagBorder: "rgba(0,85,255,.16)", shadow: "0 3px 10px rgba(0,85,255,.24)" };
  };

  return (
    <div className="chat-page w-full h-full flex flex-col overflow-hidden animate-in fade-in duration-500"
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="rounded-[18px] px-6 py-4 flex items-center gap-4 text-white relative overflow-hidden shrink-0"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 6px 22px rgba(0,51,204,0.24), 0 0 0 0.5px rgba(255,255,255,0.10)",
        }}>
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 relative z-10"
          style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
          <GraduationCap className="w-5 h-5 text-white" strokeWidth={2.2} />
        </div>
        <div className="relative z-10 flex-1 min-w-0">
          <div className="text-[18px] font-bold tracking-tight leading-tight">Teacher Notes</div>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.60)" }}>
            Direct notes with your teaching staff
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-4">
          <div className="text-right">
            <div className="text-[18px] font-bold tracking-tight leading-none"
              style={{ color: stats.unread > 0 ? "#FF8899" : "#fff" }}>
              {stats.unread}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-[0.10em] mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>Unread</div>
          </div>
          <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.20)" }} />
          <div className="text-right">
            <div className="text-[18px] font-bold tracking-tight leading-none text-white">{stats.contacted}</div>
            <div className="text-[9px] font-bold uppercase tracking-[0.10em] mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>Teachers</div>
          </div>
          <div className="w-px h-8" style={{ background: "rgba(255,255,255,0.20)" }} />
          <div className="text-right">
            <div className="text-[18px] font-bold tracking-tight leading-none text-white">{stats.total}</div>
            <div className="text-[9px] font-bold uppercase tracking-[0.10em] mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>Total</div>
          </div>
        </div>
      </div>

      {/* ── Two-column main — fills remaining height like WhatsApp ──────── */}
      <div className="mt-3 grid grid-cols-12 gap-3 flex-1 min-h-0">

        {/* LEFT — list */}
        <div className="col-span-12 lg:col-span-5 xl:col-span-4 flex flex-col gap-2 min-h-0">

          {/* Search */}
          <div className="bg-white rounded-[16px] relative"
            style={{ boxShadow: SH_CARD, border: `0.5px solid ${SEP}` }}>
            <Search size={15} color="rgba(0,85,255,.42)" strokeWidth={2.2}
              className="absolute left-[14px] top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search teachers..."
              className="w-full outline-none"
              style={{
                padding: "12px 14px 12px 42px", background: "transparent",
                borderRadius: 16, fontSize: 13, color: T1, fontWeight: 400, fontFamily: "inherit",
              }}
            />
          </div>

          {/* New note button */}
          <button
            onClick={() => {
              if (filteredTeachers.length === 0) { toast.info("No teachers found."); return; }
              if (!selectedTeacher) setSelectedTeacher(filteredTeachers[0]);
              toast.info("Type your note in the composer on the right.");
            }}
            className="h-[46px] rounded-[14px] flex items-center justify-center gap-2 text-white text-[14px] font-bold"
            style={{
              background: `linear-gradient(135deg, ${B1}, ${B2})`, border: "none",
              boxShadow: "0 6px 22px rgba(0,85,255,.38), 0 2px 5px rgba(0,85,255,.18)",
              cursor: "pointer",
            }}>
            <Plus size={14} strokeWidth={2.5} />
            New Note to Teacher
          </button>

          {/* Section label */}
          <div className="flex items-center gap-2 px-1 pt-1 text-[10px] font-bold uppercase" style={{ color: T4, letterSpacing: "0.10em" }}>
            <span>Teacher Conversations</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: "rgba(0,85,255,.10)", border: "0.5px solid rgba(0,85,255,.16)", color: B1, letterSpacing: "0.04em", textTransform: "none" }}>
              {filteredTeachers.length} teacher{filteredTeachers.length === 1 ? "" : "s"}
            </span>
            <span className="flex-1 h-px" style={{ background: "rgba(0,85,255,.12)" }} />
          </div>

          {/* List card */}
          <div className="bg-white rounded-[18px] overflow-hidden flex-1 flex flex-col min-h-0"
            style={{ boxShadow: SH_CARD, border: `0.5px solid ${SEP}` }}>
            <div className="overflow-y-auto flex-1 min-h-0">
              {teachersLoading ? (
                <div className="flex justify-center py-16"><Loader2 size={24} color={B1} className="animate-spin" /></div>
              ) : filteredTeachers.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2">
                  <User size={36} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
                  <div className="text-[13px] font-bold" style={{ color: T2 }}>No teachers found</div>
                  <div className="text-[11px]" style={{ color: T4 }}>Try a different search.</div>
                </div>
              ) : (
                filteredTeachers.map((t, i) => {
                  const last = lastMessages.get(t.id);
                  const unread = unreadPerTeacher.get(t.id) || 0;
                  const st = subjectStyleD(t.subject || "");
                  const active = selectedTeacher?.id === t.id;
                  const timeLabel = last ? fmtTime(last.timestamp) : "";
                  const preview = last ? (last.from === "principal" ? `✓ ${last.message}` : last.message) : null;
                  return (
                    <button key={t.id}
                      onClick={() => setSelectedTeacher(t)}
                      className="w-full flex items-center gap-3 px-5 py-[14px] text-left transition-colors"
                      style={{
                        borderBottom: i === filteredTeachers.length - 1 ? "none" : `0.5px solid ${SEP}`,
                        background: active ? "rgba(0,85,255,.06)" : unread > 0 ? "rgba(0,85,255,.03)" : "#fff",
                        border: "none",
                      }}>
                      <div className="w-[44px] h-[44px] rounded-[14px] flex items-center justify-center text-white text-[14px] font-bold shrink-0 relative"
                        style={{ background: st.avBg, boxShadow: st.shadow }}>
                        {(t.name || "TC").substring(0, 2).toUpperCase()}
                        {unread > 0 && (
                          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-[9px] text-[10px] font-bold text-white flex items-center justify-center"
                            style={{ background: RED, border: "2px solid #fff", boxShadow: "0 2px 6px rgba(255,51,85,.28)" }}>
                            {unread}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-[3px]">
                          <span className="text-[13px] font-bold truncate" style={{ color: T1, letterSpacing: "-0.2px" }}>{t.name || "Teacher"}</span>
                          {t.subject && (
                            <span className="px-2 py-[2px] rounded-full text-[9px] font-bold shrink-0"
                              style={{ background: st.tagBg, color: st.tagColor, border: `0.5px solid ${st.tagBorder}` }}>
                              {t.subject}
                            </span>
                          )}
                        </div>
                        {preview ? (
                          <div className="text-[12px] truncate"
                            style={{ color: unread > 0 ? T2 : T3, fontWeight: unread > 0 ? 600 : 400 }}>
                            {preview}
                          </div>
                        ) : (
                          <div className="text-[12px] italic" style={{ color: T4 }}>No messages yet</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {last ? (
                          <>
                            <span className="text-[10px] font-semibold" style={{ color: unread > 0 ? B1 : T4 }}>{timeLabel}</span>
                            {unread > 0 ? (
                              <span className="w-2 h-2 rounded-full" style={{ background: B1, boxShadow: "0 0 0 2px rgba(0,85,255,.18)" }} />
                            ) : last.from === "principal" ? (
                              <CheckCheck size={12} color={GREEN} strokeWidth={2.5} />
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[10px] italic" style={{ color: T4 }}>Start chat →</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — chat or empty */}
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 min-h-0">
          <div className="bg-white rounded-[18px] overflow-hidden flex flex-col h-full"
            style={{ boxShadow: SH_CARD, border: `0.5px solid ${SEP}` }}>
            {!selectedTeacher ? (
              <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center">
                <div className="w-20 h-20 rounded-[22px] flex items-center justify-center mb-5"
                  style={{ background: "rgba(0,85,255,.10)", border: "0.5px solid rgba(0,85,255,.20)" }}>
                  <MessageSquare size={36} color="rgba(0,85,255,.45)" strokeWidth={1.8} />
                </div>
                <h3 className="text-[18px] font-bold mb-2" style={{ color: T1 }}>Teacher Notes</h3>
                <p className="text-[13px] max-w-[360px] leading-[1.55]" style={{ color: T3 }}>
                  Select a teacher from the left to start a conversation, share feedback or follow up on pending tasks.
                </p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="px-6 py-4 flex items-center gap-3 relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg,#0033CC 0%,#0055FF 50%,#2277FF 100%)", flexShrink: 0 }}>
                  <div className="absolute -right-4 -top-6 w-[130px] h-[130px] rounded-full pointer-events-none"
                    style={{ background: "radial-gradient(circle, rgba(255,255,255,.14) 0%, transparent 65%)" }} />
                  <div className="w-[44px] h-[44px] rounded-[14px] flex items-center justify-center text-white text-[15px] font-bold shrink-0 relative z-10"
                    style={{ background: subjectStyleD(selectedTeacher.subject || "").avBg, border: "2px solid rgba(255,255,255,.26)" }}>
                    {(selectedTeacher.name || "TC").substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 relative z-10">
                    <div className="text-[16px] font-bold text-white truncate" style={{ letterSpacing: "-0.3px" }}>
                      {selectedTeacher.name || "Teacher"}
                    </div>
                    <div className="text-[11px] font-medium flex items-center gap-1.5 mt-0.5" style={{ color: "rgba(255,255,255,.65)" }}>
                      <span className="w-[6px] h-[6px] rounded-full" style={{ background: "#00EE88" }} />
                      {selectedTeacher.subject || "Teacher"}{selectedTeacher.assignedClass ? ` · ${selectedTeacher.assignedClass}` : ""} · Active
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative z-10 shrink-0">
                    <button
                      onClick={() => {
                        const phone = selectedTeacher.phone || selectedTeacher.mobile || "";
                        if (phone) window.location.href = `tel:${phone}`;
                        else toast.info(`${selectedTeacher.name || "Teacher"}'s phone number is not saved.`);
                      }}
                      className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,.18)", border: "0.5px solid rgba(255,255,255,.26)", cursor: "pointer" }}
                      aria-label="Call">
                      <Phone size={14} color="rgba(255,255,255,.92)" strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => toast.info(`${selectedTeacher.name || "Teacher"} · ${teacherMessages.length} message${teacherMessages.length === 1 ? "" : "s"}`)}
                      className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,.18)", border: "0.5px solid rgba(255,255,255,.26)", cursor: "pointer" }}
                      aria-label="More">
                      <MoreVertical size={14} color="rgba(255,255,255,.92)" strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3" style={{ background: "#EEF4FF", minHeight: 0 }}>
                  {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <Loader2 size={28} color={B1} className="animate-spin" />
                    </div>
                  ) : teacherMessages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
                      <div className="w-[60px] h-[60px] rounded-[18px] flex items-center justify-center mb-2"
                        style={{ background: "#fff", boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)" }}>
                        <MessageSquare size={28} color="rgba(0,85,255,.35)" strokeWidth={1.8} />
                      </div>
                      <p className="text-[14px] font-bold" style={{ color: T1 }}>No messages yet</p>
                      <p className="text-[12px]" style={{ color: T4 }}>Type below to start the conversation.</p>
                    </div>
                  ) : (
                    groupedMessages.map(group => (
                      <div key={group.date}>
                        <div className="flex justify-center mb-3">
                          <span className="px-3 py-1 rounded-full text-[10px] font-semibold"
                            style={{ background: "rgba(0,85,255,.08)", border: "0.5px solid rgba(0,85,255,.14)", color: T3 }}>
                            {group.date}
                          </span>
                        </div>
                        {group.messages.map(n => {
                          const isSent = n.from === "principal";
                          if (isSent) {
                            return (
                              <div key={n.id} className="flex justify-end mb-2">
                                <div className="max-w-[70%]">
                                  <div className="px-4 py-3 text-white text-[13px] leading-[1.65] whitespace-pre-wrap relative overflow-hidden"
                                    style={{
                                      background: `linear-gradient(135deg, ${B1}, ${B2})`,
                                      borderRadius: "18px 4px 18px 18px",
                                      boxShadow: "0 3px 12px rgba(0,85,255,.24)",
                                    }}>
                                    {n.message}
                                  </div>
                                  <div className="text-[10px] font-semibold flex items-center gap-1 justify-end mt-1" style={{ color: T4 }}>
                                    {fmtTime(n.timestamp)}
                                    <CheckCheck size={12} color={GREEN} strokeWidth={2.5} />
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={n.id} className="flex items-start gap-2 max-w-[70%] mb-2">
                              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-white text-[11px] font-bold shrink-0 self-end"
                                style={{ background: subjectStyleD(selectedTeacher.subject || "").avBg }}>
                                {(selectedTeacher.name || "T").substring(0, 1).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="px-4 py-3 text-[13px] leading-[1.65] whitespace-pre-wrap"
                                  style={{
                                    background: "#fff", color: T1,
                                    borderRadius: "4px 18px 18px 18px",
                                    boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                                    border: "0.5px solid rgba(0,85,255,.10)",
                                  }}>
                                  <div className="text-[11px] font-bold mb-1" style={{ color: B1 }}>
                                    {selectedTeacher.name || "Teacher"}
                                  </div>
                                  {n.message}
                                </div>
                                <div className="text-[10px] font-semibold flex items-center gap-1 justify-end mt-1" style={{ color: T4 }}>
                                  {fmtTime(n.timestamp)}
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

                {/* Input */}
                <div className="px-4 py-3 flex items-center gap-2 shrink-0"
                  style={{ background: "rgba(238,244,255,.94)", backdropFilter: "saturate(220%) blur(24px)", WebkitBackdropFilter: "saturate(220%) blur(24px)", borderTop: "0.5px solid rgba(0,85,255,.10)" }}>
                  <button
                    onClick={() => setMessageContent((c) => c + "🙂")}
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ background: "#fff", border: "0.5px solid rgba(0,85,255,.14)", boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)", cursor: "pointer" }}
                    aria-label="Emoji">
                    <Smile size={18} color={T3} strokeWidth={2} />
                  </button>
                  <input
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Write a note to this teacher..."
                    className="flex-1 outline-none"
                    style={{
                      padding: "10px 14px", background: "#fff", borderRadius: 14,
                      border: "0.5px solid rgba(0,85,255,.14)", fontFamily: "inherit",
                      fontSize: 13, color: T1, fontWeight: 400,
                      boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!messageContent.trim()}
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{
                      background: messageContent.trim() ? `linear-gradient(135deg, ${B1}, ${B2})` : "rgba(0,85,255,.20)",
                      border: "none",
                      boxShadow: messageContent.trim() ? "0 3px 12px rgba(0,85,255,.30)" : "none",
                      cursor: messageContent.trim() ? "pointer" : "not-allowed",
                      opacity: messageContent.trim() ? 1 : 0.65,
                    }}
                    aria-label="Send">
                    <Send size={14} color="#fff" strokeWidth={2.5} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default TeacherNotes;

import { useState, useEffect } from "react";
import { BarChart2, CalendarCheck, Star, Users, Search, List, Plus } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import TeacherProfile from "@/components/TeacherProfile";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot } from "firebase/firestore";
import { sendEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, GraduationCap } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";

const Teachers = () => {
  const { userData } = useAuth();
  const [teachersData, setTeachersData] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [teacherToAssign, setTeacherToAssign] = useState<any | null>(null);
  const [assignedGrade, setAssignedGrade] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    subject: ""
  });

  useEffect(() => {
    if (!userData?.schoolId) return;

    const q = query(
      collection(db, "teachers"), 
      where("schoolId", "==", userData.schoolId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const colors = ["bg-primary", "bg-edu-green", "bg-edu-orange", "bg-edu-blue", "bg-edu-purple"];
      const teachers = snapshot.docs.map((doc, index) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          initials: data.name ? data.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : "T",
          color: colors[index % colors.length],
          classes: data.classes || "N/A",
          experience: data.experience || "N/A",
          rating: data.rating || "5.0",
          status: data.status || "Active"
        };
      });
      setTeachersData(teachers);
    }, (error) => {
      console.error("Error fetching teachers:", error);
      toast.error("Failed to load teachers data");
    });

    return () => unsubscribe();
  }, [userData?.schoolId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.name) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSending(true);
    try {
      // 1. Save to Firestore Whitelist for Teachers
      await addDoc(collection(db, "teachers"), {
        ...inviteForm,
        email: inviteForm.email.toLowerCase(),
        schoolId: userData?.schoolId,
        schoolName: userData?.schoolName,
        branch: userData?.branch,
        status: 'Invited',
        role: 'teacher',
        createdAt: serverTimestamp()
      });

      // 2. Send Email via Resend
      const dashboardUrl = "https://teacher-dashboard-ochre.vercel.app";
      await sendEmail({
        to: inviteForm.email,
        subject: `Invitation to join ${userData?.schoolName} as a Teacher`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
            <h2 style="color: #1e3a8a;">Welcome to EduIntellect</h2>
            <p>Hello <strong>${inviteForm.name}</strong>,</p>
            <p>You have been invited by the Principal of <strong>${userData?.schoolName} (${userData?.branch})</strong> to join as a Teacher.</p>
            <p>Please use the link below to access your dashboard using your Google account (${inviteForm.email}):</p>
            <div style="margin: 30px 0;">
              <a href="${dashboardUrl}" style="background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Access Teacher Dashboard</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">If you have any questions, please contact your school administration.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="font-size: 12px; color: #94a3b8;">This invitation was sent from the EduIntellect Management Platform.</p>
          </div>
        `
      });

      toast.success("Invitation sent successfully!");
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", subject: "" });
    } catch (error: any) {
      console.error("Invite Error:", error);
      toast.error(error.message || "Failed to send invitation");
    } finally {
      setIsSending(false);
    }
  };

  const handleAssignGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherToAssign || !assignedGrade) return;

    setIsSending(true);
    try {
      const teacherDocRef = doc(db, "teachers", teacherToAssign.id);
      await updateDoc(teacherDocRef, {
        classes: assignedGrade
      });
      toast.success(`Assigned ${assignedGrade} to ${teacherToAssign.name}`);
      setIsAssignOpen(false);
      setTeacherToAssign(null);
      setAssignedGrade("");
    } catch (error: any) {
      console.error("Assign Error:", error);
      toast.error("Failed to assign grade");
    } finally {
      setIsSending(false);
    }
  };

  if (selectedTeacher) {
    return <TeacherProfile teacher={selectedTeacher} onBack={() => setSelectedTeacher(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Teachers</h1>
        <p className="text-sm text-muted-foreground">Manage teaching staff and monitor performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Avg Class Performance" value="68.4%" subtitle="↑ 2.1% vs last term" subtitleColor="success" icon={BarChart2} iconColor="text-primary" />
        <StatCard title="Teacher Attendance" value="94.2%" subtitle="Excellent" subtitleColor="success" icon={CalendarCheck} iconColor="text-primary" />
        <StatCard title="Parent Feedback" value="4.3/5" subtitle="Based on 324 reviews" subtitleColor="muted" icon={Star} iconColor="text-warning" />
        <StatCard title="Active Teachers" value="42/45" subtitle="3 on leave" subtitleColor="destructive" icon={Users} iconColor="text-primary" />
      </div>

      <div className="flex items-center justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Search teachers..." />
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg bg-card hover:bg-secondary font-bold text-slate-600 transition-colors">
            <List className="w-4 h-4" /> List View
          </button>
          <button 
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#1e3a8a] text-white hover:opacity-90 font-bold transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add Teacher
          </button>
        </div>
      </div>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e294b]">Invite Teacher</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Send an invitation to join {userData?.schoolName}. They will login using Google.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-slate-500">Full Name</Label>
              <Input 
                id="name" 
                placeholder="e.g. Mrs. Kavita" 
                className="rounded-xl border-slate-200"
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-500">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="teacher@gmail.com" 
                className="rounded-xl border-slate-200"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject" className="text-xs font-bold uppercase tracking-wider text-slate-500">Primary Subject</Label>
              <Input 
                id="subject" 
                placeholder="e.g. Mathematics" 
                className="rounded-xl border-slate-200"
                value={inviteForm.subject}
                onChange={(e) => setInviteForm({ ...inviteForm, subject: e.target.value })}
              />
            </div>
            <DialogFooter className="pt-4">
              <button 
                type="submit" 
                disabled={isSending}
                className="w-full h-12 rounded-xl bg-[#1e3a8a] text-white font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Invitation"
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e294b]">Assign Grade / Class</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Assign a specific grade to {teacherToAssign?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignGrade} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="grade" className="text-xs font-bold uppercase tracking-wider text-slate-500">Select Grade</Label>
              <select 
                id="grade"
                value={assignedGrade}
                onChange={(e) => setAssignedGrade(e.target.value)}
                className="w-full h-11 rounded-xl border-slate-200 bg-white border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              >
                <option value="">Select a Grade</option>
                <option value="Grade 1">Grade 1</option>
                <option value="Grade 2">Grade 2</option>
                <option value="Grade 3">Grade 3</option>
                <option value="Grade 4">Grade 4</option>
                <option value="Grade 5">Grade 5</option>
                <option value="Grade 6">Grade 6</option>
                <option value="Grade 7">Grade 7</option>
                <option value="Grade 8">Grade 8</option>
                <option value="Grade 9">Grade 9</option>
                <option value="Grade 10">Grade 10</option>
                <option value="Grade 11">Grade 11</option>
                <option value="Grade 12">Grade 12</option>
              </select>
            </div>
            <DialogFooter className="pt-4">
              <button 
                type="submit" 
                disabled={isSending}
                className="w-full h-12 rounded-xl bg-[#1e3a8a] text-white font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
                {isSending ? "Assigning..." : "Confirm Assignment"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {teachersData.length > 0 ? (
          teachersData.map((t) => (
            <div 
              key={t.initials} 
              className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group"
              onClick={() => setSelectedTeacher(t)}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-2xl ${t.color} flex items-center justify-center text-lg font-bold text-white shadow-sm ring-4 ring-white`}>{t.initials}</div>
                <div>
                  <p className="font-bold text-[#1e293b] text-base group-hover:text-[#1e3a8a] transition-colors">{t.name}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wide">{t.subject}</p>
                </div>
              </div>
              <div className="space-y-3 pt-4 border-t border-slate-50 italic">
                <div className="flex justify-between items-center"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Classes</span><span className="text-sm font-bold text-[#475569]">{t.classes}</span></div>
                <div className="flex justify-between items-center"><span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Experience</span><span className="text-sm font-bold text-[#475569]">{t.experience}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Rating</span>
                  <span className="flex items-center gap-1 font-bold text-warning">
                    <Star className="w-3.5 h-3.5 fill-warning" /> {t.rating}
                  </span>
                </div>
              </div>
              <div className="mt-6 flex justify-between items-center">
                <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${t.status === "Active" ? "bg-green-50 text-green-500 border border-green-100" : "bg-red-50 text-red-500 border border-red-100"}`}>
                  {t.status}
                </span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setTeacherToAssign(t);
                    setAssignedGrade(t.classes === "N/A" ? "" : t.classes);
                    setIsAssignOpen(true);
                  }}
                  className="text-[10px] font-black text-[#1e3a8a] uppercase tracking-tighter hover:underline flex items-center gap-1"
                >
                  <GraduationCap className="w-3 h-3" /> Assign Grade
                </button>
                <button className="text-[10px] font-black text-slate-400 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">View Profile →</button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-slate-200">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No teachers found</h3>
            <p className="text-sm text-slate-500 max-w-xs text-center mt-1">
              Start by inviting your teachers to the platform.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Teachers;


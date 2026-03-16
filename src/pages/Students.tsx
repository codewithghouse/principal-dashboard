import { useState, useEffect } from "react";
import { Search, Download, Plus } from "lucide-react";
import StudentProfile from "@/components/StudentProfile";
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
import { Loader2 } from "lucide-react";

const statusColor = (s: string) => {
  if (s === "Excellent") return "text-success font-medium";
  if (s === "At Risk") return "text-destructive font-medium";
  if (s === "Average") return "text-warning font-medium";
  return "text-foreground";
};

const Students = () => {
  const { userData } = useAuth();
  const [studentsData, setStudentsData] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    grade: "",
    rollNo: ""
  });

  useEffect(() => {
    if (!userData?.schoolId) return;

    const q = query(
      collection(db, "students"), 
      where("schoolId", "==", userData.schoolId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const students = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          initials: data.name ? data.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : "S",
          gender: data.gender || "Not Specified",
          contact: data.contact || data.parentEmail || data.email,
          attendance: data.attendance || "0%",
          status: data.status || "Enrolled",
          risk: data.risk || false
        };
      });
      setStudentsData(students);
    }, (error) => {
      console.error("Error fetching students:", error);
      toast.error("Failed to load students data");
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
      // 1. Save to Firestore Whitelist for Students
      await addDoc(collection(db, "students"), {
        ...inviteForm,
        email: inviteForm.email.toLowerCase(),
        schoolId: userData?.schoolId,
        schoolName: userData?.schoolName,
        branch: userData?.branch,
        status: 'Invited',
        role: 'student',
        createdAt: serverTimestamp()
      });

      // 2. Send Email via Resend
      const dashboardUrl = "https://parent-dashboard-ten.vercel.app";
      await sendEmail({
        to: inviteForm.email,
        subject: `Welcome to ${userData?.schoolName} - Student Invitation`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h2 style="color: #1e3a8a;">Welcome to EduIntellect</h2>
            <p>Hello <strong>${inviteForm.name}</strong>,</p>
            <p>You have been enrolled as a student at <strong>${userData?.schoolName} (${userData?.branch})</strong>.</p>
            <p>Please use your Google account (${inviteForm.email}) to access your student portal and view your classes, attendance, and grades.</p>
            <div style="margin: 30px 0;">
              <a href="${dashboardUrl}" style="background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Access Student Portal</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">Academic Details:</p>
            <ul style="color: #64748b; font-size: 14px;">
              <li>Grade: ${inviteForm.grade}</li>
              <li>Roll No: ${inviteForm.rollNo}</li>
            </ul>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="font-size: 12px; color: #94a3b8;">This invitation was sent from the EduIntellect Management Platform.</p>
          </div>
        `
      });

      toast.success("Student invitation sent!");
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", grade: "", rollNo: "" });
    } catch (error: any) {
      console.error("Invite Error:", error);
      toast.error(error.message || "Failed to send invitation");
    } finally {
      setIsSending(false);
    }
  };

  if (selectedStudent) {
    return <StudentProfile student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Students</h1>
        <p className="text-sm text-muted-foreground">Manage and view all student records</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Search students..." />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg bg-card hover:bg-secondary transition-colors font-medium">
            <Download className="w-4 h-4" /> Export
          </button>
          <button 
            onClick={() => setIsInviteOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 font-medium transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1e294b]">Add New Student</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Invite a student to your branch. They will use their Google account to login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="sname" className="text-xs font-bold uppercase tracking-wider text-slate-500">Student Name</Label>
                <Input 
                  id="sname" 
                  placeholder="e.g. Aarav Reddy" 
                  className="rounded-xl"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="semail" className="text-xs font-bold uppercase tracking-wider text-slate-500">Google Email</Label>
                <Input 
                  id="semail" 
                  type="email" 
                  placeholder="student@gmail.com" 
                  className="rounded-xl"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade" className="text-xs font-bold uppercase tracking-wider text-slate-500">Grade / Section</Label>
                <Input 
                  id="grade" 
                  placeholder="10A" 
                  className="rounded-xl"
                  value={inviteForm.grade}
                  onChange={(e) => setInviteForm({ ...inviteForm, grade: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roll" className="text-xs font-bold uppercase tracking-wider text-slate-500">Roll Number</Label>
                <Input 
                  id="roll" 
                  placeholder="101" 
                  className="rounded-xl"
                  value={inviteForm.rollNo}
                  onChange={(e) => setInviteForm({ ...inviteForm, rollNo: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <button 
                type="submit" 
                disabled={isSending}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending Invite...
                  </>
                ) : (
                  "Enrol Student"
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Student</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Roll No</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Grade-Section</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Parent Contact</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Attendance</th>
                <th className="text-left px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Academic Status</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Risk</th>
                <th className="text-center px-6 py-4 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-slate-700">
              {studentsData.length > 0 ? (
                studentsData.map((s) => (
                  <tr key={s.rollNo} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-[10px] font-bold text-white shadow-sm">{s.initials}</div>
                        <div>
                          <p className="font-bold text-foreground leading-tight">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase">{s.gender}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium">{s.rollNo}</td>
                    <td className="px-6 py-4 font-medium">{s.grade}</td>
                    <td className="px-6 py-4 text-muted-foreground font-medium">{s.contact}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-primary">{s.attendance}</span>
                    </td>
                    <td className={`px-6 py-4 ${statusColor(s.status)} text-xs font-bold`}>
                      <span className={`px-2 py-1 rounded-full bg-muted/50`}>{s.status}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {s.risk && <div className="w-2 h-2 mx-auto rounded-full bg-destructive animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => setSelectedStudent(s)}
                        className="text-primary text-xs font-bold hover:underline uppercase tracking-wider"
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center opacity-40">
                      <Plus className="w-12 h-12 mb-4 text-slate-300" />
                      <p className="text-lg font-bold text-slate-900">No students found</p>
                      <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-widest">Awaiting Enrollment</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-border text-sm text-muted-foreground font-medium">
          <span>Showing 1-{studentsData.length} of {studentsData.length} students</span>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">Previous</button>
            <div className="flex items-center gap-1">
              <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-white font-bold shadow-sm">1</button>
              <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary font-bold">2</button>
              <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary font-bold">3</button>
            </div>
            <button className="px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Students;


import { useState, useEffect, useRef } from "react";
import {
  School, Upload, Calendar, User, Bell, Shield,
  Database, Save, Loader2, Plus, Trash2, BookOpen,
  Mail, Phone, Globe, MapPin, CheckCircle2, AlertTriangle,
  Users, Lock, Download, RefreshCw, Eye, EyeOff, X
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, updateDoc, collection, query,
  where, getDocs, addDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import MigrationEngine from "@/components/MigrationEngine";

/* ════════════════════════════════════════════
   Toggle Switch
════════════════════════════════════════════ */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${
        checked ? "bg-green-500" : "bg-slate-300"
      }`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
        checked ? "translate-x-7" : "translate-x-1"
      }`} />
    </button>
  );
}

/* ════════════════════════════════════════════
   Field component
════════════════════════════════════════════ */
function Field({
  label, value, onChange, type = "text", placeholder = "", icon: Icon
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; icon?: any;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground block">{label}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border border-border rounded-xl py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-[#1e3a8a]/10 transition-colors ${
            Icon ? "pl-10 pr-4" : "px-4"
          }`}
        />
      </div>
    </div>
  );
}

const TABS = [
  { id: "profile",       label: "School Profile" },
  { id: "academic",      label: "Academic Settings" },
  { id: "notifications", label: "Notifications" },
  { id: "users",         label: "Users & Permissions" },
  { id: "data",          label: "Data Management" },
];

/* ════════════════════════════════════════════
   MAIN SETTINGS PAGE
════════════════════════════════════════════ */
const SettingsPage = () => {
  const { user, userData } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const schoolId = userData?.schoolId;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure school and system settings</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-[#1e3a8a] text-[#1e3a8a]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "profile"       && <SchoolProfileTab schoolId={schoolId} userData={userData} user={user} />}
      {activeTab === "academic"      && <AcademicSettingsTab schoolId={schoolId} />}
      {activeTab === "notifications" && <NotificationsTab schoolId={schoolId} />}
      {activeTab === "users"         && <UsersPermissionsTab schoolId={schoolId} userData={userData} />}
      {activeTab === "data"          && <DataManagementTab />}
    </div>
  );
};

/* ════════════════════════════════════════════
   TAB 1 — School Profile
════════════════════════════════════════════ */
function SchoolProfileTab({ schoolId, userData, user }: any) {
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({
    schoolName:     "",
    address:        "",
    phone:          "",
    email:          "",
    website:        "",
    principalName:  "",
    principalEmail: "",
    principalPhone: "",
    academicStart:  "",
    academicEnd:    "",
    currentSession: "",
    emailNotifications: true,
    smsAlerts:          true,
    autoBackup:         true,
  });

  const set = (k: string) => (v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, "schools", schoolId)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setForm(f => ({
          ...f,
          schoolName:     d.name          || userData?.schoolName || "",
          address:        d.address        || "",
          phone:          d.phone          || "",
          email:          d.email          || "",
          website:        d.website        || "",
          principalName:  d.principalName  || userData?.name || user?.displayName || "",
          principalEmail: d.principalEmail || userData?.email || user?.email || "",
          principalPhone: d.principalPhone || "",
          academicStart:  d.academicYear?.startDate  || "",
          academicEnd:    d.academicYear?.endDate    || "",
          currentSession: d.academicYear?.currentSession || "",
          emailNotifications: d.prefs?.emailNotifications ?? true,
          smsAlerts:          d.prefs?.smsAlerts          ?? true,
          autoBackup:         d.prefs?.autoBackup         ?? true,
        }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId]);

  const handleSave = async () => {
    if (!schoolId) return toast.error("No School ID found.");
    setSaving(true);
    try {
      await updateDoc(doc(db, "schools", schoolId), {
        name:           form.schoolName,
        address:        form.address,
        phone:          form.phone,
        email:          form.email,
        website:        form.website,
        principalName:  form.principalName,
        principalEmail: form.principalEmail,
        principalPhone: form.principalPhone,
        academicYear: {
          startDate:      form.academicStart,
          endDate:        form.academicEnd,
          currentSession: form.currentSession,
        },
        prefs: {
          emailNotifications: form.emailNotifications,
          smsAlerts:          form.smsAlerts,
          autoBackup:         form.autoBackup,
        },
        updatedAt: serverTimestamp(),
      });
      toast.success("School profile saved!");
    } catch (e: any) {
      toast.error("Save failed: " + e.message);
    }
    setSaving(false);
  };

  const initials = (form.schoolName || "SM").substring(0, 2).toUpperCase();

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left (3 cols) ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* School Information */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <School className="w-4 h-4 text-blue-600" /> School Information
            </h2>
            <div className="space-y-4">
              <Field label="School Name"  value={form.schoolName} onChange={set("schoolName")}  icon={School}  placeholder="Edullent International School" />
              <Field label="Address"      value={form.address}    onChange={set("address")}    icon={MapPin}  placeholder="123 School Road, Hyderabad" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone"   value={form.phone}   onChange={set("phone")}   icon={Phone} type="tel"   placeholder="+91 9000000000" />
                <Field label="Email"   value={form.email}   onChange={set("email")}   icon={Mail}  type="email" placeholder="school@edu.com" />
              </div>
              <Field label="Website" value={form.website} onChange={set("website")} icon={Globe} type="url" placeholder="https://school.edu" />
            </div>
          </div>

          {/* School Logo */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600" /> School Logo
            </h2>
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-[#1e3a8a] flex items-center justify-center text-white text-xl font-black shrink-0">
                {initials}
              </div>
              <div>
                <button className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted/20 transition-colors">
                  <Upload className="w-4 h-4" /> Upload New Logo
                </button>
                <p className="text-xs text-muted-foreground mt-2">Recommended: 200×200px, PNG or JPG</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right (2 cols) ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Academic Year */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-green-600" /> Academic Year
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date" value={form.academicStart} onChange={set("academicStart")} type="date" />
                <Field label="End Date"   value={form.academicEnd}   onChange={set("academicEnd")}   type="date" />
              </div>
              <Field label="Current Session" value={form.currentSession} onChange={set("currentSession")} placeholder="2025–2026" />
            </div>
          </div>

          {/* Principal Information */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <User className="w-4 h-4 text-purple-600" /> Principal Information
            </h2>
            <div className="space-y-4">
              <Field label="Principal Name"  value={form.principalName}  onChange={set("principalName")}  placeholder="Dr. Firstname Lastname" />
              <Field label="Email"           value={form.principalEmail} onChange={set("principalEmail")} type="email" placeholder="principal@school.edu" />
              <Field label="Phone"           value={form.principalPhone} onChange={set("principalPhone")} type="tel"   placeholder="+91 9000000000" />
            </div>
          </div>

          {/* System Preferences */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-500" /> System Preferences
            </h2>
            <div className="space-y-4">
              {[
                { label: "Email Notifications", key: "emailNotifications" },
                { label: "SMS Alerts",          key: "smsAlerts"          },
                { label: "Auto-backup Data",    key: "autoBackup"         },
              ].map(row => (
                <div key={row.key} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{row.label}</span>
                  <Toggle
                    checked={form[row.key as keyof typeof form] as boolean}
                    onChange={v => set(row.key)(v)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1e3a8a] text-white text-sm font-bold rounded-xl hover:bg-[#1e4fc0] transition-colors shadow-sm disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   TAB 2 — Academic Settings
════════════════════════════════════════════ */
function AcademicSettingsTab({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [passThreshold, setPassThreshold] = useState("40");
  const [gradeA, setGradeA] = useState("80");
  const [gradeB, setGradeB] = useState("60");
  const [gradeC, setGradeC] = useState("40");
  const [workingDays, setWorkingDays] = useState("220");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState("");

  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, "schools", schoolId)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        const g = d.grading || {};
        setPassThreshold(String(g.passThreshold ?? 40));
        setGradeA(String(g.gradeA ?? 80));
        setGradeB(String(g.gradeB ?? 60));
        setGradeC(String(g.gradeC ?? 40));
        setWorkingDays(String(g.workingDays ?? 220));
        setSubjects(g.subjects || []);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId]);

  const addSubject = () => {
    const s = newSubject.trim();
    if (!s || subjects.includes(s)) return;
    setSubjects(prev => [...prev, s]);
    setNewSubject("");
  };

  const removeSubject = (s: string) => setSubjects(prev => prev.filter(x => x !== s));

  const handleSave = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "schools", schoolId), {
        "grading.passThreshold": Number(passThreshold),
        "grading.gradeA":        Number(gradeA),
        "grading.gradeB":        Number(gradeB),
        "grading.gradeC":        Number(gradeC),
        "grading.workingDays":   Number(workingDays),
        "grading.subjects":      subjects,
        updatedAt: serverTimestamp(),
      });
      toast.success("Academic settings saved!");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Grading System */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" /> Grading System
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 font-semibold">
              Students scoring below Pass Threshold are marked as "Failed" and appear in At-Risk list.
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Pass Threshold (%)",  val: passThreshold, set: setPassThreshold },
                { label: "Grade A starts at (%)", val: gradeA,       set: setGradeA       },
                { label: "Grade B starts at (%)", val: gradeB,       set: setGradeB       },
                { label: "Grade C starts at (%)", val: gradeC,       set: setGradeC       },
              ].map(row => (
                <div key={row.label} className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">{row.label}</label>
                  <input
                    type="number" min="0" max="100"
                    value={row.val} onChange={e => row.set(e.target.value)}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
                  />
                </div>
              ))}
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-border">
              <p className="text-xs font-bold text-muted-foreground mb-2">Grade Preview</p>
              <div className="flex gap-3 flex-wrap">
                {[
                  { grade: "A", min: gradeA, color: "bg-green-100 text-green-700" },
                  { grade: "B", min: gradeB, color: "bg-blue-100 text-blue-700"   },
                  { grade: "C", min: gradeC, color: "bg-amber-100 text-amber-700" },
                  { grade: "F", min: "0",    color: "bg-red-100 text-red-700"     },
                ].map(g => (
                  <div key={g.grade} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${g.color}`}>
                    {g.grade} ≥ {g.min}%
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Working Days */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-600" /> Calendar Settings
          </h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Total Working Days (per year)</label>
              <input
                type="number" value={workingDays} onChange={e => setWorkingDays(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
              />
            </div>
            <div className="p-4 bg-muted/20 rounded-xl border border-border text-xs text-muted-foreground">
              Attendance percentage is calculated as: <br />
              <span className="font-bold text-foreground">Days Present ÷ {workingDays} × 100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subjects */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-purple-600" /> Subjects
        </h2>
        <div className="flex gap-3 mb-4">
          <input
            value={newSubject} onChange={e => setNewSubject(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addSubject()}
            placeholder="Add subject (e.g. Mathematics)"
            className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-[#1e3a8a]/10"
          />
          <button
            onClick={addSubject}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1e3a8a] text-white text-sm font-bold rounded-xl hover:bg-[#1e4fc0] transition-colors"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {subjects.length === 0 && (
            <p className="text-sm text-muted-foreground">No subjects added yet.</p>
          )}
          {subjects.map(s => (
            <div key={s} className="flex items-center gap-2 px-3 py-1.5 bg-[#1e3a8a]/10 text-[#1e3a8a] text-sm font-semibold rounded-full">
              {s}
              <button onClick={() => removeSubject(s)} className="hover:text-red-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1e3a8a] text-white text-sm font-bold rounded-xl hover:bg-[#1e4fc0] transition-colors shadow-sm disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   TAB 3 — Notifications
════════════════════════════════════════════ */
function NotificationsTab({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [prefs, setPrefs] = useState({
    emailNotifications: true,
    smsAlerts:          true,
    pushNotifications:  false,
    riskAlerts:         true,
    attendanceAlerts:   true,
    disciplineAlerts:   true,
    parentMsgAlerts:    true,
    examAlerts:         true,
    weeklyReport:       false,
  });

  const toggle = (k: string) => setPrefs(p => ({ ...p, [k]: !p[k as keyof typeof p] }));

  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, "schools", schoolId)).then(snap => {
      if (snap.exists() && snap.data().notifPrefs) {
        setPrefs(p => ({ ...p, ...snap.data().notifPrefs }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId]);

  const handleSave = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "schools", schoolId), {
        notifPrefs: prefs,
        updatedAt: serverTimestamp(),
      });
      toast.success("Notification preferences saved!");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" /></div>;

  const CHANNELS = [
    { key: "emailNotifications", label: "Email Notifications",   desc: "Receive alerts via email",          icon: Mail,          color: "text-blue-600"  },
    { key: "smsAlerts",          label: "SMS Alerts",            desc: "Get SMS for urgent events",         icon: Phone,         color: "text-green-600" },
    { key: "pushNotifications",  label: "Push Notifications",    desc: "Browser/app push alerts",           icon: Bell,          color: "text-purple-600"},
  ];

  const ALERT_TYPES = [
    { key: "riskAlerts",       label: "At-Risk Student Alerts",  desc: "When a student enters risk zone",    icon: AlertTriangle, color: "text-red-500"   },
    { key: "attendanceAlerts", label: "Attendance Alerts",       desc: "Attendance drops below threshold",   icon: Calendar,      color: "text-amber-500" },
    { key: "disciplineAlerts", label: "Discipline Alerts",       desc: "New discipline incidents logged",    icon: Shield,        color: "text-orange-500"},
    { key: "parentMsgAlerts",  label: "Parent Messages",         desc: "When a parent sends a message",      icon: Mail,          color: "text-blue-500"  },
    { key: "examAlerts",       label: "Exam & Results Alerts",   desc: "When results are published",         icon: BookOpen,      color: "text-indigo-500"},
    { key: "weeklyReport",     label: "Weekly Summary Report",   desc: "Auto-email every Monday morning",   icon: RefreshCw,     color: "text-slate-500" },
  ];

  return (
    <div className="space-y-6">
      {/* Notification channels */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
          <Bell className="w-4 h-4 text-blue-600" /> Notification Channels
        </h2>
        <div className="space-y-4">
          {CHANNELS.map(c => (
            <div key={c.key} className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center ${c.color}`}>
                  <c.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
              </div>
              <Toggle checked={prefs[c.key as keyof typeof prefs] as boolean} onChange={() => toggle(c.key)} />
            </div>
          ))}
        </div>
      </div>

      {/* Alert types */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> Alert Types
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ALERT_TYPES.map(a => (
            <div key={a.key} className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border">
              <div className="flex items-center gap-3">
                <a.icon className={`w-4 h-4 ${a.color} shrink-0`} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </div>
              </div>
              <Toggle checked={prefs[a.key as keyof typeof prefs] as boolean} onChange={() => toggle(a.key)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1e3a8a] text-white text-sm font-bold rounded-xl hover:bg-[#1e4fc0] transition-colors shadow-sm disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   TAB 4 — Users & Permissions
════════════════════════════════════════════ */
function UsersPermissionsTab({ schoolId, userData }: any) {
  const [loading,    setLoading]    = useState(true);
  const [users,      setUsers]      = useState<any[]>([]);
  const [addOpen,    setAddOpen]    = useState(false);
  const [newName,    setNewName]    = useState("");
  const [newEmail,   setNewEmail]   = useState("");
  const [newRole,    setNewRole]    = useState("teacher");
  const [adding,     setAdding]     = useState(false);

  const ROLE_COLORS: Record<string, string> = {
    principal: "bg-[#1e3a8a]/10 text-[#1e3a8a]",
    admin:     "bg-purple-50 text-purple-700",
    teacher:   "bg-green-50 text-green-700",
    staff:     "bg-amber-50 text-amber-700",
  };

  const branchId = userData?.branchId;

  useEffect(() => {
    if (!schoolId) return;
    const scopeC: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) scopeC.push(where("branchId", "==", branchId));
    Promise.all([
      getDocs(query(collection(db, "principals"), ...scopeC)),
      getDocs(query(collection(db, "teachers"),   ...scopeC)),
    ]).then(([pSnap, tSnap]) => {
      const p = pSnap.docs.map(d => ({ id: d.id, ...d.data(), _col: "principals" }));
      const t = tSnap.docs.map(d => ({ id: d.id, ...d.data(), _col: "teachers"   }));
      const all = [...p, ...t].sort((a: any, b: any) =>
        (a.name || "").localeCompare(b.name || "")
      );
      setUsers(all);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId, branchId]);

  const handleAdd = async () => {
    if (!newName.trim() || !newEmail.trim()) return toast.error("Name and email required.");
    setAdding(true);
    try {
      const colName = newRole === "teacher" ? "teachers" : "principals";
      const docRef = await addDoc(collection(db, colName), {
        name:     newName.trim(),
        email:    newEmail.trim(),
        role:     newRole,
        schoolId,
        branchId: branchId || "",
        status:   "Active",
        createdAt: serverTimestamp(),
      });
      setUsers(prev => [...prev, { id: docRef.id, name: newName, email: newEmail, role: newRole, status: "Active", _col: colName }]);
      setNewName(""); setNewEmail(""); setNewRole("teacher");
      setAddOpen(false);
      toast.success("User added successfully!");
    } catch (e: any) { toast.error(e.message); }
    setAdding(false);
  };

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" /> Users & Permissions
          </h2>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a8a] text-white text-xs font-bold rounded-xl hover:bg-[#1e4fc0] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add User
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#1e3a8a]" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  {["Name", "Email", "Role", "Status", ""].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">No users found.</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1e3a8a]/10 flex items-center justify-center text-[11px] font-bold text-[#1e3a8a] shrink-0">
                          {(u.name || "?").substring(0, 2).toUpperCase()}
                        </div>
                        <p className="text-sm font-semibold text-foreground">{u.name || "—"}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{u.email || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${ROLE_COLORS[u.role] || "bg-muted text-muted-foreground"}`}>
                        {u.role || "staff"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${
                        (u.status || "").toLowerCase() === "active" ? "text-green-600" : "text-amber-500"
                      }`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {u.status || "Active"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-muted-foreground font-semibold">{u._col === "principals" ? "Admin" : "Teacher"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">Add New User</h3>
              <button onClick={() => setAddOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <Field label="Full Name"  value={newName}  onChange={setNewName}  placeholder="Dr. Firstname Lastname" />
              <Field label="Email"      value={newEmail} onChange={setNewEmail} type="email" placeholder="user@school.edu" />
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground block">Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background outline-none">
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                  <option value="principal">Principal</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAddOpen(false)}
                className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold hover:bg-muted/20 transition-colors">
                Cancel
              </button>
              <button onClick={handleAdd} disabled={adding}
                className="flex-1 py-2.5 bg-[#1e3a8a] text-white text-sm font-bold rounded-xl hover:bg-[#1e4fc0] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {adding ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</> : "Add User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   TAB 5 — Data Management
════════════════════════════════════════════ */
function DataManagementTab() {
  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3 text-sm text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="font-semibold">Data operations are permanent and cannot be undone. Proceed with caution.</span>
      </div>
      <MigrationEngine />
    </div>
  );
}

export default SettingsPage;

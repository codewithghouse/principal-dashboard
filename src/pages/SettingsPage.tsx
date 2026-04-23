import { useState, useEffect } from "react";
import {
  School, Upload, Calendar, User, Bell, Shield,
  Database, Save, Loader2, Plus, BookOpen,
  Mail, Phone, Globe, MapPin, CheckCircle2, AlertTriangle,
  Users, RefreshCw, X, Sparkles, Download, ChevronRight,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, updateDoc, collection, query,
  where, getDocs, addDoc, serverTimestamp
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import MigrationEngine from "@/components/MigrationEngine";

const B1 = "#0055FF", B2 = "#1166FF";
const BG = "#EEEEF3";
const T1 = "#001040", T2 = "#002080", T3 = "#5070B0", T4 = "#99AACC";
const SEP = "rgba(0,85,255,0.08)";
const GREEN = "#00C853", GREEN_D = "#007830", GREEN_S = "rgba(0,200,83,0.10)", GREEN_B = "rgba(0,200,83,0.22)";
const RED = "#FF3355", RED_S = "rgba(255,51,85,0.10)", RED_B = "rgba(255,51,85,0.22)";
const ORANGE = "#FF8800", ORANGE_S = "rgba(255,136,0,0.10)", ORANGE_B = "rgba(255,136,0,0.22)";
const GOLD = "#FFAA00";
const VIOLET = "#7B3FF4", VIOLET_S = "rgba(123,63,244,0.10)", VIOLET_B = "rgba(123,63,244,0.22)";
const SH = "0 0 0 0.5px rgba(0,85,255,0.08), 0 2px 10px rgba(0,85,255,0.07), 0 10px 28px rgba(0,85,255,0.09)";
const SH_LG = "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.10), 0 18px 44px rgba(0,85,255,0.12)";
const SH_BTN = "0 6px 22px rgba(0,85,255,0.38), 0 2px 5px rgba(0,85,255,0.18)";

function Toggle({ checked, onChange, tone = "green" }: { checked: boolean; onChange: (v: boolean) => void; tone?: "green" | "violet" | "blue" }) {
  const onColor = tone === "violet" ? VIOLET : tone === "blue" ? B1 : GREEN;
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="relative w-10 h-[23px] rounded-full transition-colors duration-200 focus:outline-none shrink-0"
      style={{ background: checked ? onColor : "#D0DEFF" }}>
      <span className="absolute top-[2px] w-[19px] h-[19px] bg-white rounded-full transition-transform duration-200"
        style={{
          boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
          transform: checked ? "translateX(19px)" : "translateX(2px)",
          transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
        }} />
    </button>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", icon: Icon, small = false }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; icon?: any; small?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.06em] block mb-[5px]" style={{ color: T3 }}>{label}</label>
      <div className="relative flex items-center">
        {Icon && <Icon className="absolute left-[12px] pointer-events-none w-[14px] h-[14px]" style={{ color: "rgba(0,85,255,0.42)" }} strokeWidth={2.3} />}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full rounded-[12px] outline-none transition-colors"
          style={{
            background: BG, border: `0.5px solid rgba(0,85,255,0.12)`, fontFamily: "inherit",
            fontSize: small ? 11 : 12, fontWeight: 500, color: T1,
            padding: Icon ? "11px 12px 11px 36px" : "11px 12px",
          }} />
      </div>
    </div>
  );
}

function SectionCard({ icon: Icon, iconTone = "blue", title, subtitle, children }: {
  icon: any; iconTone?: "blue" | "green" | "violet" | "orange" | "red" | "gold";
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  const tones: Record<string, { bg: string; border: string; color: string }> = {
    blue:   { bg: "rgba(0,85,255,0.10)",  border: "rgba(0,85,255,0.20)",  color: B1 },
    green:  { bg: GREEN_S, border: GREEN_B, color: GREEN },
    violet: { bg: VIOLET_S, border: VIOLET_B, color: VIOLET },
    orange: { bg: ORANGE_S, border: ORANGE_B, color: ORANGE },
    red:    { bg: RED_S, border: RED_B, color: RED },
    gold:   { bg: "rgba(255,170,0,0.10)", border: "rgba(255,170,0,0.22)", color: GOLD },
  };
  const t = tones[iconTone];
  return (
    <div className="bg-white rounded-[22px] overflow-hidden" style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
      <div className="flex items-center gap-[11px] px-4 py-[14px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
        <div className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center shrink-0"
          style={{ background: t.bg, border: `0.5px solid ${t.border}` }}>
          <Icon className="w-4 h-4" style={{ color: t.color }} strokeWidth={2.3} />
        </div>
        <div>
          <div className="text-[14px] font-bold" style={{ color: T1, letterSpacing: "-0.2px" }}>{title}</div>
          {subtitle && <div className="text-[10px] font-medium mt-[2px]" style={{ color: T4 }}>{subtitle}</div>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function SaveBar({ saving, onClick, label = "Save Changes" }: { saving: boolean; onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="w-full h-[50px] rounded-[16px] flex items-center justify-center gap-2 font-bold text-[13px] text-white relative overflow-hidden transition-transform hover:scale-[1.01] disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #001040 0%, #001888 50%, #0033CC 100%)", boxShadow: "0 8px 22px rgba(0,20,80,0.42), 0 2px 5px rgba(0,20,80,0.3)" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 52%)" }} />
      {saving ? <><Loader2 className="w-[14px] h-[14px] animate-spin relative z-10" /><span className="relative z-10">Saving…</span></>
              : <><Save className="w-[14px] h-[14px] relative z-10" strokeWidth={2.3} /><span className="relative z-10">{label}</span></>}
    </button>
  );
}

const TABS: { id: string; label: string; icon: any }[] = [
  { id: "profile",       label: "School Profile",    icon: School },
  { id: "academic",      label: "Academic",          icon: BookOpen },
  { id: "notifications", label: "Notifications",     icon: Bell },
  { id: "users",         label: "Users",             icon: Users },
  { id: "data",          label: "Data",              icon: Database },
];

const SettingsPage = () => {
  const { user, userData } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("profile");
  const schoolId = userData?.schoolId;
  const activeMeta = TABS.find(t => t.id === activeTab);

  return (
    <div className={`${isMobile ? "-mx-3 -mt-3" : "max-w-[1400px] mx-auto px-2"} pb-10 animate-in fade-in duration-500`}
      style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: isMobile ? BG : undefined, minHeight: isMobile ? "100vh" : undefined }}>

      <div className={`flex items-center justify-between gap-4 ${isMobile ? "px-5 pt-4 pb-2" : "pt-2 pb-5"} flex-wrap`}>
        <div className="flex items-center gap-4">
          <div className={`${isMobile ? "w-[30px] h-[30px] rounded-[10px]" : "w-12 h-12 rounded-[14px]"} flex items-center justify-center shrink-0`}
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: isMobile ? "0 4px 12px rgba(0,85,255,0.32)" : "0 6px 18px rgba(0,85,255,0.28)" }}>
            {activeMeta ? <activeMeta.icon className={`${isMobile ? "w-4 h-4" : "w-[22px] h-[22px]"} text-white`} strokeWidth={2.4} /> : null}
          </div>
          <div>
            <div className={`${isMobile ? "text-[22px]" : "text-[24px]"} font-bold leading-none`} style={{ color: T1, letterSpacing: "-0.6px" }}>Settings</div>
            <div className={`${isMobile ? "text-[11px]" : "text-[12px]"} mt-1`} style={{ color: T3 }}>Configure school and system settings</div>
          </div>
        </div>
        {!isMobile && (
          <div className="flex items-center gap-[6px] px-[13px] py-[8px] rounded-[12px] bg-white"
            style={{ border: `0.5px solid rgba(0,85,255,0.14)`, boxShadow: SH }}>
            <Shield className="w-[13px] h-[13px]" style={{ color: B1 }} strokeWidth={2.4} />
            <span className="text-[11px] font-bold" style={{ color: B1 }}>Admin Access</span>
          </div>
        )}
      </div>

      <div className={`${isMobile ? "overflow-x-auto mt-3 [&::-webkit-scrollbar]:hidden" : ""}`} style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <div className={`flex gap-[7px] ${isMobile ? "px-5 pb-1" : "flex-wrap"}`}>
          {TABS.map(t => {
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`${isMobile ? "h-9" : "h-11"} px-4 rounded-full flex items-center gap-[6px] ${isMobile ? "text-[11px]" : "text-[12px]"} font-bold whitespace-nowrap transition-transform hover:scale-[1.02] shrink-0`}
                style={{
                  background: active ? `linear-gradient(135deg, ${B1}, ${B2})` : "#FFFFFF",
                  color: active ? "#fff" : T3,
                  border: active ? "0.5px solid transparent" : `0.5px solid ${SEP}`,
                  boxShadow: active ? "0 4px 14px rgba(0,85,255,0.36)" : SH,
                }}>
                <t.icon className={`${isMobile ? "w-[12px] h-[12px]" : "w-[14px] h-[14px]"}`} strokeWidth={2.3} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${isMobile ? "" : "mt-5"}`}>
        {activeTab === "profile"       && <SchoolProfileTab isMobile={isMobile} schoolId={schoolId} userData={userData} user={user} />}
        {activeTab === "academic"      && <AcademicSettingsTab isMobile={isMobile} schoolId={schoolId} />}
        {activeTab === "notifications" && <NotificationsTab isMobile={isMobile} schoolId={schoolId} />}
        {activeTab === "users"         && <UsersPermissionsTab isMobile={isMobile} schoolId={schoolId} userData={userData} />}
        {activeTab === "data"          && <DataManagementTab isMobile={isMobile} />}
      </div>
    </div>
  );
};

function SchoolProfileTab({ isMobile, schoolId, userData, user }: any) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    schoolName: "", address: "", phone: "", email: "", website: "",
    principalName: "", principalEmail: "", principalPhone: "",
    academicStart: "", academicEnd: "", currentSession: "",
    emailNotifications: true, smsAlerts: true, autoBackup: true,
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
        name: form.schoolName, address: form.address, phone: form.phone,
        email: form.email, website: form.website,
        principalName: form.principalName, principalEmail: form.principalEmail, principalPhone: form.principalPhone,
        academicYear: { startDate: form.academicStart, endDate: form.academicEnd, currentSession: form.currentSession },
        prefs: { emailNotifications: form.emailNotifications, smsAlerts: form.smsAlerts, autoBackup: form.autoBackup },
        updatedAt: serverTimestamp(),
      });
      toast.success("School profile saved!");
    } catch (e: any) {
      toast.error("Save failed: " + e.message);
    }
    setSaving(false);
  };

  const initials = (form.schoolName || "SM").substring(0, 2).toUpperCase();
  const filledFields = [form.schoolName, form.address, form.phone, form.email, form.principalName].filter(Boolean).length;
  const missingFields = [form.website, form.academicStart, form.principalPhone].filter(v => !v).length;
  const prefsOn = [form.emailNotifications, form.smsAlerts, form.autoBackup].filter(Boolean).length;
  const profileCompletePct = Math.round((filledFields / 5) * 100);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} /></div>;

  return (
    <div className={isMobile ? "px-5" : ""}>
      <div className={`${isMobile ? "mt-[14px] px-[18px] py-4" : "px-7 py-6"} rounded-[22px] relative overflow-hidden text-white`}
        style={{ background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)", boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)" }}>
        <div className="absolute -top-9 -right-6 w-[150px] h-[150px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between mb-[14px] relative z-10 flex-wrap gap-2">
          <div className="flex items-center gap-[10px] min-w-0">
            <div className={`${isMobile ? "w-9 h-9" : "w-14 h-14"} rounded-[12px] flex items-center justify-center shrink-0`}
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
              <School className={`${isMobile ? "w-[18px] h-[18px]" : "w-7 h-7"} text-white`} strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px]" style={{ color: "rgba(255,255,255,0.50)" }}>School Profile</div>
              <div className={`${isMobile ? "text-[22px]" : "text-[40px]"} font-bold leading-none truncate`} style={{ letterSpacing: "-0.6px" }}>{form.schoolName || "Untitled"}</div>
            </div>
          </div>
          <span className="flex items-center gap-[5px] px-3 py-[5px] rounded-full text-[11px] font-bold"
            style={{ background: "rgba(0,200,83,0.22)", border: "0.5px solid rgba(0,200,83,0.40)", color: "#66EE88" }}>
            <CheckCircle2 className="w-[11px] h-[11px]" strokeWidth={2.8} />
            {profileCompletePct}% Complete
          </span>
        </div>
        <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
          {[
            { val: filledFields, lbl: "Fields Set", color: "#fff" },
            { val: missingFields, lbl: "Missing", color: "#FFCC44" },
            { val: `${prefsOn}/3`, lbl: "Prefs On", color: "#66EE88" },
          ].map(x => (
            <div key={x.lbl} className="text-center py-[11px]" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="text-[17px] font-bold leading-none mb-[3px]" style={{ color: x.color, letterSpacing: "-0.3px" }}>{x.val}</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.40)" }}>{x.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${isMobile ? "mt-3" : "mt-5"} grid grid-cols-1 ${isMobile ? "" : "lg:grid-cols-2"} gap-4`}>
        <SectionCard icon={School} iconTone="blue" title="School Information" subtitle="Primary school details & contact">
          <div className="flex flex-col gap-3">
            <Field label="School Name" value={form.schoolName} onChange={set("schoolName") as any} icon={School} placeholder="Edullent" />
            <Field label="Address" value={form.address} onChange={set("address") as any} icon={MapPin} placeholder="123 School Road" />
            <div className="grid grid-cols-2 gap-[10px]">
              <Field label="Phone" value={form.phone} onChange={set("phone") as any} icon={Phone} type="tel" placeholder="+91 90000" />
              <Field label="Email" value={form.email} onChange={set("email") as any} icon={Mail} type="email" placeholder="school@edu" small />
            </div>
            <Field label="Website" value={form.website} onChange={set("website") as any} icon={Globe} type="url" placeholder="https://school.edu" />
          </div>
        </SectionCard>

        <SectionCard icon={Calendar} iconTone="green" title="Academic Year" subtitle="Session dates & calendar">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-[10px]">
              <Field label="Start Date" value={form.academicStart} onChange={set("academicStart") as any} type="date" />
              <Field label="End Date" value={form.academicEnd} onChange={set("academicEnd") as any} type="date" />
            </div>
            <div className="p-[10px] px-3 rounded-[12px]" style={{ background: "rgba(0,85,255,0.05)", border: "0.5px solid rgba(0,85,255,0.12)" }}>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-[3px]" style={{ color: T3 }}>Current Session</div>
              <input value={form.currentSession} onChange={e => set("currentSession")(e.target.value)} placeholder="2025 – 2026"
                className="w-full bg-transparent text-[13px] font-bold outline-none" style={{ color: T1 }} />
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={User} iconTone="violet" title="Principal Information" subtitle="Head of institution contact">
          <div className="flex flex-col gap-3">
            <Field label="Principal Name" value={form.principalName} onChange={set("principalName") as any} icon={User} placeholder="Dr. Firstname Lastname" />
            <Field label="Email" value={form.principalEmail} onChange={set("principalEmail") as any} icon={Mail} type="email" placeholder="principal@school.edu" />
            <Field label="Phone" value={form.principalPhone} onChange={set("principalPhone") as any} icon={Phone} type="tel" placeholder="+91 90000" />
          </div>
        </SectionCard>

        <SectionCard icon={Upload} iconTone="blue" title="School Logo" subtitle="Brand asset for reports & UI">
          <div className="flex items-center gap-3 p-3 rounded-[14px]" style={{ background: BG, border: `0.5px solid ${SEP}` }}>
            <div className="w-14 h-14 rounded-[14px] flex items-center justify-center text-[17px] font-bold text-white shrink-0"
              style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.24)" }}>
              {initials}
            </div>
            <div className="flex-1">
              <button className="flex items-center gap-[6px] px-3 py-2 rounded-[11px] bg-white text-[11px] font-bold transition-transform hover:scale-[1.02]"
                style={{ color: T2, border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SH }}>
                <Upload className="w-[12px] h-[12px]" strokeWidth={2.4} />
                Upload New Logo
              </button>
              <div className="text-[9px] font-medium mt-[6px]" style={{ color: T4 }}>Recommended: 200×200px · PNG or JPG</div>
            </div>
          </div>
        </SectionCard>

        <div className={isMobile ? "" : "lg:col-span-2"}>
          <SectionCard icon={Shield} iconTone="violet" title="System Preferences" subtitle="Quick toggles">
            <div className="flex flex-col gap-3">
              {[
                { key: "emailNotifications", name: "Email Notifications", desc: "Alerts via email",    icon: Mail,     tone: "blue" as const },
                { key: "smsAlerts",          name: "SMS Alerts",           desc: "Urgent event SMS",    icon: Phone,    tone: "green" as const },
                { key: "autoBackup",         name: "Auto-backup Data",     desc: "Nightly cloud backup",icon: Database, tone: "violet" as const },
              ].map(row => {
                const tones: Record<string, { bg: string; border: string; color: string }> = {
                  blue:   { bg: "rgba(0,85,255,0.10)",  border: "rgba(0,85,255,0.20)",  color: B1 },
                  green:  { bg: GREEN_S, border: GREEN_B, color: GREEN },
                  violet: { bg: VIOLET_S, border: VIOLET_B, color: VIOLET },
                };
                const t = tones[row.tone];
                return (
                  <div key={row.key} className="flex items-center gap-[11px] p-3 rounded-[14px]" style={{ background: BG, border: `0.5px solid ${SEP}` }}>
                    <div className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center shrink-0"
                      style={{ background: t.bg, border: `0.5px solid ${t.border}` }}>
                      <row.icon className="w-4 h-4" style={{ color: t.color }} strokeWidth={2.3} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold" style={{ color: T1, letterSpacing: "-0.1px" }}>{row.name}</div>
                      <div className="text-[10px] font-medium mt-[2px]" style={{ color: T3 }}>{row.desc}</div>
                    </div>
                    <Toggle checked={form[row.key as keyof typeof form] as boolean} onChange={v => set(row.key)(v)} tone={row.tone} />
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4">
        <SaveBar saving={saving} onClick={handleSave} />
      </div>

      <div className={`mt-4 rounded-[22px] ${isMobile ? "px-5 py-[18px]" : "px-7 py-6"} relative overflow-hidden`}
        style={{ background: "linear-gradient(140deg, #001888 0%, #0033CC 48%, #0055FF 100%)", boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)" }}>
        <div className="absolute -top-[34px] -right-[22px] w-[140px] h-[140px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-[6px] mb-[10px] relative z-10">
          <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
            <Sparkles className="w-[13px] h-[13px] text-white" strokeWidth={2.3} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Profile Intelligence</span>
        </div>
        <p className="text-[12px] leading-[1.72] relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
          Profile is <strong style={{ color: "#fff", fontWeight: 700 }}>{profileCompletePct}% complete</strong>.
          {missingFields > 0 && <> <strong style={{ color: "#fff", fontWeight: 700 }}>{missingFields} field{missingFields === 1 ? "" : "s"}</strong> still missing — these affect <strong style={{ color: "#fff", fontWeight: 700 }}>reports</strong> and <strong style={{ color: "#fff", fontWeight: 700 }}>parent-facing communications</strong>.</>}
        </p>
        <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10 mt-3" style={{ background: "rgba(255,255,255,0.12)" }}>
          {[
            { val: `${profileCompletePct}%`, lbl: "Complete", color: "#66EE88" },
            { val: missingFields, lbl: "Pending", color: "#fff" },
            { val: `${prefsOn}/3`, lbl: "Prefs On", color: "#fff" },
          ].map(s => (
            <div key={s.lbl} className="text-center py-[11px]" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="text-[18px] font-bold leading-none mb-[3px]" style={{ color: s.color, letterSpacing: "-0.4px" }}>{s.val}</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.07em]" style={{ color: "rgba(255,255,255,0.40)" }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AcademicSettingsTab({ isMobile, schoolId }: { isMobile: boolean; schoolId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        "grading.gradeA": Number(gradeA),
        "grading.gradeB": Number(gradeB),
        "grading.gradeC": Number(gradeC),
        "grading.workingDays": Number(workingDays),
        "grading.subjects": subjects,
        updatedAt: serverTimestamp(),
      });
      toast.success("Academic settings saved!");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} /></div>;

  return (
    <div className={isMobile ? "px-5" : ""}>
      <div className={`${isMobile ? "mt-[14px] px-[18px] py-4" : "px-7 py-6"} rounded-[22px] relative overflow-hidden text-white`}
        style={{ background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)", boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)" }}>
        <div className="absolute -top-9 -right-6 w-[150px] h-[150px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between mb-[14px] relative z-10 flex-wrap gap-2">
          <div className="flex items-center gap-[10px]">
            <div className={`${isMobile ? "w-9 h-9" : "w-14 h-14"} rounded-[12px] flex items-center justify-center shrink-0`}
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
              <BookOpen className={`${isMobile ? "w-[18px] h-[18px]" : "w-7 h-7"} text-white`} strokeWidth={2.1} />
            </div>
            <div>
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px]" style={{ color: "rgba(255,255,255,0.50)" }}>Pass Threshold</div>
              <div className={`${isMobile ? "text-[24px]" : "text-[40px]"} font-bold leading-none`} style={{ letterSpacing: "-0.6px" }}>{passThreshold}%</div>
            </div>
          </div>
          <span className="flex items-center gap-[5px] px-3 py-[5px] rounded-full text-[11px] font-bold"
            style={{ background: "rgba(255,136,0,0.20)", border: "0.5px solid rgba(255,136,0,0.35)", color: "#FFCC44" }}>
            <AlertTriangle className="w-[11px] h-[11px]" strokeWidth={2.5} />
            Active
          </span>
        </div>
        <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
          {[
            { val: `${passThreshold}%`, lbl: "Pass Min", color: "#fff" },
            { val: `${gradeA}%`, lbl: "Grade A", color: "#66EE88" },
            { val: workingDays, lbl: "Days/Yr", color: "#FFCC44" },
          ].map(x => (
            <div key={x.lbl} className="text-center py-[11px]" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="text-[17px] font-bold leading-none mb-[3px]" style={{ color: x.color, letterSpacing: "-0.3px" }}>{x.val}</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.40)" }}>{x.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 px-[13px] py-[11px] rounded-[14px] flex items-start gap-[9px]"
        style={{ background: "rgba(255,136,0,0.07)", border: "0.5px solid rgba(255,136,0,0.22)" }}>
        <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" style={{ color: ORANGE }} strokeWidth={2.3} />
        <div className="text-[11px] font-semibold leading-[1.5]" style={{ color: "#6B3800" }}>
          Students scoring below Pass Threshold are marked as <strong>"Failed"</strong> and appear in the At-Risk list.
        </div>
      </div>

      <div className={`mt-3 grid grid-cols-1 ${isMobile ? "" : "lg:grid-cols-2"} gap-4`}>
        <SectionCard icon={BookOpen} iconTone="blue" title="Grading System" subtitle="Thresholds for letter grades">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-[10px]">
              <Field label="Pass Threshold %" value={passThreshold} onChange={setPassThreshold} type="number" />
              <Field label="Grade A starts %" value={gradeA} onChange={setGradeA} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-[10px]">
              <Field label="Grade B starts %" value={gradeB} onChange={setGradeB} type="number" />
              <Field label="Grade C starts %" value={gradeC} onChange={setGradeC} type="number" />
            </div>
            <div className="p-[11px] px-3 rounded-[13px]" style={{ background: BG, border: `0.5px solid rgba(0,85,255,0.08)` }}>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-[7px]" style={{ color: T4 }}>Grade Preview</div>
              <div className="flex gap-[6px] flex-wrap">
                {[
                  { grade: "A", min: gradeA, bg: GREEN_S, color: GREEN_D, border: GREEN_B },
                  { grade: "B", min: gradeB, bg: "rgba(0,85,255,0.10)", color: B1, border: "rgba(0,85,255,0.22)" },
                  { grade: "C", min: gradeC, bg: ORANGE_S, color: "#884400", border: ORANGE_B },
                  { grade: "F", min: "0",    bg: RED_S, color: "#A0001D", border: RED_B },
                ].map(g => (
                  <div key={g.grade} className="px-[10px] py-[5px] rounded-full text-[10px] font-bold"
                    style={{ background: g.bg, color: g.color, border: `0.5px solid ${g.border}` }}>
                    {g.grade} ≥ {g.min}%
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={Calendar} iconTone="green" title="Calendar Settings" subtitle="Working days & attendance basis">
          <div className="flex flex-col gap-3">
            <Field label="Total Working Days (per year)" value={workingDays} onChange={setWorkingDays} type="number" />
            <div className="p-[10px] px-3 rounded-[12px]" style={{ background: "rgba(0,85,255,0.05)", border: "0.5px solid rgba(0,85,255,0.12)" }}>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-[3px]" style={{ color: T3 }}>Attendance formula</div>
              <div className="text-[12px] font-bold" style={{ color: T1 }}>Days Present ÷ {workingDays} × 100</div>
            </div>
          </div>
        </SectionCard>

        <div className={isMobile ? "" : "lg:col-span-2"}>
          <SectionCard icon={BookOpen} iconTone="violet" title="Subjects" subtitle="Curriculum subjects tracked">
            <div className="flex gap-2 mb-3">
              <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addSubject()}
                placeholder="Add subject (e.g. Mathematics)"
                className="flex-1 rounded-[12px] px-3 py-[11px] text-[12px] font-medium outline-none"
                style={{ background: BG, border: `0.5px solid rgba(0,85,255,0.12)`, color: T1, fontFamily: "inherit" }} />
              <button onClick={addSubject}
                className="px-[14px] rounded-[12px] flex items-center gap-[5px] text-[11px] font-bold text-white transition-transform hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN }}>
                <Plus className="w-[13px] h-[13px]" strokeWidth={2.5} /> Add
              </button>
            </div>
            <div className="flex flex-wrap gap-[7px]">
              {subjects.length === 0 ? (
                <p className="text-[11px] italic px-1 py-2" style={{ color: T4 }}>No subjects added yet.</p>
              ) : subjects.map(s => (
                <div key={s} className="flex items-center gap-[7px] px-3 py-[6px] rounded-full text-[11px] font-bold"
                  style={{ background: "rgba(0,85,255,0.10)", color: B1, border: "0.5px solid rgba(0,85,255,0.20)" }}>
                  {s}
                  <button onClick={() => removeSubject(s)} className="hover:text-red-500 transition-colors">
                    <X className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="mt-4">
        <SaveBar saving={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

function NotificationsTab({ isMobile, schoolId }: { isMobile: boolean; schoolId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    emailNotifications: true, smsAlerts: true, pushNotifications: false,
    riskAlerts: true, attendanceAlerts: true, disciplineAlerts: true,
    parentMsgAlerts: true, examAlerts: true, weeklyReport: false,
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
      await updateDoc(doc(db, "schools", schoolId), { notifPrefs: prefs, updatedAt: serverTimestamp() });
      toast.success("Notification preferences saved!");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} /></div>;

  const CHANNELS = [
    { key: "emailNotifications", label: "Email Notifications", desc: "Receive alerts via email", icon: Mail, tone: "blue" as const },
    { key: "smsAlerts",          label: "SMS Alerts",          desc: "Get SMS for urgent events", icon: Phone, tone: "green" as const },
    { key: "pushNotifications",  label: "Push Notifications",  desc: "Browser/app push alerts",   icon: Bell,  tone: "violet" as const },
  ];

  const ALERT_TYPES = [
    { key: "riskAlerts",       label: "At-Risk Student Alerts", desc: "When a student enters risk zone",  icon: AlertTriangle, tone: "red" as const },
    { key: "attendanceAlerts", label: "Attendance Alerts",      desc: "Attendance drops below threshold", icon: Calendar,      tone: "gold" as const },
    { key: "disciplineAlerts", label: "Discipline Alerts",      desc: "New discipline incidents logged",  icon: Shield,        tone: "orange" as const },
    { key: "parentMsgAlerts",  label: "Parent Messages",        desc: "When a parent sends a message",    icon: Mail,          tone: "blue" as const },
    { key: "examAlerts",       label: "Exam & Results Alerts",  desc: "When results are published",       icon: BookOpen,      tone: "violet" as const },
    { key: "weeklyReport",     label: "Weekly Summary Report",  desc: "Auto-email every Monday morning",  icon: RefreshCw,     tone: "green" as const },
  ];

  const tonesMap: Record<string, { bg: string; border: string; color: string }> = {
    blue:   { bg: "rgba(0,85,255,0.10)",  border: "rgba(0,85,255,0.20)",  color: B1 },
    green:  { bg: GREEN_S, border: GREEN_B, color: GREEN },
    violet: { bg: VIOLET_S, border: VIOLET_B, color: VIOLET },
    orange: { bg: ORANGE_S, border: ORANGE_B, color: ORANGE },
    red:    { bg: RED_S, border: RED_B, color: RED },
    gold:   { bg: "rgba(255,170,0,0.10)", border: "rgba(255,170,0,0.22)", color: GOLD },
  };

  return (
    <div className={isMobile ? "px-5 pt-[14px]" : ""}>
      <div className={`grid grid-cols-1 ${isMobile ? "" : "lg:grid-cols-2"} gap-4`}>
        <SectionCard icon={Bell} iconTone="blue" title="Notification Channels" subtitle="How alerts reach you">
          <div className="flex flex-col gap-3">
            {CHANNELS.map(c => {
              const t = tonesMap[c.tone];
              return (
                <div key={c.key} className="flex items-center gap-[11px] p-3 rounded-[14px]" style={{ background: BG, border: `0.5px solid ${SEP}` }}>
                  <div className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center shrink-0"
                    style={{ background: t.bg, border: `0.5px solid ${t.border}` }}>
                    <c.icon className="w-4 h-4" style={{ color: t.color }} strokeWidth={2.3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold" style={{ color: T1, letterSpacing: "-0.1px" }}>{c.label}</div>
                    <div className="text-[10px] font-medium mt-[2px]" style={{ color: T3 }}>{c.desc}</div>
                  </div>
                  <Toggle checked={prefs[c.key as keyof typeof prefs] as boolean} onChange={() => toggle(c.key)} tone={c.tone === "violet" ? "violet" : c.tone === "blue" ? "blue" : "green"} />
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard icon={AlertTriangle} iconTone="gold" title="Alert Types" subtitle="What you get pinged about">
          <div className="flex flex-col gap-3">
            {ALERT_TYPES.map(a => {
              const t = tonesMap[a.tone];
              return (
                <div key={a.key} className="flex items-center gap-[11px] p-3 rounded-[14px]" style={{ background: BG, border: `0.5px solid ${SEP}` }}>
                  <div className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center shrink-0"
                    style={{ background: t.bg, border: `0.5px solid ${t.border}` }}>
                    <a.icon className="w-4 h-4" style={{ color: t.color }} strokeWidth={2.3} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold" style={{ color: T1, letterSpacing: "-0.1px" }}>{a.label}</div>
                    <div className="text-[10px] font-medium mt-[2px]" style={{ color: T3 }}>{a.desc}</div>
                  </div>
                  <Toggle checked={prefs[a.key as keyof typeof prefs] as boolean} onChange={() => toggle(a.key)} />
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="mt-4">
        <SaveBar saving={saving} onClick={handleSave} label="Save Preferences" />
      </div>
    </div>
  );
}

function UsersPermissionsTab({ isMobile, schoolId, userData }: any) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("teacher");
  const [adding, setAdding] = useState(false);
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
      const t = tSnap.docs.map(d => ({ id: d.id, ...d.data(), _col: "teachers" }));
      const all = [...p, ...t].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
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
        name: newName.trim(), email: newEmail.trim(), role: newRole,
        schoolId, branchId: branchId || "", status: "Active",
        createdAt: serverTimestamp(),
      });
      setUsers(prev => [...prev, { id: docRef.id, name: newName, email: newEmail, role: newRole, status: "Active", _col: colName }]);
      setNewName(""); setNewEmail(""); setNewRole("teacher");
      setAddOpen(false);
      toast.success("User added successfully!");
    } catch (e: any) { toast.error(e.message); }
    setAdding(false);
  };

  const roleTheme = (role: string) => {
    if (role === "principal") return { bg: "rgba(0,85,255,0.10)", color: B1, border: "rgba(0,85,255,0.22)", accent: `linear-gradient(180deg, ${B1}, ${B2})`, avatar: `linear-gradient(135deg, ${B1}, ${B2})` };
    if (role === "admin")     return { bg: VIOLET_S, color: VIOLET, border: VIOLET_B, accent: `linear-gradient(180deg, ${VIOLET}, #A075FF)`, avatar: `linear-gradient(135deg, ${VIOLET}, #A075FF)` };
    if (role === "teacher")   return { bg: GREEN_S, color: GREEN_D, border: GREEN_B, accent: `linear-gradient(180deg, ${GREEN}, #22EE66)`, avatar: `linear-gradient(135deg, ${GREEN}, #22EE66)` };
    return                        { bg: ORANGE_S, color: "#884400", border: ORANGE_B, accent: `linear-gradient(180deg, ${ORANGE}, #FFCC22)`, avatar: `linear-gradient(135deg, ${ORANGE}, #FFCC22)` };
  };

  return (
    <div className={isMobile ? "px-5 pt-[14px]" : ""}>
      <div className="flex justify-end mb-3">
        <button onClick={() => setAddOpen(true)}
          className="h-10 px-[14px] rounded-[12px] flex items-center gap-[6px] text-[11px] font-bold text-white relative overflow-hidden transition-transform hover:scale-[1.02]"
          style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
          <Plus className="w-[13px] h-[13px] relative z-10" strokeWidth={2.5} />
          <span className="relative z-10">Add User</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} /></div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-[20px] py-16 flex flex-col items-center gap-3 text-center" style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
          <div className="w-14 h-14 rounded-[16px] flex items-center justify-center"
            style={{ background: "rgba(0,85,255,0.08)", border: `0.5px solid ${SEP}` }}>
            <Users className="w-6 h-6" style={{ color: T4 }} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-bold" style={{ color: T1 }}>No users found</p>
          <p className="text-[11px]" style={{ color: T4 }}>Add your first admin, teacher, or staff member</p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${isMobile ? "" : "md:grid-cols-2 xl:grid-cols-3"} gap-3`}>
          {users.map(u => {
            const theme = roleTheme(u.role || "staff");
            const initials = (u.name || "?").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
            return (
              <div key={u.id} className="bg-white rounded-[20px] p-[13px] flex items-center gap-[11px] relative overflow-hidden cursor-pointer transition-transform hover:scale-[1.01]"
                style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: theme.accent }} />
                <div className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center text-[13px] font-bold text-white shrink-0 ml-[3px]"
                  style={{ background: theme.avatar, boxShadow: `0 3px 10px ${theme.color}33` }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold truncate mb-[2px]" style={{ color: T1, letterSpacing: "-0.2px" }}>{u.name || "—"}</div>
                  <div className="text-[10px] truncate" style={{ color: T3 }}>{u.email || "—"}</div>
                  <div className="flex items-center gap-[5px] mt-[5px]">
                    <span className="inline-flex items-center px-2 py-[3px] rounded-full text-[9px] font-bold uppercase tracking-[0.06em]"
                      style={{ background: theme.bg, color: theme.color, border: `0.5px solid ${theme.border}` }}>
                      {u.role || "staff"}
                    </span>
                    <span className="inline-flex items-center gap-[3px] text-[9px] font-bold" style={{ color: (u.status || "Active").toLowerCase() === "active" ? GREEN_D : ORANGE }}>
                      <CheckCircle2 className="w-[10px] h-[10px]" />
                      {u.status || "Active"}
                    </span>
                  </div>
                </div>
                <div className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0"
                  style={{ background: BG, border: `0.5px solid rgba(0,85,255,0.10)` }}>
                  <ChevronRight className="w-[13px] h-[13px]" style={{ color: T4 }} strokeWidth={2.3} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[22px] p-6 w-full max-w-md animate-in zoom-in-95 duration-200"
            style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold" style={{ color: T1, letterSpacing: "-0.3px" }}>Add New User</h3>
              <button onClick={() => setAddOpen(false)} className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: BG, color: T4 }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Full Name" value={newName} onChange={setNewName} placeholder="Dr. Firstname Lastname" icon={User} />
              <Field label="Email" value={newEmail} onChange={setNewEmail} type="email" placeholder="user@school.edu" icon={Mail} />
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.06em] block mb-[5px]" style={{ color: T3 }}>Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)}
                  className="w-full rounded-[12px] px-3 py-[11px] text-[12px] font-semibold outline-none appearance-none cursor-pointer"
                  style={{
                    background: BG, border: `0.5px solid rgba(0,85,255,0.12)`, color: T1, fontFamily: "inherit",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235070B0' stroke-width='2.4' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat", backgroundPosition: "right 13px center", paddingRight: 34,
                  }}>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                  <option value="principal">Principal</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setAddOpen(false)}
                className="flex-1 h-11 rounded-[12px] text-[12px] font-bold bg-white"
                style={{ border: `0.5px solid ${SEP}`, color: T3, boxShadow: SH }}>
                Cancel
              </button>
              <button onClick={handleAdd} disabled={adding}
                className="flex-1 h-11 rounded-[12px] flex items-center justify-center gap-2 text-[12px] font-bold text-white relative overflow-hidden disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                {adding ? <><Loader2 className="w-4 h-4 animate-spin relative z-10" /><span className="relative z-10">Adding…</span></>
                        : <span className="relative z-10">Add User</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DataManagementTab({ isMobile }: { isMobile: boolean }) {
  return (
    <div className={isMobile ? "px-5 pt-[14px]" : ""}>
      <div className="px-[13px] py-[11px] rounded-[14px] flex items-start gap-[9px] mb-3"
        style={{ background: "rgba(255,51,85,0.07)", border: "0.5px solid rgba(255,51,85,0.22)" }}>
        <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" style={{ color: RED }} strokeWidth={2.3} />
        <div className="text-[11px] font-semibold leading-[1.5]" style={{ color: "#7A0018" }}>
          Data operations are permanent and cannot be undone. Proceed with caution.
        </div>
      </div>

      <div className="rounded-[22px] px-[18px] py-[18px] relative overflow-hidden mb-3"
        style={{ background: "linear-gradient(145deg, #020618 0%, #040B28 40%, #020618 100%)", boxShadow: "0 10px 30px rgba(0,8,40,0.42), 0 0 0 0.5px rgba(255,255,255,0.06)" }}>
        <div className="absolute -top-[30px] -right-[20px] w-[140px] h-[140px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(123,63,244,0.16) 0%, transparent 65%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(123,63,244,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(123,63,244,0.03) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }} />

        <div className="flex items-center gap-[10px] relative z-10 mb-2">
          <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
            style={{ background: "rgba(123,63,244,0.16)", border: "0.5px solid rgba(123,63,244,0.32)" }}>
            <Database className="w-4 h-4 text-white" strokeWidth={2.3} />
          </div>
          <div className="text-[15px] font-bold text-white" style={{ letterSpacing: "-0.2px" }}>Data Migration Engine</div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.04em] mb-[14px] relative z-10" style={{ color: "rgba(255,255,255,0.48)" }}>
          Backfill legacy records · Rebuild indexes · Seed demo data
        </div>

        <div className="flex gap-2 relative z-10 mb-[14px]">
          <button className="flex-1 h-[42px] rounded-[12px] flex items-center justify-center gap-[6px] text-[10px] font-bold uppercase tracking-[0.08em] transition-transform hover:scale-[1.02]"
            style={{ background: "linear-gradient(135deg, rgba(0,200,83,0.16), rgba(0,200,83,0.08))", border: "0.5px solid rgba(0,200,83,0.4)", color: "#66EE88" }}>
            <Download className="w-[13px] h-[13px]" strokeWidth={2.4} />
            Export Data
          </button>
          <button className="flex-1 h-[42px] rounded-[12px] flex items-center justify-center gap-[6px] text-[10px] font-bold uppercase tracking-[0.08em] text-white transition-transform hover:scale-[1.02]"
            style={{ background: "linear-gradient(135deg, rgba(123,63,244,0.85), rgba(123,63,244,0.55))", border: "0.5px solid rgba(123,63,244,0.5)", boxShadow: "0 4px 14px rgba(123,63,244,0.32)" }}>
            <RefreshCw className="w-[13px] h-[13px]" strokeWidth={2.4} />
            Run Migration
          </button>
        </div>

        <div className="rounded-[16px] px-[18px] py-6 text-center relative z-10"
          style={{ background: "rgba(255,255,255,0.03)", border: "0.5px dashed rgba(255,255,255,0.12)" }}>
          <div className="w-[50px] h-[50px] rounded-[14px] flex items-center justify-center mx-auto mb-[11px]"
            style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.12)" }}>
            <Shield className="w-6 h-6 text-white" strokeWidth={2.2} />
          </div>
          <div className="text-[14px] font-bold text-white mb-[5px]">System Status Nominal</div>
          <div className="text-[9px] font-bold uppercase tracking-[0.08em] leading-[1.55]" style={{ color: "rgba(255,255,255,0.38)" }}>
            All databases synced · Last backup 2h ago
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[22px] overflow-hidden p-4"
        style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
        <MigrationEngine />
      </div>
    </div>
  );
}

export default SettingsPage;
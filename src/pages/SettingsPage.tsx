import { useState, useEffect } from "react";
import {
  School, Upload, Calendar, User, Bell, Shield,
  Database, Save, Loader2, Plus, BookOpen,
  Mail, Phone, Globe, MapPin, CheckCircle2, AlertTriangle,
  Users, RefreshCw, X, ChevronRight,
} from "lucide-react";
import { db, storage } from "@/lib/firebase";
import {
  doc, getDoc, updateDoc, collection, query,
  where, getDocs, addDoc, serverTimestamp, writeBatch, deleteDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

const B1 = "#0055FF", B2 = "#1166FF";
const BG = "#EEF4FF";
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
  // Rendered as a <div role="switch"> (not <button>) so it sidesteps the
  // ~9 different `button { ... !important }` global rules in index.css
  // (padding 8/16, hover lift, active scale, card-shadow, transition
  // overrides, etc.) that all silently inflated/animated the iOS pill
  // and detached the thumb from the track. div has no global overrides;
  // role+tabIndex+keyboard handler keeps a11y identical to a button.
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className="relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none shrink-0 cursor-pointer select-none"
      style={{
        width: 44,
        height: 26,
        padding: 3,
        boxSizing: "border-box",
        background: checked ? onColor : "#D0DEFF",
        boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.04)",
      }}
    >
      <span
        className="block bg-white rounded-full"
        style={{
          width: 20,
          height: 20,
          boxShadow: "0 1px 2px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.10)",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: "transform 220ms cubic-bezier(0.34,1.56,0.64,1)",
        }}
      />
    </div>
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
        {Icon && <Icon className="absolute left-[14px] pointer-events-none w-[13px] h-[13px] z-10" style={{ color: "rgba(0,85,255,0.42)" }} strokeWidth={2.2} />}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="custom-chrome w-full rounded-[12px] outline-none transition-colors placeholder:font-normal placeholder:text-[#99AACC] placeholder:opacity-100"
          style={{
            // .custom-chrome opts out of global `input { padding/font !important }`
            // rules in index.css — values flow through these CSS custom props.
            "--cc-padding": Icon ? "11px 12px 11px 38px" : "11px 12px",
            "--cc-font-size": small ? "11px" : "12px",
            "--cc-font-weight": "500",
            "--cc-line-height": "1.4",
            background: BG, border: `0.5px solid rgba(0,85,255,0.12)`, fontFamily: "inherit",
            color: T1,
            textOverflow: "ellipsis",
          } as any} />
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

function SaveBar({ saving, onClick, label = "Save Changes", disabled = false, idleLabel }:
  { saving: boolean; onClick: () => void; label?: string; disabled?: boolean; idleLabel?: string }) {
  // disabled (no unsaved changes) gets a muted treatment + alt copy so
  // the user understands why the button looks inactive.
  const isOff = disabled && !saving;
  return (
    <button onClick={onClick} disabled={saving || disabled}
      className="w-full h-[50px] rounded-[16px] flex items-center justify-center gap-2 font-bold text-[13px] text-white relative overflow-hidden transition-all hover:scale-[1.01] disabled:hover:scale-100 disabled:cursor-not-allowed"
      style={{
        background: isOff
          ? "linear-gradient(135deg, #B0BFD8 0%, #8FA0C0 50%, #6F84A8 100%)"
          : "linear-gradient(135deg, #001040 0%, #001888 50%, #0033CC 100%)",
        boxShadow: isOff
          ? "0 4px 12px rgba(100,120,180,0.20)"
          : "0 8px 22px rgba(0,20,80,0.42), 0 2px 5px rgba(0,20,80,0.3)",
        opacity: isOff ? 0.85 : 1,
      }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 52%)" }} />
      {saving ? <><Loader2 className="w-[14px] h-[14px] animate-spin relative z-10" /><span className="relative z-10">Saving…</span></>
              : <><Save className="w-[14px] h-[14px] relative z-10" strokeWidth={2.3} /><span className="relative z-10">{isOff ? (idleLabel || "No changes to save") : label}</span></>}
    </button>
  );
}

// ─── Format validators (module-level so all tabs share) ───
const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const isValidPhone = (s: string) => {
  const digits = s.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
};
const isValidUrl = (s: string) => {
  const v = s.trim();
  if (!v) return true;
  try { const u = new URL(v.startsWith("http") ? v : "https://" + v); return !!u.hostname; }
  catch { return false; }
};

// Data tab removed — exposed destructive migration tools (Heal Ghost
// Records, Run Full Audit) to principals. Migration ops belong in
// owner-dashboard / DevOps tooling, not principal Settings.
const TABS: { id: string; label: string; icon: any }[] = [
  { id: "profile",       label: "Branch Profile",    icon: School },
  { id: "academic",      label: "Academic",          icon: BookOpen },
  { id: "notifications", label: "Notifications",     icon: Bell },
  { id: "users",         label: "Users",             icon: Users },
];

const TAB_STORAGE_KEY = "principal_settings_active_tab";

const SettingsPage = () => {
  const { user, userData, refreshUserData } = useAuth();
  const isMobile = useIsMobile();
  // Tab state persists across reloads — earlier the page always reset to
  // "profile" which was annoying when editing notifications/users.
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "profile";
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    return stored && TABS.some(t => t.id === stored) ? stored : "profile";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    }
  }, [activeTab]);
  const schoolId = userData?.schoolId;
  const activeMeta = TABS.find(t => t.id === activeTab);

  return (
    <div className={`${isMobile ? "-mx-3 -mt-3" : "w-full px-2"} pb-10 animate-in fade-in duration-500`}
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
        {activeTab === "notifications" && <NotificationsTab isMobile={isMobile} userData={userData} />}
        {activeTab === "users"         && <UsersPermissionsTab isMobile={isMobile} schoolId={schoolId} userData={userData} />}
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
  // Snapshot of form values as last loaded/saved — used to compute isDirty
  // so the Save button correctly disables when the user has made no
  // changes. JSON.stringify compare is fine for this flat shape.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const isDirty = JSON.stringify(form) !== savedSnapshot;
  const set = (k: string) => (v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  // Logo state — stored on principals/{userData.id}.logoUrl. Renders on
  // every report (reportTemplate.ts hero) so principals see their school
  // brand on the PDFs they share with parents/teachers.
  const [logoUrl, setLogoUrl] = useState<string>((userData as any)?.logoUrl || "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRemoving, setLogoRemoving] = useState(false);

  // Re-load logoUrl from the principal's own doc — handles the case where
  // userData was cached before the logo was uploaded in another tab/session.
  useEffect(() => {
    if (!userData?.id) return;
    let cancelled = false;
    getDoc(doc(db, "principals", userData.id))
      .then(snap => {
        if (cancelled) return;
        const data = snap.data();
        if (data?.logoUrl) setLogoUrl(data.logoUrl);
      })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, [userData?.id]);

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so picking the same file again re-fires
    if (!file || !userData?.id || !user?.uid) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Logo must be an image (PNG, JPG, etc).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo too large — max 5 MB.");
      return;
    }
    setLogoUploading(true);
    try {
      // Storage path uses Firebase Auth uid — matches the existing
      // `profiles/{userId}/{fileName}` storage rule (uid-self write only).
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `profiles/${user.uid}/logo_${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file, { contentType: file.type });
      const url = await getDownloadURL(ref);

      await updateDoc(doc(db, "principals", userData.id), {
        logoUrl: url,
        logoPath: path,
        logoUpdatedAt: serverTimestamp(),
      });
      setLogoUrl(url);
      toast.success("School logo uploaded — will appear on all generated reports.");
    } catch (err: any) {
      console.error("[SchoolProfileTab] logo upload failed:", err);
      toast.error("Logo upload failed: " + (err?.message || "unknown"));
    } finally {
      setLogoUploading(false);
    }
  };

  const onRemoveLogo = async () => {
    if (!userData?.id || !logoUrl) return;
    setLogoRemoving(true);
    try {
      // Best-effort delete the Storage object; never block the Firestore
      // update on it — orphan files are harmless and pruneable later.
      const existingPath = (userData as any)?.logoPath;
      if (existingPath) {
        try { await deleteObject(storageRef(storage, existingPath)); }
        catch (e) { console.warn("[SchoolProfileTab] storage delete failed (already gone?):", e); }
      }
      await updateDoc(doc(db, "principals", userData.id), {
        logoUrl: "",
        logoPath: "",
        logoUpdatedAt: serverTimestamp(),
      });
      setLogoUrl("");
      toast.success("Logo removed.");
    } catch (err: any) {
      console.error("[SchoolProfileTab] logo remove failed:", err);
      toast.error("Could not remove logo: " + (err?.message || "unknown"));
    } finally {
      setLogoRemoving(false);
    }
  };

  useEffect(() => {
    if (!schoolId) return;
    // Hybrid scope: school-wide info from schools/{schoolId}, principal-
    // specific contact info + system prefs from principals/{userData.id}.
    // Earlier code kept principalName/Email/Phone + prefs on the school
    // doc — every branch principal collided on one record.
    Promise.all([
      getDoc(doc(db, "schools", schoolId)),
      userData?.id ? getDoc(doc(db, "principals", userData.id)) : Promise.resolve(null),
    ]).then(([sSnap, pSnap]) => {
      const d = sSnap.exists() ? sSnap.data() : {};
      const p = pSnap?.exists() ? pSnap.data() : {};
      const next = {
        schoolName:     d.name           || userData?.schoolName || "",
        address:        d.address        || "",
        phone:          d.phone          || "",
        email:          d.email          || "",
        website:        d.website        || "",
        // Per-principal — read from principals/{id} first, fall back to
        // legacy school-doc values for migration period.
        principalName:  p.name           || d.principalName  || userData?.name  || user?.displayName || "",
        principalEmail: p.email          || d.principalEmail || userData?.email || user?.email       || "",
        principalPhone: p.phone          || d.principalPhone || "",
        academicStart:  d.academicYear?.startDate     || "",
        academicEnd:    d.academicYear?.endDate       || "",
        currentSession: d.academicYear?.currentSession || "",
        // Prefs are per-principal (each principal manages their own).
        emailNotifications: p.prefs?.emailNotifications ?? d.prefs?.emailNotifications ?? true,
        smsAlerts:          p.prefs?.smsAlerts          ?? d.prefs?.smsAlerts          ?? true,
        autoBackup:         p.prefs?.autoBackup         ?? d.prefs?.autoBackup         ?? true,
      };
      setForm(next);
      setSavedSnapshot(JSON.stringify(next));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId, userData?.id]);

  const handleSave = async () => {
    if (!schoolId) return toast.error("No School ID found.");
    // Format validation — email/url/phone. Empty values are allowed
    // (these are optional fields); invalid non-empty values are rejected
    // with a clear toast so the user knows which field is wrong.
    if (form.email.trim() && !isValidEmail(form.email)) {
      return toast.error("School email is not a valid email address.");
    }
    if (form.website.trim() && !isValidUrl(form.website)) {
      return toast.error("Branch website is not a valid URL.");
    }
    if (form.phone.trim() && !isValidPhone(form.phone)) {
      return toast.error("Branch phone must be 7-15 digits.");
    }
    if (form.principalEmail.trim() && !isValidEmail(form.principalEmail)) {
      return toast.error("Principal email is not a valid email address.");
    }
    if (form.principalPhone.trim() && !isValidPhone(form.principalPhone)) {
      return toast.error("Principal phone must be 7-15 digits.");
    }
    setSaving(true);
    try {
      // Atomic write batch covering EVERY surface that displays the school
      // / branch name across the four dashboards:
      //
      //   1. schools/{schoolId}                         — principal's own header
      //   2. principals/{userData.id}                   — principal contact + denormalized schoolName
      //   3. schools/{ownerUid}/branches/{branchId}     — Owner dashboard's branch list
      //
      // The 3rd write is the one that closes the gap user kept hitting
      // ("branch name still 'umsh' on owner dashboard"). The cascade trigger
      // ALSO tries to do this, but a single-tenant data shape (where the
      // principal.branchId is a human slug, not the owner's branch doc-id)
      // makes the trigger's match logic brittle. Direct write here = zero
      // ambiguity + zero latency.
      const batch = writeBatch(db);
      batch.update(doc(db, "schools", schoolId), {
        name: form.schoolName, address: form.address, phone: form.phone,
        email: form.email, website: form.website,
        academicYear: { startDate: form.academicStart, endDate: form.academicEnd, currentSession: form.currentSession },
        updatedAt: serverTimestamp(),
      });
      if (userData?.id) {
        batch.update(doc(db, "principals", userData.id), {
          name: form.principalName,
          email: form.principalEmail,
          phone: form.principalPhone,
          // Mirror the school's new name onto the principal doc so the
          // AuthContext's next read picks it up. Also update branchName for
          // multi-branch principal scenarios.
          schoolName: form.schoolName,
          branchName: form.schoolName,
          prefs: {
            emailNotifications: form.emailNotifications,
            smsAlerts:          form.smsAlerts,
            autoBackup:         form.autoBackup,
          },
          updatedAt: serverTimestamp(),
        });
      }

      // Owner subcollection direct write — the principal's data carries
      // ownerUid (via schoolId in single-tenant) + branchId. The single-
      // tenant convention onboards principals with `schoolId: ownerUid` so
      // we can resolve the owner's branches path directly. Worth a try; if
      // the docs don't exist (multi-tenant or different shape) the cascade
      // trigger handles fallback.
      const ownerUidCandidates = new Set<string>();
      // Most common: principal.schoolId IS the owner's uid.
      if (schoolId) ownerUidCandidates.add(schoolId);
      // Backup: explicit ownerUid field if set.
      const explicitOwnerUid = (userData as { ownerUid?: string })?.ownerUid;
      if (explicitOwnerUid) ownerUidCandidates.add(explicitOwnerUid);

      const branchId = (userData as { branchId?: string })?.branchId;
      for (const ownerUid of ownerUidCandidates) {
        if (!branchId) continue;
        // Use update via try-catch — if the doc doesn't exist OR the rule
        // rejects (cross-tenant), we silently skip; cascade will pick it up.
        batch.update(
          doc(db, "schools", ownerUid, "branches", branchId),
          { name: form.schoolName, updatedAt: serverTimestamp() },
        );
      }

      try {
        await batch.commit();
      } catch (batchErr: any) {
        // If the owner-subcollection update failed (e.g., branch doc doesn't
        // exist or permission denied for cross-tenant write), retry WITHOUT
        // it so the primary updates still land.
        if (String(batchErr?.code || "").includes("not-found") ||
            String(batchErr?.code || "").includes("permission-denied")) {
          console.warn("[Settings] owner branch direct-write skipped, falling back to schools+principals only:", batchErr?.code);
          const fallback = writeBatch(db);
          fallback.update(doc(db, "schools", schoolId), {
            name: form.schoolName, address: form.address, phone: form.phone,
            email: form.email, website: form.website,
            academicYear: { startDate: form.academicStart, endDate: form.academicEnd, currentSession: form.currentSession },
            updatedAt: serverTimestamp(),
          });
          if (userData?.id) {
            fallback.update(doc(db, "principals", userData.id), {
              name: form.principalName,
              email: form.principalEmail,
              phone: form.principalPhone,
              schoolName: form.schoolName,
              branchName: form.schoolName,
              prefs: {
                emailNotifications: form.emailNotifications,
                smsAlerts:          form.smsAlerts,
                autoBackup:         form.autoBackup,
              },
              updatedAt: serverTimestamp(),
            });
          }
          await fallback.commit();
        } else {
          throw batchErr;
        }
      }
      // Refresh in-memory userData so the header + sidebar reflect the new
      // school name without a page reload. Best-effort: if the AuthContext
      // hasn't been updated yet (stale bundle, hot-reload mismatch), skip
      // silently — the cascade trigger + a manual refresh will reflect the
      // change on next page load. Critically, the SAVE itself has already
      // succeeded by this point — don't let a refresh failure toast a
      // "Save failed" lie at the user.
      try {
        if (typeof refreshUserData === "function") {
          await refreshUserData();
        }
      } catch (refreshErr) {
        // Non-fatal — the writes landed, just the in-memory refresh failed.
        console.warn("[Settings] refreshUserData skipped:", refreshErr);
      }
      setSavedSnapshot(JSON.stringify(form));
      toast.success("Settings saved.");
    } catch (e: any) {
      // Log the full error before the toast — toast truncates and we want
      // diagnostics in console for debugging.
      console.error("[Settings] save failed", e);
      const msg = e?.message || e?.code || String(e || "");
      toast.error(`Save failed: ${msg}`);
    }
    setSaving(false);
  };

  const initials = (form.schoolName || "SM").substring(0, 2).toUpperCase();
  // Track every field counted toward "completion" exactly once. Earlier
  // code had `filledFields` / 5 against a different list than `missingFields`,
  // which meant a 100% complete profile could still report N missing — math
  // didn't add up. Memory: bug_pattern_fabricated_fallback.
  const TRACKED_FIELDS = [
    form.schoolName, form.address, form.phone, form.email, form.website,
    form.principalName, form.principalEmail, form.principalPhone,
    form.academicStart, form.academicEnd,
  ];
  const filledFields = TRACKED_FIELDS.filter(Boolean).length;
  const missingFields = TRACKED_FIELDS.length - filledFields;
  const prefsOn = [form.emailNotifications, form.smsAlerts, form.autoBackup].filter(Boolean).length;
  const profileCompletePct = Math.round((filledFields / TRACKED_FIELDS.length) * 100);

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
              <div className="text-[8px] font-bold uppercase tracking-[0.12em] mb-[3px]" style={{ color: "rgba(255,255,255,0.50)" }}>Branch Profile</div>
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
        <SectionCard icon={School} iconTone="blue" title="Branch Information" subtitle="Primary branch details & contact">
          <div className="flex flex-col gap-3">
            <Field label="Branch Name" value={form.schoolName} onChange={set("schoolName") as any} icon={School} placeholder="e.g., Nampally Branch" />
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
                className="custom-chrome w-full bg-transparent outline-none placeholder:font-normal placeholder:text-[#99AACC] placeholder:opacity-100"
                style={{
                  "--cc-padding": "0",
                  "--cc-font-size": "13px",
                  "--cc-font-weight": "700",
                  "--cc-line-height": "1.4",
                  color: T1,
                } as any} />
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

        <SectionCard icon={Upload} iconTone="blue" title="School Logo" subtitle="Shows on every generated report">
          <div className="flex items-center gap-3 p-3 rounded-[14px]" style={{ background: BG, border: `0.5px solid ${SEP}` }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="School logo"
                className="w-14 h-14 rounded-[14px] object-contain shrink-0 bg-white"
                style={{ boxShadow: "0 4px 14px rgba(0,85,255,0.18)", border: "0.5px solid rgba(0,85,255,0.14)", padding: 4 }}
              />
            ) : (
              <div className="w-14 h-14 rounded-[14px] flex items-center justify-center text-[17px] font-bold text-white shrink-0"
                style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 14px rgba(0,85,255,0.24)" }}>
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <label
                  htmlFor="principal-logo-input"
                  className={`flex items-center gap-[6px] px-3 py-2 rounded-[11px] bg-white text-[11px] font-bold transition-transform ${logoUploading || logoRemoving ? "opacity-60 cursor-wait" : "hover:scale-[1.02] cursor-pointer"}`}
                  style={{ color: T2, border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: SH }}
                >
                  {logoUploading
                    ? <Loader2 className="w-[12px] h-[12px] animate-spin" />
                    : <Upload className="w-[12px] h-[12px]" strokeWidth={2.4} />}
                  {logoUploading ? "Uploading…" : (logoUrl ? "Replace Logo" : "Upload Logo")}
                </label>
                <input
                  id="principal-logo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  hidden
                  disabled={logoUploading || logoRemoving}
                  onChange={onPickLogo}
                />
                {logoUrl && (
                  <button
                    onClick={onRemoveLogo}
                    disabled={logoUploading || logoRemoving}
                    className="flex items-center gap-[6px] px-3 py-2 rounded-[11px] text-[11px] font-bold transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:cursor-wait"
                    style={{ background: RED_S, color: RED, border: `0.5px solid ${RED_B}` }}
                  >
                    {logoRemoving ? <Loader2 className="w-[12px] h-[12px] animate-spin" /> : <X className="w-[12px] h-[12px]" strokeWidth={2.4} />}
                    Remove
                  </button>
                )}
              </div>
              <div className="text-[9px] font-medium mt-[6px]" style={{ color: T4 }}>
                Recommended: 200×200 PNG or JPG (max 5 MB) · used as the brand mark on every report
              </div>
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
        <SaveBar saving={saving} onClick={handleSave} disabled={!isDirty} />
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
  // isDirty snapshot — same pattern as SchoolProfileTab.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const currentSnap = JSON.stringify({ passThreshold, gradeA, gradeB, gradeC, workingDays });
  const isDirty = currentSnap !== savedSnapshot;

  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, "schools", schoolId)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        const g = d.grading || {};
        const pT = String(g.passThreshold ?? 40);
        const gA = String(g.gradeA ?? 80);
        const gB = String(g.gradeB ?? 60);
        const gC = String(g.gradeC ?? 40);
        const wD = String(g.workingDays ?? 220);
        setPassThreshold(pT);
        setGradeA(gA);
        setGradeB(gB);
        setGradeC(gC);
        setWorkingDays(wD);
        setSavedSnapshot(JSON.stringify({
          passThreshold: pT, gradeA: gA, gradeB: gB, gradeC: gC, workingDays: wD,
        }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId]);

  const handleSave = async () => {
    if (!schoolId) return;
    // Validate grade threshold ordering — A > B > C >= passThreshold,
    // and 0-100 bounds. Earlier code saved any garbage (e.g. A=30 B=60 C=80
    // inverted) which broke downstream grade displays everywhere.
    const pT = Number(passThreshold), gA = Number(gradeA), gB = Number(gradeB), gC = Number(gradeC);
    const wD = Number(workingDays);
    if ([pT, gA, gB, gC].some(v => isNaN(v) || v < 0 || v > 100)) {
      return toast.error("All grade thresholds must be between 0 and 100.");
    }
    if (!(gA > gB && gB > gC)) {
      return toast.error("Grades must be ordered: A > B > C.");
    }
    if (gC < pT) {
      return toast.error("Grade C threshold cannot be below the Pass threshold.");
    }
    if (isNaN(wD) || wD < 1 || wD > 365) {
      return toast.error("Working days must be between 1 and 365.");
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, "schools", schoolId), {
        "grading.passThreshold": pT,
        "grading.gradeA": gA,
        "grading.gradeB": gB,
        "grading.gradeC": gC,
        "grading.workingDays": wD,
        updatedAt: serverTimestamp(),
      });
      setSavedSnapshot(currentSnap);
      toast.success("Academic settings saved.");
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

      </div>

      <div className="mt-4">
        <SaveBar saving={saving} onClick={handleSave} disabled={!isDirty} />
      </div>
    </div>
  );
}

function NotificationsTab({ isMobile, userData }: { isMobile: boolean; userData: any }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    emailNotifications: true, smsAlerts: true, pushNotifications: false,
    riskAlerts: true, attendanceAlerts: true, disciplineAlerts: true,
    parentMsgAlerts: true, examAlerts: true, weeklyReport: false,
  });
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const isDirty = JSON.stringify(prefs) !== savedSnapshot;
  const toggle = (k: string) => setPrefs(p => ({ ...p, [k]: !p[k as keyof typeof p] }));

  useEffect(() => {
    // Notifications are PER-PRINCIPAL. Earlier code wrote to the shared
    // schools/{id}.notifPrefs which collided across branches. Now stored
    // on principals/{userData.id}.notifPrefs.
    if (!userData?.id) { setLoading(false); return; }
    getDoc(doc(db, "principals", userData.id)).then(snap => {
      const next = snap.exists() && snap.data().notifPrefs
        ? { ...prefs, ...snap.data().notifPrefs }
        : prefs;
      setPrefs(next);
      setSavedSnapshot(JSON.stringify(next));
      setLoading(false);
    }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.id]);

  const handleSave = async () => {
    if (!userData?.id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "principals", userData.id), { notifPrefs: prefs, updatedAt: serverTimestamp() });
      setSavedSnapshot(JSON.stringify(prefs));
      toast.success("Notification preferences saved.");
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
      {/* Honesty banner: toggles save to Firestore but the email/SMS
          delivery pipeline is not yet wired. Earlier the page silently
          accepted toggles + showed a success toast — UX lie. */}
      <div className="px-[13px] py-[11px] rounded-[14px] flex items-start gap-[9px] mb-3"
        style={{ background: "rgba(255,170,0,0.07)", border: "0.5px solid rgba(255,170,0,0.28)" }}>
        <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" style={{ color: GOLD }} strokeWidth={2.3} />
        <div className="text-[11px] font-semibold leading-[1.5]" style={{ color: "#6B4400" }}>
          <strong>Delivery pipeline coming soon.</strong> Your toggles are saved
          to your principal profile and will activate automatically once the
          email/SMS service is connected. In-app alerts already use these prefs.
        </div>
      </div>

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
        <SaveBar saving={saving} onClick={handleSave} label="Save Preferences" disabled={!isDirty} />
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
  // Edit modal state — opens when a user card is clicked.
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("teacher");
  const [editStatus, setEditStatus] = useState("Active");
  const [editSaving, setEditSaving] = useState(false);
  const [editDeleting, setEditDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const branchId = userData?.branchId;

  useEffect(() => {
    if (!schoolId) return;
    const scopeC: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) scopeC.push(where("branchId", "==", branchId));
    // Users tab is the principal's TEACHER ROSTER — read only the
    // `teachers` collection. Principals are not managed here (they
    // belong to the owner-dashboard staff flow). Earlier code mixed
    // principals + teachers in one list which created confusion +
    // duplicates when the same email had records in both collections.
    getDocs(query(collection(db, "teachers"), ...scopeC)).then(tSnap => {
      // Force role = "teacher" — the docs in this collection often
      // omit a `role` field, which made them render as the default
      // orange "STAFF" badge.
      const teachers = tSnap.docs.map(d => {
        const data: any = d.data();
        return { id: d.id, ...data, _col: "teachers", role: "teacher" };
      });
      // Dedup by lowercase email (same teacher across branches collapses
      // to one row). Authority: Active > Pending Invite > Inactive.
      const statusRank = (s: string): number => {
        const v = String(s || "").toLowerCase();
        if (v === "active") return 3;
        if (v.includes("pending")) return 2;
        if (v === "inactive") return 1;
        return 0;
      };
      const byEmail = new Map<string, any>();
      teachers.forEach((u: any) => {
        const key = String(u.email || "").toLowerCase().trim() || `id:${u.id}`;
        const existing = byEmail.get(key);
        if (!existing || statusRank(u.status) > statusRank(existing.status)) {
          byEmail.set(key, u);
        }
      });
      const sorted = Array.from(byEmail.values()).sort((a: any, b: any) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
      setUsers(sorted);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [schoolId, branchId]);

  const handleAdd = async () => {
    if (!newName.trim() || !newEmail.trim()) return toast.error("Name and email required.");
    // Basic email format check.
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return toast.error("Invalid email address.");
    }
    // Reject duplicates within the visible user list.
    if (users.some(u => String(u.email || "").toLowerCase() === trimmedEmail)) {
      return toast.error("A user with this email already exists.");
    }
    setAdding(true);
    try {
      // Always creates a `teachers` collection entry — Users tab is the
      // teacher roster only. Status is "Pending Invite" until the
      // teacher logs in (handled by AccessRequests / AuthContext linking).
      const docRef = await addDoc(collection(db, "teachers"), {
        name: newName.trim(),
        email: trimmedEmail,
        role: "teacher",
        schoolId,
        branchId: branchId || "",
        status: "Pending Invite",
        createdAt: serverTimestamp(),
        invitedBy: userData?.id || null,
      });
      setUsers(prev => [...prev, {
        id: docRef.id, name: newName, email: trimmedEmail, role: "teacher",
        status: "Pending Invite", _col: "teachers",
      }]);
      setNewName(""); setNewEmail(""); setNewRole("teacher");
      setAddOpen(false);
      toast.success("Invite created — teacher is now Pending. They will activate on first login.");
    } catch (e: any) { toast.error(e.message); }
    setAdding(false);
  };

  // Open the edit modal — pre-fills with the clicked user's data.
  const openEdit = (u: any) => {
    setEditUser(u);
    setEditName(u.name || "");
    setEditRole(u.role || "teacher");
    setEditStatus(u.status || "Active");
    setConfirmDelete(false);
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    if (!editName.trim()) return toast.error("Name cannot be empty.");
    setEditSaving(true);
    try {
      await updateDoc(doc(db, editUser._col, editUser.id), {
        name: editName.trim(),
        role: editRole,
        status: editStatus,
        updatedAt: serverTimestamp(),
      });
      setUsers(prev => prev.map(u => u.id === editUser.id
        ? { ...u, name: editName.trim(), role: editRole, status: editStatus }
        : u));
      toast.success("User updated.");
      setEditUser(null);
    } catch (e: any) { toast.error(e.message); }
    setEditSaving(false);
  };

  // Soft-delete: removes the directory entry. Two-step confirm — first
  // click arms, second commits. Hard delete (no auth account exists yet
  // for Pending Invites; for Active users, the auth account is left in
  // Firebase Auth — they just lose access via the missing principal/
  // teacher record).
  const handleEditDelete = async () => {
    if (!editUser) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setEditDeleting(true);
    try {
      await deleteDoc(doc(db, editUser._col, editUser.id));
      setUsers(prev => prev.filter(u => u.id !== editUser.id));
      toast.success("User removed.");
      setEditUser(null);
    } catch (e: any) { toast.error(e.message); }
    setEditDeleting(false);
    setConfirmDelete(false);
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
          <span className="relative z-10">Add Teacher</span>
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
          <p className="text-[13px] font-bold" style={{ color: T1 }}>No teachers added yet</p>
          <p className="text-[11px]" style={{ color: T4 }}>Click "Add Teacher" to invite your first staff member</p>
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${isMobile ? "" : "md:grid-cols-2 xl:grid-cols-3"} gap-3`}>
          {users.map(u => {
            const theme = roleTheme(u.role || "teacher");
            const initials = (u.name || "?").split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
            const status = u.status || "Active";
            const statusLower = status.toLowerCase();
            const statusColor = statusLower === "active" ? GREEN_D
              : statusLower === "inactive" ? T4
              : statusLower.includes("pending") ? ORANGE
              : ORANGE;
            // Horizontal-row layout: accent stripe (left edge) → avatar
            // → name/email/badge stack → chevron. flex-row + items-center
            // is explicit so children align horizontally regardless of
            // card width.
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => openEdit(u)}
                className="bg-white rounded-[18px] py-[12px] pl-[16px] pr-[12px] flex flex-row items-center gap-[12px] relative overflow-hidden cursor-pointer transition-transform hover:scale-[1.01] text-left w-full min-h-[80px]"
                style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
                {/* Accent stripe */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: theme.accent }} />
                {/* Avatar */}
                <div
                  className="w-[46px] h-[46px] rounded-[13px] flex items-center justify-center text-[14px] font-bold text-white shrink-0"
                  style={{ background: theme.avatar, boxShadow: `0 3px 10px ${theme.color}33` }}>
                  {initials}
                </div>
                {/* Content (middle) */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="text-[13px] font-bold truncate" style={{ color: T1, letterSpacing: "-0.2px" }}>{u.name || "—"}</div>
                  <div className="text-[10px] truncate mt-[1px]" style={{ color: T3 }}>{u.email || "—"}</div>
                  <div className="flex items-center gap-[6px] mt-[5px] flex-wrap">
                    <span className="inline-flex items-center px-[8px] py-[2px] rounded-full text-[9px] font-bold uppercase tracking-[0.06em]"
                      style={{ background: theme.bg, color: theme.color, border: `0.5px solid ${theme.border}` }}>
                      {u.role || "teacher"}
                    </span>
                    <span className="inline-flex items-center gap-[3px] text-[9px] font-bold" style={{ color: statusColor }}>
                      <CheckCircle2 className="w-[10px] h-[10px]" />
                      {status}
                    </span>
                  </div>
                </div>
                {/* Chevron (right) */}
                <div className="w-[28px] h-[28px] rounded-[9px] flex items-center justify-center shrink-0 ml-auto"
                  style={{ background: BG, border: `0.5px solid rgba(0,85,255,0.10)` }}>
                  <ChevronRight className="w-[13px] h-[13px]" style={{ color: T4 }} strokeWidth={2.3} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[22px] p-6 w-full max-w-md animate-in zoom-in-95 duration-200"
            style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold" style={{ color: T1, letterSpacing: "-0.3px" }}>Invite New Teacher</h3>
              <button onClick={() => setAddOpen(false)} className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: BG, color: T4 }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Honesty banner — earlier the modal claimed "added successfully"
                while creating a record the user couldn't actually log in to. */}
            <div className="px-3 py-[9px] rounded-[12px] flex items-start gap-[8px] mb-3"
              style={{ background: "rgba(0,85,255,0.07)", border: "0.5px solid rgba(0,85,255,0.18)" }}>
              <AlertTriangle className="w-[14px] h-[14px] shrink-0 mt-[1px]" style={{ color: B1 }} strokeWidth={2.3} />
              <div className="text-[10px] font-medium leading-[1.5]" style={{ color: T2 }}>
                Creates a teacher record only. The teacher is marked <strong>Pending Invite</strong> and will activate when they log in for the first time using this email.
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Full Name" value={newName} onChange={setNewName} placeholder="Firstname Lastname" icon={User} />
              <Field label="Email" value={newEmail} onChange={setNewEmail} type="email" placeholder="teacher@school.edu" icon={Mail} />
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
                {adding ? <><Loader2 className="w-4 h-4 animate-spin relative z-10" /><span className="relative z-10">Sending invite…</span></>
                        : <span className="relative z-10">Send Invite</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[22px] p-6 w-full max-w-md animate-in zoom-in-95 duration-200"
            style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold" style={{ color: T1, letterSpacing: "-0.3px" }}>Edit Teacher</h3>
              <button onClick={() => setEditUser(null)} className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                style={{ background: BG, color: T4 }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <Field label="Full Name" value={editName} onChange={setEditName} icon={User} />
              <Field label="Email" value={editUser.email || ""} onChange={() => { /* email is read-only — it's the auth identifier */ }} type="email" icon={Mail} />
              <div className="text-[9px] font-medium -mt-[6px]" style={{ color: T4 }}>Email is the login identifier and cannot be changed here.</div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.06em] block mb-[5px]" style={{ color: T3 }}>Role</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  className="w-full rounded-[12px] px-3 py-[11px] text-[12px] font-semibold outline-none appearance-none cursor-pointer"
                  style={{
                    background: BG, border: `0.5px solid rgba(0,85,255,0.12)`, color: T1, fontFamily: "inherit",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235070B0' stroke-width='2.4' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat", backgroundPosition: "right 13px center", paddingRight: 34,
                  }}>
                  <option value="teacher">Teacher</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.06em] block mb-[5px]" style={{ color: T3 }}>Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                  className="w-full rounded-[12px] px-3 py-[11px] text-[12px] font-semibold outline-none appearance-none cursor-pointer"
                  style={{
                    background: BG, border: `0.5px solid rgba(0,85,255,0.12)`, color: T1, fontFamily: "inherit",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235070B0' stroke-width='2.4' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat", backgroundPosition: "right 13px center", paddingRight: 34,
                  }}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive (revoked access)</option>
                  <option value="Pending Invite">Pending Invite</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleEditDelete} disabled={editSaving || editDeleting}
                className="h-11 px-4 rounded-[12px] flex items-center justify-center gap-2 text-[11px] font-bold disabled:opacity-60 transition-colors"
                style={{
                  background: confirmDelete ? RED : RED_S,
                  color: confirmDelete ? "#fff" : RED,
                  border: `0.5px solid ${confirmDelete ? RED : RED_B}`,
                }}>
                {editDeleting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Removing…</span></>
                  : confirmDelete
                    ? <span>Confirm Delete?</span>
                    : <span>Remove Teacher</span>}
              </button>
              <div className="flex-1" />
              <button onClick={() => setEditUser(null)}
                className="h-11 px-4 rounded-[12px] text-[12px] font-bold bg-white"
                style={{ border: `0.5px solid ${SEP}`, color: T3, boxShadow: SH }}>
                Cancel
              </button>
              <button onClick={handleEditSave} disabled={editSaving || editDeleting}
                className="h-11 px-4 rounded-[12px] flex items-center justify-center gap-2 text-[12px] font-bold text-white relative overflow-hidden disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                {editSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin relative z-10" /><span className="relative z-10">Saving…</span></>
                  : <span className="relative z-10">Save</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default SettingsPage;
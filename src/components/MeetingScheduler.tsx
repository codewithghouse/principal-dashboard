import { useState } from "react";
import { X, Calendar, Clock, Users, CheckCircle, Loader2, Video, MapPin } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-fill context — e.g. student name, teacher name */
  context?: {
    type: "student" | "teacher" | "parent";
    name: string;
    id?: string;
    email?: string;
    reason?: string;
  };
}

const MEETING_TYPES = ["Parent Meeting", "Teacher Review", "Student Counselling", "Department Meeting", "Risk Intervention"];
const LOCATIONS     = ["Principal's Office", "Conference Room", "Virtual (Google Meet)", "Virtual (Zoom)", "Classroom"];

const MeetingScheduler = ({ open, onClose, context }: Props) => {
  const { userData } = useAuth();

  const today = new Date().toLocaleDateString("en-CA");
  const defaultTime = new Date();
  defaultTime.setMinutes(0);
  const timeStr = defaultTime.toLocaleTimeString("en-CA", { hour:"2-digit", minute:"2-digit" });

  const [form, setForm] = useState({
    title:       context ? `${context.type === "student" ? "Student Counselling" : context.type === "teacher" ? "Teacher Review" : "Parent Meeting"} — ${context.name}` : "",
    type:        MEETING_TYPES[0],
    date:        today,
    time:        timeStr,
    duration:    "30",
    location:    LOCATIONS[0],
    attendees:   context?.name ?? "",
    agenda:      context?.reason ?? "",
    notes:       "",
  });
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.title || !form.date || !form.time) {
      toast.error("Please fill in title, date, and time");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "meetings"), {
        ...form,
        duration:    parseInt(form.duration),
        schoolId:    userData?.schoolId,
        branchId:    userData?.branchId,
        createdBy:   userData?.email,
        status:      "Scheduled",
        contextType: context?.type,
        contextId:   context?.id,
        contextEmail:context?.email,
        createdAt:   serverTimestamp(),
      });
      setDone(true);
      toast.success("Meeting scheduled successfully");
      setTimeout(() => { setDone(false); onClose(); }, 1800);
    } catch (e: any) {
      toast.error("Failed to schedule meeting: " + e.message);
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-[#1e3a8a] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Schedule Meeting</h2>
              {context && <p className="text-xs text-blue-200 font-medium">Context: {context.name}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-sm font-bold text-[#1e294b]">Meeting Scheduled!</p>
            <p className="text-xs text-slate-400">{form.date} at {form.time}</p>
          </div>
        ) : (
          <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">

            {/* Title */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Meeting Title *</label>
              <input value={form.title} onChange={set("title")}
                className="w-full h-10 px-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all"
                placeholder="e.g. Risk Intervention — Aryan Sharma" />
            </div>

            {/* Type + Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Type</label>
                <select value={form.type} onChange={set("type")}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all">
                  {MEETING_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Duration</label>
                <select value={form.duration} onChange={set("duration")}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all">
                  {["15","30","45","60","90"].map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1"><Clock className="w-3 h-3" /> Date *</label>
                <input type="date" value={form.date} onChange={set("date")} min={today}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1"><Clock className="w-3 h-3" /> Time *</label>
                <input type="time" value={form.time} onChange={set("time")}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all" />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</label>
              <select value={form.location} onChange={set("location")}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all">
                {LOCATIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>

            {/* Attendees */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block flex items-center gap-1"><Users className="w-3 h-3" /> Attendees</label>
              <input value={form.attendees} onChange={set("attendees")}
                className="w-full h-10 px-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all"
                placeholder="Names or emails, comma-separated" />
            </div>

            {/* Agenda */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Agenda / Reason</label>
              <textarea value={form.agenda} onChange={set("agenda")} rows={2}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 transition-all resize-none"
                placeholder="Purpose of the meeting..." />
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 pt-2">
              <button onClick={onClose}
                className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 h-11 rounded-xl bg-[#1e3a8a] text-white text-xs font-black hover:bg-[#1e4fc0] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                {saving ? "Scheduling..." : "Schedule Meeting"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingScheduler;

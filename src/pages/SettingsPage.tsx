import { useState, useEffect } from "react";
import { 
  Settings as SettingsIcon, School, Users, Bell, Shield, 
  Database, Upload, Mail, Phone, Globe, MapPin, Calendar, 
  User, Save, ChevronRight, Loader2
} from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

const tabs = [
  { id: 'profile', label: "School Profile" },
  { id: 'academic', label: "Academic Settings" },
  { id: 'notifications', label: "Notifications" },
  { id: 'users', label: "Users & Permissions" },
  { id: 'data', label: "Data Management" },
];

const SettingsPage = () => {
  const { user, userData } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    schoolName: userData?.schoolName || "EduIntellect International School",
    address: userData?.address || "",
    phone: userData?.phone || userData?.schoolPhone || "",
    email: userData?.schoolEmail || "",
    website: userData?.website || "",
    principalName: userData?.name || user?.displayName || "",
    principalEmail: userData?.email || user?.email || "",
    principalPhone: userData?.phone || ""
  });

  const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;

  useEffect(() => {
    if (!schoolId) return;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, "schools", schoolId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          // Helper to check if a value is dummy/placeholder
          const isDummy = (val: string) => !val || 
            val.toLowerCase().includes("satish") || 
            val.toLowerCase().includes("prasad") || 
            val.toLowerCase().includes("dummy") || 
            val.toLowerCase().includes("admin@eduintellect.com");

          setFormData(prev => ({
            ...prev,
            schoolName: data.name || prev.schoolName,
            address: data.address || prev.address,
            phone: data.phone || prev.phone,
            email: data.email || prev.email,
            website: data.website || prev.website,
            principalName:  !isDummy(data.principalName)  ? data.principalName  : (userData?.name  || user?.displayName || prev.principalName),
            principalEmail: !isDummy(data.principalEmail) ? data.principalEmail : (userData?.email || user?.email        || prev.principalEmail),
            principalPhone: !isDummy(data.principalPhone) ? data.principalPhone : (userData?.phone || prev.principalPhone)
          }));
        } else {
          setFormData(prev => ({
            ...prev,
            schoolName: userData?.schoolName || prev.schoolName,
            principalName: userData?.name || user?.displayName || prev.principalName,
            principalEmail: userData?.email || user?.email || prev.principalEmail,
            principalPhone: userData?.phone || prev.principalPhone
          }));
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [user, userData, schoolId]);

  const handleSave = async () => {
    if (!schoolId) return toast.error("No School ID found. Cannot save.");
    setIsSaving(true);
    try {
      const docRef = doc(db, "schools", schoolId);
      await updateDoc(docRef, {
        name: formData.schoolName,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
        website: formData.website,
        principalName: formData.principalName,
        principalEmail: formData.principalEmail,
        principalPhone: formData.principalPhone,
        updatedAt: new Date()
      });
      toast.success("Settings updated successfully!");
    } catch (err: any) {
      toast.error("Failed to update settings: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500 pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-[#1e293b] tracking-tight">System Configuration</h1>
          <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">Control Center for {formData.schoolName}</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-3 px-10 py-4 bg-[#1e3a8a] text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-indigo-200 hover:scale-[1.05] transition-all disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isSaving ? "Saving..." : "Commit Changes"}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-10 border-b border-slate-100 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-5 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${
              activeTab === tab.id 
              ? 'text-[#1e3a8a]' 
              : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#1e3a8a] rounded-t-full shadow-[0_-4px_12px_rgba(30,58,138,0.3)]" />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: School Information */}
        <div className="lg:col-span-12 xl:col-span-8 space-y-10">
          <div className="bg-card border border-border rounded-[3rem] p-12 shadow-sm">
            <h2 className="text-xl font-black text-[#1e293b] mb-12 flex items-center gap-3">
               <School className="w-6 h-6 text-indigo-600" /> Administrative Identity
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Institutional Title</label>
                <input 
                  type="text" 
                  value={formData.schoolName}
                  onChange={e => setFormData({...formData, schoolName: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-black text-[#1e293b] focus:bg-white focus:ring-4 focus:ring-indigo-100/50 outline-none transition-all shadow-inner"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Primary Headquarters</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 pl-14 text-base font-black text-[#1e293b] focus:bg-white focus:ring-4 focus:ring-indigo-100/50 outline-none transition-all shadow-inner"
                  />
                  <MapPin className="absolute left-5 top-5 w-6 h-6 text-slate-300" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Relay Contact (Phone)</label>
                <div className="relative">
                  <input 
                    type="tel" 
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 pl-14 text-base font-black text-[#1e293b] focus:bg-white focus:ring-4 focus:ring-indigo-100/50 outline-none transition-all shadow-inner"
                  />
                  <Phone className="absolute left-5 top-5 w-6 h-6 text-slate-300" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Public Domain (Website)</label>
                <div className="relative">
                  <input 
                    type="url" 
                    value={formData.website}
                    onChange={e => setFormData({...formData, website: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 pl-14 text-base font-black text-[#1e293b] focus:bg-white focus:ring-4 focus:ring-indigo-100/50 outline-none transition-all shadow-inner"
                  />
                  <Globe className="absolute left-5 top-5 w-6 h-6 text-slate-300" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-12 shadow-2xl text-white">
            <h2 className="text-xl font-black uppercase tracking-tight mb-10 flex items-center gap-3">
               <User className="w-6 h-6 text-indigo-400" /> Principal Secretariat
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Executive Name</label>
                <input 
                  type="text" 
                  value={formData.principalName}
                  onChange={e => setFormData({...formData, principalName: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-base font-black text-white focus:bg-white/10 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all"
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Direct Secure Mail</label>
                <input 
                  type="email" 
                  value={formData.principalEmail}
                  onChange={e => setFormData({...formData, principalEmail: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-base font-black text-white focus:bg-white/10 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Assets & Status */}
        <div className="lg:col-span-12 xl:col-span-4 space-y-10">
          <div className="bg-card border border-border rounded-[3rem] p-10 shadow-sm text-center">
             <div className="w-32 h-32 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-4xl font-black text-[#1e3a8a] mx-auto mb-8 shadow-xl border-4 border-white">
                {formData.schoolName.substring(0, 2).toUpperCase()}
             </div>
             <button className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-slate-50 rounded-2xl text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] hover:bg-slate-50 transition-all shadow-sm">
                <Upload className="w-5 h-5" /> Re-upload Logo
             </button>
             <p className="mt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60 line-clamp-1">{formData.website}</p>
          </div>

          <div className="bg-gradient-to-br from-[#1e3a8a] to-blue-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
             <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
             <h3 className="text-lg font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <Shield className="w-6 h-6 text-blue-300" /> Security Status
             </h3>
             <div className="space-y-6">
                <div className="flex justify-between items-center bg-white/5 p-5 rounded-2xl border border-white/10 backdrop-blur-sm">
                   <p className="text-xs font-black uppercase tracking-widest">Two-Factor Auth</p>
                   <div className="w-12 h-6 bg-green-500 rounded-full flex items-center px-1 shadow-inner">
                      <div className="w-4 h-4 bg-white rounded-full shadow-md ml-auto"></div>
                   </div>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-5 rounded-2xl border border-white/10 backdrop-blur-sm">
                   <p className="text-xs font-black uppercase tracking-widest">Daily Data Backups</p>
                   <div className="w-12 h-6 bg-slate-600 rounded-full flex items-center px-1 shadow-inner opacity-50">
                      <div className="w-4 h-4 bg-slate-300 rounded-full shadow-md"></div>
                   </div>
                </div>
             </div>
             <button className="w-full py-5 mt-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/20 transition-all">Audit Permissions</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

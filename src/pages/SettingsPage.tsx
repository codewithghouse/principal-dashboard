import { useState } from "react";
import { 
  Settings as SettingsIcon, School, Users, Bell, Shield, 
  Database, Upload, Mail, Phone, Globe, MapPin, Calendar, 
  User, Save, ChevronRight
} from "lucide-react";

const tabs = [
  { id: 'profile', label: "School Profile" },
  { id: 'academic', label: "Academic Settings" },
  { id: 'notifications', label: "Notifications" },
  { id: 'users', label: "Users & Permissions" },
  { id: 'data', label: "Data Management" },
];

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500 pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-[#1e293b]">Settings</h1>
          <p className="text-sm text-slate-400 font-medium">Configure school and system settings</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-[#1e3a8a] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:scale-[1.02] transition-all">
          <Save className="w-4 h-4" /> Save Changes
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-8 border-b border-slate-100 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-4 text-sm font-black transition-all relative ${
              activeTab === tab.id 
              ? 'text-[#1e3a8a]' 
              : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#1e3a8a] rounded-t-full shadow-[0_-2px_6px_rgba(30,58,138,0.2)]" />
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: School Information */}
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-[#1e293b] mb-8">School Information</h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">School Name</label>
                <input 
                  type="text" 
                  placeholder="Enter school name"
                  defaultValue="EduIntellect International School"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-[#1e293b] focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Address</label>
                <div className="relative">
                  <input 
                    type="text" 
                    defaultValue="123 School Road, Banjara Hills, Hyderabad, Telangana 500034"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 text-sm font-bold text-[#1e293b] focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                  <MapPin className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Phone</label>
                  <div className="relative">
                    <input 
                      type="tel" 
                      defaultValue="+91 98765 43210"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 text-sm font-bold text-[#1e293b] focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                    <Phone className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Email</label>
                  <div className="relative">
                    <input 
                      type="email" 
                      defaultValue="admin@eduintellect.com"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 text-sm font-bold text-[#1e293b] focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                    <Mail className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Website</label>
                <div className="relative">
                  <input 
                    type="url" 
                    defaultValue="https://www.eduintellect-school.com"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 text-sm font-bold text-[#1e293b] focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                  <Globe className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-[#1e293b] mb-8">School Logo</h2>
            <div className="flex items-center gap-8">
               <div className="w-24 h-24 rounded-[2rem] bg-[#1e3a8a] flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-blue-100">
                  SM
               </div>
               <button className="flex items-center gap-2 px-6 py-3 border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all">
                  <Upload className="w-4 h-4" /> Upload New Logo
               </button>
            </div>
          </div>
        </div>

        {/* Right Column: Academic & Principal */}
        <div className="lg:col-span-5 space-y-8">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-[#1e293b] mb-8">Academic Year</h2>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Start Date</label>
                  <input type="date" defaultValue="2026-04-01" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-500 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">End Date</label>
                  <input type="date" defaultValue="2027-03-31" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-500 outline-none" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Current Session</label>
                <input 
                  type="text" 
                  defaultValue="2026-27"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-[#1e293b] focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h2 className="text-lg font-black text-[#1e293b] mb-8">Principal Information</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase pl-1">Principal Name</label>
                <div className="relative">
                  <input 
                    type="text" 
                    defaultValue="Dr. Satish Prasad"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 text-sm font-bold text-[#1e293b] outline-none"
                  />
                  <User className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase pl-1">Email</label>
                <div className="relative">
                  <input 
                    type="email" 
                    defaultValue="satish.prasad@eduintellect.com"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 text-sm font-bold text-[#1e293b] outline-none"
                  />
                  <Mail className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase pl-1">Phone</label>
                <div className="relative">
                  <input 
                    type="tel" 
                    defaultValue="+91 99887 76655"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 text-sm font-bold text-[#1e293b] outline-none"
                  />
                  <Phone className="absolute left-4 top-4 w-5 h-5 text-slate-300" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;


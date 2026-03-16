import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { Button } from "../components/ui/button";
import { GraduationCap, ShieldCheck, Mail, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { loginWithGoogle, loading, error } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      toast.error("Login failed. Please try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[100px] animate-pulse" />
      </div>

      <div className="w-full max-w-md relative animate-in fade-in zoom-in duration-700">
        {/* Logo Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[#1e3a8a] text-white shadow-2xl shadow-blue-900/20 mb-6 font-bold text-3xl">
            <GraduationCap className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-black text-[#1e294b] tracking-tight italic">EduIntellect</h1>
          <p className="text-slate-500 font-bold mt-2 uppercase tracking-[0.2em] text-xs">Principal Dashboard</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl p-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#1e294b]">Welcome Back</h2>
            <p className="text-slate-400 font-medium text-sm mt-1">Please login to manage your branch</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-rose-600 leading-relaxed">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <Button 
              onClick={handleLogin}
              disabled={isLoggingIn || loading}
              className="w-full h-14 rounded-2xl bg-white border-2 border-slate-100 text-[#1e294b] hover:bg-slate-50 hover:border-blue-200 transition-all duration-300 flex items-center justify-center gap-3 group relative overflow-hidden shadow-sm hover:shadow-md"
            >
              {isLoggingIn ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#1e3a8a]" />
              ) : (
                <img 
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                  alt="Google" 
                  className="w-5 h-5 group-hover:scale-110 transition-transform"
                />
              )}
              <span className="font-bold text-sm tracking-tight">Sign in with Google</span>
            </Button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-4 text-slate-300 font-bold tracking-widest">Secure Access</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/50 flex flex-col items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#1e3a8a]" />
                <span className="text-[10px] font-black text-[#1e3a8a] uppercase">Verified</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/50 flex flex-col items-center gap-2">
                <Mail className="w-5 h-5 text-[#1e3a8a]" />
                <span className="text-[10px] font-black text-[#1e3a8a] uppercase">Invitations</span>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-[11px] font-bold text-slate-400 px-6 uppercase tracking-wider">
              Only invited principals can access this console
            </p>
          </div>
        </div>

        {/* Tech Stack Info */}
        <div className="mt-8 flex items-center justify-center gap-6 opacity-30 grayscale">
           <img src="https://firebase.google.com/downloads/brand-guidelines/PNG/logo-logomark.png" className="h-5 opacity-50" alt="Firebase" />
           <div className="h-4 w-[1px] bg-slate-400"></div>
           <span className="text-[10px] font-black tracking-widest text-[#1e294b]">CLOUD ARCHITECTURE</span>
        </div>
      </div>
    </div>
  );
}

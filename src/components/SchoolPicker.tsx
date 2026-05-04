/**
 * SchoolPicker.tsx
 *
 * Modal shown when a logged-in user matches MORE than one principal record
 * (multi-school principal, OR a user who accidentally registered as owner
 * AND was also invited as principal at one or more schools).
 *
 * Picking a school:
 *  • Saves the chosen schoolId to localStorage so subsequent logins skip the
 *    picker and silently use the saved choice.
 *  • Calls the parent's onPick callback which re-runs the auth flow with
 *    `preferredSchoolId` set, causing the Cloud Function to set claims
 *    against the chosen school.
 */

import { GraduationCap, Building2, Loader2, X } from "lucide-react";

export interface SchoolOption {
  /** Firestore principal doc id. */
  id: string;
  schoolId: string;
  schoolName: string;
  branchName?: string;
  status?: string;
  lastActive?: string;
}

export const SELECTED_SCHOOL_KEY = "principal_dashboard.selectedSchoolId";

interface Props {
  options: SchoolOption[];
  onPick: (schoolId: string) => void;
  onCancel?: () => void;
  /** True while the auth flow is re-running after pick. Disables buttons. */
  busy?: boolean;
  /** Email shown in the header so user knows which account is logged in. */
  email?: string;
}

export default function SchoolPicker({ options, onPick, onCancel, busy, email }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="school-picker-title"
    >
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#1e3a8a] px-6 py-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <h2
                id="school-picker-title"
                className="text-base font-black text-white tracking-tight"
              >
                Choose your school
              </h2>
              <p className="text-[11px] text-blue-200 mt-0.5">
                {email
                  ? `${email} is principal at ${options.length} school${options.length === 1 ? "" : "s"}`
                  : `Found ${options.length} principal record${options.length === 1 ? "" : "s"} for this account`}
              </p>
            </div>
          </div>
          {onCancel && !busy && (
            <button
              onClick={onCancel}
              aria-label="Close"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.id}
              disabled={busy}
              onClick={() => onPick(opt.schoolId)}
              className="w-full text-left rounded-2xl border-2 border-slate-100 hover:border-[#1e3a8a]/30 hover:bg-slate-50 transition-all px-4 py-4 disabled:opacity-50 disabled:cursor-wait"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1e3a8a]/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-[#1e3a8a]" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {opt.schoolName || "Unnamed school"}
                    </p>
                    {opt.status === "Active" && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-[2px] rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                        Active
                      </span>
                    )}
                  </div>
                  {opt.branchName && (
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                      Branch: {opt.branchName}
                    </p>
                  )}
                  {opt.lastActive && (
                    <p className="text-[10px] text-slate-400 mt-1">Last active: {opt.lastActive}</p>
                  )}
                </div>
                {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0 mt-1" />}
              </div>
            </button>
          ))}
        </div>

        <div className="px-5 pb-5">
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            Your choice is saved on this browser. Use the user menu to switch schools later.
          </p>
        </div>
      </div>
    </div>
  );
}

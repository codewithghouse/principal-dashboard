import { useState, useEffect } from 'react';
import {
  ChevronLeft, Calendar, MapPin, User, FileEdit,
  ArrowUpRight, Send, CheckCircle2, FileText, ShieldAlert,
  Check, Clock, ChevronDown, Plus, Loader2
} from 'lucide-react';
import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs, onSnapshot,
  doc, updateDoc, arrayUnion, limit
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

interface IncidentDetailProps {
  incident: any;
  onBack: () => void;
}

const STATUSES = ['Open', 'Under Review', 'Action Taken', 'Resolved'];

const getWorkflowStages = (status: string) => {
  const s = (status || 'Open').toLowerCase();
  return [
    { label: 'Reported',     done: true,                                             active: s === 'open' },
    { label: 'Under Review', done: ['under review','action taken','resolved'].includes(s), active: s === 'under review' },
    { label: 'Action Taken', done: ['action taken','resolved'].includes(s),          active: s === 'action taken' },
    { label: 'Resolved',     done: s === 'resolved',                                 active: s === 'resolved' }
  ];
};

const getSeverityColor = (sev: string) => {
  const s = (sev || '').toUpperCase();
  if (s === 'CRITICAL') return 'bg-red-500 text-white';
  if (s === 'HIGH')     return 'bg-orange-500 text-white';
  if (s === 'MEDIUM')   return 'bg-amber-400 text-white';
  return 'bg-slate-400 text-white';
};

const getStatusColor = (status: string) => {
  if (status === 'Resolved')     return 'text-green-600';
  if (status === 'Under Review') return 'text-amber-500';
  if (status === 'Action Taken') return 'text-blue-600';
  return 'text-slate-600';
};

const LOG_COLORS: Record<string, string> = {
  green: 'bg-green-500', blue: 'bg-blue-500',
  amber: 'bg-amber-500', red: 'bg-red-500', slate: 'bg-slate-400'
};

const IncidentDetail = ({ incident, onBack }: IncidentDetailProps) => {
  const { userData } = useAuth();
  const [localInc, setLocalInc]           = useState<any>(incident);
  const [notes, setNotes]                 = useState(incident?.resolutionNotes || '');
  const [saving, setSaving]               = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [relatedIncidents, setRelatedIncidents] = useState<any[]>([]);
  const [newAction, setNewAction]         = useState('');
  const [loggingAction, setLoggingAction] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // ── Real-time listener on this specific incident ──
  useEffect(() => {
    if (!incident?.id) return;
    const unsub = onSnapshot(doc(db, 'incidents', incident.id), (snap) => {
      if (snap.exists()) setLocalInc({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [incident?.id]);

  // ── Fetch related incidents (same student, different doc) ──
  useEffect(() => {
    if (!userData?.schoolId || !localInc?.student?.name) return;
    const scopeC: any[] = [where('schoolId', '==', userData.schoolId)];
    if (userData.branchId) scopeC.push(where('branchId', '==', userData.branchId));
    getDocs(query(
      collection(db, 'incidents'),
      ...scopeC,
      where('student.name', '==', localInc.student.name),
      limit(6)
    )).then(snap => {
      setRelatedIncidents(
        snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.id !== incident.id)
      );
    }).catch(() => {});
  }, [userData?.schoolId, userData?.branchId, localInc?.student?.name, incident.id]);

  const actorName = userData?.name || 'Principal';
  const now       = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const addLog = (action: string, color: string, extra: Record<string, any> = {}) =>
    updateDoc(doc(db, 'incidents', incident.id), {
      actionLog: arrayUnion({ action, time: now(), by: actorName, color }),
      ...extra
    });

  // ── Actions ──
  const updateStatus = async (newStatus: string) => {
    setSaving(true);
    try {
      await addLog(`Status changed to "${newStatus}"`, 'bg-blue-500', { status: newStatus });
    } finally {
      setSaving(false);
      setShowStatusPicker(false);
    }
  };

  const escalate = async () => {
    setSaving(true);
    try {
      await addLog('Incident escalated to CRITICAL priority', 'bg-red-500', { severity: 'CRITICAL' });
    } finally { setSaving(false); }
  };

  const notifyParents = async () => {
    setSaving(true);
    try {
      await addLog('Parents notified via SMS', 'bg-amber-500', { parentNotified: true });
    } finally { setSaving(false); }
  };

  const closeIncident = async () => {
    setSaving(true);
    try {
      // Bundle resolution notes + status change + action log in one write
      const logEntry = {
        action: notes.trim()
          ? `Incident closed and resolved. Notes: ${notes.trim()}`
          : 'Incident closed and resolved',
        time: now(), by: actorName, color: 'bg-green-500'
      };
      await updateDoc(doc(db, 'incidents', incident.id), {
        status: 'Resolved',
        resolutionNotes: notes,
        resolvedAt: new Date().toLocaleString('en-IN'),
        resolvedBy: actorName,
        actionLog: arrayUnion(logEntry),
      });
    } finally {
      setSaving(false);
      setShowCloseConfirm(false);
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'incidents', incident.id), { resolutionNotes: notes });
    } finally { setSaving(false); }
  };

  const logCustomAction = async () => {
    if (!newAction.trim()) return;
    setLoggingAction(true);
    try {
      await addLog(newAction.trim(), 'bg-blue-500');
      setNewAction('');
    } finally { setLoggingAction(false); }
  };

  const witnesses   = localInc?.witnesses   || [];
  const actionLog   = localInc?.actionLog   || [];
  const attachments = localInc?.attachments || [];
  const workflow    = getWorkflowStages(localInc?.status);

  const incidentId = localInc?.incidentId ||
    `#INC-${new Date().getFullYear()}-${(incident.id || '').slice(-4).toUpperCase()}`;

  const isCritical = ['HIGH', 'CRITICAL'].includes((localInc?.severity || '').toUpperCase());

  const displayLog = actionLog.length > 0 ? actionLog : [{
    action: 'Incident Reported',
    time:   localInc?.date || 'Recently',
    by:     localInc?.reportedBy || 'System',
    color:  'bg-green-500'
  }];

  return (
    <div className="animate-in fade-in duration-500 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <button onClick={onBack} className="hover:text-foreground transition-colors cursor-pointer">Discipline</button>
        <span>/</span>
        <span className="text-foreground font-semibold">Incident Detail</span>
      </div>

      {/* ===== INCIDENT HEADER ===== */}
      <div className={`rounded-2xl p-7 mb-6 shadow-sm border ${isCritical ? 'bg-red-50 border-red-200' : 'bg-card border-border'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">{incidentId}</span>
            <span className={`px-3 py-1 ${getSeverityColor(localInc?.severity)} text-[10px] font-black rounded-full uppercase tracking-wider shadow-sm`}>
              {(localInc?.severity || 'Medium').toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Status</span>
            <span className={`text-sm font-black ${getStatusColor(localInc?.status)}`}>
              {localInc?.status || 'Open'}
            </span>
          </div>
        </div>

        <h1 className="text-xl font-bold text-foreground mb-6">
          {localInc?.title || localInc?.type || 'Undocumented Incident'}
        </h1>

        {/* Workflow tracker */}
        <div className="flex items-center w-full mb-6 max-w-xl">
          {workflow.map((stage, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 ${
                  stage.done   ? 'bg-[#1e3a8a] border-[#1e3a8a] text-white' :
                  stage.active ? 'bg-blue-50 border-blue-400 text-blue-600' :
                                 'bg-slate-50 border-slate-200 text-slate-300'
                }`}>
                  {stage.done ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </div>
                <span className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-wider mt-1.5 ${
                  stage.active || stage.done ? 'text-foreground' : 'text-muted-foreground'
                }`}>{stage.label}</span>
              </div>
              {i < workflow.length - 1 && (
                <div className={`flex-1 h-1 rounded-full mx-2 mb-4 ${workflow[i+1].done || workflow[i+1].active ? 'bg-[#1e3a8a]' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground pt-4 border-t border-border/50">
          <span className="flex items-center gap-1.5 font-medium">
            <Calendar className="w-4 h-4" />
            {localInc?.date || 'Unknown Date'} {localInc?.time ? `• ${localInc.time}` : ''}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <MapPin className="w-4 h-4" /> {localInc?.location || 'Unknown Location'}
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <User className="w-4 h-4" /> Reported by: {localInc?.reportedBy || 'Anonymous'}
          </span>
          {localInc?.status === 'Resolved' && localInc?.resolvedAt && (
            <span className="flex items-center gap-1.5 font-bold text-green-600">
              <CheckCircle2 className="w-4 h-4" /> Resolved: {localInc.resolvedAt}
              {localInc.resolvedBy ? ` by ${localInc.resolvedBy}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ===== 3-COLUMN LAYOUT ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-6">
          {/* Involved Student */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Involved Student</h3>
            <div className="flex items-center gap-4 mb-5">
              <div className={`w-14 h-14 ${isCritical ? 'bg-red-500' : 'bg-slate-800'} rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0`}>
                {(localInc?.student?.name || 'UK').substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="text-base font-bold text-foreground">{localInc?.student?.name || 'Unknown Student'}</h4>
                <p className="text-xs text-muted-foreground font-medium">
                  {localInc?.student?.grade ? `Grade ${localInc.student.grade}` : ''}
                  {localInc?.student?.rollNo ? ` • Roll ${localInc.student.rollNo}` : ''}
                </p>
              </div>
            </div>
            <div className="space-y-2 pt-4 border-t border-border text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Previous Incidents</span>
                <span className={`font-black ${(localInc?.student?.previousIncidents || 0) > 2 ? 'text-red-500' : 'text-foreground'}`}>
                  {relatedIncidents.length || localInc?.student?.previousIncidents || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Risk Status</span>
                <span className={`font-black ${isCritical ? 'text-red-500' : 'text-amber-500'}`}>
                  {isCritical ? 'Critical' : 'Moderate'}
                </span>
              </div>
            </div>
            <button className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 text-[#1e3a8a] text-sm font-bold bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
              <User className="w-4 h-4" /> View Student Profile
            </button>
          </div>

          {/* Witnesses */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-foreground">Witnesses</h3>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-bold">{witnesses.length} Recorded</span>
            </div>
            {witnesses.length === 0 ? (
              <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500">No witnesses recorded</p>
              </div>
            ) : (
              <div className="space-y-3">
                {witnesses.map((w: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className={`w-9 h-9 rounded-full ${w.color || 'bg-[#1e3a8a]'} flex items-center justify-center text-white text-[10px] font-bold`}>
                      {(w.initials || w.name?.substring(0,2) || 'W').toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{w.name}</p>
                      {w.grade && <p className="text-[10px] text-muted-foreground">{w.grade}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── MIDDLE COLUMN ── */}
        <div className="space-y-6">
          {/* Incident Description */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Incident Description</h3>
            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
              <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">
                {localInc?.description || 'No detailed description available for this incident.'}
              </p>
            </div>
          </div>

          {/* Action Taken Log */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-6">Action Taken Log</h3>
            <div className="relative pl-4 border-l-2 border-slate-100 space-y-5">
              {displayLog.map((log: any, i: number) => {
                const dotClass = LOG_COLORS[log.color?.replace('bg-','').split('-')[0]] || log.color || 'bg-slate-400';
                return (
                  <div key={i} className="relative">
                    <div className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white ring-1 ring-slate-100 ${dotClass}`} />
                    <div className="pl-2">
                      <p className="text-sm font-bold text-foreground">{log.action}</p>
                      <p className="text-xs text-muted-foreground font-medium mt-0.5">
                        {log.time} {log.by ? `• by ${log.by}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Related Incidents */}
          {relatedIncidents.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-foreground mb-4">Related Incidents</h3>
              <div className="space-y-2">
                {relatedIncidents.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-sm font-medium text-foreground">{r.type || r.title || 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground font-medium">{r.date || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-6">
          {/* Take Action */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-5">Take Action</h3>
            <div className="space-y-3">
              {/* Update Status with dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowStatusPicker(p => !p)}
                  disabled={saving}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-xl text-sm font-bold bg-[#1e3a8a] text-white shadow-md hover:bg-[#1e4fc0] transition-all disabled:opacity-50"
                >
                  <span className="flex items-center gap-2"><FileEdit className="w-4 h-4" /> Update Status</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                {showStatusPicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
                    {STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(s)}
                        className={`w-full text-left px-4 py-3 text-sm font-bold hover:bg-secondary transition-colors border-b border-border last:border-0 ${localInc?.status === s ? 'text-[#1e3a8a]' : 'text-foreground'}`}
                      >
                        {localInc?.status === s && <Check className="w-3 h-3 inline mr-2" />}
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={escalate}
                disabled={saving || (localInc?.severity || '').toUpperCase() === 'CRITICAL'}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold bg-card border border-border text-foreground hover:bg-slate-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowUpRight className="w-4 h-4 text-red-500" /> Escalate
                {(localInc?.severity || '').toUpperCase() === 'CRITICAL' && <span className="ml-auto text-[10px] text-red-500 font-black">CRITICAL</span>}
              </button>

              <button
                onClick={notifyParents}
                disabled={saving || localInc?.parentNotified}
                className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold bg-card border border-border text-foreground hover:bg-slate-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4 text-amber-500" /> Notify Parents
                {localInc?.parentNotified && <span className="ml-auto text-[10px] text-green-500 font-black">SENT</span>}
              </button>

              {!showCloseConfirm ? (
                <button
                  onClick={() => setShowCloseConfirm(true)}
                  disabled={saving || localInc?.status === 'Resolved'}
                  className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold bg-card border border-border text-foreground hover:bg-slate-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4 text-green-500" /> Close Incident
                  {localInc?.status === 'Resolved' && <span className="ml-auto text-[10px] text-green-500 font-black">CLOSED</span>}
                </button>
              ) : (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
                  <p className="text-xs font-black text-green-800 uppercase tracking-widest">Confirm closure</p>
                  <p className="text-xs text-green-700">Resolution notes will be saved with this action.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCloseConfirm(false)}
                      className="flex-1 py-2 rounded-lg border border-green-200 text-xs font-bold text-green-700 bg-white hover:bg-green-100 transition-colors">
                      Cancel
                    </button>
                    <button onClick={closeIncident} disabled={saving}
                      className="flex-1 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Confirm Close
                    </button>
                  </div>
                </div>
              )}

              {/* ── Add custom action to log ─────────────────── */}
              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Log a Custom Action</p>
                <div className="flex gap-2">
                  <input
                    value={newAction}
                    onChange={e => setNewAction(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') logCustomAction(); }}
                    placeholder="e.g. Suspension issued for 2 days"
                    className="flex-1 h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-blue-300 transition-all"
                  />
                  <button
                    onClick={logCustomAction}
                    disabled={loggingAction || !newAction.trim()}
                    className="w-9 h-9 rounded-xl bg-[#1e3a8a] text-white flex items-center justify-center hover:bg-blue-800 transition-colors disabled:opacity-40"
                  >
                    {loggingAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[9px] text-slate-300">Press Enter or click + to add to the action timeline</p>
              </div>
            </div>
          </div>

          {/* Resolution Notes */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-foreground mb-4">Resolution Notes</h3>
            <textarea
              rows={4}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add resolution notes or follow-up remarks..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/20 focus:border-[#1e3a8a]/30 placeholder:text-slate-400"
            />
            <button
              onClick={saveNotes}
              disabled={saving}
              className="mt-3 w-full px-5 py-2.5 bg-[#1e3a8a] text-white rounded-xl text-sm font-bold hover:bg-[#1e4fc0] transition-colors shadow-md disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>

          {/* Attachments */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground">Attachments</h3>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-bold">{attachments.length} Files</span>
            </div>
            {attachments.length === 0 ? (
              <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs font-bold text-slate-500">
                No attachments uploaded
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((file: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 p-3 border border-border rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-foreground">{file.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Back */}
      <div className="mt-8">
        <button
          onClick={onBack}
          className="px-6 py-2.5 bg-card border border-border rounded-xl text-sm font-bold text-foreground shadow-sm hover:bg-secondary transition-colors inline-flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Discipline
        </button>
      </div>
    </div>
  );
};

export default IncidentDetail;

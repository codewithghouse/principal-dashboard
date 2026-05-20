/**
 * AlumniPage.tsx (principal) — CRUD for alumni PDF documents.
 *
 * Schools share alumni info (newsletters, achievement showcases, reunion
 * announcements) primarily as PDFs. This page lets the principal upload,
 * list, and delete those PDFs. Teachers and parents see the same list
 * (read-only) on their dashboards.
 *
 * Storage:    alumni/{schoolId}/{branchSeg}/{timestamp}_{fileName}
 * Firestore:  alumni_documents/{auto}
 *   { schoolId, branchId, title, description, year, fileName, fileUrl,
 *     filePath, fileSize, uploadedAt, uploadedBy, uploadedByName }
 */

import { useEffect, useState } from "react";
import {
  Award, Upload, Trash2, Eye, Loader2, X, Plus, FileText,
  Calendar, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { db, storage } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { ref, deleteObject, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/lib/AuthContext";

const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30MB
const ALLOWED_TYPES = ["application/pdf"];

interface AlumniDoc {
  id: string;
  schoolId?: string;
  branchId?: string | null;
  title?: string;
  description?: string;
  year?: number | string;
  fileName?: string;
  fileUrl?: string;
  filePath?: string;
  fileSize?: number;
  uploadedAt?: any;
  uploadedBy?: string;
  uploadedByName?: string;
}

const T = {
  FONT: "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
  BG: "#EEF4FF",
  CARD: "#FFFFFF",
  T1: "#001040", T2: "#002080", T3: "#5070B0", T4: "#99AACC",
  P: "#0055FF",
  GREEN: "#00C853",
  RED: "#FF3355",
  ORANGE: "#FF8800",
  VIOLET: "#7B3FF4",
  SH: "0 0 0 0.5px rgba(0,85,255,0.10), 0 4px 16px rgba(0,85,255,0.12), 0 18px 44px rgba(0,85,255,0.15)",
  BDR: "0.5px solid rgba(0,85,255,0.10)",
};

const formatBytes = (n?: number): string => {
  if (!n || n <= 0) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let v = n; let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
};

const formatDate = (ts: any): string => {
  if (!ts) return "—";
  const d = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export default function AlumniPage() {
  const { userData } = useAuth();
  const [docs, setDocs] = useState<AlumniDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const schoolId = userData?.schoolId;
    if (!schoolId) { setLoading(false); return; }
    const branchId = userData?.branchId as string | undefined;
    const inBranch = (raw: any) => !branchId || !raw?.branchId || raw.branchId === branchId;

    const unsub = onSnapshot(
      query(collection(db, "alumni_documents"), where("schoolId", "==", schoolId)),
      (snap) => {
        const arr = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter(inBranch) as AlumniDoc[];
        // newest first
        arr.sort((a, b) => {
          const ta = a.uploadedAt?.toMillis?.() ?? 0;
          const tb = b.uploadedAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setDocs(arr);
        setLoading(false);
      },
      (err) => {
        console.error("[AlumniPage] listener failed:", err);
        toast.error("Failed to load alumni documents.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [userData?.schoolId, userData?.branchId]);

  const handleDelete = async (d: AlumniDoc) => {
    setDeleteId(d.id);
    try {
      // Best-effort storage delete first; Firestore delete is the source of truth.
      if (d.filePath) {
        try { await deleteObject(ref(storage, d.filePath)); }
        catch (e) { console.warn("[AlumniPage] storage delete failed (file may be missing):", e); }
      }
      await deleteDoc(doc(db, "alumni_documents", d.id));
      toast.success(`"${d.title || d.fileName}" deleted.`);
    } catch (e: any) {
      toast.error("Delete failed: " + (e?.message || "unknown"));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div style={{ background: T.BG, minHeight: "100vh", padding: "24px 16px 40px", fontFamily: T.FONT }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.6px", color: T.T4, margin: "0 0 4px", textTransform: "uppercase" }}>
            School branding
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", color: T.T1, margin: 0, lineHeight: 1.1, display: "flex", alignItems: "center", gap: 10 }}>
            <Award size={26} color={T.VIOLET} />
            Alumni
          </h1>
          <p style={{ fontSize: 12, color: T.T3, fontWeight: 500, marginTop: 6, margin: "6px 0 0", lineHeight: 1.5 }}>
            Upload alumni newsletters, achievement showcases, and reunion announcements as PDFs. Teachers + parents can view them on their dashboards.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "10px 16px", borderRadius: 12,
            background: `linear-gradient(135deg, ${T.P}, #1166FF)`,
            color: "#fff", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.2px",
            boxShadow: "0 6px 18px rgba(0,85,255,0.30)",
            fontFamily: T.FONT,
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Upload PDF
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 20px" }}>
          <Loader2 className="animate-spin" style={{ color: T.P }} size={28} />
        </div>
      )}

      {/* Empty state */}
      {!loading && docs.length === 0 && (
        <div style={{
          background: T.CARD, borderRadius: 18, padding: "48px 22px", textAlign: "center",
          boxShadow: T.SH, border: T.BDR,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "rgba(123,63,244,.10)",
            display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
          }}>
            <Award size={26} color={T.VIOLET} />
          </div>
          <p style={{ fontSize: 16, fontWeight: 800, color: T.T1, margin: "0 0 6px" }}>
            No alumni documents yet
          </p>
          <p style={{ fontSize: 12, color: T.T3, fontWeight: 500, margin: "0 0 16px", lineHeight: 1.55, maxWidth: 400, marginInline: "auto" }}>
            Upload your first alumni PDF — newsletter, notable-alumni showcase, or reunion brochure. Teachers and parents will see it instantly on their dashboards.
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 20px", borderRadius: 11,
              background: T.P, color: "#fff", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700, fontFamily: T.FONT,
            }}
          >
            <Upload size={14} /> Upload PDF
          </button>
        </div>
      )}

      {/* List */}
      {!loading && docs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {docs.map((d) => (
            <DocCard
              key={d.id}
              d={d}
              deleting={deleteId === d.id}
              onDelete={() => handleDelete(d)}
            />
          ))}
        </div>
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <UploadModal
          schoolId={userData?.schoolId || ""}
          branchId={(userData?.branchId as string | undefined) || null}
          uploadedBy={userData?.id || ""}
          uploadedByName={(userData as any)?.fullName || (userData as any)?.name || "Principal"}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </div>
  );
}

// ── Document card ──────────────────────────────────────────────────────────
const DocCard = ({ d, deleting, onDelete }: {
  d: AlumniDoc; deleting: boolean; onDelete: () => void;
}) => (
  <div style={{
    background: T.CARD, borderRadius: 16, padding: "14px 16px",
    boxShadow: T.SH, border: T.BDR,
    display: "flex", alignItems: "center", gap: 14,
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: 12,
      background: "rgba(255,51,85,.10)",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <FileText size={22} color={T.RED} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: T.T1, marginBottom: 3, letterSpacing: "-0.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {d.title || d.fileName || "Alumni document"}
      </div>
      {d.description && (
        <div style={{ fontSize: 12, color: T.T2, fontWeight: 600, marginBottom: 6, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {d.description}
        </div>
      )}
      {/* Metadata row — bumped from T4 #99AACC (washed-out) to T2 #002080
          with bolder weight + bigger size so each chip reads clearly. */}
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: T.T2, fontWeight: 700, flexWrap: "wrap", alignItems: "center" }}>
        {d.year && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar size={12} strokeWidth={2.5} color={T.T1} /> {String(d.year)}</span>}
        <span>{formatBytes(d.fileSize)}</span>
        <span>{formatDate(d.uploadedAt)}</span>
        {d.uploadedByName && <span style={{ color: T.T1 }}>· {d.uploadedByName}</span>}
      </div>
    </div>
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      {d.fileUrl && (
        <a
          href={d.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View PDF"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(0,85,255,.10)", color: T.P,
            display: "flex", alignItems: "center", justifyContent: "center",
            textDecoration: "none", border: "0.5px solid rgba(0,85,255,.18)",
          }}
        >
          <Eye size={15} />
        </a>
      )}
      <button
        onClick={onDelete}
        disabled={deleting}
        title="Delete"
        aria-label="Delete"
        className="custom-chrome"
        style={{
          // .custom-chrome zeroes padding via index.css. Without it the
          // global `button { padding: 8px 16px !important }` reduces the
          // 36×36 button to a 4px-wide content box and the trash icon
          // disappears (the View next to it is an <a>, not a button, so
          // it renders fine — that's why only this one looked empty).
          width: 36, height: 36, borderRadius: 10,
          background: "rgba(255,51,85,.10)", color: T.RED,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "0.5px solid rgba(255,51,85,.28)", cursor: deleting ? "wait" : "pointer",
          opacity: deleting ? 0.5 : 1,
        }}
      >
        {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} strokeWidth={2.4} />}
      </button>
    </div>
  </div>
);

// ── Upload modal ───────────────────────────────────────────────────────────
const UploadModal = ({ schoolId, branchId, uploadedBy, uploadedByName, onClose }: {
  schoolId: string; branchId: string | null; uploadedBy: string; uploadedByName: string; onClose: () => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [year, setYear] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const onPick = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) {
      toast.error(`File too large — max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    if (f.type && !ALLOWED_TYPES.includes(f.type)) {
      toast.error("Only PDF files are accepted.");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, "")); // sensible default
  };

  const onUpload = async () => {
    if (!schoolId) { toast.error("Session expired — please re-login."); return; }
    if (!file) { toast.error("Pick a PDF file first."); return; }
    if (!title.trim()) { toast.error("Title is required."); return; }

    setUploading(true);
    setProgress(0);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "alumni.pdf";
      const branchSeg = branchId || "_default";
      const filePath = `alumni/${schoolId}/${branchSeg}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, filePath);
      const task = uploadBytesResumable(storageRef, file, { contentType: "application/pdf" });

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => setProgress(snap.bytesTransferred / snap.totalBytes * 100),
          (err) => reject(err),
          () => resolve(),
        );
      });

      const fileUrl = await getDownloadURL(task.snapshot.ref);
      await addDoc(collection(db, "alumni_documents"), {
        schoolId,
        branchId: branchId || null,
        title: title.trim(),
        description: description.trim() || null,
        year: year.trim() || null,
        fileName: file.name,
        fileUrl,
        filePath,
        fileSize: file.size,
        uploadedAt: serverTimestamp(),
        uploadedBy: uploadedBy || null,
        uploadedByName: uploadedByName || null,
      });
      toast.success("Alumni PDF uploaded.");
      onClose();
    } catch (e: any) {
      console.error("[AlumniPage] upload failed:", e);
      toast.error("Upload failed: " + (e?.message || "unknown error"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,16,64,.45)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50,
        fontFamily: T.FONT,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.CARD, borderRadius: 18, width: "100%", maxWidth: 480,
          boxShadow: "0 24px 60px rgba(0,8,60,.40)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: T.BDR }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: T.T1, margin: 0 }}>Upload Alumni PDF</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="custom-chrome"
            style={{
              // .custom-chrome zeroes padding via index.css. Without it the
              // global `button { padding: 8px 16px !important }` reduces the
              // 30×30 button to a negative-width content box and the X icon
              // disappears entirely.
              width: 30, height: 30, borderRadius: 8,
              background: "rgba(0,85,255,.10)",
              border: "0.5px solid rgba(0,85,255,.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} color={T.T1} strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* File picker */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: T.T4, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
              PDF file *
            </label>
            <label
              htmlFor="alumni-file"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px", borderRadius: 12,
                background: "rgba(0,85,255,.04)", border: "0.5px dashed rgba(0,85,255,.30)",
                cursor: "pointer",
              }}
            >
              <Upload size={16} color={T.P} />
              <span style={{ fontSize: 12, fontWeight: 600, color: file ? T.T1 : T.T3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file ? file.name : "Click to choose PDF (max 30 MB)"}
              </span>
              {file && <CheckCircle2 size={14} color={T.GREEN} />}
            </label>
            <input
              id="alumni-file"
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => onPick(e.target.files?.[0] || null)}
            />
          </div>

          {/* Title */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: T.T4, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
              Title *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Alumni Newsletter 2024"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                background: "rgba(0,85,255,.04)", border: "0.5px solid rgba(0,85,255,.14)",
                fontSize: 13, color: T.T1, outline: "none", fontFamily: T.FONT,
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: T.T4, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's inside this PDF?"
              rows={2}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                background: "rgba(0,85,255,.04)", border: "0.5px solid rgba(0,85,255,.14)",
                fontSize: 12, color: T.T1, outline: "none", resize: "vertical", fontFamily: T.FONT,
              }}
            />
          </div>

          {/* Year */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.2px", color: T.T4, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
              Year / Batch (optional)
            </label>
            <input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g. 2024 or Class of 2018"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                background: "rgba(0,85,255,.04)", border: "0.5px solid rgba(0,85,255,.14)",
                fontSize: 13, color: T.T1, outline: "none", fontFamily: T.FONT,
              }}
            />
          </div>

          {/* Progress */}
          {uploading && (
            <div>
              <div style={{ height: 6, background: "rgba(0,85,255,.10)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: T.P, transition: "width 0.2s" }} />
              </div>
              <div style={{ fontSize: 10, color: T.T3, marginTop: 4, fontWeight: 600 }}>
                Uploading… {progress.toFixed(0)}%
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, padding: "0 20px 20px" }}>
          <button
            onClick={onClose}
            disabled={uploading}
            style={{
              flex: 1, padding: "10px", borderRadius: 11,
              background: T.CARD, color: T.T2, border: T.BDR, cursor: uploading ? "wait" : "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: T.FONT, opacity: uploading ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onUpload}
            disabled={uploading || !file || !title.trim()}
            style={{
              flex: 1, padding: "10px", borderRadius: 11,
              background: T.P, color: "#fff", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700, fontFamily: T.FONT,
              opacity: (uploading || !file || !title.trim()) ? 0.5 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {uploading ? <><Loader2 size={14} className="animate-spin" /> Uploading…</> : <>Upload</>}
          </button>
        </div>
      </div>
    </div>
  );
};

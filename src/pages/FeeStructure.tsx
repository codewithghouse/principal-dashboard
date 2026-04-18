import { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Upload, Download, FileSpreadsheet, Save, Trash2, Loader2,
  AlertCircle, CheckCircle2, Plus, Minus, DollarSign, Calendar,
  User, Search, ChevronRight,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs, addDoc, doc,
  serverTimestamp, deleteDoc,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";

/* ── types ──────────────────────────────────────────────── */
interface FeeRow {
  className: string;
  amounts: Record<string, number>;   // term → amount (class-level default)
}

interface StudentFeeRow {
  className: string;
  rollNo: string;
  studentName: string;
  amounts: Record<string, number>;   // term → amount
  discount: number;
  paid: number;
  pending: number;
  parentPhone?: string;
  parentName?: string;
}

type FeeMode = "class" | "student";

interface FeeStructure {
  id?: string;
  schoolId: string;
  branchId: string;
  branchName?: string;
  mode: FeeMode;                       // "class" = rows only · "student" = studentRows populated
  termTypes: string[];
  rows: FeeRow[];                      // class-level aggregate (always populated)
  studentRows?: StudentFeeRow[];       // per-student detail (if mode === "student")
  uploadedBy: string;
  uploadedByRole: string;
  uploadedAt?: any;
  academicYear?: string;
  isActive: boolean;
  notes?: string;
}

/* ── helpers ────────────────────────────────────────────── */
const CLASS_HEADER_ALIASES    = ["class", "classname", "class name", "grade", "section", "standard"];
const STUDENT_HEADER_ALIASES  = ["student name", "student", "name", "studentname"];
const ROLL_HEADER_ALIASES     = ["roll no", "rollno", "roll", "roll number", "admission no", "adm no"];
const DISCOUNT_ALIASES        = ["discount", "waiver", "rebate"];
const PAID_ALIASES            = ["paid", "amount paid", "collected"];
const PENDING_ALIASES         = ["pending", "due", "balance", "outstanding"];
const PHONE_ALIASES           = ["parent phone", "phone", "mobile", "contact", "parent mobile", "guardian phone", "whatsapp"];
const PARENT_NAME_ALIASES     = ["parent name", "guardian name", "father name", "mother name", "parent"];
const META_COLUMNS            = new Set<string>([
  ...CLASS_HEADER_ALIASES, ...STUDENT_HEADER_ALIASES, ...ROLL_HEADER_ALIASES,
  ...DISCOUNT_ALIASES, ...PAID_ALIASES, ...PENDING_ALIASES,
  ...PHONE_ALIASES, ...PARENT_NAME_ALIASES,
]);

function matchHeader(h: string, aliases: string[]): boolean {
  return aliases.includes(h.trim().toLowerCase());
}
function isClassHeader(h: string): boolean       { return matchHeader(h, CLASS_HEADER_ALIASES); }
function isStudentHeader(h: string): boolean     { return matchHeader(h, STUDENT_HEADER_ALIASES); }
function isRollHeader(h: string): boolean        { return matchHeader(h, ROLL_HEADER_ALIASES); }
function isDiscountHeader(h: string): boolean    { return matchHeader(h, DISCOUNT_ALIASES); }
function isPaidHeader(h: string): boolean        { return matchHeader(h, PAID_ALIASES); }
function isPendingHeader(h: string): boolean     { return matchHeader(h, PENDING_ALIASES); }
function isPhoneHeader(h: string): boolean       { return matchHeader(h, PHONE_ALIASES); }
function isParentNameHeader(h: string): boolean  { return matchHeader(h, PARENT_NAME_ALIASES); }
function isMetaHeader(h: string): boolean        { return META_COLUMNS.has(h.trim().toLowerCase()); }

function toNumber(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

function currency(n: number): string {
  return n.toLocaleString("en-IN");
}

/* ══════════════════════════════════════════════════════════ */
export default function FeeStructurePage() {
  const { userData } = useAuth();
  const schoolId = userData?.schoolId || "";
  const branchId = userData?.branchId || "";
  const role     = userData?.role || "principal";
  const uploaderEmail = userData?.email || "unknown";

  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [allStructures, setAllStructures] = useState<FeeStructure[]>([]);  // ALL uploads history
  const [draft,     setDraft]     = useState<FeeStructure | null>(null);
  const [academicYear, setAcademicYear] = useState<string>("");
  const [notes,     setNotes]     = useState<string>("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  /* Load ALL active structures for this branch (history) */
  const reloadStructures = async () => {
    try {
      const q = query(
        collection(db, "fee_structure"),
        where("schoolId", "==", schoolId),
        where("branchId", "==", branchId),
        where("isActive", "==", true),
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as FeeStructure));
      /* Sort newest first by uploadedAt */
      list.sort((a, b) => {
        const at = (a.uploadedAt?.toMillis?.() ?? 0) as number;
        const bt = (b.uploadedAt?.toMillis?.() ?? 0) as number;
        return bt - at;
      });
      setAllStructures(list);
      /* Auto-expand the first (latest) card so user sees it open */
      if (list[0]?.id && expandedIds.size === 0) {
        setExpandedIds(new Set([list[0].id]));
      }
    } catch (e) {
      console.error("[FeeStructure] load error:", e);
    }
  };

  useEffect(() => {
    if (!schoolId || !branchId) { setLoading(false); return; }
    (async () => {
      await reloadStructures();
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, branchId]);

  const toggleCard = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ── Excel upload handler — supports multi-sheet + single-sheet ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb   = XLSX.read(data, { type: "array" });

        /* Collect student rows across ALL sheets.
           Mode A (multi-sheet): sheet name = class name, rows = students
           Mode B (single sheet): old layout — "Class" column in rows       */
        const allStudentRows: StudentFeeRow[] = [];
        const allClassRows:   FeeRow[] = [];
        const termTypeSet = new Set<string>();
        let anyStudentRow = false;
        let anyClassRow   = false;

        for (const sheetName of wb.SheetNames) {
          const ws   = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
          if (!rows.length) continue;

          const headers          = Object.keys(rows[0]).filter(h => h.trim() !== "");
          const classHeader      = headers.find(isClassHeader);
          const studentHeader    = headers.find(isStudentHeader);
          const rollHeader       = headers.find(isRollHeader);
          const discountHeader   = headers.find(isDiscountHeader);
          const paidHeader       = headers.find(isPaidHeader);
          const pendingHeader    = headers.find(isPendingHeader);
          const phoneHeader      = headers.find(isPhoneHeader);
          const parentNameHeader = headers.find(isParentNameHeader);

          /* Term columns — skip meta headers */
          const sheetTerms = headers.filter(h => !isMetaHeader(h));
          sheetTerms.forEach(t => termTypeSet.add(t));

          if (studentHeader) {
            /* Student-level sheet.
               Class comes from either:
                 - "Class" column in each row (if present)
                 - or the sheet name itself (multi-sheet pattern)        */
            for (const r of rows) {
              const studentName = String(r[studentHeader] || "").trim();
              if (!studentName) continue;
              const className = classHeader
                ? String(r[classHeader] || "").trim() || sheetName.trim()
                : sheetName.trim();
              if (!className) continue;

              const amounts: Record<string, number> = {};
              sheetTerms.forEach(t => { amounts[t] = toNumber(r[t]); });

              allStudentRows.push({
                className,
                rollNo:       rollHeader       ? String(r[rollHeader] || "").trim()       : "",
                studentName,
                amounts,
                discount:     discountHeader   ? toNumber(r[discountHeader])              : 0,
                paid:         paidHeader       ? toNumber(r[paidHeader])                  : 0,
                pending:      pendingHeader    ? toNumber(r[pendingHeader])               : 0,
                parentPhone:  phoneHeader      ? String(r[phoneHeader] || "").trim()      : "",
                parentName:   parentNameHeader ? String(r[parentNameHeader] || "").trim() : "",
              });
              anyStudentRow = true;
            }
          } else if (classHeader) {
            /* Class-level legacy sheet */
            for (const r of rows) {
              const className = String(r[classHeader] || "").trim();
              if (!className) continue;
              const amounts: Record<string, number> = {};
              sheetTerms.forEach(t => { amounts[t] = toNumber(r[t]); });
              allClassRows.push({ className, amounts });
              anyClassRow = true;
            }
          }
          /* Otherwise: skip — unrecognised sheet (e.g., "Instructions") */
        }

        if (!anyStudentRow && !anyClassRow) {
          toast.error("No usable data. Each sheet should have a 'Student Name' or 'Class' column.");
          return;
        }

        const termTypes = [...termTypeSet];

        if (anyStudentRow) {
          /* Build class-level aggregate from student rows */
          const byClass = new Map<string, StudentFeeRow[]>();
          allStudentRows.forEach(s => {
            if (!byClass.has(s.className)) byClass.set(s.className, []);
            byClass.get(s.className)!.push(s);
          });
          const aggRows: FeeRow[] = [...byClass.entries()].map(([className, list]) => {
            const amounts: Record<string, number> = {};
            termTypes.forEach(t => {
              const vals = list.map(x => x.amounts[t]).filter(v => v > 0);
              amounts[t] = vals.length ? vals[0] : 0;
            });
            return { className, amounts };
          });

          setDraft({
            schoolId,
            branchId,
            branchName: userData?.branchName || "",
            mode: "student",
            termTypes,
            rows: aggRows,
            studentRows: allStudentRows,
            uploadedBy: uploaderEmail,
            uploadedByRole: role,
            isActive: true,
            academicYear,
            notes,
          });
          toast.success(
            `Parsed ${allStudentRows.length} students across ${aggRows.length} classes (${wb.SheetNames.length} sheet${wb.SheetNames.length !== 1 ? "s" : ""}) · ${termTypes.length} terms.`
          );
        } else {
          /* Class-level only */
          setDraft({
            schoolId,
            branchId,
            branchName: userData?.branchName || "",
            mode: "class",
            termTypes,
            rows: allClassRows,
            uploadedBy: uploaderEmail,
            uploadedByRole: role,
            isActive: true,
            academicYear,
            notes,
          });
          toast.success(`Parsed ${allClassRows.length} classes × ${termTypes.length} terms. Review & save.`);
        }
      } catch (err) {
        console.error(err);
        toast.error("Could not read the Excel file. Ensure .xlsx / .xls format.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  /* ── Save — ALWAYS creates a new document (preserves history) ─────────── */
  const handleSave = async () => {
    const payload = draft;
    if (!payload) return;
    if (!schoolId || !branchId) {
      toast.error("Missing school/branch scope — contact admin.");
      return;
    }
    setSaving(true);
    try {
      const docPayload = {
        ...payload,
        academicYear,
        notes,
        uploadedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "fee_structure"), docPayload as any);
      toast.success("New fee structure published. Previous uploads preserved.");
      setDraft(null);
      /* Auto-expand the new one, collapse rest */
      setExpandedIds(new Set([ref.id]));
      await reloadStructures();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Save failed.");
    }
    setSaving(false);
  };

  /* ── Delete a specific structure (by id) ────────────────────────────── */
  const handleDeleteOne = async (id: string, label: string) => {
    if (!confirm(`Delete this upload (${label})? Other uploads stay intact.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "fee_structure", id));
      toast.success("Upload deleted.");
      await reloadStructures();
    } catch (e: any) {
      toast.error(e?.message || "Delete failed.");
    }
    setSaving(false);
  };

  /* ── Template download (multi-sheet: one sheet per class) ────── */
  const downloadTemplate = () => {
    /* Excel sheet names have strict limits: max 31 chars, no: \ / * ? : [ ] */
    const sheetName = (name: string) =>
      name.replace(/[\\/*?:[\]]/g, "-").slice(0, 31) || "Class";

    const mkRow = (roll: string, name: string, q: number, h: number, a: number, m: number, discount = 0, paid = 0, pending = 0, parentName = "", phone = "") => ({
      "Roll No": roll, "Student Name": name,
      Q1: q, Q2: q, Q3: q, Q4: q,
      "Half-Yearly": h, Annual: a, Monthly: m,
      Discount: discount, Paid: paid, Pending: pending,
      "Parent Name": parentName, "Parent Phone": phone,
    });

    const classData: { className: string; rows: any[] }[] = [
      { className: "Nursery", rows: [
        mkRow("N01", "Aarav Sharma",  3500, 6500, 13000, 1200, 0,    13000, 0,     "Rajesh Sharma", "+919876500001"),
        mkRow("N02", "Zara Khan",     3500, 6500, 13000, 1200, 500,  6500,  6000,  "Imran Khan",    "+919876500002"),
        mkRow("N03", "Ishaan Reddy",  3500, 6500, 13000, 1200, 0,    7000,  6000,  "Suresh Reddy",  "+919876500003"),
      ]},
      { className: "LKG", rows: [
        mkRow("L01", "Aisha Fatima",  4000, 7500, 15000, 1400, 0,    15000, 0,     "Salman Fatima", "+919876500004"),
        mkRow("L02", "Rohan Mehta",   4000, 7500, 15000, 1400, 1000, 14000, 0,     "Amit Mehta",    "+919876500005"),
        mkRow("L03", "Anaya Gupta",   4000, 7500, 15000, 1400, 0,    8000,  7000,  "Vijay Gupta",   "+919876500006"),
      ]},
      { className: "UKG", rows: [
        mkRow("U01", "Kabir Singh",   4500, 8500, 17000, 1600, 0,    17000, 0,     "Harjeet Singh", "+919876500007"),
        mkRow("U02", "Saanvi Patel",  4500, 8500, 17000, 1600, 0,    9000,  8000,  "Kiran Patel",   "+919876500008"),
        mkRow("U03", "Vihaan Joshi",  4500, 8500, 17000, 1600, 1500, 8500,  7000,  "Dinesh Joshi",  "+919876500009"),
      ]},
      { className: "Class 1", rows: [
        mkRow("1A01","Arjun Kumar",    5000, 9500, 19000, 1800, 0,    19000, 0,    "Rakesh Kumar",   "+919876500010"),
        mkRow("1A02","Myra Rao",       5000, 9500, 19000, 1800, 0,    10000, 9000, "Prakash Rao",    "+919876500011"),
        mkRow("1A03","Rehan Ahmed",    5000, 9500, 19000, 1800, 2000, 17000, 0,    "Faisal Ahmed",   "+919876500012"),
        mkRow("1A04","Tanvi Deshmukh", 5000, 9500, 19000, 1800, 0,    5000,  14000,"Sunil Deshmukh", "+919876500013"),
      ]},
      { className: "Class 2", rows: [
        mkRow("2A01","Advik Nair",     5500, 10500, 21000, 2000, 0,    21000, 0,    "Ramesh Nair",    "+919876500014"),
        mkRow("2A02","Diya Kapoor",    5500, 10500, 21000, 2000, 0,    11000, 10000,"Anil Kapoor",    "+919876500015"),
        mkRow("2A03","Aayan Qureshi",  5500, 10500, 21000, 2000, 1000, 20000, 0,    "Zubair Qureshi", "+919876500016"),
      ]},
      { className: "Class 3", rows: [
        mkRow("3A01","Ira Bhardwaj",   6000, 11500, 23000, 2200, 0,    23000, 0,    "Mohit Bhardwaj", "+919876500017"),
        mkRow("3A02","Kian Malhotra",  6000, 11500, 23000, 2200, 0,    12000, 11000,"Rohit Malhotra", "+919876500018"),
        mkRow("3A03","Aditi Iyer",     6000, 11500, 23000, 2200, 500,  22500, 0,    "Karthik Iyer",   "+919876500019"),
      ]},
      { className: "Class 4", rows: [
        mkRow("4A01","Reyansh Pillai", 6500, 12500, 25000, 2400, 0,    25000, 0,    "Anand Pillai",   "+919876500020"),
        mkRow("4A02","Meera Chopra",   6500, 12500, 25000, 2400, 0,    13000, 12000,"Vikram Chopra",  "+919876500021"),
        mkRow("4A03","Yash Jain",      6500, 12500, 25000, 2400, 1500, 23500, 0,    "Naresh Jain",    "+919876500022"),
      ]},
      { className: "Class 5", rows: [
        mkRow("5A01","Anika Bose",     7000, 13500, 27000, 2600, 0,    27000, 0,    "Subhash Bose",   "+919876500023"),
        mkRow("5A02","Viraj Desai",    7000, 13500, 27000, 2600, 0,    14000, 13000,"Paresh Desai",   "+919876500024"),
        mkRow("5A03","Siya Agarwal",   7000, 13500, 27000, 2600, 2000, 25000, 0,    "Deepak Agarwal", "+919876500025"),
      ]},
      { className: "Class 6", rows: [
        mkRow("6A01","Aryan Thakur",   7500, 14500, 29000, 2800, 0,    29000, 0,    "Jitendra Thakur","+919876500026"),
        mkRow("6A02","Navya Varma",    7500, 14500, 29000, 2800, 0,    15000, 14000,"Pradeep Varma",  "+919876500027"),
        mkRow("6A03","Farhan Ansari",  7500, 14500, 29000, 2800, 1000, 28000, 0,    "Tariq Ansari",   "+919876500028"),
      ]},
      { className: "Class 7", rows: [
        mkRow("7A01","Tara Menon",     8000, 15500, 31000, 3000, 0,    31000, 0,    "Harish Menon",   "+919876500029"),
        mkRow("7A02","Dev Shetty",     8000, 15500, 31000, 3000, 0,    16000, 15000,"Ganesh Shetty",  "+919876500030"),
        mkRow("7A03","Riya Saxena",    8000, 15500, 31000, 3000, 500,  30500, 0,    "Rajeev Saxena",  "+919876500031"),
      ]},
      { className: "Class 8", rows: [
        mkRow("8A01","Arnav Bhatia",   8500, 16500, 33000, 3200, 0,    33000, 0,    "Manish Bhatia",  "+919876500032"),
        mkRow("8A02","Kiara Khanna",   8500, 16500, 33000, 3200, 0,    17000, 16000,"Yogesh Khanna",  "+919876500033"),
        mkRow("8A03","Imran Sheikh",   8500, 16500, 33000, 3200, 3000, 30000, 0,    "Aslam Sheikh",   "+919876500034"),
      ]},
      { className: "Class 9", rows: [
        mkRow("9A01","Aryan Mishra",   9500, 18500, 37000, 3600, 0,    37000, 0,    "Anil Mishra",    "+919876500035"),
        mkRow("9A02","Pari Goyal",     9500, 18500, 37000, 3600, 0,    19000, 18000,"Ashok Goyal",    "+919876500036"),
        mkRow("9A03","Zayn Hussain",   9500, 18500, 37000, 3600, 2500, 34500, 0,    "Javed Hussain",  "+919876500037"),
      ]},
      { className: "Class 10", rows: [
        mkRow("10A01","Vivaan Shah",  10500, 20500, 41000, 4000, 0,    41000, 0,    "Nilesh Shah",    "+919876500038"),
        mkRow("10A02","Anvi Menon",   10500, 20500, 41000, 4000, 0,    21000, 20000,"Prasad Menon",   "+919876500039"),
        mkRow("10A03","Hamza Mirza",  10500, 20500, 41000, 4000, 4000, 37000, 0,    "Arif Mirza",     "+919876500040"),
      ]},
      { className: "Class 11 Science", rows: [
        mkRow("11S01","Krishna Iyer",   14000, 27500, 55000, 5500, 0,    55000, 0,    "Subramanian Iyer","+919876500041"),
        mkRow("11S02","Riya Ahluwalia", 14000, 27500, 55000, 5500, 0,    28000, 27000,"Gurpreet Ahluwalia","+919876500042"),
      ]},
      { className: "Class 11 Commerce", rows: [
        mkRow("11C01","Aarush Batra",   12000, 23500, 47000, 4700, 0,    47000, 0,    "Ajay Batra",   "+919876500043"),
        mkRow("11C02","Nisha Rawat",    12000, 23500, 47000, 4700, 2000, 45000, 0,    "Pankaj Rawat", "+919876500044"),
      ]},
      { className: "Class 12 Science", rows: [
        mkRow("12S01","Aadhya Verma",   15000, 29500, 59000, 5900, 0,    59000, 0,    "Satish Verma", "+919876500045"),
        mkRow("12S02","Kabir Malik",    15000, 29500, 59000, 5900, 0,    30000, 29000,"Rohit Malik",  "+919876500046"),
      ]},
      { className: "Class 12 Commerce", rows: [
        mkRow("12C01","Tanya Arora",    13000, 25500, 51000, 5100, 0,    51000, 0,    "Sandeep Arora","+919876500047"),
        mkRow("12C02","Sahil Singhal",  13000, 25500, 51000, 5100, 3000, 48000, 0,    "Gopal Singhal","+919876500048"),
      ]},
    ];

    const colWidths = [
      { wch: 10 }, // Roll No
      { wch: 22 }, // Student Name
      ...Array(7).fill({ wch: 12 }), // Q1-Q4, Half-Yearly, Annual, Monthly
      { wch: 10 }, // Discount
      { wch: 10 }, // Paid
      { wch: 10 }, // Pending
      { wch: 18 }, // Parent Name
      { wch: 16 }, // Parent Phone
    ];

    const wb = XLSX.utils.book_new();
    classData.forEach(({ className, rows }) => {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = colWidths;
      XLSX.utils.book_append_sheet(wb, ws, sheetName(className));
    });
    XLSX.writeFile(wb, "fee_structure_template.xlsx");
  };

  /* ── Manual row tweaks on draft ────────────────────────── */
  const updateDraftCell = (rowIdx: number, term: string, value: number) => {
    if (!draft) return;
    const rows = [...draft.rows];
    rows[rowIdx] = {
      ...rows[rowIdx],
      amounts: { ...rows[rowIdx].amounts, [term]: value },
    };
    setDraft({ ...draft, rows });
  };

  const latest  = allStructures[0] || null;
  const hasAny  = allStructures.length > 0 || !!draft;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#1e3a8a]" />
      </div>
    );
  }

  /* Helper: compute totals per structure for summary */
  const totalsFor = (s: FeeStructure) => {
    const perTerm: Record<string, number> = {};
    s.termTypes.forEach(t => {
      perTerm[t] = (s.rows || []).reduce((sum, r) => sum + (r.amounts[t] || 0), 0);
    });
    const grandRow = (s.rows || []).map(r =>
      s.termTypes.reduce((sum, t) => sum + (r.amounts[t] || 0), 0)
    );
    const branchTotal = Object.values(perTerm).reduce((a, b) => a + b, 0);
    return { perTerm, grandRow, branchTotal };
  };

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e294b] tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-[#1e3a8a]" /> Fee Structure
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            Upload term-wise fee plan per class. Owner will see this branch-wise.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Template
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1e3a8a] text-white text-xs font-bold hover:bg-[#1e294b] transition-all shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" /> {allStructures.length > 0 ? "Upload New Version" : "Upload Excel"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Status / metadata cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Status</p>
          <div className={`flex items-center gap-2 text-sm font-bold ${latest ? "text-emerald-600" : "text-amber-600"}`}>
            {latest ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {latest
              ? `${allStructures.length} upload${allStructures.length !== 1 ? "s" : ""} saved`
              : "Not published"}
          </div>
          {latest?.uploadedBy && (
            <p className="text-[10px] text-slate-400 font-semibold mt-1.5 truncate">Last by {latest.uploadedBy}</p>
          )}
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Academic Year (for new upload)</label>
          <input
            value={academicYear}
            onChange={e => setAcademicYear(e.target.value)}
            placeholder="e.g., 2026-27"
            className="w-full text-sm font-bold text-[#1e294b] bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-300"
          />
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Notes (for new upload)</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g., Revised after board meeting"
            className="w-full text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-300"
          />
        </div>
      </div>

      {/* Instruction banner when nothing exists and no draft */}
      {!hasAny && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#1e3a8a] flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#1e294b] mb-1">Upload your Fee Structure Excel</h3>
            <p className="text-xs text-slate-600 font-medium leading-relaxed mb-3">
              Multi-sheet Excel with one sheet per class. Columns: <b>Roll No, Student Name, Q1..Q4, Half-Yearly, Annual, Monthly, Paid, Pending, Parent Name, Parent Phone</b>.
              Each new upload is kept as a separate version — history is preserved.
            </p>
            <button
              onClick={downloadTemplate}
              className="text-xs font-bold text-[#1e3a8a] hover:underline flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Download sample template
            </button>
          </div>
        </div>
      )}

      {/* Draft preview — shows only when a fresh Excel is uploaded but not yet saved */}
      {draft && (() => {
        const { perTerm, grandRow } = totalsFor(draft);
        return (
          <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-amber-50 border-amber-100 gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <FileSpreadsheet className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-extrabold text-[#1e294b]">Review & Publish New Upload</h3>
                <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                  Unsaved
                </span>
              </div>
              <p className="text-[10px] font-semibold text-slate-500">
                {draft.mode === "student"
                  ? `${draft.studentRows?.length || 0} students · ${draft.rows.length} classes · ${draft.termTypes.length} terms`
                  : `${draft.rows.length} classes × ${draft.termTypes.length} terms`}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-slate-50/60">
                  <tr>
                    <th className="py-3 px-5 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Class</th>
                    {draft.termTypes.map(t => (
                      <th key={t} className="py-3 px-5 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {t}</span>
                      </th>
                    ))}
                    <th className="py-3 px-5 text-left text-[9px] font-black text-[#1e3a8a] uppercase tracking-widest whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/40">
                      <td className="py-3 px-5 text-sm font-bold text-[#1e294b]">{row.className}</td>
                      {draft.termTypes.map(t => (
                        <td key={t} className="py-3 px-5 text-sm font-semibold text-slate-600">
                          <input
                            type="number"
                            value={row.amounts[t] ?? 0}
                            onChange={e => updateDraftCell(i, t, toNumber(e.target.value))}
                            className="w-24 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold outline-none focus:border-blue-300"
                          />
                        </td>
                      ))}
                      <td className="py-3 px-5 text-sm font-extrabold text-[#1e3a8a]">₹ {currency(grandRow[i] || 0)}</td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50/50 border-t-2 border-[#1e3a8a]/10">
                    <td className="py-3 px-5 text-xs font-black text-[#1e3a8a] uppercase tracking-wider">Branch Total</td>
                    {draft.termTypes.map(t => (
                      <td key={t} className="py-3 px-5 text-sm font-extrabold text-[#1e3a8a]">₹ {currency(perTerm[t] || 0)}</td>
                    ))}
                    <td className="py-3 px-5 text-sm font-extrabold text-[#1e3a8a]">
                      ₹ {currency(Object.values(perTerm).reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {draft.mode === "student" && draft.studentRows && draft.studentRows.length > 0 && (
              <StudentBreakdown students={draft.studentRows} termTypes={draft.termTypes} />
            )}

            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/40 gap-3 flex-wrap">
              <button
                onClick={() => setDraft(null)}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <Minus className="w-3.5 h-3.5" /> Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#1e3a8a] text-white text-xs font-bold hover:bg-[#1e294b] transition-all shadow-sm disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Publish as New Version
              </button>
            </div>
          </div>
        );
      })()}

      {/* ─── History: list of all saved structures ────────────────────────────── */}
      {allStructures.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black text-[#1e294b] uppercase tracking-widest flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#1e3a8a]" />
              Saved Fee Structures · History
            </h2>
            <p className="text-[10px] font-semibold text-slate-400">
              {allStructures.length} version{allStructures.length !== 1 ? "s" : ""} · newest first
            </p>
          </div>

          {allStructures.map((s, idx) => {
            const isOpen = expandedIds.has(s.id!);
            const isLatest = idx === 0;
            const { perTerm, grandRow, branchTotal } = totalsFor(s);
            const uploadedDate = s.uploadedAt?.toDate?.()
              ? s.uploadedAt.toDate().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
              : "—";
            return (
              <div key={s.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${
                isLatest ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-100"
              }`}>
                <button
                  onClick={() => s.id && toggleCard(s.id)}
                  className={`w-full flex items-center justify-between px-5 py-4 gap-3 flex-wrap text-left transition-all ${
                    isLatest
                      ? "bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100"
                      : "bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isLatest ? "bg-emerald-600" : "bg-slate-400"
                    }`}>
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-[#1e294b] truncate">
                          {s.academicYear ? `AY ${s.academicYear}` : "Fee Structure"}
                        </span>
                        {isLatest && (
                          <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-widest">
                            Latest · Live
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-slate-400">
                          {s.mode === "student"
                            ? `${s.studentRows?.length || 0} students · ${s.rows.length} classes`
                            : `${s.rows.length} classes`} · {s.termTypes.length} terms
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-slate-500 font-semibold">{uploadedDate}</span>
                        {s.uploadedBy && <span className="text-[10px] text-slate-400 font-medium">· by {s.uploadedBy}</span>}
                        {s.notes && <span className="text-[10px] text-amber-700 font-semibold truncate">· {s.notes}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-extrabold text-[#1e3a8a] bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      ₹ {currency(branchTotal)}
                    </span>
                    <span
                      role="button"
                      onClick={e => { e.stopPropagation(); s.id && handleDeleteOne(s.id, s.academicYear || uploadedDate); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[10px] font-bold hover:bg-red-50 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="animate-in fade-in duration-200">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-50/60">
                          <tr>
                            <th className="py-3 px-5 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Class</th>
                            {s.termTypes.map(t => (
                              <th key={t} className="py-3 px-5 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
                                <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {t}</span>
                              </th>
                            ))}
                            <th className="py-3 px-5 text-left text-[9px] font-black text-[#1e3a8a] uppercase tracking-widest whitespace-nowrap">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {s.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50/40">
                              <td className="py-3 px-5 text-sm font-bold text-[#1e294b]">{row.className}</td>
                              {s.termTypes.map(t => (
                                <td key={t} className="py-3 px-5 text-sm font-semibold text-slate-600">
                                  ₹ {currency(row.amounts[t] || 0)}
                                </td>
                              ))}
                              <td className="py-3 px-5 text-sm font-extrabold text-[#1e3a8a]">₹ {currency(grandRow[i] || 0)}</td>
                            </tr>
                          ))}
                          <tr className="bg-blue-50/50 border-t-2 border-[#1e3a8a]/10">
                            <td className="py-3 px-5 text-xs font-black text-[#1e3a8a] uppercase tracking-wider">Branch Total</td>
                            {s.termTypes.map(t => (
                              <td key={t} className="py-3 px-5 text-sm font-extrabold text-[#1e3a8a]">₹ {currency(perTerm[t] || 0)}</td>
                            ))}
                            <td className="py-3 px-5 text-sm font-extrabold text-[#1e3a8a]">₹ {currency(branchTotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {s.mode === "student" && s.studentRows && s.studentRows.length > 0 && (
                      <StudentBreakdown students={s.studentRows} termTypes={s.termTypes} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick-add class button for manual entry when nothing exists */}
      {!hasAny && (
        <button
          onClick={() => setDraft({
            schoolId,
            branchId,
            branchName: userData?.branchName || "",
            mode: "class",
            termTypes: ["Q1", "Q2", "Q3", "Q4", "Annual"],
            rows: [{ className: "Class 1", amounts: { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Annual: 0 } }],
            uploadedBy: uploaderEmail,
            uploadedByRole: role,
            isActive: true,
          })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Start from scratch (no Excel)
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/* ── Sub-component: Student breakdown grouped by class ──── */
/* ══════════════════════════════════════════════════════════ */
function StudentBreakdown({ students, termTypes }: { students: StudentFeeRow[]; termTypes: string[] }) {
  /* Auto-expand the first class so user can see at least one group open */
  const firstClass = students[0]?.className || "";
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    firstClass ? new Set([firstClass]) : new Set()
  );
  const [search, setSearch]     = useState("");
  const [classFilter, setClassFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending">("all");

  /* Apply filters first */
  const filtered = useMemo(() => {
    return students.filter(s => {
      if (classFilter !== "All" && s.className !== classFilter) return false;
      if (search && !s.studentName.toLowerCase().includes(search.toLowerCase())
                && !s.rollNo.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter === "paid"    && s.pending   > 0) return false;
      if (statusFilter === "pending" && s.pending === 0) return false;
      return true;
    });
  }, [students, search, classFilter, statusFilter]);

  /* Group by class */
  const groups = useMemo(() => {
    const map = new Map<string, StudentFeeRow[]>();
    filtered.forEach(s => {
      if (!map.has(s.className)) map.set(s.className, []);
      map.get(s.className)!.push(s);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const allClasses = useMemo(() => {
    const set = new Set(students.map(s => s.className));
    return ["All", ...[...set].sort()];
  }, [students]);

  const totalStudents = filtered.length;
  const totalPaid     = filtered.reduce((a, s) => a + s.paid, 0);
  const totalPending  = filtered.reduce((a, s) => a + s.pending, 0);
  const totalDiscount = filtered.reduce((a, s) => a + s.discount, 0);
  const defaulters    = filtered.filter(s => s.pending > 0).length;

  const toggleGroup = (cls: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      return next;
    });
  };

  const expandAll   = () => setExpanded(new Set(students.map(s => s.className)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="border-t border-slate-200 bg-slate-50/30">
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-[#1e3a8a]" />
          <h3 className="text-sm font-extrabold text-[#1e294b]">Student-level Breakdown</h3>
          <span className="text-[10px] font-semibold text-slate-400 ml-2">
            {totalStudents} student{totalStudents !== 1 ? "s" : ""} · click class to expand
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-all"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-all"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Student stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-4">
        {[
          { label: "Total Paid",     value: `₹ ${currency(totalPaid)}`,     color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Total Pending",  value: `₹ ${currency(totalPending)}`,  color: "text-red-600",     bg: "bg-red-50" },
          { label: "Defaulters",     value: defaulters,                     color: "text-amber-600",   bg: "bg-amber-50" },
          { label: "Discount Given", value: `₹ ${currency(totalDiscount)}`, color: "text-purple-600",  bg: "bg-purple-50" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 border border-white/60`}>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 px-5 py-3 border-y border-slate-100 bg-white">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student or roll no..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 outline-none focus:border-blue-300"
          />
        </div>
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-slate-50 outline-none focus:border-blue-300"
        >
          {allClasses.map(c => <option key={c} value={c}>{c === "All" ? "All Classes" : c}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(["all", "paid", "pending"] as const).map(v => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                statusFilter === v ? "bg-white text-[#1e3a8a] shadow-sm" : "text-slate-500"
              }`}
            >
              {v === "all" ? "All" : v === "paid" ? "Paid" : "Pending"}
            </button>
          ))}
        </div>
      </div>

      {/* Student rows grouped by class */}
      <div className="divide-y divide-slate-100">
        {groups.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400 font-medium">No students match the filters</div>
        ) : groups.map(([className, list]) => {
          const isOpen = expanded.has(className);
          const paidSum    = list.reduce((a, s) => a + s.paid, 0);
          const pendingSum = list.reduce((a, s) => a + s.pending, 0);
          return (
            <div key={className}>
              <button
                onClick={() => toggleGroup(className)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <span className="text-sm font-extrabold text-[#1e294b]">{className}</span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    {list.length} student{list.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <span className="text-emerald-600">₹ {currency(paidSum)} paid</span>
                  {pendingSum > 0 && <span className="text-red-600">₹ {currency(pendingSum)} pending</span>}
                </div>
              </button>

              {isOpen && (
                <div className="overflow-x-auto bg-white border-t border-slate-100">
                  <table className="w-full text-left min-w-[700px]">
                    <thead className="bg-slate-50/60">
                      <tr>
                        <th className="py-2.5 px-5 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Roll</th>
                        <th className="py-2.5 px-5 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Student Name</th>
                        <th className="py-2.5 px-5 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Parent · Phone</th>
                        {termTypes.map(t => (
                          <th key={t} className="py-2.5 px-5 text-left text-[9px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">{t}</th>
                        ))}
                        <th className="py-2.5 px-5 text-left text-[9px] font-black text-purple-600 uppercase tracking-widest whitespace-nowrap">Discount</th>
                        <th className="py-2.5 px-5 text-left text-[9px] font-black text-emerald-600 uppercase tracking-widest whitespace-nowrap">Paid</th>
                        <th className="py-2.5 px-5 text-left text-[9px] font-black text-red-600 uppercase tracking-widest whitespace-nowrap">Pending</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.map((s, i) => (
                        <tr key={i} className={`hover:bg-slate-50/40 ${s.pending > 0 ? "bg-red-50/20" : ""}`}>
                          <td className="py-2.5 px-5 text-xs font-bold text-slate-600">{s.rollNo || "—"}</td>
                          <td className="py-2.5 px-5 text-sm font-bold text-[#1e294b]">{s.studentName}</td>
                          <td className="py-2.5 px-5 text-xs font-semibold text-slate-600">
                            {s.parentName || s.parentPhone ? (
                              <div className="flex flex-col">
                                {s.parentName && <span className="text-slate-700 font-bold">{s.parentName}</span>}
                                {s.parentPhone && <span className="text-[10px] text-slate-400 font-medium">{s.parentPhone}</span>}
                              </div>
                            ) : "—"}
                          </td>
                          {termTypes.map(t => (
                            <td key={t} className="py-2.5 px-5 text-xs font-semibold text-slate-600">
                              ₹ {currency(s.amounts[t] || 0)}
                            </td>
                          ))}
                          <td className="py-2.5 px-5 text-xs font-bold text-purple-600">
                            {s.discount > 0 ? `₹ ${currency(s.discount)}` : "—"}
                          </td>
                          <td className="py-2.5 px-5 text-xs font-extrabold text-emerald-600">₹ {currency(s.paid)}</td>
                          <td className={`py-2.5 px-5 text-xs font-extrabold ${s.pending > 0 ? "text-red-600" : "text-slate-400"}`}>
                            {s.pending > 0 ? `₹ ${currency(s.pending)}` : "✓ Cleared"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
import { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Upload, Download, FileSpreadsheet, Save, Trash2, Loader2,
  AlertCircle, CheckCircle2, Plus, Minus, DollarSign, Calendar,
  User, Search, ChevronRight,
  Sparkles, ChevronLeft, Users, TrendingUp, Clock, AlertTriangle, Tag,
  ChevronDown,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, getDocs, addDoc, doc,
  serverTimestamp, deleteDoc,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<"plan" | "breakdown">("plan");
  const [mobileExpandedClasses, setMobileExpandedClasses] = useState<Set<string>>(new Set());
  const [mobileStudentFilter, setMobileStudentFilter] = useState<"all" | "paid" | "pending">("all");
  const [mobileStudentSearch, setMobileStudentSearch] = useState("");
  const [mobileShowAllClasses, setMobileShowAllClasses] = useState(false);
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

  // ───────────────────────── MOBILE RETURN ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0055FF";
    const B2 = "#1166FF";
    const B3 = "#2277FF";
    const B4 = "#4499FF";
    const GREEN = "#00C853";
    const GREEN_D = "#007830";
    const RED = "#FF3355";
    const RED_D = "#B01030";
    const ORANGE = "#FF8800";
    const ORANGE_D = "#884400";
    const GOLD = "#FFAA00";
    const VIOLET = "#7B3FF4";
    const VIOLET_D = "#5023B0";
    const T1 = "#001040";
    const T2 = "#002080";
    const T3 = "#5070B0";
    const T4 = "#99AACC";
    const SEP = "rgba(0,85,255,.07)";

    const fmtInr = (n: number) => {
      if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
      if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
      if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
      return `₹${n.toLocaleString("en-IN")}`;
    };
    const fmtInrFull = (n: number) => `₹${n.toLocaleString("en-IN")}`;

    // Academic year options from all structures
    const ayOptions = Array.from(
      new Set(allStructures.map((s) => s.academicYear).filter(Boolean))
    ) as string[];

    const latestStructure = latest;
    const latestTotals = latestStructure ? totalsFor(latestStructure) : null;
    const latestBranchTotal = latestTotals?.branchTotal || 0;
    const latestClassCount = latestStructure?.rows.length || 0;
    const latestTermCount = latestStructure?.termTypes.length || 0;
    const annualAvg = latestTermCount > 0 ? latestBranchTotal / latestTermCount : 0;
    const monthlyAvg = latestClassCount > 0 ? latestBranchTotal / latestClassCount / 12 : 0;

    // Student-level totals (for breakdown screen)
    const allStudents = latestStructure?.studentRows || [];
    const totalPaid = allStudents.reduce((a, s) => a + (s.paid || 0), 0);
    const totalPending = allStudents.reduce((a, s) => a + (s.pending || 0), 0);
    const totalDiscount = allStudents.reduce((a, s) => a + (s.discount || 0), 0);
    const collectionRate =
      totalPaid + totalPending > 0 ? (totalPaid / (totalPaid + totalPending)) * 100 : 0;
    const defaulters = allStudents.filter((s) => (s.pending || 0) > 0).length;
    const cleared = allStudents.filter((s) => (s.pending || 0) === 0 && (s.paid || 0) > 0).length;
    const discountApprovals = allStudents.filter((s) => (s.discount || 0) > 0).length;

    // Classes with students
    const studentsByClass = new Map<string, StudentFeeRow[]>();
    allStudents.forEach((s) => {
      if (!studentsByClass.has(s.className)) studentsByClass.set(s.className, []);
      studentsByClass.get(s.className)!.push(s);
    });

    const filteredStudentsForClass = (list: StudentFeeRow[]) => {
      let out = list;
      if (mobileStudentFilter === "paid") out = out.filter((s) => (s.pending || 0) === 0 && (s.paid || 0) > 0);
      if (mobileStudentFilter === "pending") out = out.filter((s) => (s.pending || 0) > 0);
      if (mobileStudentSearch.trim()) {
        const q = mobileStudentSearch.trim().toLowerCase();
        out = out.filter(
          (s) =>
            s.studentName.toLowerCase().includes(q) ||
            (s.rollNo || "").toLowerCase().includes(q)
        );
      }
      return out;
    };

    const classAvGrads = [
      `linear-gradient(135deg, ${B1}, ${B3})`,
      `linear-gradient(135deg, ${GREEN}, #22DD77)`,
      `linear-gradient(135deg, ${ORANGE}, #FFCC44)`,
      `linear-gradient(135deg, ${VIOLET}, #A075FF)`,
      `linear-gradient(135deg, ${GOLD}, #FFCC44)`,
    ];
    const classAvShadows = [
      "0 4px 12px rgba(0,85,255,.28)",
      "0 4px 12px rgba(0,200,83,.28)",
      "0 4px 12px rgba(255,136,0,.28)",
      "0 4px 12px rgba(123,63,244,.28)",
      "0 4px 12px rgba(255,170,0,.28)",
    ];
    const classAccents = [
      `linear-gradient(180deg, ${B1}, ${B4})`,
      `linear-gradient(180deg, ${GREEN}, #66EE88)`,
      `linear-gradient(180deg, ${ORANGE}, #FFCC44)`,
      `linear-gradient(180deg, ${VIOLET}, #A075FF)`,
      `linear-gradient(180deg, ${GOLD}, #FFCC44)`,
    ];

    const studentAvGrads = [
      `linear-gradient(135deg, ${GREEN}, #22DD77)`,
      `linear-gradient(135deg, ${VIOLET}, #A075FF)`,
      `linear-gradient(135deg, ${B1}, ${B3})`,
      `linear-gradient(135deg, ${ORANGE}, #FFCC44)`,
      `linear-gradient(135deg, ${GOLD}, #FFCC44)`,
    ];

    // Upload / AY change handlers
    const handleMobileUpload = () => fileRef.current?.click();

    // ─── MOBILE BREAKDOWN VIEW ───
    if (mobileView === "breakdown") {
      return (
        <div
          style={{
            fontFamily: "'DM Sans', -apple-system, sans-serif",
            background: "#EEF4FF",
            minHeight: "100vh",
            paddingBottom: 24,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => setMobileView("plan")}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  border: "0.5px solid rgba(0,85,255,.12)",
                  cursor: "pointer",
                }}
                aria-label="Back"
              >
                <ChevronLeft size={16} color={B1} strokeWidth={2.3} />
              </button>
              <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px" }}>Student Payments</div>
            </div>
          </div>

          {/* Page Head */}
          <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T1, letterSpacing: "-0.6px", marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    background: `linear-gradient(135deg, ${VIOLET}, #A075FF)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(123,63,244,.32)",
                  }}
                >
                  <Users size={16} color="#fff" strokeWidth={2.4} />
                </div>
                Breakdown
              </div>
              <div style={{ fontSize: 11, color: T3, fontWeight: 400, lineHeight: 1.5 }}>
                Class-wise payment status<br />
                for {allStudents.length} students
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: 7, padding: "12px 20px 0" }}>
            {([
              { k: "all", l: "All" },
              { k: "paid", l: "Paid" },
              { k: "pending", l: "Pending" },
            ] as const).map((f) => {
              const isActive = mobileStudentFilter === f.k;
              return (
                <button
                  key={f.k}
                  onClick={() => setMobileStudentFilter(f.k)}
                  style={{
                    flex: 1,
                    padding: "9px 6px",
                    borderRadius: 12,
                    background: isActive ? `linear-gradient(135deg, ${B1}, ${B2})` : "#fff",
                    border: isActive ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,.12)",
                    color: isActive ? "#fff" : T3,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    boxShadow: isActive
                      ? "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)"
                      : "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {f.l}
                </button>
              );
            })}
          </div>

          {/* Hero */}
          <div
            style={{
              margin: "14px 20px 0",
              background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
              borderRadius: 22,
              padding: "16px 18px",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 8px 26px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -36,
                right: -24,
                width: 150,
                height: 150,
                background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    background: "rgba(255,255,255,.16)",
                    border: "0.5px solid rgba(255,255,255,.24)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TrendingUp size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
                </div>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>
                    Collection Rate
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1 }}>
                    {collectionRate.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: 100,
                  background: "rgba(120,180,255,.22)",
                  border: "0.5px solid rgba(120,180,255,.4)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#AACCFF",
                }}
              >
                <Users size={11} strokeWidth={2.5} />
                {allStudents.length} Students
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 1,
                background: "rgba(255,255,255,.12)",
                borderRadius: 14,
                overflow: "hidden",
                position: "relative",
                zIndex: 1,
              }}
            >
              {[
                { v: fmtInr(totalPaid), l: "Paid", c: "#66EE88" },
                { v: fmtInr(totalPending), l: "Pending", c: "#FF99AA" },
                { v: defaulters, l: "Defaulters", c: "#FFDD88" },
              ].map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "11px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.c, letterSpacing: "-0.4px", lineHeight: 1, marginBottom: 3 }}>
                    {s.v}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bright stat grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
            {[
              {
                label: "Total Paid",
                value: fmtInrFull(totalPaid),
                sub: `${cleared} students cleared`,
                bg: "linear-gradient(140deg,#E8FCF0 0%,#A8F0C4 60%,#7AE8A6 100%)",
                border: "0.5px solid rgba(0,200,83,.35)",
                lblColor: GREEN_D,
                valColor: "#005A20",
                subColor: GREEN_D,
                iconColor: GREEN_D,
                icon: <CheckCircle2 size={14} color={GREEN_D} strokeWidth={2.5} />,
              },
              {
                label: "Total Pending",
                value: fmtInrFull(totalPending),
                sub: `${defaulters} students owe`,
                bg: "linear-gradient(140deg,#FFECEE 0%,#FFBFC8 60%,#FF99A8 100%)",
                border: "0.5px solid rgba(255,51,85,.35)",
                lblColor: RED_D,
                valColor: "#8A0A22",
                subColor: RED_D,
                iconColor: RED_D,
                icon: <AlertCircle size={14} color={RED_D} strokeWidth={2.5} />,
              },
              {
                label: "Defaulters",
                value: defaulters,
                sub: allStudents.length > 0 ? `${((defaulters / allStudents.length) * 100).toFixed(1)}% of branch` : "—",
                bg: "linear-gradient(140deg,#FFF4E0 0%,#FFDB99 60%,#FFC266 100%)",
                border: "0.5px solid rgba(255,136,0,.35)",
                lblColor: ORANGE_D,
                valColor: "#663300",
                subColor: ORANGE_D,
                iconColor: ORANGE_D,
                icon: <AlertTriangle size={14} color={ORANGE_D} strokeWidth={2.5} />,
              },
              {
                label: "Discount Given",
                value: fmtInrFull(totalDiscount),
                sub: `${discountApprovals} waivers approved`,
                bg: "linear-gradient(140deg,#F3EAFF 0%,#D6BCFF 60%,#B899FF 100%)",
                border: "0.5px solid rgba(123,63,244,.35)",
                lblColor: VIOLET_D,
                valColor: "#3A1580",
                subColor: VIOLET_D,
                iconColor: VIOLET_D,
                icon: <Tag size={14} color={VIOLET_D} strokeWidth={2.5} />,
              },
            ].map((c, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 20,
                  padding: 15,
                  position: "relative",
                  overflow: "hidden",
                  background: c.bg,
                  border: c.border,
                  boxShadow: "0 10px 28px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -20,
                    right: -18,
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(255,255,255,.65) 0%, transparent 70%)",
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,.65)",
                    border: "0.5px solid rgba(255,255,255,.9)",
                    zIndex: 1,
                  }}
                >
                  {c.icon}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: c.lblColor, marginBottom: 8, position: "relative", zIndex: 1 }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c.valColor, letterSpacing: "-0.7px", lineHeight: 1, marginBottom: 4, position: "relative", zIndex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.value}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: c.subColor, position: "relative", zIndex: 1 }}>
                  {c.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ margin: "14px 20px 0", position: "relative" }}>
            <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
              <Search size={15} color="rgba(0,85,255,.42)" strokeWidth={2.2} />
            </div>
            <input
              value={mobileStudentSearch}
              onChange={(e) => setMobileStudentSearch(e.target.value)}
              placeholder="Search student or roll no..."
              style={{
                width: "100%",
                padding: "12px 16px 12px 42px",
                background: "#fff",
                borderRadius: 14,
                border: "0.5px solid rgba(0,85,255,.12)",
                fontFamily: "inherit",
                fontSize: 13,
                color: T1,
                fontWeight: 400,
                outline: "none",
                boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
              }}
            />
          </div>

          {/* Section label */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: T4,
              padding: "16px 20px 0",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>Class Breakdown</span>
            <span
              style={{
                padding: "3px 9px",
                borderRadius: 100,
                background: "rgba(0,85,255,.10)",
                border: "0.5px solid rgba(0,85,255,.16)",
                fontSize: 9,
                fontWeight: 700,
                color: B1,
                textTransform: "none",
                letterSpacing: "0.04em",
              }}
            >
              {studentsByClass.size} class{studentsByClass.size === 1 ? "" : "es"}
            </span>
            <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
          </div>

          {/* Expand / Collapse All buttons */}
          {studentsByClass.size > 0 && (
            <div style={{ display: "flex", gap: 7, padding: "12px 20px 0" }}>
              <button
                onClick={() => setMobileExpandedClasses(new Set(studentsByClass.keys()))}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 11,
                  background: "#fff",
                  color: T2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  border: "0.5px solid rgba(0,85,255,.12)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                }}
              >
                <ChevronDown size={12} strokeWidth={2.4} />
                Expand All
              </button>
              <button
                onClick={() => setMobileExpandedClasses(new Set())}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 11,
                  background: "#fff",
                  color: T2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  border: "0.5px solid rgba(0,85,255,.12)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                }}
              >
                <ChevronLeft size={12} strokeWidth={2.4} style={{ transform: "rotate(90deg)" }} />
                Collapse All
              </button>
            </div>
          )}

          {/* Class accordion */}
          {studentsByClass.size === 0 ? (
            <div
              style={{
                margin: "12px 20px 0",
                background: "#fff",
                borderRadius: 22,
                padding: "32px 20px",
                boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                textAlign: "center",
              }}
            >
              <Users size={44} color="rgba(0,85,255,.22)" strokeWidth={1.8} />
              <div style={{ fontSize: 14, fontWeight: 700, color: T1 }}>No student data yet</div>
              <div style={{ fontSize: 11, color: T4, maxWidth: 260, lineHeight: 1.5 }}>
                Upload an Excel with a "Student Name" column to see per-student payment status.
              </div>
            </div>
          ) : (
            Array.from(studentsByClass.entries()).map(([className, studList], ci) => {
              const isExpanded = mobileExpandedClasses.has(className);
              const classPaid = studList.reduce((a, s) => a + (s.paid || 0), 0);
              const classPending = studList.reduce((a, s) => a + (s.pending || 0), 0);
              const initial = (className.match(/\d+|[A-Z]/g)?.[0] || className[0] || "?").toUpperCase().slice(0, 2);
              const filtered = isExpanded ? filteredStudentsForClass(studList) : [];

              return (
                <div
                  key={className}
                  style={{
                    margin: "10px 20px 0",
                    background: "#fff",
                    borderRadius: 18,
                    boxShadow: isExpanded
                      ? "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11)"
                      : "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                    border: isExpanded ? "0.5px solid rgba(0,85,255,.18)" : "0.5px solid rgba(0,85,255,.08)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      background: classAccents[ci % classAccents.length],
                    }}
                  />
                  <button
                    onClick={() => {
                      setMobileExpandedClasses((prev) => {
                        const next = new Set(prev);
                        if (next.has(className)) next.delete(className);
                        else next.add(className);
                        return next;
                      });
                    }}
                    style={{
                      padding: "14px 16px 14px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        background: classAvGrads[ci % classAvGrads.length],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                        boxShadow: classAvShadows[ci % classAvShadows.length],
                      }}
                    >
                      {initial}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px", display: "flex", alignItems: "center", gap: 6 }}>
                        {className}
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: T4,
                            padding: "1px 7px",
                            borderRadius: 100,
                            background: "rgba(0,85,255,.08)",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {studList.length} student{studList.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, fontSize: 10, fontWeight: 700 }}>
                        <span style={{ color: GREEN_D, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: GREEN }} />
                          {fmtInr(classPaid)} paid
                        </span>
                        <span style={{ color: RED_D, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: RED }} />
                          {fmtInr(classPending)} pending
                        </span>
                      </div>
                    </div>
                    <ChevronDown
                      size={16}
                      color={T3}
                      strokeWidth={2.4}
                      style={{
                        transition: "transform .25s ease",
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        flexShrink: 0,
                      }}
                    />
                  </button>
                  {isExpanded && (
                    <div style={{ padding: "4px 12px 12px", background: "rgba(0,85,255,.025)", borderTop: `0.5px solid rgba(0,85,255,.08)` }}>
                      {filtered.length === 0 ? (
                        <div style={{ padding: "16px 18px", fontSize: 11, color: T4, textAlign: "center", fontStyle: "italic" }}>
                          {mobileStudentSearch.trim() || mobileStudentFilter !== "all"
                            ? "No students match your filter."
                            : "No students in this class yet."}
                        </div>
                      ) : (
                        filtered.map((s, si) => {
                          const isCleared = (s.pending || 0) === 0 && (s.paid || 0) > 0;
                          const isPending = (s.pending || 0) > 0;
                          const hasDiscount = (s.discount || 0) > 0;
                          const initials = s.studentName
                            .split(/\s+/)
                            .map((w) => w[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join("")
                            .toUpperCase();
                          const stripeColor = isCleared
                            ? `linear-gradient(180deg, ${GREEN}, #66EE88)`
                            : isPending
                            ? `linear-gradient(180deg, ${RED}, #FF7788)`
                            : `linear-gradient(180deg, ${B1}, #4499FF)`;

                          // Extract term categories from latestStructure.termTypes
                          const terms = latestStructure?.termTypes || [];
                          const qTerms = terms.filter((t) => /^q\d/i.test(t));
                          const halfYearlyTerm = terms.find((t) => /half/i.test(t));
                          const annualTerm = terms.find((t) => /annual|yearly/i.test(t) && !/half/i.test(t));
                          const monthlyTerm = terms.find((t) => /monthly|month/i.test(t));

                          return (
                            <div
                              key={`${s.rollNo}-${si}`}
                              style={{
                                marginTop: 10,
                                background: "#fff",
                                borderRadius: 16,
                                boxShadow: "0 2px 10px rgba(0,85,255,.08)",
                                border: "0.5px solid rgba(0,85,255,.10)",
                                overflow: "hidden",
                                position: "relative",
                              }}
                            >
                              {/* Stripe */}
                              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: stripeColor }} />

                              {/* Top: roll pill + avatar + name/parent + status tag */}
                              <div style={{ padding: "12px 14px 10px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: `0.5px solid ${SEP}` }}>
                                <div
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: "#fff",
                                    padding: "3px 8px",
                                    borderRadius: 100,
                                    letterSpacing: "0.04em",
                                    flexShrink: 0,
                                    background: `linear-gradient(135deg, ${B1}, ${B2})`,
                                    boxShadow: "0 2px 6px rgba(0,85,255,.3)",
                                  }}
                                >
                                  {s.rollNo || `#${si + 1}`}
                                </div>
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 10,
                                    background: studentAvGrads[si % studentAvGrads.length],
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#fff",
                                    flexShrink: 0,
                                  }}
                                >
                                  {initials || "?"}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {s.studentName}
                                  </div>
                                  <div style={{ fontSize: 10, color: T3, fontWeight: 500, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {s.parentName || "—"}
                                  </div>
                                  {s.parentPhone && (
                                    <div style={{ fontSize: 9, color: T4, fontWeight: 500 }}>{s.parentPhone}</div>
                                  )}
                                </div>
                                {isCleared ? (
                                  <div
                                    style={{
                                      padding: "3px 8px",
                                      borderRadius: 100,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      letterSpacing: "0.02em",
                                      background: "linear-gradient(135deg,#D0F8DE,#A5F0BC)",
                                      color: GREEN_D,
                                      border: `0.5px solid ${"rgba(0,200,83,.22)"}`,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 3,
                                      flexShrink: 0,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    <CheckCircle2 size={9} strokeWidth={2.5} />
                                    Cleared
                                  </div>
                                ) : isPending ? (
                                  <div
                                    style={{
                                      padding: "3px 8px",
                                      borderRadius: 100,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      letterSpacing: "0.02em",
                                      background: "linear-gradient(135deg,#FFD8DF,#FFB0BE)",
                                      color: RED_D,
                                      border: `0.5px solid ${"rgba(255,51,85,.22)"}`,
                                      flexShrink: 0,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {fmtInr(s.pending)} due
                                  </div>
                                ) : null}
                              </div>

                              {/* Q1-Q4 grid */}
                              {qTerms.length > 0 && (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: `repeat(${qTerms.length}, 1fr)`,
                                    gap: 1,
                                    background: "rgba(0,85,255,.10)",
                                  }}
                                >
                                  {qTerms.map((t) => (
                                    <div key={t} style={{ background: "#fff", padding: "7px 4px", textAlign: "center" }}>
                                      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T4, marginBottom: 2, display: "block" }}>
                                        {t}
                                      </div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: T2, letterSpacing: "-0.1px" }}>
                                        {fmtInr(s.amounts[t] || 0)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Half-Yearly / Annual / Monthly period strip */}
                              {(halfYearlyTerm || annualTerm || monthlyTerm) && (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-around",
                                    padding: "8px 14px",
                                    background: "rgba(0,85,255,.03)",
                                    borderBottom: `0.5px solid ${SEP}`,
                                    gap: 4,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {halfYearlyTerm && (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                                      <span style={{ color: T4, fontWeight: 700, textTransform: "uppercase", fontSize: 8, letterSpacing: "0.06em" }}>
                                        H-Yrly
                                      </span>
                                      <span style={{ color: T2, fontWeight: 700, letterSpacing: "-0.1px" }}>
                                        {fmtInr(s.amounts[halfYearlyTerm] || 0)}
                                      </span>
                                    </span>
                                  )}
                                  {annualTerm && (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                                      <span style={{ color: T4, fontWeight: 700, textTransform: "uppercase", fontSize: 8, letterSpacing: "0.06em" }}>
                                        Annual
                                      </span>
                                      <span style={{ color: T2, fontWeight: 700, letterSpacing: "-0.1px" }}>
                                        {fmtInr(s.amounts[annualTerm] || 0)}
                                      </span>
                                    </span>
                                  )}
                                  {monthlyTerm && (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                                      <span style={{ color: T4, fontWeight: 700, textTransform: "uppercase", fontSize: 8, letterSpacing: "0.06em" }}>
                                        Monthly
                                      </span>
                                      <span style={{ color: T2, fontWeight: 700, letterSpacing: "-0.1px" }}>
                                        {fmtInr(s.amounts[monthlyTerm] || 0)}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Pay breakdown: Paid / Discount / Pending */}
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr 1fr",
                                  gap: 1,
                                  background: "rgba(0,85,255,.08)",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "8px 6px",
                                    textAlign: "center",
                                    background: (s.paid || 0) > 0
                                      ? "linear-gradient(135deg,#E5FCEE,#C8F5DA)"
                                      : "#fff",
                                  }}
                                >
                                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2, display: "block", color: (s.paid || 0) > 0 ? GREEN_D : T4 }}>
                                    Paid
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "-0.2px", lineHeight: 1, color: (s.paid || 0) > 0 ? "#004018" : T4 }}>
                                    {fmtInr(s.paid || 0)}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    padding: "8px 6px",
                                    textAlign: "center",
                                    background: hasDiscount
                                      ? "linear-gradient(135deg,#F3EAFF,#E0CEFF)"
                                      : "#fff",
                                  }}
                                >
                                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2, display: "block", color: hasDiscount ? VIOLET_D : T4 }}>
                                    Discount
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "-0.2px", lineHeight: 1, color: hasDiscount ? "#280C5C" : T4 }}>
                                    {fmtInr(s.discount || 0)}
                                  </div>
                                </div>
                                <div
                                  style={{
                                    padding: "8px 6px",
                                    textAlign: "center",
                                    background: isPending
                                      ? "linear-gradient(135deg,#FFE3E8,#FFC4CC)"
                                      : "#fff",
                                  }}
                                >
                                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2, display: "block", color: isPending ? RED_D : T4 }}>
                                    Pending
                                  </div>
                                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "-0.2px", lineHeight: 1, color: isPending ? "#60081A" : T4 }}>
                                    {fmtInr(s.pending || 0)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ height: 20 }} />
        </div>
      );
    }

    // ─── MOBILE PLAN VIEW ───
    return (
      <div
        style={{
          fontFamily: "'DM Sans', -apple-system, sans-serif",
          background: "#EEF4FF",
          minHeight: "100vh",
          paddingBottom: 24,
        }}
      >
        {/* Hidden file input — shared with desktop via fileRef */}
        {/* (already exists in desktop return; also present here for mobile button) */}

        {/* Page Head */}
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: T1, letterSpacing: "-0.6px", marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${GREEN}, #22DD77)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(0,200,83,.32)",
                }}
              >
                <DollarSign size={16} color="#fff" strokeWidth={2.4} />
              </div>
              Fee Structure
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400, lineHeight: 1.5 }}>
              Term-wise fee plan per class,<br />
              managed branch-wise
            </div>
          </div>
          {allStudents.length > 0 && (
            <button
              onClick={() => setMobileView("breakdown")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 11px",
                borderRadius: 14,
                background: "#fff",
                border: "0.5px solid rgba(0,85,255,.14)",
                boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                flexShrink: 0,
                marginTop: 4,
                cursor: "pointer",
              }}
            >
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 1 }}>
                  Students
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T1, letterSpacing: "-0.2px", lineHeight: 1 }}>
                  {allStudents.length}
                </div>
              </div>
              <ChevronRight size={13} color={T3} strokeWidth={2.4} />
            </button>
          )}
        </div>

        {/* Academic Year Pills — from existing structures */}
        {ayOptions.length > 0 && (
          <div style={{ display: "flex", gap: 7, padding: "12px 20px 0", overflowX: "auto", scrollbarWidth: "none" }}>
            {ayOptions.map((ay) => {
              const isActive = academicYear === ay;
              return (
                <button
                  key={ay}
                  onClick={() => setAcademicYear(ay)}
                  style={{
                    flex: 1,
                    padding: "9px 6px",
                    borderRadius: 12,
                    background: isActive ? `linear-gradient(135deg, ${B1}, ${B2})` : "#fff",
                    border: isActive ? "0.5px solid transparent" : "0.5px solid rgba(0,85,255,.12)",
                    color: isActive ? "#fff" : T3,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    boxShadow: isActive
                      ? "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)"
                      : "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    minWidth: 90,
                    whiteSpace: "nowrap",
                  }}
                >
                  {ay}
                </button>
              );
            })}
          </div>
        )}

        {/* Hero */}
        <div
          style={{
            margin: "14px 20px 0",
            background: "linear-gradient(135deg,#001040 0%,#001888 35%,#0033CC 70%,#0055FF 100%)",
            borderRadius: 22,
            padding: "16px 18px",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 26px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -36,
              right: -24,
              width: 150,
              height: 150,
              background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: "rgba(255,255,255,.16)",
                  border: "0.5px solid rgba(255,255,255,.24)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <DollarSign size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
              </div>
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>
                  Total Annual Fee
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.6px", lineHeight: 1 }}>
                  {fmtInrFull(latestBranchTotal)}
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 100,
                background: latestStructure ? "rgba(0,200,83,.22)" : "rgba(255,170,0,.22)",
                border: latestStructure ? "0.5px solid rgba(0,200,83,.4)" : "0.5px solid rgba(255,170,0,.4)",
                fontSize: 10,
                fontWeight: 700,
                color: latestStructure ? "#66FFAA" : "#FFDD88",
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: latestStructure ? "#66FFAA" : "#FFDD88",
                  boxShadow: latestStructure ? "0 0 8px rgba(102,255,170,.8)" : "none",
                }}
              />
              {latestStructure ? "LATEST · LIVE" : "NOT PUBLISHED"}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: "rgba(255,255,255,.12)",
              borderRadius: 14,
              overflow: "hidden",
              position: "relative",
              zIndex: 1,
            }}
          >
            {[
              { v: latestClassCount, l: "Classes", c: "#fff" },
              { v: latestTermCount, l: "Terms", c: "#FFDD88" },
              { v: allStructures.length, l: "Versions", c: "#66EE88" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "11px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.c, letterSpacing: "-0.4px", lineHeight: 1, marginBottom: 3 }}>
                  {s.v}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stat grid 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
          {[
            {
              label: "Total Classes",
              value: latestClassCount,
              sub: latestClassCount > 0 ? "Per latest version" : "No data yet",
              color: B1,
              subColor: T4,
              icon: <FileSpreadsheet size={13} color={B1} strokeWidth={2.4} />,
              bg: "rgba(0,85,255,.10)",
              border: "rgba(0,85,255,.18)",
              glow: "rgba(0,85,255,.10)",
            },
            {
              label: "Fee Terms",
              value: latestTermCount,
              sub: latestStructure ? (latestStructure.termTypes.slice(0, 2).join(", ") || "—") : "—",
              color: VIOLET,
              subColor: VIOLET_D,
              icon: <Calendar size={13} color={VIOLET} strokeWidth={2.4} />,
              bg: "rgba(123,63,244,.10)",
              border: "rgba(123,63,244,.22)",
              glow: "rgba(123,63,244,.10)",
            },
            {
              label: "Annual Avg",
              value: fmtInr(annualAvg),
              sub: "Per term, all classes",
              color: GREEN_D,
              subColor: GREEN_D,
              icon: <TrendingUp size={13} color={GREEN} strokeWidth={2.4} />,
              bg: "rgba(0,200,83,.10)",
              border: "rgba(0,200,83,.22)",
              glow: "rgba(0,200,83,.10)",
            },
            {
              label: "Monthly Avg",
              value: fmtInr(monthlyAvg),
              sub: "Per class, blended",
              color: ORANGE,
              subColor: ORANGE_D,
              icon: <Clock size={13} color={ORANGE} strokeWidth={2.4} />,
              bg: "rgba(255,136,0,.10)",
              border: "rgba(255,136,0,.22)",
              glow: "rgba(255,136,0,.10)",
            },
          ].map((c, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                borderRadius: 20,
                padding: 15,
                boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                border: "0.5px solid rgba(0,85,255,.10)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -18,
                  right: -14,
                  width: 65,
                  height: 65,
                  background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
                  borderRadius: "50%",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 13,
                  right: 13,
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: c.bg,
                  border: `0.5px solid ${c.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {c.icon}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T4, marginBottom: 9 }}>
                {c.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.8px", lineHeight: 1, marginBottom: 4, color: c.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.value}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: c.subColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Upload form card */}
        <div
          style={{
            margin: "14px 20px 0",
            background: "#fff",
            borderRadius: 20,
            padding: 16,
            boxShadow: "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
            border: "0.5px solid rgba(0,85,255,.10)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: `linear-gradient(135deg, ${B1}, ${B2})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,85,255,.32)",
              }}
            >
              <Upload size={16} color="#fff" strokeWidth={2.3} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T1, letterSpacing: "-0.2px" }}>
                {allStructures.length > 0 ? "Upload New Version" : "Upload Fee Structure"}
              </div>
              <div style={{ fontSize: 10, color: T3, fontWeight: 500 }}>
                {allStructures.length > 0 ? "Add a revised fee plan for this AY" : "Upload your branch's fee plan"}
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 5 }}>
              Academic Year
            </div>
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="e.g., 2026-27"
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "#EEF4FF",
                borderRadius: 12,
                border: "0.5px solid rgba(0,85,255,.14)",
                fontFamily: "inherit",
                fontSize: 12,
                color: T1,
                fontWeight: 500,
                outline: "none",
              }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 5 }}>
              Notes
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Revised after board meeting"
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "#EEF4FF",
                borderRadius: 12,
                border: "0.5px solid rgba(0,85,255,.14)",
                fontFamily: "inherit",
                fontSize: 12,
                color: T1,
                fontWeight: 500,
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={handleMobileUpload}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 13,
              background: `linear-gradient(135deg, ${B1}, ${B2})`,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
              boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
              marginTop: 4,
              letterSpacing: "0.02em",
            }}
          >
            <Plus size={14} strokeWidth={2.4} />
            {allStructures.length > 0 ? "Upload New Version" : "Upload Excel"}
          </button>
          <button
            onClick={downloadTemplate}
            style={{
              width: "100%",
              marginTop: 8,
              height: 36,
              borderRadius: 11,
              background: "#EEF4FF",
              color: B1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              border: "0.5px dashed rgba(0,85,255,.3)",
              letterSpacing: "0.02em",
            }}
          >
            <Download size={12} strokeWidth={2.4} />
            Download Template
          </button>
        </div>

        {/* Draft review banner (if draft exists) */}
        {draft && (
          <div
            style={{
              margin: "14px 20px 0",
              background: "linear-gradient(140deg,#FFF6D6 0%,#FFE58A 42%,#FFCC44 100%)",
              borderRadius: 18,
              padding: "14px 16px",
              border: "0.5px solid rgba(255,170,0,.35)",
              boxShadow: "0 6px 20px rgba(255,170,0,.24)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <FileSpreadsheet size={16} color="#885500" strokeWidth={2.3} />
              <div style={{ fontSize: 12, fontWeight: 700, color: "#331F00" }}>Review & Publish</div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#885500",
                  background: "rgba(255,255,255,.65)",
                  padding: "2px 7px",
                  borderRadius: 100,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em",
                  marginLeft: "auto",
                }}
              >
                Unsaved
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#663300", fontWeight: 500, marginBottom: 12, lineHeight: 1.5 }}>
              {draft.mode === "student"
                ? `${draft.studentRows?.length || 0} students · ${draft.rows.length} classes · ${draft.termTypes.length} terms parsed.`
                : `${draft.rows.length} classes × ${draft.termTypes.length} terms parsed.`}
              {" "}Publish to make it live.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDraft(null)}
                disabled={saving}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 12,
                  background: "rgba(255,255,255,.75)",
                  color: "#885500",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "0.5px solid rgba(255,170,0,.35)",
                  cursor: saving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  opacity: saving ? 0.55 : 1,
                }}
              >
                <Minus size={13} strokeWidth={2.4} />
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1.2,
                  height: 40,
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${B1}, ${B2})`,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  cursor: saving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)",
                  opacity: saving ? 0.65 : 1,
                }}
              >
                {saving ? (
                  <Loader2 size={13} strokeWidth={2.4} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Save size={13} strokeWidth={2.4} />
                )}
                Publish
                <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
              </button>
            </div>
          </div>
        )}

        {/* Status Card (shows when latest structure exists) */}
        {latestStructure && (
          <div
            style={{
              margin: "14px 20px 0",
              padding: "13px 14px",
              background: "linear-gradient(135deg,#E5FCEE 0%,#C8F5DA 100%)",
              borderRadius: 16,
              border: "0.5px solid rgba(0,200,83,.3)",
              boxShadow: "0 6px 18px rgba(0,200,83,.10)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -20,
                right: -20,
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(255,255,255,.6) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 11,
                background: `linear-gradient(135deg, ${GREEN}, #22DD77)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(0,200,83,.35)",
                position: "relative",
                zIndex: 1,
              }}
            >
              <CheckCircle2 size={16} color="#fff" strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: GREEN_D, marginBottom: 2 }}>
                Status
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#003D18", letterSpacing: "-0.3px", marginBottom: 2 }}>
                {allStructures.length} upload{allStructures.length === 1 ? "" : "s"} saved
              </div>
              <div style={{ fontSize: 10, color: "#005A2A", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {latestStructure.uploadedBy
                  ? `Last by ${latestStructure.uploadedBy}`
                  : "Latest version live"}
              </div>
            </div>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: GREEN,
                boxShadow: "0 0 0 3px rgba(0,200,83,.25), 0 0 12px rgba(0,200,83,.6)",
                flexShrink: 0,
                position: "relative",
                zIndex: 1,
              }}
            />
          </div>
        )}

        {/* --- Class-wise Breakdown section removed; fee table now embedded inside version cards below --- */}
        {false && latestStructure && (
          <>
            {/* placeholder to keep mobileShowAllClasses referenced — toggle kept for potential future use */}
            {(mobileShowAllClasses
              ? latestStructure.rows
              : latestStructure.rows.slice(0, 4)
            ).map((row, ri) => {
              const classTotal = latestStructure.termTypes.reduce(
                (sum, t) => sum + (row.amounts[t] || 0),
                0
              );
              const initial = (row.className.match(/\d+|[A-Z]/g)?.[0] || row.className[0] || "?")
                .toUpperCase()
                .slice(0, row.className.match(/\d+[A-Z]/) ? 3 : 2);
              const quarterTerms = latestStructure.termTypes.filter((t) => /^q\d/i.test(t)).slice(0, 4);
              const nonQuarterTerms = latestStructure.termTypes.filter((t) => !/^q\d/i.test(t));
              return (
                <div
                  key={ri}
                  style={{
                    margin: "10px 20px 0",
                    background: "#fff",
                    borderRadius: 20,
                    boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08), 0 10px 26px rgba(0,85,255,.10)",
                    border: "0.5px solid rgba(0,85,255,.08)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      background: classAccents[ri % classAccents.length],
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px 20px", borderBottom: `0.5px solid ${SEP}` }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        background: classAvGrads[ri % classAvGrads.length],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: initial.length > 2 ? 11 : 14,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                        boxShadow: classAvShadows[ri % classAvShadows.length],
                      }}
                    >
                      {initial}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.className}
                      </div>
                      <div style={{ fontSize: 10, color: T4, fontWeight: 500 }}>
                        {latestStructure.termTypes.length} term{latestStructure.termTypes.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: B1, letterSpacing: "-0.4px", lineHeight: 1 }}>
                        {fmtInr(classTotal)}
                      </div>
                      <div style={{ fontSize: 9, color: T4, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
                        Total / yr
                      </div>
                    </div>
                  </div>
                  {quarterTerms.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${quarterTerms.length}, 1fr)`,
                        gap: 1,
                        background: "rgba(0,85,255,.10)",
                        borderBottom: `0.5px solid ${SEP}`,
                      }}
                    >
                      {quarterTerms.map((t) => (
                        <div key={t} style={{ background: "#fff", padding: "9px 6px", textAlign: "center" }}>
                          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 2 }}>
                            {t}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T2, letterSpacing: "-0.1px", lineHeight: 1 }}>
                            {fmtInr(row.amounts[t] || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {nonQuarterTerms.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-around",
                        padding: "10px 14px",
                        background: "rgba(0,85,255,.03)",
                        fontSize: 10,
                        fontWeight: 600,
                        color: T3,
                        gap: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {nonQuarterTerms.slice(0, 3).map((t) => (
                        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {t} <strong style={{ color: T2, fontWeight: 700 }}>{fmtInr(row.amounts[t] || 0)}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {latestStructure.rows.length > 4 && (
              <button
                onClick={() => setMobileShowAllClasses(!mobileShowAllClasses)}
                style={{
                  margin: "10px 20px 0",
                  width: "calc(100% - 40px)",
                  height: 40,
                  borderRadius: 13,
                  background: "#fff",
                  color: B1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.08)",
                  border: "0.5px dashed rgba(0,85,255,.3)",
                }}
              >
                {mobileShowAllClasses ? (
                  <>
                    <ChevronLeft size={13} strokeWidth={2.3} />
                    Show less
                  </>
                ) : (
                  <>
                    <Plus size={13} strokeWidth={2.3} />
                    View all {latestStructure.rows.length} classes
                  </>
                )}
              </button>
            )}
          </>
        )}

        {/* Version history */}
        {allStructures.length > 0 && (
          <>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: T4,
                padding: "16px 20px 0",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>Version History</span>
              <span
                style={{
                  padding: "3px 9px",
                  borderRadius: 100,
                  background: "rgba(0,85,255,.10)",
                  border: "0.5px solid rgba(0,85,255,.16)",
                  fontSize: 9,
                  fontWeight: 700,
                  color: B1,
                  textTransform: "none",
                  letterSpacing: "0.04em",
                }}
              >
                {allStructures.length} version{allStructures.length === 1 ? "" : "s"}
              </span>
              <span style={{ flex: 1, height: "0.5px", background: "rgba(0,85,255,.12)" }} />
            </div>

            {allStructures.map((s, i) => {
              const { branchTotal, perTerm } = totalsFor(s);
              const uploadedLabel = s.uploadedAt?.toDate?.()
                ? s.uploadedAt.toDate().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                : "—";
              const studentCount = s.studentRows?.length || 0;
              const isLatest = i === 0;
              const isExpanded = s.id ? expandedIds.has(s.id) : false;

              // Pick representative terms for the table columns
              const quarterTerms = s.termTypes.filter((t) => /^q\d/i.test(t));
              const repQuarter = quarterTerms[0];
              const annualTerm = s.termTypes.find((t) => /annual|yearly/i.test(t) && !/half/i.test(t));
              const monthlyTerm = s.termTypes.find((t) => /monthly|month/i.test(t));
              const halfYearlyTerm = s.termTypes.find((t) => /half/i.test(t));
              const halfYearlyTotal = halfYearlyTerm ? perTerm[halfYearlyTerm] || 0 : 0;

              const classDotColors = [B1, GREEN, "#00CCDD", B2, B2, B2, B2, B2, ORANGE, ORANGE, ORANGE, ORANGE, RED, GOLD, GOLD, VIOLET, VIOLET];

              return (
                <div
                  key={s.id}
                  style={{
                    margin: "12px 20px 0",
                    background: isLatest ? "linear-gradient(135deg,#E5FCEE 0%,#F4FFF8 60%,#FFFFFF 100%)" : "#fff",
                    borderRadius: 20,
                    boxShadow: isLatest
                      ? "0 10px 28px rgba(0,200,83,.14), 0 0 0 .5px rgba(0,200,83,.22)"
                      : "0 0 0 .5px rgba(0,85,255,.10), 0 4px 16px rgba(0,85,255,.11), 0 18px 44px rgba(0,85,255,.13)",
                    border: `0.5px solid ${isLatest ? "rgba(0,200,83,.3)" : "rgba(0,85,255,.10)"}`,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => s.id && toggleCard(s.id)}
                    style={{
                      padding: "14px 16px",
                      borderBottom: isExpanded ? `0.5px solid ${isLatest ? "rgba(0,200,83,.15)" : SEP}` : "none",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 11,
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 11,
                        background: isLatest
                          ? `linear-gradient(135deg, ${GREEN}, #22DD77)`
                          : "rgba(99,99,99,.10)",
                        border: isLatest ? "none" : "0.5px solid rgba(99,99,99,.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: isLatest ? "0 4px 12px rgba(0,200,83,.35)" : "none",
                      }}
                    >
                      {isLatest ? (
                        <CheckCircle2 size={16} color="#fff" strokeWidth={2.5} />
                      ) : (
                        <Clock size={14} color={T4} strokeWidth={2.4} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T1, letterSpacing: "-0.2px" }}>
                          Fee Structure
                        </div>
                        {isLatest && (
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 100,
                              background: `linear-gradient(135deg, ${GREEN}, #22DD77)`,
                              fontSize: 8,
                              fontWeight: 700,
                              color: "#fff",
                              letterSpacing: "0.08em",
                              boxShadow: "0 3px 8px rgba(0,200,83,.35)",
                            }}
                          >
                            LATEST · LIVE
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                        {studentCount > 0 && (
                          <span style={{ padding: "3px 7px", borderRadius: 100, background: "rgba(123,63,244,.08)", color: VIOLET, border: "0.5px solid rgba(123,63,244,.16)", fontSize: 9, fontWeight: 700 }}>
                            {studentCount} students
                          </span>
                        )}
                        <span style={{ padding: "3px 7px", borderRadius: 100, background: "rgba(0,85,255,.08)", color: B1, border: "0.5px solid rgba(0,85,255,.14)", fontSize: 9, fontWeight: 700 }}>
                          {s.rows.length} classes
                        </span>
                        <span style={{ padding: "3px 7px", borderRadius: 100, background: "rgba(0,85,255,.08)", color: B1, border: "0.5px solid rgba(0,85,255,.14)", fontSize: 9, fontWeight: 700 }}>
                          {s.termTypes.length} terms
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: T3, fontWeight: 500, marginBottom: 2 }}>{uploadedLabel}</div>
                      <div style={{ fontSize: 9, color: T4, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.uploadedBy ? `by ${s.uploadedBy}` : ""}
                        {s.academicYear ? ` · AY ${s.academicYear}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: isLatest ? GREEN_D : B1, letterSpacing: "-0.3px", lineHeight: 1, marginBottom: 4 }}>
                        {fmtInr(branchTotal)}
                      </div>
                      {!isLatest && s.id && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOne(s.id!, `v${allStructures.length - i}`);
                          }}
                          style={{
                            padding: "3px 9px",
                            borderRadius: 100,
                            background: "rgba(255,51,85,.10)",
                            border: "0.5px solid rgba(255,51,85,.22)",
                            fontSize: 9,
                            fontWeight: 700,
                            color: RED_D,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            cursor: saving ? "not-allowed" : "pointer",
                            opacity: saving ? 0.55 : 1,
                          }}
                        >
                          <Trash2 size={9} strokeWidth={2.5} />
                          Delete
                        </div>
                      )}
                      <ChevronDown
                        size={14}
                        color={T4}
                        strokeWidth={2.4}
                        style={{
                          marginTop: 4,
                          display: "block",
                          marginLeft: "auto",
                          transition: "transform .25s ease",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      />
                    </div>
                  </button>

                  {/* Full fee table — shown when expanded */}
                  {isExpanded && s.rows.length > 0 && (
                    <div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "74px 1fr 1fr 1fr 1fr",
                          gap: 2,
                          padding: "10px 14px",
                          background: "linear-gradient(90deg, rgba(0,85,255,.08), rgba(0,85,255,.04))",
                          borderBottom: `0.5px solid ${SEP}`,
                        }}
                      >
                        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: B1, textAlign: "left" }}>Class</div>
                        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: B1, textAlign: "right" }}>
                          {repQuarter || "Term"}
                        </div>
                        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: B1, textAlign: "right" }}>
                          {annualTerm ? "Annual" : (s.termTypes[1] || "—")}
                        </div>
                        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: B1, textAlign: "right" }}>
                          {monthlyTerm ? "Monthly" : (s.termTypes[2] || "—")}
                        </div>
                        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: B1, textAlign: "right" }}>Total</div>
                      </div>

                      {s.rows.map((row, ri) => {
                        const rowTotal = s.termTypes.reduce((sum, t) => sum + (row.amounts[t] || 0), 0);
                        const dotColor = classDotColors[ri % classDotColors.length];
                        return (
                          <div
                            key={ri}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "74px 1fr 1fr 1fr 1fr",
                              gap: 2,
                              padding: "9px 14px",
                              borderBottom: `0.5px solid ${SEP}`,
                              alignItems: "center",
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: T1, letterSpacing: "-0.1px", display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {row.className}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T2, textAlign: "right" }}>
                              {repQuarter ? fmtInr(row.amounts[repQuarter] || 0) : "—"}
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T2, textAlign: "right" }}>
                              {annualTerm ? fmtInr(row.amounts[annualTerm] || 0) : s.termTypes[1] ? fmtInr(row.amounts[s.termTypes[1]] || 0) : "—"}
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T2, textAlign: "right" }}>
                              {monthlyTerm ? fmtInr(row.amounts[monthlyTerm] || 0) : s.termTypes[2] ? fmtInr(row.amounts[s.termTypes[2]] || 0) : "—"}
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: B1, textAlign: "right" }}>
                              {fmtInr(rowTotal)}
                            </div>
                          </div>
                        );
                      })}

                      {/* Branch Total row */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "74px 1fr 1fr 1fr 1fr",
                          gap: 2,
                          padding: "10px 14px",
                          background: "linear-gradient(90deg, rgba(0,85,255,.10), rgba(0,85,255,.05))",
                          borderTop: "0.5px solid rgba(0,85,255,.20)",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: B1, letterSpacing: "-0.1px" }}>Branch Total</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: B1, textAlign: "right" }}>
                          {repQuarter ? fmtInr(perTerm[repQuarter] || 0) : "—"}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: B1, textAlign: "right" }}>
                          {annualTerm ? fmtInr(perTerm[annualTerm] || 0) : s.termTypes[1] ? fmtInr(perTerm[s.termTypes[1]] || 0) : "—"}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: B1, textAlign: "right" }}>
                          {monthlyTerm ? fmtInr(perTerm[monthlyTerm] || 0) : s.termTypes[2] ? fmtInr(perTerm[s.termTypes[2]] || 0) : "—"}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: VIOLET_D, textAlign: "right" }}>
                          {fmtInr(branchTotal)}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "10px 14px",
                          background: "rgba(0,85,255,.03)",
                          fontSize: 9,
                          fontWeight: 600,
                          color: T3,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        {halfYearlyTerm ? (
                          <span>
                            Half-Yearly total:{" "}
                            <strong style={{ color: B1, fontWeight: 700 }}>{fmtInr(halfYearlyTotal)}</strong>
                          </span>
                        ) : (
                          <span>
                            {s.termTypes.length} term{s.termTypes.length === 1 ? "" : "s"} tracked
                          </span>
                        )}
                        <span>
                          {s.rows.length} classes · {s.termTypes.length} terms
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* AI card */}
        <div
          style={{
            margin: "12px 20px 0",
            background: "linear-gradient(140deg,#001888 0%,#0033CC 48%,#0055FF 100%)",
            borderRadius: 22,
            padding: "18px 20px",
            boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -34,
              right: -22,
              width: 140,
              height: 140,
              background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, position: "relative", zIndex: 1 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "rgba(255,255,255,.18)",
                border: "0.5px solid rgba(255,255,255,.26)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={13} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
              AI Fee Intelligence
            </span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
            {latestStructure ? (
              <>
                Current structure spans{" "}
                <strong style={{ color: "#fff", fontWeight: 700 }}>
                  {latestClassCount} class{latestClassCount === 1 ? "" : "es"}
                </strong>{" "}
                with annual revenue of{" "}
                <strong style={{ color: "#fff", fontWeight: 700 }}>
                  {fmtInrFull(latestBranchTotal)}
                </strong>{" "}
                across{" "}
                <strong style={{ color: "#fff", fontWeight: 700 }}>
                  {latestTermCount} term{latestTermCount === 1 ? "" : "s"}
                </strong>
                .
                {allStudents.length > 0 && (
                  <>
                    {" "}Collection rate sits at{" "}
                    <strong style={{ color: "#fff", fontWeight: 700 }}>
                      {collectionRate.toFixed(1)}%
                    </strong>
                    {defaulters > 0 && (
                      <>
                        {" "}with{" "}
                        <strong style={{ color: "#FF99AA", fontWeight: 700 }}>
                          {defaulters} defaulter{defaulters === 1 ? "" : "s"}
                        </strong>
                      </>
                    )}
                    .
                  </>
                )}
              </>
            ) : (
              <>No fee structure uploaded yet. Upload an Excel template to publish your branch's fee plan.</>
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 1,
              background: "rgba(255,255,255,.12)",
              borderRadius: 14,
              overflow: "hidden",
              position: "relative",
              zIndex: 1,
              marginTop: 12,
            }}
          >
            {[
              { v: latestClassCount, l: "Classes", c: "#fff" },
              { v: fmtInr(latestBranchTotal), l: "Annual", c: "#FFDD88" },
              { v: latestStructure ? "LIVE" : "—", l: "Status", c: latestStructure ? "#66EE88" : "#FFDD88" },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: s.c, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>
                  {s.v}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 20 }} />

        {/* Hidden file input — mobile upload button uses this */}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />
      </div>
    );
  }

  // ── Desktop derived metrics ──
  const dLatestTotals = latest ? totalsFor(latest) : null;
  const dBranchTotal = dLatestTotals?.branchTotal || 0;
  const dClassCount = latest?.rows.length || 0;
  const dTermCount = latest?.termTypes.length || 0;
  const dStudentCount = latest?.mode === "student" ? (latest.studentRows?.length || 0) : 0;

  return (
    <div className="pb-10 max-w-[1400px] mx-auto px-2 animate-in fade-in duration-300" style={{ fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* ── Top toolbar ── */}
      <div className="flex items-start justify-between gap-4 pt-2 mb-5">
        <div className="min-w-0">
          <div className="text-[28px] font-bold leading-tight tracking-[-0.7px] flex items-center gap-[10px]" style={{ color: "#001040" }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 4px 12px rgba(0,85,255,0.32)" }}>
              <DollarSign className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
            </div>
            Fee Structure
          </div>
          <div className="text-[12px] font-normal mt-[6px] ml-[46px] flex items-center gap-[6px]" style={{ color: "#5070B0" }}>
            <span>Term-wise Plan</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Per-Class Fees</span>
            <span className="font-bold" style={{ color: "#99AACC" }}>·</span>
            <span>Version History</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={downloadTemplate}
            className="h-[42px] px-4 rounded-[12px] flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.06em] bg-white transition-transform active:scale-95 hover:scale-[1.02]"
            style={{ color: "#002080", border: "0.5px solid rgba(0,85,255,0.16)", boxShadow: "0 0 0 .5px rgba(0,85,255,.08), 0 2px 8px rgba(0,85,255,.09)" }}>
            <Download className="w-[13px] h-[13px]" strokeWidth={2.4} /> Template
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="h-[42px] px-5 rounded-[12px] flex items-center gap-[6px] text-[11px] font-bold text-white uppercase tracking-[0.06em] transition-transform active:scale-95 hover:scale-[1.02] relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #0055FF, #1166FF)", boxShadow: "0 6px 22px rgba(0,85,255,.40), 0 2px 5px rgba(0,85,255,.20)" }}>
            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Upload className="w-[13px] h-[13px] relative z-10" strokeWidth={2.4} />
            <span className="relative z-10">{allStructures.length > 0 ? "Upload New Version" : "Upload Excel"}</span>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
        </div>
      </div>

      {/* ── Hero banner ── */}
      <div className="rounded-[22px] px-6 py-5 relative overflow-hidden flex items-center justify-between gap-5 mb-4"
        style={{
          background: "linear-gradient(135deg, #001040 0%, #001888 35%, #0033CC 70%, #0055FF 100%)",
          boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-12 -right-8 w-[180px] h-[180px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-[12px] min-w-0 relative z-10">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
            <DollarSign className="w-[22px] h-[22px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] mb-[5px]" style={{ color: "rgba(255,255,255,0.50)" }}>
              Branch Total · {latest?.academicYear ? `AY ${latest.academicYear}` : "Latest version"}
            </div>
            <div className="text-[34px] font-bold text-white leading-none tracking-[-1px]">
              {latest ? `₹ ${currency(dBranchTotal)}` : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
          {latest ? (
            <div className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-full"
              style={{ background: "rgba(0,200,83,0.22)", border: "0.5px solid rgba(0,200,83,0.4)" }}>
              <CheckCircle2 className="w-[13px] h-[13px]" style={{ color: "#66EE88" }} strokeWidth={2.5} />
              <span className="text-[12px] font-bold" style={{ color: "#66EE88" }}>Published</span>
            </div>
          ) : (
            <div className="flex items-center gap-[5px] px-[14px] py-[7px] rounded-full"
              style={{ background: "rgba(255,170,0,0.22)", border: "0.5px solid rgba(255,170,0,0.4)" }}>
              <AlertCircle className="w-[13px] h-[13px]" style={{ color: "#FFDD88" }} strokeWidth={2.5} />
              <span className="text-[12px] font-bold" style={{ color: "#FFDD88" }}>Not published</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-[1px] rounded-[13px] overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: allStructures.length, label: "Versions", color: "#fff" },
              { val: dClassCount, label: "Classes", color: "#66EE88" },
              { val: dTermCount, label: "Terms", color: "#FFDD88" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[10px] px-[14px] text-center min-w-[72px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[17px] font-bold leading-none mb-[3px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[8px] font-bold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bright stat cards (stats + year/notes inputs combined) ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Versions stat */}
        <div className="rounded-[20px] p-5 relative overflow-hidden"
          style={{ background: "linear-gradient(140deg, #DDEAFF 0%, #A8C5FF 55%, #7AA5FF 100%)", border: "0.5px solid rgba(0,85,255,0.4)", boxShadow: "0 10px 28px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}>
          <div className="absolute -top-6 -right-5 w-[90px] h-[90px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.65) 0%, transparent 70%)" }} />
          <div className="absolute top-4 right-4 w-[32px] h-[32px] rounded-[11px] flex items-center justify-center z-[1]"
            style={{ background: "rgba(255,255,255,0.75)", border: "0.5px solid rgba(255,255,255,0.95)" }}>
            <FileSpreadsheet className="w-[15px] h-[15px]" style={{ color: "#001055" }} strokeWidth={2.5} />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.09em] mb-[10px]" style={{ color: "#002080" }}>Versions Saved</div>
          <div className="text-[34px] font-bold leading-none tracking-[-1px] mb-[5px]" style={{ color: "#001055" }}>{allStructures.length}</div>
          <div className="text-[11px] font-semibold" style={{ color: "#002080" }}>
            {latest?.uploadedBy ? `Last by ${latest.uploadedBy.split("@")[0]}` : "No uploads yet"}
          </div>
        </div>

        {/* Students stat */}
        <div className="rounded-[20px] p-5 relative overflow-hidden"
          style={{ background: "linear-gradient(140deg, #EEE0FF 0%, #C9A8FF 55%, #A880FF 100%)", border: "0.5px solid rgba(123,63,244,0.4)", boxShadow: "0 10px 28px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}>
          <div className="absolute -top-6 -right-5 w-[90px] h-[90px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.65) 0%, transparent 70%)" }} />
          <div className="absolute top-4 right-4 w-[32px] h-[32px] rounded-[11px] flex items-center justify-center z-[1]"
            style={{ background: "rgba(255,255,255,0.75)", border: "0.5px solid rgba(255,255,255,0.95)" }}>
            <Users className="w-[15px] h-[15px]" style={{ color: "#3A1580" }} strokeWidth={2.5} />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.09em] mb-[10px]" style={{ color: "#3A1580" }}>Students Tracked</div>
          <div className="text-[34px] font-bold leading-none tracking-[-1px] mb-[5px]" style={{ color: "#280C5C" }}>{dStudentCount || "—"}</div>
          <div className="text-[11px] font-semibold" style={{ color: "#3A1580" }}>
            {dStudentCount > 0 ? "Student-level detail" : "Class-level only"}
          </div>
        </div>

        {/* Academic Year input */}
        <div className="rounded-[20px] p-5 relative overflow-hidden"
          style={{ background: "linear-gradient(140deg, #DEFCE8 0%, #8CF0B0 55%, #50E088 100%)", border: "0.5px solid rgba(0,200,83,0.4)", boxShadow: "0 10px 28px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}>
          <div className="absolute -top-6 -right-5 w-[90px] h-[90px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.65) 0%, transparent 70%)" }} />
          <div className="absolute top-4 right-4 w-[32px] h-[32px] rounded-[11px] flex items-center justify-center z-[1]"
            style={{ background: "rgba(255,255,255,0.75)", border: "0.5px solid rgba(255,255,255,0.95)" }}>
            <Calendar className="w-[15px] h-[15px]" style={{ color: "#005A20" }} strokeWidth={2.5} />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.09em] mb-[10px]" style={{ color: "#005A20" }}>Academic Year (new upload)</div>
          <input value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="e.g., 2026-27"
            className="w-full h-[40px] px-3 rounded-[11px] text-[15px] font-bold outline-none"
            style={{ background: "rgba(255,255,255,0.65)", border: "0.5px solid rgba(0,200,83,0.35)", color: "#004018" }} />
        </div>

        {/* Notes input */}
        <div className="rounded-[20px] p-5 relative overflow-hidden"
          style={{ background: "linear-gradient(140deg, #FFF6D1 0%, #FFE488 55%, #FFCC33 100%)", border: "0.5px solid rgba(255,170,0,0.4)", boxShadow: "0 10px 28px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)" }}>
          <div className="absolute -top-6 -right-5 w-[90px] h-[90px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.65) 0%, transparent 70%)" }} />
          <div className="absolute top-4 right-4 w-[32px] h-[32px] rounded-[11px] flex items-center justify-center z-[1]"
            style={{ background: "rgba(255,255,255,0.75)", border: "0.5px solid rgba(255,255,255,0.95)" }}>
            <Tag className="w-[15px] h-[15px]" style={{ color: "#664400" }} strokeWidth={2.5} />
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.09em] mb-[10px]" style={{ color: "#664400" }}>Notes (new upload)</div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g., Revised Q2 fees"
            className="w-full h-[40px] px-3 rounded-[11px] text-[13px] font-semibold outline-none"
            style={{ background: "rgba(255,255,255,0.65)", border: "0.5px solid rgba(255,170,0,0.35)", color: "#472A00" }} />
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
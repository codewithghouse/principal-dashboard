/**
 * school_holidays subscription + lookup helpers. Mirror across 4 dashboards.
 * Principal dashboard is the WRITER (Holidays page); other dashboards read.
 */

import {
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export interface SchoolHoliday {
  id: string;
  schoolId: string;
  date: string;
  reason: string;
  branchId?: string;
  declaredBy?: string;
  declaredByName?: string;
  createdAt?: unknown;
}

export function subscribeSchoolHolidays(
  schoolId: string,
  onChange: (holidays: SchoolHoliday[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!schoolId) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, "school_holidays"), where("schoolId", "==", schoolId)),
    (snap) => {
      const out: SchoolHoliday[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SchoolHoliday, "id">),
      }));
      onChange(out);
    },
    (err) => {
      console.error("[schoolHolidays] listener error:", err);
      onError?.(err);
    },
  );
}

export function buildHolidayMap(
  holidays: SchoolHoliday[],
): Map<string, SchoolHoliday> {
  const m = new Map<string, SchoolHoliday>();
  holidays.forEach((h) => {
    if (h.date) m.set(h.date, h);
  });
  return m;
}

export function isSchoolHoliday(
  dateKey: string | undefined | null,
  holidayMap: Map<string, SchoolHoliday>,
): boolean {
  if (!dateKey) return false;
  return holidayMap.has(dateKey);
}

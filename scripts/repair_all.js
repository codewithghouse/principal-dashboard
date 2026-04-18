#!/usr/bin/env node
/**
 * repair_all.js — one-time institutional context repair.
 *
 * Walks students / enrollments / attendance / test_scores / gradebook_scores
 * and backfills missing `schoolId` by looking up the linked teacher.
 *
 * REWRITTEN to use Firebase Admin SDK (was client SDK before, which relied on
 * Firestore rules being open — will fail once rules enforce tenant-scoping).
 *
 * USAGE:
 *   1) Place a Firebase Admin service-account key at the repo root as
 *      serviceAccountKey.json (download from Firebase Console → Project
 *      Settings → Service Accounts → Generate Key).
 *   2) npm install firebase-admin
 *   3) node principal-dashboard/scripts/repair_all.js [--dry-run]
 *
 * Flags:
 *   --dry-run   Report what WOULD be updated without writing.
 */
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const dryRun = process.argv.includes("--dry-run");

// Resolve the service-account key from the repo root.
const keyPath = path.resolve(__dirname, "..", "..", "serviceAccountKey.json");
if (!fs.existsSync(keyPath)) {
  console.error(
    "Missing serviceAccountKey.json at",
    keyPath,
    "\nDownload from Firebase Console → Project Settings → Service Accounts."
  );
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

async function repairAllData() {
  console.log(`Starting Institutional Context Repair${dryRun ? " [DRY-RUN]" : ""}...`);

  // 1) Build teacher context map
  const teacherMap = new Map();
  const tSnap = await db.collection("teachers").get();
  tSnap.forEach((d) => {
    const data = d.data();
    const sId = data.schoolId || data.school || data.schoolID;
    const sName = data.schoolName || "Institutional Faculty";
    const br = data.branch || "Main";
    if (sId) {
      teacherMap.set(d.id, { schoolId: sId, schoolName: sName, branch: br });
    }
  });
  console.log(`Loaded ${teacherMap.size} teachers with school contexts.`);

  const collections = [
    "students",
    "enrollments",
    "attendance",
    "test_scores",
    "gradebook_scores",
  ];
  let totalRepaired = 0;

  for (const col of collections) {
    console.log(`Scanning collection: ${col}...`);
    let colCount = 0;
    let batch = db.batch();
    let batchCount = 0;

    // Paginate through the collection to avoid loading everything in memory.
    let cursor = null;
    while (true) {
      let q = db
        .collection(col)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(500);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const hasSchool = data.schoolId || data.school || data.schoolID;

        if (!hasSchool && data.teacherId && teacherMap.has(data.teacherId)) {
          const ctx = teacherMap.get(data.teacherId);
          if (!dryRun) {
            batch.update(docSnap.ref, {
              schoolId: ctx.schoolId,
              school: ctx.schoolId,
              schoolName: ctx.schoolName,
              branch: ctx.branch,
            });
            batchCount++;
            if (batchCount >= 400) {
              await batch.commit();
              batch = db.batch();
              batchCount = 0;
            }
          }
          colCount++;
          totalRepaired++;
        }
      }

      if (snap.docs.length < 500) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    if (batchCount > 0 && !dryRun) await batch.commit();
    console.log(`Fixed ${colCount} records in ${col}.`);
  }

  console.log(`\nTotal documents repaired: ${totalRepaired}${dryRun ? " (dry-run, no writes)" : ""}`);
}

repairAllData()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Fatal:", err); process.exit(1); });
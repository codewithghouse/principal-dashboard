import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDweUfpKmjSe1T7pqDymPrgHXFZZGdULM4",
  authDomain: "eduintellect-7e709.firebaseapp.com",
  projectId: "eduintellect-7e709",
  storageBucket: "eduintellect-7e709.firebasestorage.app",
  messagingSenderId: "745625746881",
  appId: "1:745625746881:web:9b849424c494372f7e0340"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function repairAllData() {
    console.log("🚀 Starting Institutional Context Repair...");

    // 1. Build Teacher Context Map
    console.log("Teacher Context Map banara hu...");
    const teacherMap = new Map();
    const tSnap = await getDocs(collection(db, "teachers"));
    tSnap.forEach(d => {
        const data = d.data();
        const sId = data.schoolId || data.school || data.schoolID;
        const sName = data.schoolName || "Institutional Faculty";
        const br = data.branch || "Main";
        if (sId) {
            teacherMap.set(d.id, { schoolId: sId, schoolName: sName, branch: br });
        }
    });
    console.log(`✅ Loaded ${teacherMap.size} Teachers with school contexts.`);

    const collections = ['students', 'enrollments', 'attendance', 'test_scores', 'gradebook_scores'];
    let totalRepaired = 0;

    for (const col of collections) {
        console.log(`Scanning collection: ${col}...`);
        const snap = await getDocs(collection(db, col));
        let colCount = 0;

        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const hasSchool = data.schoolId || data.school || data.schoolID;

            if (!hasSchool && data.teacherId && teacherMap.has(data.teacherId)) {
                const ctx = teacherMap.get(data.teacherId);
                await updateDoc(doc(db, col, docSnap.id), {
                    schoolId: ctx.schoolId,
                    school: ctx.schoolId,
                    schoolName: ctx.schoolName,
                    branch: ctx.branch
                });
                colCount++;
                totalRepaired++;
            }
        }
        console.log(`✅ Fixed ${colCount} records in ${col}.`);
    }

    console.log(`\n🎉 SUCCESS! Total documents repaired: ${totalRepaired}`);
    process.exit(0);
}

repairAllData().catch(err => {
    console.error("❌ Fatal Error:", err);
    process.exit(1);
});

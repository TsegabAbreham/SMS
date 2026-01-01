"use client";


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  DocumentData,
  QueryDocumentSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

type Student = {
  id: string;
  name: string;
  className?: string;
  email?: string;
  subjects?: string[];
};

type AttendanceItem = {
  id?: string; // for our model this will be the date (YYYY-MM-DD)
  studentId: string;
  date: string; // YYYY-MM-DD
  status: "present" | "absent" | "late";
};

type GradeItem = {
  id?: string; // slug_date
  studentId: string;
  subject: string;
  grade: number;
  date?: string; // assessment date
};

export default function StudentDashboard() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [student, setStudent] = useState<Student | null>(null);

  const [attendance, setAttendance] = useState<AttendanceItem[]>([]);
  const [grades, setGrades] = useState<GradeItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Attendance modal state
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login?role=student");
        return;
      }
      setUser(u);

      try {
        const userDoc = await getDoc(doc(db, "users", u.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;
        if (!userDoc.exists() || userData?.role !== "student") {
          await signOut(auth);
          router.push("/login?role=student");
          return;
        }

        await loadAll(u.uid);
      } catch (err: any) {
        console.error("Auth load error:", err);
        setError(err?.message ?? "Failed to load student data.");
        setLoading(false);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load student profile + subcollections that are now inside students/{uid}
  async function loadAll(uid: string) {
    setLoading(true);
    setError(null);

    try {
      // 1) student profile
      const studDocRef = doc(db, "students", uid);
      const studDoc = await getDoc(studDocRef);
      if (!studDoc.exists()) {
        setStudent(null);
        setError("Student profile not found.");
      } else {
        const d = studDoc.data() as any;
        setStudent({
          id: uid,
          name: d.name ?? "Unknown",
          className: d.class ?? d.className ?? "",
          email: d.email ?? "",
          subjects: d.subjects ?? [], // fallback only; subcollection is source of truth
        });
      }

      // 2) subjects from subcollection students/{uid}/subjects
      const subsCol = collection(db, "students", uid, "subjects");
      const subsSnap = await getDocs(subsCol);
      const subs = subsSnap.docs.map((d) => (d.data() as any).name as string);

      // 3) attendance from subcollection students/{uid}/attendance; date doc ids allow simple ordering
      const attCol = collection(db, "students", uid, "attendance");
      const attQ = query(attCol, orderBy("date", "desc"));
      const attSnap = await getDocs(attQ);
      const attList: AttendanceItem[] = attSnap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...(d.data() as AttendanceItem) }));

      // 4) grades from subcollection students/{uid}/grades
      const gradeCol = collection(db, "students", uid, "grades");
      const gradeQ = query(gradeCol, orderBy("date", "desc"));
      const gradeSnap = await getDocs(gradeQ);
      const gradeList: GradeItem[] = gradeSnap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...(d.data() as GradeItem) }));

      // apply to state
      setAttendance(attList);
      setGrades(gradeList);
      setStudent((prev) => (prev ? { ...prev, subjects: subs } : prev));
    } catch (err: any) {
      console.error("loadAll error:", err);
      if (err?.message?.includes("index")) {
        setError("Firestore query requires an index. Please create the index or change the query.");
      } else if (err?.code === "permission-denied") {
        setError("Firestore permission denied. Check your security rules.");
      } else {
        setError(err?.message ?? "Error loading data. Check console.");
      }
    } finally {
      setLoading(false);
    }
  }

  // derived stats
  const attendanceSummary = (() => {
    const total = attendance.length;
    const present = attendance.filter((a) => a.status === "present").length;
    const absent = attendance.filter((a) => a.status === "absent").length;
    const late = attendance.filter((a) => a.status === "late").length;
    const percentPresent = total === 0 ? 0 : Math.round((present / total) * 100);
    return { total, present, absent, late, percentPresent };
  })();

  const gradesBySubject = (() => {
    const map: Record<string, number[]> = {};
    for (const g of grades) {
      if (!map[g.subject]) map[g.subject] = [];
      map[g.subject].push(Number(g.grade));
    }
    const result: { subject: string; avg: number; count: number }[] = [];
    let overallSum = 0;
    let overallCount = 0;
    for (const sub of Object.keys(map)) {
      const arr = map[sub];
      const sum = arr.reduce((s, v) => s + v, 0);
      const avg = arr.length ? sum / arr.length : 0;
      result.push({ subject: sub, avg: Math.round(avg * 100) / 100, count: arr.length });
      overallSum += sum;
      overallCount += arr.length;
    }
    const overallAvg = overallCount ? Math.round((overallSum / overallCount) * 100) / 100 : 0;
    return { perSubject: result, overallAvg };
  })();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login?role=student");
    } catch (err) {
      console.error("logout error", err);
      setError("Logout failed.");
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-sky-50">
        <div className="p-6 bg-white rounded shadow text-slate-700">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-sky-50">
        <div className="p-6 bg-white rounded shadow text-red-600">
          <p>{error}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => router.push("/login?role=student")} className="bg-blue-600 text-white px-3 py-1 rounded">Back to login</button>
            <button onClick={() => user && loadAll(user.uid)} className="bg-gray-200 px-3 py-1 rounded">Retry</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-gradient-to-b from-sky-50 to-white">
      <div className="max-w-5xl w-full mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Student Dashboard</h1>
            <p className="text-sm text-slate-600">Welcome, {student?.name ?? "Student"}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-700 text-right">
              <div>{student?.className || "-"}</div>
              <div className="text-xs text-slate-500">{student?.email || user?.email}</div>
            </div>
            <br></br>
            <button onClick={handleLogout} className="bg-rose-600 hover:bg-rose-700 text-white py-2 px-3 rounded">Logout</button>
          </div>
        </header>

     
        <div className="grid md:grid-cols-3 gap-6">
          <section className="md:col-span-2 bg-white rounded shadow p-4 space-y-4">

            {/* Attendance */}
            <div className="p-4 border rounded">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-slate-800">Attendance</h2>
                <div className="text-sm text-slate-600">{attendanceSummary.total} records</div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-slate-500">Present</div>
                  <div className="font-semibold text-emerald-600">{attendanceSummary.present}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Absent</div>
                  <div className="font-semibold text-rose-600">{attendanceSummary.absent}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Late</div>
                  <div className="font-semibold text-amber-600">{attendanceSummary.late}</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-sm text-slate-600">Attendance rate: <span className="font-medium">{attendanceSummary.percentPresent}%</span></div>

                <div className="mt-3 max-h-48 overflow-auto border rounded p-2 bg-slate-50">
                  {attendance.length === 0 ? (
                    <div className="text-sm text-slate-600">No attendance records yet.</div>
                  ) : (
                        <>
                        {/* Button to open modal */}
                        <button
                          className="w-full text-left text-sm text-slate-700 color-sky-600 hover:underline"
                          onClick={() => setModalOpen(true)}
                        >
                          Click here for detailed attendance records
                        </button>

                        {/* Modal */}
                        {modalOpen && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            {/* Backdrop */}
                            <div
                              className="absolute inset-0 bg-black/60"
                              onClick={() => setModalOpen(false)}
                            ></div>

                            {/* Modal content */}
                            <div className="relative bg-white w-full max-w-md rounded-lg shadow-lg p-6 z-10">
                              <h2 className="text-lg font-semibold mb-4 text-slate-800">Attendance Records</h2>

                              <ul className="text-sm space-y-1 max-h-96 overflow-auto">
                                {attendance.length === 0 ? (
                                  <li className="text-slate-600">No attendance records yet.</li>
                                ) : (
                                  attendance.map((a) => (
                                    <li key={a.id ?? a.date} className="flex justify-between text-slate-800">
                                      <div>{a.date}</div>
                                      <div
                                        className={
                                          a.status === "present"
                                            ? "text-emerald-600"
                                            : a.status === "late"
                                            ? "text-amber-600"
                                            : "text-rose-600"
                                        }
                                      >
                                        {a.status}
                                      </div>
                                    </li>
                                  ))
                                )}
                              </ul>

                              <div className="mt-4 flex justify-end">
                                <button
                                  onClick={() => setModalOpen(false)}
                                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                  )}
                </div>
              </div>
            </div>


            {/* Grades */}
            <div className="p-4 border rounded">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-slate-800">Grades</h2>
                <div className="text-sm text-slate-600">Overall avg: <span className="font-medium">{gradesBySubject.overallAvg || "-"}</span></div>
              </div>
              
              
              <div className="mt-3">
                {grades.length === 0 ? (
                  <div className="text-sm text-slate-600">No grades yet.</div>
                ) : (
                <div className="overflow-x-auto border rounded">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                          Subject
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-300">
                          Average
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {gradesBySubject.perSubject.map((s) => (
                        <tr key={s.subject}>
                          <td className="px-4 py-2 text-gray-800 border border-gray-300">{s.subject}</td>
                          <td className="px-4 py-2 text-right font-medium text-blue-600 border border-gray-300">{s.avg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>


                )}
              </div>
            </div>

            {/* Subject List */}
            <div className="p-4 border rounded">
              <h2 className="text-lg font-medium text-slate-800">Subjects</h2>
              <div className="mt-3 text-sm text-slate-600">
                {student?.subjects && student.subjects.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {student.subjects.map((s) => (
                      <span key={s} className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-700">{s}</span>
                    ))}
                  </div>
                ) : (
                  <div>No subjects assigned yet.</div>
                )}
              </div>
            </div>
          </section>


        </div>
      </div>
    </main>
  );
}

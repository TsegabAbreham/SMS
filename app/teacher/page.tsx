"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";

import { auth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  addDoc,
  query,
  where,
  orderBy,
  DocumentData,
  QueryDocumentSnapshot,
  getDoc,
  updateDoc,
  arrayUnion,
  deleteDoc,
} from "firebase/firestore";

// types
type Student = {
  id: string;
  name: string;
  className?: string;
  email?: string;
  photoURL?: string | null;
};

type AttendanceItem = {
  studentId: string;
  date: string; // YYYY-MM-DD
  status: "present" | "absent" | "late";
};

type GradeItem = {
  studentId: string;
  subject: string;
  grade: number;
  date: string; // YYYY-MM-DD (assessment date)
};

export default function TeacherPage() {
  const router = useRouter();

  // modal form fields (for create student)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [className, setClassName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // students list
  const [students, setStudents] = useState<Student[]>([]);

  // UI state
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<"subjects" | "attendance" | "grades">("subjects");

  // attendance & grades for selected student
  const [attendanceList, setAttendanceList] = useState<AttendanceItem[]>([]);
  const [gradesList, setGradesList] = useState<GradeItem[]>([]);
  const [studentSubjects, setStudentSubjects] = useState<string[]>([]);

  // forms for attendance & grades
  const [attDate, setAttDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [attStatus, setAttStatus] = useState<AttendanceItem["status"]>("present");

  const [gradeSubject, setGradeSubject] = useState("");
  const [gradeValue, setGradeValue] = useState<number | "">("");
  const [gradeDate, setGradeDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // new subject input
  const [newSubjectName, setNewSubjectName] = useState("");

  useEffect(() => {
    fetchStudents();
  }, []);

  // ---------- Helpers ----------
  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  // ---------- Students ----------
  async function fetchStudents() {
    try {
      const col = collection(db, "students");
      const snapshot = await getDocs(col);
      const list: Student[] = snapshot.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          className: data.class || "",
          email: data.email,
          photoURL: data.photoURL ?? null,
        };
      });
      setStudents(list);
    } catch (err) {
      console.error("fetchStudents error:", err);
    }
  }

  // fetch student subcollections: subjects, attendance, grades
  async function fetchStudentData(uid: string) {
    try {
      // subjects: stored as subcollection under students/{uid}/subjects
      const subsCol = collection(db, "students", uid, "subjects");
      const subsSnap = await getDocs(subsCol);
      const subs = subsSnap.docs.map((d) => (d.data() as any).name as string);
      setStudentSubjects(subs);

      // attendance: stored under students/{uid}/attendance with doc id = date (YYYY-MM-DD)
      const attCol = collection(db, "students", uid, "attendance");
      const attQ = query(attCol, orderBy("date", "desc"));
      const attSnap = await getDocs(attQ);
      const atts: AttendanceItem[] = attSnap.docs.map((d) => d.data() as AttendanceItem);
      setAttendanceList(atts);

      // grades: stored under students/{uid}/grades with doc id = `${slug}_${date}` to avoid duplicates per subject+date
      const gradeCol = collection(db, "students", uid, "grades");
      const gradeSnap = await getDocs(gradeCol);
      const grades: GradeItem[] = gradeSnap.docs.map((d) => d.data() as GradeItem);
      // sort by date desc
      grades.sort((a, b) => (a.date < b.date ? 1 : -1));
      setGradesList(grades);
    } catch (err) {
      console.error("fetchStudentData error:", err);
    }
  }

  // open manage panel for a student
  const handleManage = async (s: Student) => {
    setSelectedStudent(s);
    setActiveTab("subjects");
    await fetchStudentData(s.id);
  };

  // ---------- Create Student (unchanged logic, but keeps students collection simple) ----------
  const handleCreateStudent = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password) {
      setError("Name, email and password are required.");
      return;
    }

    setLoading(true);
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      await setDoc(doc(db, "users", uid), {
        uid,
        email,
        role: "student",
        name,
      });

      await setDoc(doc(db, "students", uid), {
        id: uid,
        userId: uid,
        name,
        class: className || "",
        email,
      });

      setName("");
      setEmail("");
      setPassword("");
      setClassName("");
      setCreateOpen(false);

      await fetchStudents();
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("This email is already used by another account.");
      } else {
        setError(err.message || "Failed to create student.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- Subjects (now stored as subcollection to avoid accidental duplicates) ----------
  const handleAddSubject = async (subjectRaw: string) => {
    if (!selectedStudent || !subjectRaw.trim()) return;
    const name = subjectRaw.trim();
    const slug = slugify(name);
    try {
      // set doc under students/{uid}/subjects/{slug} - idempotent and prevents case/spacing duplicates
      await setDoc(doc(db, "students", selectedStudent.id, "subjects", slug), { name });

      // optional: keep a quick array in top-level students doc for faster listing (normalize)
      const studentRef = doc(db, "students", selectedStudent.id);
      await updateDoc(studentRef, { subjects: arrayUnion(name) }).catch(() => {
        // ignore update failures; subjects subcollection is the source of truth
      });

      await fetchStudentData(selectedStudent.id);
      await fetchStudents();
    } catch (err) {
      console.error("add subject error:", err);
    }
  };

  const handleDeleteSubject = async (subjectName: string) => {
    if (!selectedStudent) return;
    const slug = slugify(subjectName);
    try {
      await deleteDoc(doc(db, "students", selectedStudent.id, "subjects", slug));
      // note: we don't remove from top-level array to avoid write conflicts; you may run a small migration later
      await fetchStudentData(selectedStudent.id);
    } catch (err) {
      console.error("delete subject error:", err);
    }
  };

  // ---------- Attendance (use date as doc id under student's subcollection to prevent duplicates) ----------
  const handleAddAttendance = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedStudent) return;
    const att: AttendanceItem = {
      studentId: selectedStudent.id,
      date: attDate,
      status: attStatus,
    };

    try {
      // set doc with id = date (YYYY-MM-DD) -- this prevents duplicate entries per student per date
      await setDoc(doc(db, "students", selectedStudent.id, "attendance", attDate), att);
      await fetchStudentData(selectedStudent.id);
    } catch (err) {
      console.error("add attendance error:", err);
    }
  };

  const handleDeleteAttendance = async (date: string) => {
    if (!selectedStudent) return;
    try {
      await deleteDoc(doc(db, "students", selectedStudent.id, "attendance", date));
      await fetchStudentData(selectedStudent.id);
    } catch (err) {
      console.error("delete attendance error:", err);
    }
  };

  // ---------- Grades (unique by subject + date; stored under students/{uid}/grades/{slug}_{date}) ----------
  const handleAddGrade = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    if (!gradeSubject || gradeValue === "") return;

    const subject = gradeSubject.trim();
    const slug = slugify(subject);
    const key = `${slug}_${gradeDate}`; // if you want multiple assessments same day you can append timestamp

    const g: GradeItem = {
      studentId: selectedStudent.id,
      subject,
      grade: Number(gradeValue),
      date: gradeDate,
    };

    try {
      // use setDoc with deterministic id to avoid accidental duplicates for the same subject+date
      await setDoc(doc(db, "students", selectedStudent.id, "grades", key), g);

      // ensure subject exists
      await handleAddSubject(subject);

      setGradeSubject("");
      setGradeValue("");
      setGradeDate(new Date().toISOString().slice(0, 10));

      await fetchStudentData(selectedStudent.id);
    } catch (err) {
      console.error("add grade error:", err);
    }
  };

  const handleDeleteGrade = async (subject: string, date: string) => {
    if (!selectedStudent) return;
    const slug = slugify(subject);
    const key = `${slug}_${date}`;
    try {
      await deleteDoc(doc(db, "students", selectedStudent.id, "grades", key));
      await fetchStudentData(selectedStudent.id);
    } catch (err) {
      console.error("delete grade error:", err);
    }
  };

  // ---------- UI ----------
  return (
    <main className="min-h-screen p-6 bg-gradient-to-b from-sky-50 to-white">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-800">Teacher Dashboard</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCreateOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded shadow"
            >
              + Create Student
            </button>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          {/* left: students list */}
          <section className="md:col-span-2 bg-white rounded shadow p-4">
            <h2 className="text-xl font-semibold mb-4 text-slate-800">Students</h2>

            {students.length === 0 ? (
              <p className="text-gray-500">No students yet.</p>
            ) : (
              <ul className="space-y-3">
                {students.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-center gap-4 p-3 rounded hover:bg-slate-50 justify-between ${
                      selectedStudent?.id === s.id ? "ring-2 ring-indigo-200" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                        {s.photoURL ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.photoURL} alt={s.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-gray-600">
                            {s.name?.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{s.name}</div>
                        <div className="text-sm text-gray-600">{s.email}</div>
                        <div className="text-sm text-gray-500">Class: {s.className || "-"}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleManage(s)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white py-1 px-3 rounded text-sm"
                      >
                        Manage
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* right: manage panel (tabs) */}
          <aside className="bg-white rounded shadow p-4 text-slate-800">
            {selectedStudent ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gray-200 rounded overflow-hidden">
                    {selectedStudent.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedStudent.photoURL}
                        alt={selectedStudent.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-600">
                        {selectedStudent.name?.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{selectedStudent.name}</div>
                    <div className="text-sm text-slate-700">{selectedStudent.email}</div>
                    <div className="text-xs text-slate-600">ID: {selectedStudent.id}</div>
                  </div>
                </div>

                {/* tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setActiveTab("subjects")}
                    className={`px-3 py-1 rounded ${activeTab === "subjects" ? "bg-indigo-600 text-white" : "border"}`}
                  >
                    Subjects
                  </button>
                  <button
                    onClick={() => setActiveTab("attendance")}
                    className={`px-3 py-1 rounded ${activeTab === "attendance" ? "bg-indigo-600 text-white" : "border"}`}
                  >
                    Attendance
                  </button>
                  <button
                    onClick={() => setActiveTab("grades")}
                    className={`px-3 py-1 rounded ${activeTab === "grades" ? "bg-indigo-600 text-white" : "border"}`}
                  >
                    Grades
                  </button>
                </div>

                {activeTab === "subjects" && (
                  <div className="mb-4 p-3 border rounded">
                    <h3 className="font-medium mb-2 text-slate-800">Subjects</h3>

                    <div className="flex gap-2 mb-2">
                      <input
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        placeholder="New subject (e.g., Math)"
                        className="border p-2 rounded flex-1 bg-white text-slate-800"
                      />
                      <button
                        onClick={() => {
                          if (newSubjectName.trim()) {
                            handleAddSubject(newSubjectName.trim());
                            setNewSubjectName("");
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-3 rounded"
                      >
                        Add
                      </button>
                    </div>

                    <div className="text-sm text-slate-700">
                      {studentSubjects.length === 0 ? (
                        <em className="text-slate-600">No subjects yet.</em>
                      ) : (
                        <ul className="space-y-1">
                          {studentSubjects.map((sub) => (
                            <li key={sub} className="flex justify-between items-center">
                              <div>{sub}</div>
                              <div>
                                <button
                                  onClick={() => handleDeleteSubject(sub)}
                                  className="text-xs px-2 py-1 border rounded"
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "attendance" && (
                  <div className="mb-4 p-3 border rounded">
                    <h3 className="font-medium mb-2 text-slate-800">Attendance</h3>

                    <form onSubmit={(e) => { e.preventDefault(); handleAddAttendance(); }} className="flex gap-2 items-center mb-3">
                      <input
                        type="date"
                        value={attDate}
                        onChange={(e) => setAttDate(e.target.value)}
                        className="border p-2 rounded w-1/2 bg-white text-slate-800"
                      />
                      <select
                        value={attStatus}
                        onChange={(e) => setAttStatus(e.target.value as AttendanceItem["status"])}
                        className="border p-2 rounded w-1/2 bg-white text-slate-800"
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                      </select>
                      <button type="submit" className="bg-sky-600 hover:bg-sky-700 text-white py-1 px-3 rounded">Save</button>
                    </form>

                    <div>
                      {attendanceList.length === 0 ? (
                        <p className="text-slate-600">No attendance records.</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {attendanceList.map((a) => (
                            <li key={a.date} className="flex justify-between text-slate-800">
                              <div>{a.date}</div>
                              <div className="flex gap-2 items-center">
                                <div className={a.status === "present" ? "text-emerald-600" : a.status === "late" ? "text-amber-600" : "text-rose-600"}>{a.status}</div>
                                <button onClick={() => handleDeleteAttendance(a.date)} className="text-xs px-2 py-1 border rounded">Delete</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "grades" && (
                  <div className="mb-4 p-3 border rounded">
                    <h3 className="font-medium mb-2 text-slate-800">Add Grade</h3>

                    <form onSubmit={handleAddGrade} className="space-y-2">
                      <div>
                        <select
                          value={gradeSubject}
                          onChange={(e) => setGradeSubject(e.target.value)}
                          className="border p-2 rounded w-full bg-white text-slate-800"
                        >
                          <option value="">Select subject</option>
                          {studentSubjects.map((sub) => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={gradeValue}
                          onChange={(e) => setGradeValue(e.target.value === "" ? "" : Number(e.target.value))}
                          placeholder="Grade (e.g., 88)"
                          className="border p-2 rounded flex-1 bg-white text-slate-800"
                        />
                        <input type="date" value={gradeDate} onChange={(e) => setGradeDate(e.target.value)} className="border p-2 rounded" />
                      </div>

                      <div>
                        <button type="submit" className="bg-yellow-600 hover:bg-yellow-700 text-white py-1 px-3 rounded">Save Grade</button>
                      </div>
                    </form>

                    <div className="mt-4">
                      <h4 className="font-medium mb-2 text-slate-800">Grades</h4>
                      {gradesList.length === 0 ? (
                        <p className="text-slate-600">No grades yet.</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {gradesList.map((g) => (
                            <li key={`${g.subject}_${g.date}`} className="flex justify-between text-slate-800">
                              <div>
                                <div className="font-medium">{g.subject}</div>
                                <div className="text-xs text-slate-600">{g.date}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="font-medium">{g.grade}</div>
                                <button onClick={() => handleDeleteGrade(g.subject, g.date)} className="text-xs px-2 py-1 border rounded">Delete</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <button
                    onClick={() => {
                      setSelectedStudent(null);
                      setAttendanceList([]);
                      setGradesList([]);
                      setStudentSubjects([]);
                    }}
                    className="text-sm text-gray-600 hover:underline"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <div className="text-slate-600">Select a student and click Manage to view attendance, subjects and grades.</div>
            )}
          </aside>
        </div>
      </div>

      {/* Create Student Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreateOpen(false)}></div>

          <div className="relative bg-white w-full max-w-2xl rounded-lg shadow-xl z-10 overflow-auto">
            <div className="flex items-center justify-between px-6 py-3 bg-indigo-600 rounded-t-lg">
              <h2 className="text-white text-lg font-semibold">Create Student</h2>
              <button onClick={() => setCreateOpen(false)} className="text-white bg-indigo-700/30 hover:bg-indigo-700/40 px-3 py-1 rounded">Close</button>
            </div>

            <div className="p-6">
              <form onSubmit={handleCreateStudent} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Student name" className="border p-2 w-full rounded bg-white text-slate-800" />
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Student email" className="border p-2 w-full rounded bg-white text-slate-800" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password" className="border p-2 w-full rounded bg-white text-slate-800" />
                  <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class (e.g., 10A)" className="border p-2 w-full rounded bg-white text-slate-800" />
                </div>

                {error && <p className="text-red-500">{error}</p>}

                <div className="flex justify-end gap-2 mt-3">
                  <button type="button" onClick={() => setCreateOpen(false)} className="py-2 px-4 rounded border">Cancel</button>
                  <button type="submit" disabled={loading} className="py-2 px-4 rounded bg-indigo-600 text-white">{loading ? "Creating..." : "Create Student"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

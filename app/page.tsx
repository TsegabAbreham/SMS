"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow w-80 text-center">
        <h1 className="text-2xl font-bold mb-6 text-blue-600">Student Management System</h1>

        <button
          onClick={() => router.push("/login?role=student")}
          className="w-full bg-blue-500 text-white py-2 mb-3 rounded"
        >
          <strong>
          I am a Student
          </strong>
        </button>

        <button
          onClick={() => router.push("/login?role=teacher")}
          className="w-full bg-green-500 text-white py-2 rounded"
        >
          <strong>
          I am a Teacher
          </strong>
        </button>
      </div>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import logo from "../public/logo.png";

export default function Home() {
  const router = useRouter();

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-100 px-4">
      

      <div className="bg-white p-8 rounded shadow w-full max-w-md sm:max-w-lg md:max-w-xl text-center">
        <center><Image src={logo} alt="School Logo" width={300} height={300} className="mb-6" /></center>
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
          className="w-full bg-green-500 text-white py-2 rounded mb-6"
        >
          <strong>
          I am a Teacher
          </strong>
        </button>
        <strong>
        <p className="text-black mb-6">Made by: Anatol, Amanuel, Bisrat, Nathan, Tsegab</p>
        <p className="text-black mb-6">---------------------------</p>
        <p className="text-black ">Made for: Computer Science Project</p>
        </strong>
      </div>
    </main>
  );
}

"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

import Image from "next/image";
import logo from "../../public/logo.png";

export default function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRole = searchParams.get("role"); // student | teacher

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (!userDoc.exists()) {
        setError("User not found");
        return;
      }

      const role = userDoc.data().role;

      if (role !== selectedRole) {
        setError("Wrong role selected");
        return;
      }

      router.push(role === "teacher" ? "/teacher" : "/student");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-6 rounded shadow w-50%">
        <Image src={logo} alt="School Logo" width={200} height={200} className="mb-6 mx-auto" />
        <h1 className="text-xl font-bold mb-4 capitalize text-blue-600 text-center">
          {selectedRole} Login
        </h1>

        <input
          type="email"
          placeholder="Email"
          className="border p-4 w-full mb-2 text-cyan-600"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="border p-4 w-full mb-2 text-cyan-600"
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <button className="bg-blue-500 text-white w-full py-2 rounded hover:bg-blue-600 transition">
          Login
        </button>
      </form>
    </main>
  );
}

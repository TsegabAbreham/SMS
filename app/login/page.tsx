"use client";
import dynamic from "next/dynamic";


const LoginForm = dynamic(() => import("./LoginForm"), { ssr: false });
export default function LoginLoader() {
  return <LoginForm />;
}

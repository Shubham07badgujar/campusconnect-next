"use client";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import SocketProvider from "@/context/SocketContext";
import Navbar from "@/components/common/Navbar";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SocketProvider>
      <Navbar />
      <div className="pt-16 px-4" />
      {children}
      <ToastContainer position="top-right" autoClose={3000} />
    </SocketProvider>
  );
}

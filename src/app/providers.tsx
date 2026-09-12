"use client";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import SocketProvider from "@/context/SocketContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SocketProvider>
      {children}
      <ToastContainer position="top-right" autoClose={3000} />
    </SocketProvider>
  );
}

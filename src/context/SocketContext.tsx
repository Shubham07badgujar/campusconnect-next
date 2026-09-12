"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import { auth } from "@/lib/client/firebase";
import { useAuthState } from "react-firebase-hooks/auth";

type SocketContextValue = {
  socket: Socket | null;
  connectionError: string | null;
};

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connectionError: null,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [user] = useAuthState(auth);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Connect to the socket when the authenticated user changes.
  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch {
          // Ignore cleanup failures on sign-out.
        }
      }
      socketRef.current = null;
      setSocket(null);
      setConnectionError(null);
      return;
    }

    let nextSocket: Socket;

    try {
      // Same-origin: Socket.IO lives on the same custom server as the app.
      nextSocket = io({
        query: {
          userId: user.uid,
          userName: user.displayName || "Anonymous",
        },
        reconnectionAttempts: 6,
        reconnectionDelay: 1000,
        timeout: 10000,
      });
    } catch (err) {
      console.error("Socket creation error:", err);
      setConnectionError("Failed to initialize chat");
      return;
    }

    const onConnect = () => {
      setConnectionError(null);
    };

    const onConnectError = (err: Error) => {
      console.error("Socket connection error:", err);
      setConnectionError("Realtime connection issue");
    };

    const onDisconnect = (reason: string) => {
      if (reason !== "io client disconnect") {
        console.warn("Socket disconnected:", reason);
      }
    };

    nextSocket.on("connect", onConnect);
    nextSocket.on("connect_error", onConnectError);
    nextSocket.on("disconnect", onDisconnect);

    socketRef.current = nextSocket;
    setSocket(nextSocket);

    return () => {
      if (nextSocket) {
        try {
          nextSocket.off("connect", onConnect);
          nextSocket.off("connect_error", onConnectError);
          nextSocket.off("disconnect", onDisconnect);
          nextSocket.disconnect();
          if (socketRef.current === nextSocket) {
            socketRef.current = null;
            setSocket(null);
          }
        } catch (err) {
          console.error("Socket cleanup error:", err);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.displayName]);

  return (
    <SocketContext.Provider value={{ socket, connectionError }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;

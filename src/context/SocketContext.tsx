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
      //
      // The server derives identity solely from this token (see
      // src/server/socket-auth.ts), so no user id is sent alongside it — one
      // would be ignored anyway. `auth` is a callback because socket.io invokes
      // it before every connection AND every reconnection, which keeps a fresh
      // ID token on the wire without us tracking expiry here.
      nextSocket = io({
        auth: (cb: (data: Record<string, unknown>) => void) => {
          user
            .getIdToken()
            .then((token) => cb({ token }))
            // Hand back an empty token rather than hanging: the server rejects
            // it and `connect_error` surfaces a real message to the user.
            .catch(() => cb({ token: "" }));
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
      // The server rejects with UNAUTHENTICATED (bad/expired token) or
      // AUTH_UNAVAILABLE (Admin SDK unreachable) — worth telling apart, because
      // one is the user's session and the other is a server misconfiguration.
      if (err?.message === "AUTH_UNAVAILABLE") {
        setConnectionError("Realtime service unavailable");
      } else if (err?.message === "UNAUTHENTICATED") {
        setConnectionError("Session expired — please sign in again");
      } else {
        setConnectionError("Realtime connection issue");
      }
      console.error("Socket connection error:", err?.message || err);
    };

    const onDisconnect = (reason: string) => {
      if (reason !== "io client disconnect") {
        console.warn("Socket disconnected:", reason);
      }
    };

    // Sockets outlive the ~1h ID token. Rather than dropping a connection
    // mid-lecture, the server asks for a fresh token in place.
    const onAuthExpired = async () => {
      try {
        const token = await user.getIdToken(true);
        nextSocket.emit("reauthenticate", { token });
      } catch (err) {
        console.error("Socket reauthentication failed:", err);
        setConnectionError("Session expired — please sign in again");
      }
    };

    nextSocket.on("connect", onConnect);
    nextSocket.on("connect_error", onConnectError);
    nextSocket.on("disconnect", onDisconnect);
    nextSocket.on("auth_expired", onAuthExpired);

    socketRef.current = nextSocket;
    setSocket(nextSocket);

    return () => {
      if (nextSocket) {
        try {
          nextSocket.off("connect", onConnect);
          nextSocket.off("connect_error", onConnectError);
          nextSocket.off("disconnect", onDisconnect);
          nextSocket.off("auth_expired", onAuthExpired);
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
  }, [user?.uid]);

  return (
    <SocketContext.Provider value={{ socket, connectionError }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;

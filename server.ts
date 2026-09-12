// Custom server: Next.js request handling + Socket.IO + background scheduler.
// Run with: tsx server.ts   (dev: tsx watch server.ts)
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO } from "./src/lib/server/socket-io";
import { registerSocketHandlers } from "./src/server/socket";
import { startExamReminderScheduler } from "./src/lib/server/exam-reminders";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const httpServer = createServer((req, res) => {
      handle(req, res).catch((error) => {
        console.error("Request handling error:", error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    });

    const io = new Server(httpServer, {
      // Same-origin in production; loose CORS keeps localhost dev tooling happy.
      cors: { origin: true, credentials: true },
    });
    setIO(io);
    registerSocketHandlers(io);

    if (
      String(process.env.ENABLE_EXAM_REMINDER_NOTIFICATIONS || "false")
        .trim()
        .toLowerCase() === "true"
    ) {
      startExamReminderScheduler();
    } else {
      console.log("Exam reminder scheduler disabled by configuration.");
    }

    httpServer.listen(port, "0.0.0.0", () => {
      console.log(`✅ CampusConnect ready on http://localhost:${port} (dev=${dev})`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

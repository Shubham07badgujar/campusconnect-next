/**
 * rotateStudentPasswords.js
 *
 * One-off admin script: rotates EVERY student account's password to a new
 * cryptographically random one and emails the new credentials to each
 * student's registered contact email.
 *
 * Why: students onboarded before 2026-09-11 received passwords derived from
 * a formula (name + phone + PRN), which anyone knowing those facts can
 * reconstruct. This script invalidates all of those.
 *
 * Usage (from the backend/ folder, with backend/.env configured):
 *
 *   node rotateStudentPasswords.js                 # DRY RUN: lists affected accounts, changes nothing
 *   node rotateStudentPasswords.js --apply         # actually rotate + email credentials
 *   node rotateStudentPasswords.js --apply --prn 21CE001,21CE002   # only these PRNs
 *   node rotateStudentPasswords.js --apply --no-email              # rotate but skip emails (all go to the CSV)
 *
 * Accounts with no contact email (or whose email fails to send) are written to
 * rotated-credentials-<timestamp>.csv in this folder so the admin can hand the
 * credentials out manually. Treat that file as a secret and delete it after use.
 */

require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const admin = require("./firebase-admin");

// Same generator as server.js: unambiguous charset (no 0/O, 1/l/I).
const PASSWORD_CHARSET =
  "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateSecurePassword = (length = 12) => {
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_CHARSET[crypto.randomInt(PASSWORD_CHARSET.length)];
  }
  return password;
};

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const NO_EMAIL = args.includes("--no-email");
const prnFlagIndex = args.indexOf("--prn");
const PRN_FILTER =
  prnFlagIndex !== -1 && args[prnFlagIndex + 1]
    ? new Set(
        args[prnFlagIndex + 1]
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
      )
    : null;

const MAIL_DELAY_MS = 400; // stay under Gmail rate limits

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const collectStudents = async () => {
  const firestore = admin.firestore();
  const byUid = new Map();

  const addRecord = (docId, data) => {
    const uid = String(data.uid || docId || "").trim();
    if (!uid) return;

    const existing = byUid.get(uid) || {};
    byUid.set(uid, {
      uid,
      name: data.name || existing.name || "",
      prn: String(data.prn || data.rollNo || existing.prn || "")
        .trim()
        .toUpperCase(),
      loginId: data.loginId || existing.loginId || "",
      authEmail: data.email || existing.authEmail || "",
      contactEmail: (data.contactEmail || existing.contactEmail || "")
        .trim()
        .toLowerCase(),
    });
  };

  const usersSnapshot = await firestore
    .collection("users")
    .where("role", "==", "Student")
    .get();
  usersSnapshot.forEach((doc) => addRecord(doc.id, doc.data() || {}));

  // Legacy/duplicate records live in the students collection too.
  const studentsSnapshot = await firestore.collection("students").get();
  studentsSnapshot.forEach((doc) => addRecord(doc.id, doc.data() || {}));

  return Array.from(byUid.values());
};

const main = async () => {
  console.log(
    APPLY
      ? "MODE: APPLY — passwords WILL be rotated."
      : "MODE: DRY RUN — no changes will be made. Re-run with --apply to rotate.",
  );

  let students = await collectStudents();
  if (PRN_FILTER) {
    students = students.filter((student) => PRN_FILTER.has(student.prn));
    console.log(`PRN filter active: ${[...PRN_FILTER].join(", ")}`);
  }

  if (students.length === 0) {
    console.log("No student accounts found. Nothing to do.");
    return;
  }

  console.log(`Found ${students.length} student account(s).\n`);

  if (!APPLY) {
    for (const student of students) {
      console.log(
        `  would rotate: ${student.prn || "(no PRN)"}  ${student.name || "(no name)"}  uid=${student.uid}  mail=${student.contactEmail || "(none — CSV fallback)"}`,
      );
    }
    console.log(`\nDry run complete. ${students.length} account(s) would be rotated.`);
    return;
  }

  let transporter = null;
  if (!NO_EMAIL) {
    if (!process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD) {
      console.error(
        "EMAIL_USERNAME / EMAIL_PASSWORD missing in .env — re-run with --no-email or configure mail first.",
      );
      process.exit(1);
    }
    transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
    await transporter.verify();
  }

  const firestore = admin.firestore();
  const manualRows = [];
  let rotatedCount = 0;
  let emailedCount = 0;
  let failedCount = 0;

  for (const student of students) {
    const password = generateSecurePassword();

    try {
      await admin.auth().updateUser(student.uid, { password });
    } catch (error) {
      failedCount += 1;
      console.error(
        `  FAILED (auth update): ${student.prn} uid=${student.uid}: ${error.message}`,
      );
      continue;
    }

    rotatedCount += 1;

    // Audit trail (never store the password itself).
    const rotationStamp = {
      passwordRotatedAt: new Date().toISOString(),
      passwordRotationReason: "formula-password-remediation",
    };
    await Promise.all([
      firestore
        .collection("users")
        .doc(student.uid)
        .set(rotationStamp, { merge: true })
        .catch(() => {}),
      firestore
        .collection("students")
        .doc(student.uid)
        .set(rotationStamp, { merge: true })
        .catch(() => {}),
    ]);

    let delivered = false;
    if (transporter && student.contactEmail) {
      try {
        await transporter.sendMail({
          from: `"Campus Connect" <${process.env.EMAIL_USERNAME}>`,
          to: student.contactEmail,
          subject: "CampusConnect — Your password has been reset",
          text: `Hi ${student.name || "Student"},\n\nFor security reasons your CampusConnect password has been reset.\n\nLogin ID: ${student.loginId || student.prn}\nSystem Email: ${student.authEmail || ""}\nNew Password: ${password}\n\nPlease sign in and change your password.\n\n- CampusConnect Team`,
        });
        emailedCount += 1;
        delivered = true;
        console.log(`  rotated + emailed: ${student.prn} -> ${student.contactEmail}`);
        await sleep(MAIL_DELAY_MS);
      } catch (mailError) {
        console.error(
          `  rotated, EMAIL FAILED: ${student.prn}: ${mailError.message}`,
        );
      }
    }

    if (!delivered) {
      manualRows.push({
        prn: student.prn,
        name: student.name,
        loginId: student.loginId || student.prn,
        authEmail: student.authEmail,
        contactEmail: student.contactEmail,
        password,
        reason: student.contactEmail
          ? "email delivery failed"
          : NO_EMAIL
            ? "--no-email flag"
            : "no contact email on record",
      });
      if (!transporter || !student.contactEmail) {
        console.log(`  rotated (CSV fallback): ${student.prn}`);
      }
    }
  }

  let csvPath = "";
  if (manualRows.length > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    csvPath = path.join(__dirname, `rotated-credentials-${stamp}.csv`);
    const header = "prn,name,loginId,authEmail,contactEmail,password,reason";
    const lines = manualRows.map((row) =>
      [
        row.prn,
        row.name,
        row.loginId,
        row.authEmail,
        row.contactEmail,
        row.password,
        row.reason,
      ]
        .map(csvEscape)
        .join(","),
    );
    fs.writeFileSync(csvPath, `${header}\n${lines.join("\n")}\n`, "utf8");
  }

  console.log("\n===== SUMMARY =====");
  console.log(`Rotated:            ${rotatedCount}`);
  console.log(`Credentials emailed: ${emailedCount}`);
  console.log(`Manual (CSV):        ${manualRows.length}`);
  console.log(`Failed:              ${failedCount}`);
  if (csvPath) {
    console.log(
      `\nManual credentials written to:\n  ${csvPath}\nThis file contains plaintext passwords — hand them out, then DELETE it.`,
    );
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Rotation failed:", error);
    process.exit(1);
  });

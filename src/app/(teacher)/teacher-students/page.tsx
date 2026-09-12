"use client";

import React, { useEffect, useMemo, useState } from "react";
import { auth, firestore } from "@/lib/client/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Users, BookOpen, Search, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Input } from "@/components/ui/Field";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import { PageLoader, EmptyState, ErrorState } from "@/components/ui/States";

const normalizeAssignments = (teacherData) => {
  if (
    Array.isArray(teacherData?.assignments) &&
    teacherData.assignments.length
  ) {
    return teacherData.assignments;
  }

  if (
    Array.isArray(teacherData?.assignedCourses) &&
    teacherData.assignedCourses.length
  ) {
    const fallbackBranch = teacherData?.department || teacherData?.dept || "";
    return teacherData.assignedCourses.map((course) => ({
      branch: fallbackBranch,
      year: course.year,
      subjects: Array.isArray(course.subjects) ? course.subjects : [],
    }));
  }

  return [];
};

export default function TeacherStudents() {
  const router = useRouter();
  const [teacherName, setTeacherName] = useState("Teacher");
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentIndex, setSelectedAssignmentIndex] = useState(0);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        const teacherDoc = await getDoc(
          doc(firestore, "teachers", currentUser.uid),
        );
        if (!teacherDoc.exists()) {
          setError("Teacher profile not found.");
          setLoading(false);
          return;
        }

        const teacherData = teacherDoc.data() || {};
        setTeacherName(
          teacherData.displayName ||
            teacherData.fullName ||
            teacherData.name ||
            "Teacher",
        );

        const normalized = normalizeAssignments(teacherData).filter(
          (assignment) =>
            assignment.branch &&
            assignment.year &&
            Array.isArray(assignment.subjects) &&
            assignment.subjects.length > 0,
        );

        if (!normalized.length) {
          setAssignments([]);
          setStudents([]);
          setLoading(false);
          return;
        }

        setAssignments(normalized);
        setSelectedAssignmentIndex(0);

        const [studentsSnap, usersSnap] = await Promise.all([
          getDocs(collection(firestore, "students")),
          getDocs(collection(firestore, "users")),
        ]);

        const mergedStudents = new Map();
        const absorbStudent = (record) => {
          const uid = record.uid || record.id;
          if (!uid) return;
          const existing = mergedStudents.get(uid) || {};
          mergedStudents.set(uid, {
            ...existing,
            ...record,
            uid,
          });
        };

        studentsSnap.docs.forEach((snap) =>
          absorbStudent({ id: snap.id, ...snap.data() }),
        );
        usersSnap.docs.forEach((snap) => {
          const data = snap.data() || {};
          if ((data.role || "").toLowerCase() !== "student") return;
          absorbStudent({ id: snap.id, ...data });
        });

        setStudents(Array.from(mergedStudents.values()));
      } catch (err) {
        setError("Failed to load teacher students: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  const selectedAssignment = assignments[selectedAssignmentIndex] || null;

  const matchedStudents = useMemo(() => {
    if (!selectedAssignment) return [];

    const targetBranch = String(selectedAssignment.branch || "")
      .trim()
      .toLowerCase();
    const targetYear = String(selectedAssignment.year || "")
      .trim()
      .toLowerCase();

    return students
      .map((student) => {
        const studentBranch = String(student.dept || student.department || "")
          .trim()
          .toLowerCase();
        const studentYear = String(student.year || "")
          .trim()
          .toLowerCase();
        const studentSubjects = Array.isArray(student.subjects)
          ? student.subjects.map((subject) => String(subject).trim())
          : [];

        if (studentBranch !== targetBranch || studentYear !== targetYear) {
          return null;
        }

        const matchedSubjects = selectedAssignment.subjects.filter((subject) =>
          studentSubjects.includes(subject),
        );

        if (!matchedSubjects.length) {
          return null;
        }

        return {
          uid: student.uid,
          name: student.name || "Unknown Student",
          prn: student.prn || student.rollNo || student.rollNumber || "-",
          rollNo: student.rollNo || student.rollNumber || student.prn || "-",
          email: student.email || "-",
          contactEmail: student.contactEmail || "-",
          mobile: student.mobile || student.phone || "-",
          department: student.dept || student.department || "-",
          year: student.year || "-",
          semester: student.semester || "-",
          division: student.division || "-",
          subjects: Array.isArray(student.subjects) ? student.subjects : [],
          matchedSubjects,
        };
      })
      .filter(Boolean)
      .filter((student) => {
        const needle = search.toLowerCase().trim();
        if (!needle) return true;
        return (
          String(student.name).toLowerCase().includes(needle) ||
          String(student.prn).toLowerCase().includes(needle)
        );
      });
  }, [selectedAssignment, students, search]);

  useEffect(() => {
    setSelectedStudentIds([]);
  }, [selectedAssignmentIndex, search]);

  const toggleSelectStudent = (uid) => {
    setSelectedStudentIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.length === matchedStudents.length) {
      setSelectedStudentIds([]);
      return;
    }

    setSelectedStudentIds(matchedStudents.map((student) => student.uid));
  };

  const getCsvContent = (rows) => {
    const headers = [
      "Name",
      "PRN",
      "Roll No",
      "Login Email",
      "Contact Email",
      "Mobile",
      "Department",
      "Year",
      "Semester",
      "Division",
      "All Subjects",
      "Matched Subjects",
    ];

    const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

    const lines = rows.map((student) => {
      return [
        student.name,
        student.prn,
        student.rollNo,
        student.email,
        student.contactEmail,
        student.mobile,
        student.department,
        student.year,
        student.semester,
        student.division,
        (student.subjects || []).join("; "),
        (student.matchedSubjects || []).join("; "),
      ]
        .map(escapeCsv)
        .join(",");
    });

    return `${headers.join(",")}\n${lines.join("\n")}`;
  };

  const downloadCsv = (rows, fileName) => {
    if (!rows.length) return;
    const csv = getCsvContent(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openPdfPrint = (rows, title) => {
    if (!rows.length) return;

    const tableRows = rows
      .map(
        (student) => `
        <tr>
          <td>${student.name}</td>
          <td>${student.prn}</td>
          <td>${student.rollNo}</td>
          <td>${student.email}</td>
          <td>${student.contactEmail}</td>
          <td>${student.mobile}</td>
          <td>${student.department}</td>
          <td>${student.year}</td>
          <td>${student.semester}</td>
          <td>${student.division}</td>
          <td>${(student.subjects || []).join(", ")}</td>
          <td>${(student.matchedSubjects || []).join(", ")}</td>
        </tr>`,
      )
      .join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #999; padding: 6px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>PRN</th>
                <th>Roll No</th>
                <th>Login Email</th>
                <th>Contact Email</th>
                <th>Mobile</th>
                <th>Department</th>
                <th>Year</th>
                <th>Semester</th>
                <th>Division</th>
                <th>All Subjects</th>
                <th>Matched Subjects</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const exportSelectedCsv = () => {
    const rows = matchedStudents.filter((student) =>
      selectedStudentIds.includes(student.uid),
    );
    downloadCsv(rows, "selected_students.csv");
  };

  const exportSelectedPdf = () => {
    const rows = matchedStudents.filter((student) =>
      selectedStudentIds.includes(student.uid),
    );
    openPdfPrint(rows, "Selected Students Report");
  };

  const exportSingleCsv = (student) => {
    downloadCsv([student], `${student.prn || student.uid}_student.csv`);
  };

  const exportSinglePdf = (student) => {
    openPdfPrint([student], `${student.name} Student Report`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students by Assigned Subject"
        description={`${teacherName}, select an assigned branch-year-subject load to view matching students.`}
      />

      {error ? <ErrorState title="Unable to load students" description={error} /> : null}

      {loading ? (
        <PageLoader label="Loading assigned students..." />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No teaching assignments"
          description="No teaching assignments were found on your profile."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {assignments.map((assignment, index) => {
              const isActive = index === selectedAssignmentIndex;
              return (
                <button
                  key={`${assignment.branch}-${assignment.year}-${index}`}
                  onClick={() => setSelectedAssignmentIndex(index)}
                  className={`rounded-card border p-4 text-left shadow-card transition ${
                    isActive
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200"
                      : "border-line bg-surface hover:border-brand-300"
                  }`}
                >
                  <div className="text-sm font-semibold text-ink">
                    {assignment.branch} - {assignment.year} Year
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-ink-soft">
                    {assignment.subjects.join(", ")}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Badge tone="brand">
              <BookOpen className="h-3.5 w-3.5" />
              {selectedAssignment?.branch} - {selectedAssignment?.year} Year
            </Badge>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or PRN"
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Badge tone="neutral">
              <Users className="h-3.5 w-3.5" />
              {matchedStudents.length} students found for selected assignment
            </Badge>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="success"
                size="sm"
                onClick={exportSelectedCsv}
                disabled={selectedStudentIds.length === 0}
              >
                <Download className="h-3.5 w-3.5" /> Export Selected CSV
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={exportSelectedPdf}
                disabled={selectedStudentIds.length === 0}
              >
                <Download className="h-3.5 w-3.5" /> Export Selected PDF
              </Button>
            </div>
          </div>

          {matchedStudents.length > 0 ? (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>
                      <input
                        type="checkbox"
                        checked={
                          matchedStudents.length > 0 &&
                          selectedStudentIds.length === matchedStudents.length
                        }
                        onChange={toggleSelectAll}
                      />
                    </TH>
                    <TH>Student Name</TH>
                    <TH>PRN</TH>
                    <TH>Roll No</TH>
                    <TH>Login Email</TH>
                    <TH>Contact Email</TH>
                    <TH>Mobile</TH>
                    <TH>Department</TH>
                    <TH>Year</TH>
                    <TH>Semester</TH>
                    <TH>Division</TH>
                    <TH>All Subjects</TH>
                    <TH>Matched Subjects</TH>
                    <TH>Export</TH>
                  </tr>
                </THead>
                <TBody>
                  {matchedStudents.map((student) => (
                    <TR key={student.uid}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.uid)}
                          onChange={() => toggleSelectStudent(student.uid)}
                        />
                      </TD>
                      <TD className="font-medium">{student.name}</TD>
                      <TD>{student.prn}</TD>
                      <TD>{student.rollNo}</TD>
                      <TD>{student.email}</TD>
                      <TD>{student.contactEmail}</TD>
                      <TD>{student.mobile}</TD>
                      <TD>{student.department}</TD>
                      <TD>{student.year}</TD>
                      <TD>{student.semester}</TD>
                      <TD>{student.division}</TD>
                      <TD>{student.subjects.join(", ")}</TD>
                      <TD>{student.matchedSubjects.join(", ")}</TD>
                      <TD className="whitespace-nowrap">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => exportSingleCsv(student)}
                          >
                            CSV
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => exportSinglePdf(student)}
                          >
                            PDF
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          ) : (
            <EmptyState
              icon={Users}
              title="No matching students"
              description="No students match the selected subject assignment."
            />
          )}
        </>
      )}
    </div>
  );
}

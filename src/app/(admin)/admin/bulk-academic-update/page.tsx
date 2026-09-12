"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiRefreshCw } from "react-icons/fi";
import { collection, getDocs } from "firebase/firestore";
import { auth, firestore } from "@/lib/client/firebase";
import { BRANCHES, YEARS, SEMESTERS } from "@/lib/client/branchYearSubjects";
import Button from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/States";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";

const API_URL = String("")
  .trim()
  .replace(/\/+$/, "");

const getStudentPrn = (student) => {
  return String(student.prn || student.rollNo || student.rollNumber || "")
    .trim()
    .toUpperCase();
};

export default function BulkAcademicUpdate() {
  const router = useRouter();
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedPrns, setSelectedPrns] = useState(new Set());
  const [bulkBranch, setBulkBranch] = useState("");
  const [bulkYear, setBulkYear] = useState("");
  const [bulkSemester, setBulkSemester] = useState("");
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [summary, setSummary] = useState(null);

  const filteredStudents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return students;

    return students.filter((student) => {
      const name = String(student.name || "").toLowerCase();
      const email = String(student.email || "").toLowerCase();
      const dept = String(
        student.dept || student.department || "",
      ).toLowerCase();
      const prn = getStudentPrn(student).toLowerCase();

      return (
        name.includes(needle) ||
        email.includes(needle) ||
        dept.includes(needle) ||
        prn.includes(needle)
      );
    });
  }, [students, search]);

  const loadStudents = async () => {
    setError("");
    setIsLoadingStudents(true);
    try {
      const usersSnapshot = await getDocs(collection(firestore, "users"));
      const studentUsers = usersSnapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .filter((user) => String(user.role || "").toLowerCase() === "student")
        .filter((user) => getStudentPrn(user));

      setStudents(studentUsers);
      setSuccess(`Loaded ${studentUsers.length} student records.`);
    } catch (err) {
      setError(err.message || "Failed to load students");
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const allFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((student) =>
      selectedPrns.has(getStudentPrn(student)),
    );

  const toggleSelectAllFiltered = () => {
    setSelectedPrns((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredStudents.forEach((student) =>
          next.delete(getStudentPrn(student)),
        );
      } else {
        filteredStudents.forEach((student) => next.add(getStudentPrn(student)));
      }
      return next;
    });
  };

  const toggleSelectPrn = (prn) => {
    setSelectedPrns((prev) => {
      const next = new Set(prev);
      if (next.has(prn)) {
        next.delete(prn);
      } else {
        next.add(prn);
      }
      return next;
    });
  };

  const handleApply = async () => {
    setError("");
    setSuccess("");
    setSummary(null);

    if (selectedPrns.size === 0) {
      setError("Select at least one student for bulk update");
      return;
    }

    if (!bulkBranch && !bulkYear && !bulkSemester) {
      setError(
        "Select at least one field to update (branch, year, or semester)",
      );
      return;
    }

    setIsUpdating(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/auth/admin");
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch(
        `${API_URL}/api/admin/bulk-update-student-academics`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            updates: Array.from(selectedPrns).map((prn) => ({
              prn,
              branch: bulkBranch || undefined,
              year: bulkYear || undefined,
              semester: bulkSemester || undefined,
            })),
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Bulk academic update failed");
      }

      setSummary(data.summary || null);
      setSuccess("Bulk academic update completed for selected students.");
      await loadStudents();
    } catch (err) {
      setError(err.message || "Bulk academic update failed");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Academic Update"
        description="Update existing students in bulk by selecting records from the list. Apply branch, year, and semester in one action instead of editing each student individually."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/admin-dashboard")}
          >
            <FiArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        }
      />

      {error && (
        <div className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <Card>
        <CardHeader
          title="Select & Apply"
          description="Filter the roster, choose the new academic values, then apply them to the selected students."
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:items-end">
            <Field label="Search Students" className="md:col-span-2">
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by PRN, name, email, or branch"
              />
            </Field>
            <Field label="New Branch">
              <Select
                value={bulkBranch}
                onChange={(e) => setBulkBranch(e.target.value)}
              >
                <option value="">No Change</option>
                {BRANCHES.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="New Year">
              <Select
                value={bulkYear}
                onChange={(e) => setBulkYear(e.target.value)}
              >
                <option value="">No Change</option>
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year} Year
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="New Semester">
              <Select
                value={bulkSemester}
                onChange={(e) => setBulkSemester(e.target.value)}
              >
                <option value="">No Change</option>
                {SEMESTERS.map((semester) => (
                  <option key={semester} value={semester}>
                    Semester {semester}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={loadStudents}
                loading={isLoadingStudents}
                disabled={isLoadingStudents}
              >
                <FiRefreshCw className="h-4 w-4" />
                {isLoadingStudents ? "Loading..." : "Refresh"}
              </Button>
              <Button
                variant="success"
                onClick={handleApply}
                loading={isUpdating}
                disabled={isUpdating || selectedPrns.size === 0}
              >
                {isUpdating ? "Updating..." : "Apply"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Total Students"
              value={students.length}
              tone="info"
            />
            <StatCard
              label="Filtered"
              value={filteredStudents.length}
              tone="neutral"
            />
            <StatCard
              label="Selected"
              value={selectedPrns.size}
              tone="brand"
            />
          </div>
        </CardBody>
      </Card>

      {filteredStudents.length > 0 && (
        <Card>
          <CardHeader title="Existing Students" />
          <CardBody>
            <TableWrap className="shadow-none">
              <Table className="min-w-[980px]">
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                      />
                    </TH>
                    <TH>PRN</TH>
                    <TH>Name</TH>
                    <TH>Email</TH>
                    <TH>Branch</TH>
                    <TH>Year</TH>
                    <TH>Semester</TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredStudents.map((student) => {
                    const prn = getStudentPrn(student);
                    return (
                      <TR key={`${student.id}-${prn}`}>
                        <TD>
                          <input
                            type="checkbox"
                            checked={selectedPrns.has(prn)}
                            onChange={() => toggleSelectPrn(prn)}
                          />
                        </TD>
                        <TD>{prn || "-"}</TD>
                        <TD>{student.name || "-"}</TD>
                        <TD>{student.email || "-"}</TD>
                        <TD>{student.dept || student.department || "-"}</TD>
                        <TD>{student.year || "-"}</TD>
                        <TD>{student.semester || "-"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>
      )}

      {filteredStudents.length === 0 && !isLoadingStudents && (
        <EmptyState
          title="No matching students found."
          description="Adjust your search or refresh the roster."
        />
      )}

      {summary && (
        <Card>
          <CardHeader
            title="Update Summary"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSummary(null)}
              >
                <FiRefreshCw className="h-4 w-4" /> Clear
              </Button>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <StatCard label="Total" value={summary.totalRows} tone="info" />
              <StatCard
                label="Updated"
                value={summary.updatedCount}
                tone="success"
              />
              <StatCard
                label="Not Found"
                value={summary.notFoundCount}
                tone="warning"
              />
              <StatCard
                label="Failed"
                value={summary.failedCount}
                tone="danger"
              />
            </div>

            {summary.updatedEntries?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-emerald-700">
                  Updated Students
                </h3>
                <TableWrap className="shadow-none">
                  <Table className="min-w-[760px]">
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>PRN</TH>
                        <TH>Branch</TH>
                        <TH>Year</TH>
                        <TH>Semester</TH>
                        <TH>Subjects Assigned</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {summary.updatedEntries.map((entry, idx) => (
                        <TR key={`${entry.prn}-${idx}`}>
                          <TD>{entry.prn}</TD>
                          <TD>{entry.branch}</TD>
                          <TD>{entry.year}</TD>
                          <TD>{entry.semester}</TD>
                          <TD>{entry.subjectCount}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </div>
            )}

            {summary.notFoundEntries?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-amber-700">
                  Not Found
                </h3>
                <TableWrap className="shadow-none">
                  <Table className="min-w-[520px]">
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>PRN</TH>
                        <TH>Reason</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {summary.notFoundEntries.map((entry, idx) => (
                        <TR key={`${entry.prn}-${idx}`}>
                          <TD>{entry.prn || "-"}</TD>
                          <TD>{entry.reason}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </div>
            )}

            {summary.failedEntries?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-danger">
                  Failed Updates
                </h3>
                <TableWrap className="shadow-none">
                  <Table className="min-w-[520px]">
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>PRN</TH>
                        <TH>Reason</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {summary.failedEntries.map((entry, idx) => (
                        <TR key={`${entry.prn || idx}-${idx}`}>
                          <TD>{entry.prn || "-"}</TD>
                          <TD>{entry.reason}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

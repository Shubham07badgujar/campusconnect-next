"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiSave, FiRefreshCw, FiBookOpen } from "react-icons/fi";
import { auth } from "@/lib/client/firebase";
import {
  BRANCHES,
  YEARS,
  SEMESTERS,
  DEFAULT_SUBJECT_SETS,
} from "@/lib/client/branchYearSubjects";
import Button from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { Field, Select, Textarea } from "@/components/ui/Field";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";

const API_URL = "";

export default function SubjectSetManagement() {
  const router = useRouter();
  const [subjectSets, setSubjectSets] = useState(DEFAULT_SUBJECT_SETS);
  const [selectedBranch, setSelectedBranch] = useState(BRANCHES[0]);
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [selectedSemester, setSelectedSemester] = useState(SEMESTERS[0]);
  const [subjectText, setSubjectText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedSubjects = useMemo(() => {
    return (
      subjectSets?.[selectedBranch]?.[selectedYear]?.[selectedSemester] || []
    );
  }, [subjectSets, selectedBranch, selectedYear, selectedSemester]);

  useEffect(() => {
    setSubjectText(selectedSubjects.join("\n"));
  }, [selectedSubjects]);

  const fetchSubjectSets = async () => {
    setLoading(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/auth/admin");
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/admin/subject-sets`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to load subject sets");
      }
      setSubjectSets(data.subjectSets || DEFAULT_SUBJECT_SETS);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjectSets();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/auth/admin");
        return;
      }

      const subjects = subjectText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (subjects.length === 0) {
        throw new Error("At least one subject is required");
      }

      const token = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/admin/subject-sets`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          branch: selectedBranch,
          year: selectedYear,
          semester: selectedSemester,
          subjects,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to save subject set");
      }

      setSubjectSets(data.subjectSets || subjectSets);
      setMessage("Subject set saved successfully");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FiBookOpen className="h-5 w-5" /> Subject Set Management
          </span>
        }
        description="Manage centralized subjects for each branch and year. These sets are used for both student onboarding and teacher course assignment consistency."
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
      {message && (
        <div className="rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <Card>
        <CardHeader
          title="Edit Subject Set"
          description="Pick a branch, year, and semester, then edit the subjects (one per line) and save."
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Field label="Branch">
              <Select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                {BRANCHES.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Year">
              <Select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year} Year
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Semester">
              <Select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
              >
                {SEMESTERS.map((semester) => (
                  <option key={semester} value={semester}>
                    Semester {semester}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                onClick={fetchSubjectSets}
                loading={loading}
                disabled={loading}
              >
                <FiRefreshCw className="h-4 w-4" />{" "}
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saving}
                disabled={saving}
              >
                <FiSave className="h-4 w-4" /> {saving ? "Saving..." : "Save Set"}
              </Button>
            </div>
          </div>

          <Field
            label={`Subjects for ${selectedBranch} - ${selectedYear} Year - Semester ${selectedSemester} (one per line)`}
          >
            <Textarea
              className="min-h-[220px]"
              value={subjectText}
              onChange={(e) => setSubjectText(e.target.value)}
              placeholder="Enter one subject per line"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Current Subject Matrix" />
        <CardBody>
          <TableWrap className="shadow-none">
            <Table className="min-w-[1200px]">
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Branch</TH>
                  <TH>1st - Sem 1</TH>
                  <TH>1st - Sem 2</TH>
                  <TH>2nd - Sem 1</TH>
                  <TH>2nd - Sem 2</TH>
                  <TH>3rd - Sem 1</TH>
                  <TH>3rd - Sem 2</TH>
                  <TH>4th - Sem 1</TH>
                  <TH>4th - Sem 2</TH>
                </TR>
              </THead>
              <TBody>
                {BRANCHES.map((branch) => (
                  <TR key={branch} className="align-top">
                    <TD className="font-medium">{branch}</TD>
                    {YEARS.map((year) => (
                      <React.Fragment key={`${branch}-${year}`}>
                        {SEMESTERS.map((semester) => (
                          <TD
                            key={`${branch}-${year}-${semester}`}
                            className="text-xs text-ink-soft"
                          >
                            {(
                              subjectSets?.[branch]?.[year]?.[semester] || []
                            ).join(", ") || "-"}
                          </TD>
                        ))}
                      </React.Fragment>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </CardBody>
      </Card>
    </div>
  );
}

"use client";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiUpload,
  FiCheckCircle,
  FiAlertTriangle,
} from "react-icons/fi";
import { auth } from "@/lib/client/firebase";
import Button from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { Field, Select } from "@/components/ui/Field";
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

const buildRequestError = (response, rawText = "") => {
  const text = String(rawText || "").trim();
  const isHtmlResponse = text.startsWith("<");

  if (isHtmlResponse) {
    return `Server returned HTML instead of JSON (HTTP ${response.status}). Check VITE_API_URL and ensure it points to your backend API.`;
  }

  return (
    text ||
    `Request failed with status ${response.status}${response.statusText ? ` (${response.statusText})` : ""}.`
  );
};

const parseJsonResponse = async (response) => {
  const rawText = await response.text();
  let data: any = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(buildRequestError(response, rawText));
    }
  }

  if (!response.ok) {
    throw new Error(data.message || buildRequestError(response, rawText));
  }

  return data;
};

const fetchWithNetworkHint = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(
      `Unable to reach backend at ${API_URL}. Check deployment env VITE_API_URL and backend availability.`,
    );
  }
};

export default function BulkStudentOnboarding() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [parsedEntries, setParsedEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [precheck, setPrecheck] = useState(null);
  const [isPrechecking, setIsPrechecking] = useState(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState("skip");

  const downloadManualCredentialsCsv = () => {
    const rows = summary?.manualCredentialEntries || [];
    if (!rows.length) return;

    const headers = [
      "name",
      "prn",
      "phone",
      "branch",
      "year",
      "semester",
      "contactEmail",
      "loginId",
      "systemEmail",
      "password",
      "reason",
    ];

    const escapeCsv = (value) => {
      const str = String(value ?? "");
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "manual-credential-delivery.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const validationPreview = useMemo(() => {
    const valid = parsedEntries.filter(
      (e) => !e.validationErrors?.length,
    ).length;
    const invalid = parsedEntries.length - valid;
    return { valid, invalid, total: parsedEntries.length };
  }, [parsedEntries]);

  const parseFile = async () => {
    setError("");
    setSuccess("");
    setSummary(null);
    setPrecheck(null);
    if (!file) {
      setError("Please choose a CSV, PDF, or image file");
      return;
    }

    setIsParsing(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/auth/admin");
        return;
      }

      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetchWithNetworkHint(
        `${API_URL}/api/admin/parse-student-onboarding`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      const data = await parseJsonResponse(response);

      setParsedEntries(data.entries || []);
      setSuccess(
        `Parsed ${data.entries?.length || 0} row(s). Review and continue.`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const runPrecheck = async () => {
    setError("");
    setSuccess("");
    setSummary(null);

    if (parsedEntries.length === 0) {
      setError("Parse a file first before pre-check");
      return;
    }

    setIsPrechecking(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/auth/admin");
        return;
      }
      const token = await user.getIdToken();

      const response = await fetchWithNetworkHint(
        `${API_URL}/api/admin/precheck-student-onboarding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ students: parsedEntries }),
        },
      );

      const data = await parseJsonResponse(response);

      setPrecheck(data.precheck || null);
      setSuccess(
        "Pre-check completed. Review duplicates before creating accounts.",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPrechecking(false);
    }
  };

  const createAccounts = async () => {
    setError("");
    setSuccess("");
    setSummary(null);

    if (parsedEntries.length === 0) {
      setError("Please parse a file first");
      return;
    }

    setIsCreating(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.push("/auth/admin");
        return;
      }
      const token = await user.getIdToken();

      const response = await fetchWithNetworkHint(
        `${API_URL}/api/admin/bulk-onboard-students`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            students: parsedEntries,
            duplicateStrategy,
          }),
        },
      );

      const data = await parseJsonResponse(response);

      setSummary(data.summary);
      setSuccess("Bulk onboarding completed. Check summary below.");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Student Onboarding"
        description="Upload final admission list (CSV/PDF/image), parse with OCR or CSV parser, validate entries, and auto-create student accounts with branch/year/semester subject assignment."
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
          title="Upload & Parse"
          description="Choose an admission list file, pick a duplicate strategy, then parse, pre-check, and create accounts."
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 md:items-end">
            <div className="md:col-span-2">
              <Field
                label="Admission List File"
                hint="Recommended: CSV with columns Name, PRN, Mobile, Branch, Year, Semester, Email. PDF/image parsing depends on document clarity."
              >
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-slate-50/60 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
                  <FiUpload className="h-6 w-6 text-brand-500" />
                  <span className="text-sm font-medium text-ink">
                    {file ? file.name : "Click to choose a CSV, PDF, or image"}
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv,application/pdf,image/*"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </Field>
            </div>
            <Field label="Existing PRN Strategy">
              <Select
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value)}
              >
                <option value="skip">
                  Skip existing (mark as already enrolled)
                </option>
                <option value="update">Update existing student profile</option>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={runPrecheck}
                loading={isPrechecking}
                disabled={isPrechecking || parsedEntries.length === 0}
                className="flex-1"
              >
                {isPrechecking ? "Pre-checking..." : "Pre-check"}
              </Button>
              <Button
                variant="primary"
                onClick={parseFile}
                loading={isParsing}
                disabled={isParsing}
                className="flex-1"
              >
                <FiUpload className="h-4 w-4" />{" "}
                {isParsing ? "Parsing..." : "Parse File"}
              </Button>
              <Button
                variant="success"
                onClick={createAccounts}
                loading={isCreating}
                disabled={isCreating || parsedEntries.length === 0}
                className="flex-1"
              >
                {isCreating ? "Creating..." : "Create Accounts"}
              </Button>
            </div>
          </div>

          {parsedEntries.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="Parsed"
                value={validationPreview.total}
                tone="info"
              />
              <StatCard
                label="Valid"
                value={validationPreview.valid}
                tone="success"
              />
              <StatCard
                label="Invalid"
                value={validationPreview.invalid}
                tone="danger"
              />
            </div>
          )}
        </CardBody>
      </Card>

      {parsedEntries.length > 0 && (
        <Card>
          <CardHeader title="Parsed Entries" />
          <CardBody>
            <TableWrap className="shadow-none">
              <Table className="min-w-[980px]">
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Name</TH>
                    <TH>PRN</TH>
                    <TH>Phone</TH>
                    <TH>Branch</TH>
                    <TH>Year</TH>
                    <TH>Semester</TH>
                    <TH>Contact Email</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {parsedEntries.map((entry, idx) => {
                    const hasErrors = entry.validationErrors?.length > 0;
                    return (
                      <TR key={`${entry.prn || "row"}-${idx}`}>
                        <TD>{entry.name || "-"}</TD>
                        <TD>{entry.prn || "-"}</TD>
                        <TD>{entry.phone || "-"}</TD>
                        <TD>{entry.branch || "-"}</TD>
                        <TD>{entry.year || "-"}</TD>
                        <TD>{entry.semester || "-"}</TD>
                        <TD>{entry.email || "-"}</TD>
                        <TD>
                          {hasErrors ? (
                            <Badge tone="danger">
                              <FiAlertTriangle className="h-3.5 w-3.5" />{" "}
                              {entry.validationErrors.join(", ")}
                            </Badge>
                          ) : (
                            <Badge tone="success">
                              <FiCheckCircle className="h-3.5 w-3.5" /> Valid
                            </Badge>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </CardBody>
        </Card>
      )}

      {precheck && (
        <Card>
          <CardHeader title="Database Pre-check" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Rows" value={precheck.totalRows} tone="info" />
              <StatCard
                label="Duplicate in DB"
                value={precheck.duplicateDbCount}
                tone="danger"
              />
              <StatCard
                label="Duplicate in File"
                value={precheck.duplicateFileCount}
                tone="warning"
              />
            </div>
            {precheck.duplicateInDb?.length > 0 && (
              <TableWrap className="shadow-none">
                <Table className="min-w-[820px]">
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>PRN</TH>
                      <TH>Name in Upload</TH>
                      <TH>Existing UID</TH>
                      <TH>Existing Email</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {precheck.duplicateInDb.map((row, idx) => (
                      <TR key={`${row.prn || idx}-${idx}`}>
                        <TD>{row.prn || "-"}</TD>
                        <TD>{row.name || "-"}</TD>
                        <TD>{row.existingUid || "-"}</TD>
                        <TD>{row.existingEmail || "-"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardBody>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader title="Onboarding Summary" />
          <CardBody className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                label="Processed"
                value={summary.totalProcessed}
                tone="info"
              />
              <StatCard
                label="Created"
                value={summary.createdCount}
                tone="success"
              />
              <StatCard
                label="Updated"
                value={summary.updatedCount || 0}
                tone="brand"
              />
              <StatCard
                label="Already Enrolled"
                value={summary.skippedExistingCount || 0}
                tone="neutral"
              />
              <StatCard
                label="Email Sent"
                value={summary.credentialsSentCount}
                tone="warning"
              />
              <StatCard
                label="Failed"
                value={summary.failedCount}
                tone="danger"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Manual Credential Delivery Needed:{" "}
                <strong>{summary.manualCredentialCount || 0}</strong>
              </div>
              {summary.manualCredentialEntries?.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={downloadManualCredentialsCsv}
                >
                  Export Manual Credentials CSV
                </Button>
              )}
            </div>

            {summary.failedEntries?.length > 0 && (
              <TableWrap className="shadow-none">
                <Table className="min-w-[760px]">
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>PRN</TH>
                      <TH>Name</TH>
                      <TH>Reason</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {summary.failedEntries.map((f, idx) => (
                      <TR key={`${f.prn || idx}-${idx}`}>
                        <TD>{f.prn || "-"}</TD>
                        <TD>{f.name || "-"}</TD>
                        <TD className="text-danger">{f.reason}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}

            {summary.manualCredentialEntries?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-amber-700">
                  Students Needing Manual Credential Sharing
                </h3>
                <TableWrap className="shadow-none">
                  <Table className="min-w-[980px]">
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Name</TH>
                        <TH>PRN</TH>
                        <TH>Semester</TH>
                        <TH>Login ID</TH>
                        <TH>System Email</TH>
                        <TH>Password</TH>
                        <TH>Reason</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {summary.manualCredentialEntries.map((entry, idx) => (
                        <TR key={`${entry.prn || idx}-${idx}`}>
                          <TD>{entry.name || "-"}</TD>
                          <TD>{entry.prn || "-"}</TD>
                          <TD>{entry.semester || "-"}</TD>
                          <TD>{entry.loginId || "-"}</TD>
                          <TD>{entry.systemEmail || "-"}</TD>
                          <TD>{entry.password || "-"}</TD>
                          <TD className="text-amber-800">
                            {entry.reason || "-"}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </div>
            )}

            {summary.skippedExistingEntries?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-ink-soft">
                  Already Enrolled (Skipped)
                </h3>
                <TableWrap className="shadow-none">
                  <Table className="min-w-[760px]">
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>PRN</TH>
                        <TH>Name</TH>
                        <TH>Existing Email</TH>
                        <TH>Reason</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {summary.skippedExistingEntries.map((entry, idx) => (
                        <TR key={`${entry.prn || idx}-${idx}`}>
                          <TD>{entry.prn || "-"}</TD>
                          <TD>{entry.name || "-"}</TD>
                          <TD>{entry.existingEmail || "-"}</TD>
                          <TD>{entry.reason || "-"}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </div>
            )}

            {summary.updatedEntries?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">
                  Existing Students Updated
                </h3>
                <TableWrap className="shadow-none">
                  <Table className="min-w-[760px]">
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>PRN</TH>
                        <TH>Name</TH>
                        <TH>Existing UID</TH>
                        <TH>Existing Email</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {summary.updatedEntries.map((entry, idx) => (
                        <TR key={`${entry.prn || idx}-${idx}`}>
                          <TD>{entry.prn || "-"}</TD>
                          <TD>{entry.name || "-"}</TD>
                          <TD>{entry.existingUid || "-"}</TD>
                          <TD>{entry.existingEmail || "-"}</TD>
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

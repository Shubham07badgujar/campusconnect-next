"use client";
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, deleteDoc } from "firebase/firestore";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/States";
import { firestore, auth } from "@/lib/client/firebase";
import { FiRefreshCw, FiArrowLeft } from "react-icons/fi";
import { useRouter } from "next/navigation";
import {
  BRANCHES as departments,
  YEARS as years,
} from "@/lib/client/branchYearSubjects";

const JOB_PROFILES = [
  "Permanent Faculty",
  "Adjunct Faculty",
  "Visiting Faculty",
];

const TeacherManagement = () => {
  const [teachers, setTeachers] = useState([]);
  const [filteredTeachers, setFilteredTeachers] = useState([]);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    employeeId: "",
    jobProfile: "",
    department: "",
    assignments: [],
  });
  const [currentBranch, setCurrentBranch] = useState("");
  const [currentYear, setCurrentYear] = useState("");
  const [currentSubjects, setCurrentSubjects] = useState([]);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchTeachers = async () => {
    try {
      const collectionRef = collection(firestore, "teachers");
      const snapshot = await getDocs(collectionRef);
      const teacherList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      setTeachers(teacherList);
      setFilteredTeachers(teacherList);
      if (teacherList.length === 0) {
        setError("No teachers found in the database");
      } else {
        setError("");
      }
    } catch (error) {
      setError("Failed to fetch teachers: " + error.message);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  useEffect(() => {
    const filtered = teachers.filter(
      (teacher) =>
        teacher.name?.toLowerCase()?.includes(search.toLowerCase()) ||
        teacher.employeeId?.includes(search) ||
        teacher.mobile?.includes(search) ||
        teacher.email?.toLowerCase()?.includes(search.toLowerCase()),
    );
    setFilteredTeachers(filtered);
  }, [search, teachers]);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateMobile = (mobile) => {
    const digits = String(mobile || "").replace(/\D/g, "");
    return digits.length === 10;
  };

  const normalizeLegacyAssignments = (teacher) => {
    if (Array.isArray(teacher.assignments) && teacher.assignments.length > 0) {
      return teacher.assignments;
    }

    if (
      Array.isArray(teacher.assignedCourses) &&
      teacher.assignedCourses.length > 0
    ) {
      const branch = teacher.department || teacher.dept || "";
      return teacher.assignedCourses
        .map((course) => ({
          branch,
          year: course.year,
          subjects: Array.isArray(course.subjects) ? course.subjects : [],
        }))
        .filter(
          (assignment) =>
            assignment.branch &&
            assignment.year &&
            assignment.subjects.length > 0,
        );
    }

    return [];
  };

  const handleEdit = async (teacher) => {
    setFormData({
      name: teacher.name || "",
      email: teacher.email || "",
      mobile: teacher.mobile || teacher.phone || "",
      employeeId: teacher.employeeId || "",
      jobProfile: teacher.jobProfile || "",
      department: teacher.department || teacher.dept || "",
      assignments: normalizeLegacyAssignments(teacher),
    });
    setCurrentBranch("");
    setCurrentYear("");
    setCurrentSubjects([]);
    setAvailableSubjects([]);
    setIsEditing(true);
    setEditId(teacher.id);
    setShowForm(true);
    setError("");
  };

  const loadAvailableSubjects = async (branch, year) => {
    if (!branch || !year) {
      setAvailableSubjects([]);
      return;
    }

    setLoadingSubjects(true);
    try {
      const response = await fetch(
        `${""}/api/subjects?department=${encodeURIComponent(branch)}&year=${encodeURIComponent(year)}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to load subjects.");
      }
      setAvailableSubjects(Array.isArray(data.subjects) ? data.subjects : []);
    } catch (error) {
      setAvailableSubjects([]);
      setError(error.message);
    } finally {
      setLoadingSubjects(false);
    }
  };

  useEffect(() => {
    loadAvailableSubjects(currentBranch, currentYear);
  }, [currentBranch, currentYear]);

  const handleAddYearSubjects = () => {
    if (!currentBranch || !currentYear || currentSubjects.length === 0) {
      setError("Please select branch, year and at least one subject.");
      return;
    }

    const existingIndex = formData.assignments.findIndex(
      (assignment) =>
        assignment.branch === currentBranch && assignment.year === currentYear,
    );

    let updatedAssignments = [...formData.assignments];
    if (existingIndex >= 0) {
      const mergedSubjects = [
        ...new Set([
          ...updatedAssignments[existingIndex].subjects,
          ...currentSubjects,
        ]),
      ];
      updatedAssignments[existingIndex] = {
        ...updatedAssignments[existingIndex],
        subjects: mergedSubjects,
      };
    } else {
      updatedAssignments = [
        ...updatedAssignments,
        {
          branch: currentBranch,
          year: currentYear,
          subjects: currentSubjects,
        },
      ];
    }

    setFormData({ ...formData, assignments: updatedAssignments });

    setCurrentBranch("");
    setCurrentYear("");
    setCurrentSubjects([]);
    setAvailableSubjects([]);
    setError("");
  };

  const handleRemoveAssignment = (indexToRemove) => {
    const updatedAssignments = formData.assignments.filter(
      (_, index) => index !== indexToRemove,
    );
    setFormData({ ...formData, assignments: updatedAssignments });
  };

  const handleSubjectChange = (subject, isChecked) => {
    if (isChecked) {
      setCurrentSubjects([...currentSubjects, subject]);
    } else {
      setCurrentSubjects(currentSubjects.filter((s) => s !== subject));
    }
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    setIsLoading(true);
    try {
      if (!validateEmail(formData.email)) {
        throw new Error("Invalid email address.");
      }

      if (!validateMobile(formData.mobile)) {
        throw new Error("Mobile number must contain exactly 10 digits.");
      }

      if (
        !formData.name ||
        !formData.jobProfile ||
        !formData.department ||
        formData.assignments.length === 0
      ) {
        throw new Error(
          "Please fill all required fields and assign at least one branch-year with subjects.",
        );
      }

      const idToken = await auth.currentUser.getIdToken();

      if (isEditing && editId) {
        const response = await fetch(
          `${""}/api/teachers/${editId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              fullName: formData.name,
              email: formData.email,
              mobile: formData.mobile,
              jobProfile: formData.jobProfile,
              department: formData.department,
              assignments: formData.assignments,
            }),
          },
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Failed to update teacher.");
        }

        setSuccess(
          `Teacher updated successfully${data?.teacher?.teacherId ? ` (ID: ${data.teacher.teacherId})` : ""}!`,
        );
        setFormData((prev) => ({
          ...prev,
          employeeId: data?.teacher?.teacherId || prev.employeeId,
        }));
      } else {
        const response = await fetch(
          `${
            ""
          }/api/teachers`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              fullName: formData.name,
              email: formData.email,
              mobile: formData.mobile,
              jobProfile: formData.jobProfile,
              department: formData.department,
              assignments: formData.assignments,
            }),
          },
        );

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Failed to create teacher.");
        }

        setSuccess(
          `Teacher created successfully${data?.teacher?.teacherId ? ` (ID: ${data.teacher.teacherId})` : ""}${data?.credentials?.loginId ? ` | Login ID: ${data.credentials.loginId}` : ""}${data?.credentials?.password ? ` | Password: ${data.credentials.password}` : ""}`,
        );
      }

      setFormData({
        name: "",
        email: "",
        mobile: "",
        employeeId: "",
        jobProfile: "",
        department: "",
        assignments: [],
      });
      setCurrentBranch("");
      setCurrentYear("");
      setCurrentSubjects([]);
      setAvailableSubjects([]);
      setEditId(null);
      setIsEditing(false);
      setShowForm(false);
      await fetchTeachers();
    } catch (error) {
      setError("Error: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this teacher?")) {
      try {
        const docRef = doc(firestore, "teachers", id);
        await deleteDoc(docRef);

        setTeachers((prev) => prev.filter((t) => t.id !== id));
        setFilteredTeachers((prev) => prev.filter((t) => t.id !== id));
        setSuccess("Teacher deleted successfully!");
      } catch (error) {
        setError("Failed to delete teacher: " + error.message);
      }
    }
  };

  const router = useRouter();

  const sortedTeachers = useMemo(() => {
    return [...filteredTeachers].sort((a, b) => {
      const deptA = String(a.department || a.dept || "").toLowerCase();
      const deptB = String(b.department || b.dept || "").toLowerCase();
      if (deptA !== deptB) {
        return deptA.localeCompare(deptB);
      }

      const nameA = String(a.name || "").toLowerCase();
      const nameB = String(b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [filteredTeachers]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Management"
        description="Manage faculty records and their teaching assignments."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push("/admin-dashboard")}
          >
            <FiArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <Input
            type="text"
            placeholder="Search teacher by name, email or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={fetchTeachers}>
            <FiRefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Close Form" : "Add Teacher"}
          </Button>
        </div>
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={isEditing ? "Edit Teacher" : "Add Teacher"}
        description="Fill in the details and assign teaching load."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={isLoading}
              disabled={isLoading}
            >
              {isLoading
                ? "Saving..."
                : isEditing
                  ? "Update Teacher"
                  : "Add Teacher"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </Field>
          <Field label="Mobile Number">
            <Input
              type="text"
              placeholder="Mobile Number"
              value={formData.mobile}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  mobile: e.target.value.replace(/[^\d]/g, "").slice(0, 10),
                })
              }
            />
          </Field>
          <Field label="Job Profile">
            <Select
              value={formData.jobProfile}
              onChange={(e) =>
                setFormData({ ...formData, jobProfile: e.target.value })
              }
            >
              <option value="">Select Job Profile</option>
              {JOB_PROFILES.map((jobProfile) => (
                <option key={jobProfile} value={jobProfile}>
                  {jobProfile}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select
              value={formData.department}
              onChange={(e) =>
                setFormData({ ...formData, department: e.target.value })
              }
            >
              <option value="">Select Department</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teacher ID" hint="Auto-generated after save">
            <Input
              type="text"
              placeholder="Teacher ID (Auto Generated)"
              value={formData.employeeId || "Auto-generated after save"}
              readOnly
            />
          </Field>
        </div>

        {formData.department && (
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">
              Assign Teaching Load
            </h3>

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select
                value={currentBranch}
                onChange={(e) => {
                  setCurrentBranch(e.target.value);
                  setCurrentSubjects([]);
                }}
              >
                <option value="">Select Branch</option>
                {departments.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </Select>

              <Select
                value={currentYear}
                onChange={(e) => {
                  setCurrentYear(e.target.value);
                  setCurrentSubjects([]);
                }}
              >
                <option value="">Select Year</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year} Year
                  </option>
                ))}
              </Select>

              <Button
                variant="secondary"
                onClick={handleAddYearSubjects}
                disabled={
                  !currentBranch ||
                  !currentYear ||
                  currentSubjects.length === 0
                }
              >
                Add Assignment
              </Button>
            </div>

            {currentBranch && currentYear && (
              <div className="mb-4 rounded-lg border border-line bg-slate-50 p-4">
                <h4 className="mb-2 text-sm font-medium text-ink">
                  Select Subjects for {currentBranch} - {currentYear} Year:
                </h4>
                {loadingSubjects ? (
                  <p className="text-sm text-ink-soft">Loading subjects...</p>
                ) : availableSubjects.length === 0 ? (
                  <p className="text-sm text-danger">
                    No subjects found for the selected branch and year.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {availableSubjects.map((subject) => (
                      <label
                        key={subject}
                        className="flex items-center gap-2 text-sm text-ink"
                      >
                        <input
                          type="checkbox"
                          value={subject}
                          checked={currentSubjects.includes(subject)}
                          onChange={(e) =>
                            handleSubjectChange(subject, e.target.checked)
                          }
                          className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                        />
                        <span>{subject}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {formData.assignments.length > 0 && (
              <div className="mb-2 rounded-lg border border-brand-200 bg-brand-50 p-4">
                <h4 className="mb-2 text-sm font-medium text-ink">
                  Current Assignments:
                </h4>
                <div className="space-y-4">
                  {formData.assignments.map((assignment, idx) => (
                    <label
                      key={`${assignment.branch}-${assignment.year}-${idx}`}
                      className="block border-b border-line pb-2"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-ink">
                          {assignment.branch} - {assignment.year} Year
                        </span>
                        <button
                          onClick={() => handleRemoveAssignment(idx)}
                          className="text-sm text-danger hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="pl-4">
                        <span className="text-sm text-ink-soft">Subjects: </span>
                        <span className="text-sm font-medium text-ink">
                          {assignment.subjects.join(", ")}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Card className="animate-fade-up">
        <CardHeader
          title="All Teachers"
          actions={<Badge tone="brand">{sortedTeachers.length} total</Badge>}
        />
        <CardBody>
          {sortedTeachers.length > 0 ? (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Mobile</TH>
                    <TH>Email</TH>
                    <TH>Department</TH>
                    <TH>Teacher ID</TH>
                    <TH>Job Profile</TH>
                    <TH className="text-center">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {sortedTeachers.map((teacher) => (
                    <TR key={teacher.id}>
                      <TD className="whitespace-nowrap font-medium text-ink">
                        {teacher.name}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {teacher.mobile || teacher.phone || "-"}
                      </TD>
                      <TD className="whitespace-nowrap">{teacher.email}</TD>
                      <TD className="whitespace-nowrap">
                        {teacher.department || teacher.dept || "-"}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {teacher.teacherId || teacher.employeeId || "-"}
                      </TD>
                      <TD className="whitespace-nowrap">
                        {teacher.jobProfile || "-"}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEdit(teacher)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(teacher.id)}
                          >
                            Delete
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
              title="No teachers found"
              description="Add a teacher to get started."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default TeacherManagement;

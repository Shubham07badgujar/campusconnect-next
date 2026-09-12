"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, firestore } from "@/lib/client/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";
import TimetableGrid from "@/components/teacher/TimetableGrid";
import AddLectureModal from "@/components/teacher/AddLectureModal";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Field";
import { PageLoader } from "@/components/ui/States";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIME_SLOTS = [
  { label: "09:00 - 10:00", start: "09:00", end: "10:00" },
  { label: "10:00 - 11:00", start: "10:00", end: "11:00" },
  { label: "11:00 - 12:00", start: "11:00", end: "12:00" },
  { label: "12:00 - 13:00", start: "12:00", end: "13:00" },
  { label: "13:00 - 14:00", start: "13:00", end: "14:00" },
  { label: "14:00 - 15:00", start: "14:00", end: "15:00" },
  { label: "15:00 - 16:00", start: "15:00", end: "16:00" },
  { label: "16:00 - 17:00", start: "16:00", end: "17:00" },
];

const normalizeAssignments = (teacherData) => {
  if (
    Array.isArray(teacherData?.assignments) &&
    teacherData.assignments.length > 0
  ) {
    return teacherData.assignments;
  }

  if (
    Array.isArray(teacherData?.assignedCourses) &&
    teacherData.assignedCourses.length > 0
  ) {
    const defaultBranch = teacherData?.department || teacherData?.dept || "";
    return teacherData.assignedCourses.map((course) => ({
      branch: defaultBranch,
      year: course.year,
      subjects: Array.isArray(course.subjects) ? course.subjects : [],
    }));
  }

  return [];
};

const getApiBaseUrl = () => "";

const parseApiResponse = async (response) => {
  const contentType = String(
    response.headers.get("content-type") || "",
  ).toLowerCase();
  const bodyText = await response.text();

  if (!bodyText) {
    return {};
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(bodyText);
    } catch {
      throw new Error("Received invalid JSON response from server.");
    }
  }

  const trimmed = bodyText.trim();
  if (
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html")
  ) {
    throw new Error(
      "Backend API URL is misconfigured for deployment. Set VITE_API_URL to backend origin.",
    );
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error("Server returned a non-JSON response.");
  }
};

const fetchJson = async (url, options: any = {}) => {
  const idToken = auth.currentUser
    ? await auth.currentUser.getIdToken()
    : null;
  if (idToken) {
    options = {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${idToken}`,
      },
    };
  }

  const response = await fetch(url, options);
  const data = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(data.message || data.error || "Request failed.");
  }

  return data;
};

export default function TeacherTimetablePage() {
  const router = useRouter();
  const [teacher, setTeacher] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("1");
  const [allowedSubjects, setAllowedSubjects] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  const branchOptions = useMemo(() => {
    return [...new Set(assignments.map((item) => item.branch).filter(Boolean))];
  }, [assignments]);

  const yearOptions = useMemo(() => {
    if (!branch) return [];
    return [
      ...new Set(
        assignments
          .filter((item) => item.branch === branch)
          .map((item) => item.year)
          .filter(Boolean),
      ),
    ];
  }, [assignments, branch]);

  useEffect(() => {
    const init = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        const teacherSnap = await getDoc(
          doc(firestore, "teachers", currentUser.uid),
        );
        if (!teacherSnap.exists()) {
          toast.error("Teacher profile not found.");
          setLoading(false);
          return;
        }

        const teacherData = teacherSnap.data() || {};
        const normalized = normalizeAssignments(teacherData).filter(
          (item) => item.branch && item.year,
        );

        setTeacher({ uid: currentUser.uid, ...teacherData });
        setAssignments(normalized);

        const first = normalized[0];
        if (first) {
          setBranch(first.branch);
          setYear(first.year);
        }
      } catch (error) {
        toast.error(
          error.message || "Failed to load teacher timetable profile.",
        );
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router]);

  useEffect(() => {
    if (!branch || !year || !semester) {
      setLectures([]);
      return;
    }

    const fetchClassTimetable = async () => {
      try {
        const data = await fetchJson(
          `${apiBase}/api/timetable/${encodeURIComponent(branch)}/${encodeURIComponent(year)}/${encodeURIComponent(semester)}`,
        );
        setLectures(Array.isArray(data.lectures) ? data.lectures : []);
      } catch (error) {
        toast.error(error.message || "Failed to load timetable.");
      }
    };

    fetchClassTimetable();
  }, [apiBase, branch, year, semester]);

  useEffect(() => {
    if (!branch || !year || !semester) {
      setAllowedSubjects([]);
      return;
    }

    const assignment = assignments.find(
      (item) => item.branch === branch && item.year === year,
    );
    const assignedSubjects = Array.isArray(assignment?.subjects)
      ? assignment.subjects
      : [];

    const loadSemesterSubjects = async () => {
      try {
        const data = await fetchJson(
          `${apiBase}/api/subjects?department=${encodeURIComponent(branch)}&year=${encodeURIComponent(year)}&semester=${encodeURIComponent(semester)}`,
        );

        const semesterSubjects = Array.isArray(data.subjects)
          ? data.subjects
          : [];
        const filtered = semesterSubjects.filter((subject) =>
          assignedSubjects.includes(subject),
        );
        setAllowedSubjects(filtered);
      } catch (error) {
        toast.error(error.message || "Failed to load semester subjects.");
      }
    };

    loadSemesterSubjects();
  }, [apiBase, assignments, branch, year, semester]);

  const refreshTimetable = async () => {
    if (!branch || !year || !semester) return;

    const data = await fetchJson(
      `${apiBase}/api/timetable/${encodeURIComponent(branch)}/${encodeURIComponent(year)}/${encodeURIComponent(semester)}`,
    );

    setLectures(Array.isArray(data.lectures) ? data.lectures : []);
  };

  const handleAddLecture = async (lectureData) => {
    if (!teacher?.uid) return;

    try {
      setIsSubmitting(true);
      const token = await auth.currentUser.getIdToken();

      await fetchJson(`${apiBase}/api/timetable/add-lecture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(lectureData),
      });

      toast.success("Lecture added successfully.");
      setIsAddOpen(false);
      await refreshTimetable();
    } catch (error) {
      toast.error(error.message || "Failed to add lecture.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading timetable..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Timetable"
        description="Shared class timetable with overlap protection and attendance-ready lecture IDs."
        actions={
          <Button
            onClick={() => setIsAddOpen(true)}
            disabled={
              !branch || !year || !semester || allowedSubjects.length === 0
            }
          >
            <Plus className="h-4 w-4" /> Add lecture
          </Button>
        }
      />

      <Card>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Branch" htmlFor="tt-branch">
              <Select
                id="tt-branch"
                value={branch}
                onChange={(event) => {
                  const value = event.target.value;
                  setBranch(value);
                  const firstYear =
                    assignments.find((item) => item.branch === value)?.year ||
                    "";
                  setYear(firstYear);
                }}
              >
                <option value="">Select Branch</option>
                {branchOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Year" htmlFor="tt-year">
              <Select
                id="tt-year"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              >
                <option value="">Select Year</option>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Semester" htmlFor="tt-semester">
              <Select
                id="tt-semester"
                value={semester}
                onChange={(event) => setSemester(event.target.value)}
              >
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </Select>
            </Field>
          </div>

          <TimetableGrid
            lectures={lectures}
            days={DAYS}
            timeSlots={TIME_SLOTS}
            currentTeacherId={teacher?.uid}
          />
        </CardBody>
      </Card>

      <AddLectureModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSubmit={handleAddLecture}
        branch={branch}
        year={year}
        semester={semester}
        allowedSubjects={allowedSubjects}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

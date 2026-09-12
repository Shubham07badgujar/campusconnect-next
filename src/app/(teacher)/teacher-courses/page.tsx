"use client";

// src/pages/TeacherCourses.jsx
import React, { useState, useEffect } from "react";
import { auth, firestore } from "@/lib/client/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { BookOpen, GraduationCap, Layers, Lightbulb } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import { EmptyState, ErrorState } from "@/components/ui/States";

export default function TeacherCourses() {
  const [dept, setDept] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    const fetchTeacherData = async () => {
      const user = auth.currentUser;
      if (!user) {
        router.push("/login");
        return;
      }
      try {
        const docRef = doc(firestore, "teachers", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setDept(data.department || data.dept || "");

          if (Array.isArray(data.assignments) && data.assignments.length > 0) {
            setAssignments(data.assignments);
          } else if (
            data.assignedCourses &&
            Array.isArray(data.assignedCourses)
          ) {
            setAssignments(
              data.assignedCourses.map((course) => ({
                branch: data.department || data.dept || "",
                year: course.year,
                subjects: Array.isArray(course.subjects) ? course.subjects : [],
              })),
            );
          } else if (data.subjects) {
            const year = data.year || "";
            const subjects = Array.isArray(data.subjects)
              ? data.subjects
              : typeof data.subjects === "string"
                ? [data.subjects]
                : [];

            if (year && subjects.length > 0) {
              setAssignments([
                {
                  branch: data.department || data.dept || "",
                  year,
                  subjects,
                },
              ]);
            }
          } else {
            setAssignments([]);
          }
        } else {
          setError("Teacher data not found");
        }
      } catch (err) {
        setError("Error fetching data: " + err.message);
      }
    };
    fetchTeacherData();
  }, [router]);

  const totalSubjects = assignments.reduce(
    (total, assignment) => total + assignment.subjects.length,
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your Courses"
        description={`Department: ${dept || "Not assigned"}`}
      />

      {error ? (
        <ErrorState title="Unable to load courses" description={error} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Branch-year blocks"
              value={assignments.length}
              icon={Layers}
              tone="brand"
            />
            <StatCard
              label="Subject assignments"
              value={totalSubjects}
              icon={BookOpen}
              tone="info"
            />
            <StatCard
              label="Department"
              value={dept || "—"}
              icon={GraduationCap}
              tone="success"
            />
          </div>

          <Card>
            <CardHeader
              title="Assigned teaching loads"
              description="Branch, year and subjects you are responsible for."
            />
            <CardBody>
              {assignments.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No assignments yet"
                  description="You have no teaching loads assigned to your profile."
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {assignments.map((assignment, index) => (
                    <div
                      key={index}
                      className="animate-fade-up rounded-card border border-line bg-white p-5 shadow-card"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-ink">
                          {assignment.branch || "Branch"}
                        </h3>
                        <Badge tone="brand">{assignment.year} Year</Badge>
                      </div>
                      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                        Subjects
                      </h4>
                      <ul className="mt-2 space-y-1.5">
                        {assignment.subjects.map((subject, subIndex) => (
                          <li
                            key={subIndex}
                            className="flex items-center gap-2 text-sm text-ink-soft"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                            {subject}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Teaching resources"
              description={`${totalSubjects} subject assignment(s) across ${assignments.length} branch-year block(s).`}
            />
            <CardBody>
              <ul className="space-y-2 text-sm text-ink-soft">
                <li className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  Access learning materials in the Resources section
                </li>
                <li className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  Schedule office hours using the Calendar
                </li>
                <li className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  Communicate with students through the Chat feature
                </li>
                <li className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  Post announcements to keep your students updated
                </li>
              </ul>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

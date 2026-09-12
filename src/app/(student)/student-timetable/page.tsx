"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, Clock, User } from "lucide-react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { firestore, auth } from "@/lib/client/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { toast } from "react-toastify";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import Badge from "@/components/ui/Badge";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import { PageLoader, EmptyState } from "@/components/ui/States";

const StudentTimetable = () => {
  const [user] = useAuthState(auth);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [filterBranch, setFilterBranch] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterSemester, setFilterSemester] = useState("");

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const timeSlots = [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
  ];

  useEffect(() => {
    const fetchStudentInfo = async () => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const userDoc = await getDoc(doc(firestore, "users", user.uid));
        let data = null;

        if (userDoc.exists()) {
          data = userDoc.data();
        } else {
          const studentDoc = await getDoc(doc(firestore, "students", user.uid));
          if (studentDoc.exists()) {
            data = studentDoc.data();
          }
        }

        if (!data) {
          toast.error("Student profile not found.");
          setLoading(false);
          return;
        }

        const branch = data.dept || data.department || "";
        const year = data.year || "";
        const semester = data.semester || "";

        setStudentInfo({ uid: user.uid, ...data });
        setFilterBranch(branch);
        setFilterYear(year);
        setFilterSemester(semester);
      } catch (error) {
        console.error("Error fetching student info:", error);
        toast.error("Failed to load student profile.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudentInfo();
  }, [user, router]);

  useEffect(() => {
    const fetchTimetable = async () => {
      if (!filterBranch || !filterYear || !filterSemester) {
        setClasses([]);
        return;
      }

      try {
        const q = query(
          collection(firestore, "timetables"),
          where("branch", "==", filterBranch),
          where("year", "==", filterYear),
          where("semester", "==", filterSemester),
        );

        const snapshot = await getDocs(q);
        const classList = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
          .sort((a: any, b: any) =>
            String(a.startTime || "").localeCompare(String(b.startTime || "")),
          );

        setClasses(classList);
      } catch (error) {
        console.error("Error fetching classes:", error);
        toast.error("Failed to load timetable");
      }
    };

    fetchTimetable();
  }, [filterBranch, filterYear, filterSemester]);

  const getClassesForSlot = (day: any, timeSlot: any) => {
    return classes.filter((c) => {
      const classStart = c.startTime;
      const classEnd = c.endTime;
      return c.day === day && classStart <= timeSlot && classEnd > timeSlot;
    });
  };

  const getColorForSubject = (subject = "") => {
    const colors = [
      "bg-blue-100 border-blue-500 text-blue-800",
      "bg-green-100 border-green-500 text-green-800",
      "bg-purple-100 border-purple-500 text-purple-800",
      "bg-orange-100 border-orange-500 text-orange-800",
      "bg-pink-100 border-pink-500 text-pink-800",
      "bg-indigo-100 border-indigo-500 text-indigo-800",
      "bg-teal-100 border-teal-500 text-teal-800",
    ];
    const index = subject.length % colors.length;
    return colors[index];
  };

  if (loading) {
    return <PageLoader label="Loading timetable..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Timetable"
        description="View your class schedule for the week."
      />

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </span>
              Applied Filters
            </span>
          }
          actions={
            <Badge tone="brand">{classes.length} class(es)</Badge>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Branch" htmlFor="tt-branch">
              <Input id="tt-branch" type="text" value={filterBranch} readOnly />
            </Field>
            <Field label="Year" htmlFor="tt-year">
              <Input id="tt-year" type="text" value={filterYear} readOnly />
            </Field>
            <Field label="Semester" htmlFor="tt-semester">
              <Select
                id="tt-semester"
                value={filterSemester}
                onChange={(e) => setFilterSemester(e.target.value)}
              >
                <option value="">Select semester</option>
                <option value="1">1</option>
                <option value="2">2</option>
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      {classes.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No classes found for your current profile"
          description="Contact your teachers if timetable slots are not published yet."
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[820px]">
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="text-left">Time</TH>
                {days.map((day) => (
                  <TH key={day} className="min-w-[150px] text-center">
                    {day}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {timeSlots.map((timeSlot) => (
                <TR key={timeSlot}>
                  <TD className="bg-slate-50/70 font-medium text-ink-soft">
                    {timeSlot}
                  </TD>
                  {days.map((day) => {
                    const slotClasses = getClassesForSlot(day, timeSlot);
                    return (
                      <TD key={day} className="align-top">
                        {slotClasses.map((classItem: any) => (
                          <div
                            key={classItem.id}
                            className={`${getColorForSubject(classItem.subjectName || classItem.subject)} mb-1 rounded-lg border-l-4 p-2`}
                          >
                            <div className="text-sm font-semibold">
                              {classItem.subjectName || classItem.subject}
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3" />
                              {classItem.startTime} - {classItem.endTime}
                            </div>
                            {classItem.teacherName && (
                              <div className="mt-0.5 flex items-center gap-1 text-xs">
                                <User className="h-3 w-3" />
                                {classItem.teacherName}
                              </div>
                            )}
                          </div>
                        ))}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
};

export default StudentTimetable;

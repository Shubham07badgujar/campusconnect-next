"use client";

import React, { useState, useEffect } from "react";
import { firestore, auth } from "@/lib/client/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { toast } from "react-toastify";
import { Check, X, CalendarDays, PieChart, Download } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import { Field, Select, Input } from "@/components/ui/Field";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import { PageLoader, EmptyState } from "@/components/ui/States";

function AttendanceTracker() {
  const [user] = useAuthState(auth);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isStudent, setIsStudent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [students, setStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [attendanceView, setAttendanceView] = useState("mark"); // 'mark', 'history', 'stats'
  const [attendanceFilter, setAttendanceFilter] = useState("all"); // 'all', 'present', 'absent'
  const [studentAttendance, setStudentAttendance] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Check user role and load appropriate data
  useEffect(() => {
    const checkUserRole = async () => {
      if (!user) return;

      try {
        // Check if teacher
        const teacherQuery = query(
          collection(firestore, "teachers"),
          where("uid", "==", user.uid),
        );
        const teacherSnapshot = await getDocs(teacherQuery);
        const isUserTeacher = !teacherSnapshot.empty;
        setIsTeacher(isUserTeacher);

        // Check if student
        const studentQuery = query(
          collection(firestore, "students"),
          where("uid", "==", user.uid),
        );
        const studentSnapshot = await getDocs(studentQuery);
        const isUserStudent = !studentSnapshot.empty;
        setIsStudent(isUserStudent);

        // Fetch courses based on role
        if (isUserTeacher) {
          const teacherCoursesQuery = query(
            collection(firestore, "courses"),
            where("teacherId", "==", user.uid),
          );
          const coursesSnapshot = await getDocs(teacherCoursesQuery);
          const coursesList = coursesSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          } as any));
          setCourses(coursesList);
          if (coursesList.length > 0) {
            setSelectedCourse(coursesList[0].id);
          }
        } else if (isUserStudent) {
          // Fetch student's enrolled courses
          const studentDoc = studentSnapshot.docs[0];
          const studentData = studentDoc.data();

          if (studentData.enrolledCourses) {
            const coursesPromises = studentData.enrolledCourses.map(
              async (courseId) => {
                const courseDoc = await getDoc(
                  doc(firestore, "courses", courseId),
                );
                if (courseDoc.exists()) {
                  return {
                    id: courseDoc.id,
                    ...courseDoc.data(),
                  };
                }
                return null;
              },
            );

            const coursesList = (await Promise.all(coursesPromises)).filter(
              Boolean,
            );
            setCourses(coursesList);

            if (coursesList.length > 0) {
              setSelectedCourse(coursesList[0].id);

              // Fetch student's attendance for the selected course
              await fetchStudentAttendance(user.uid, coursesList[0].id);
            }

            // Set student info
            setSelectedStudent({
              id: studentDoc.id,
              uid: user.uid,
              name: studentData.name || studentData.displayName,
              ...studentData,
            });
          }
        }
      } catch (error) {
        console.error("Error checking user role:", error);
        toast.error("Failed to load user data");
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
  }, [user]);

  // Fetch students for a course when a course is selected (teacher view)
  useEffect(() => {
    const fetchStudentsForCourse = async () => {
      if (!selectedCourse || !isTeacher) return;

      try {
        setLoading(true);

        // Fetch students enrolled in this course
        const enrollmentsQuery = query(
          collection(firestore, "enrollments"),
          where("courseId", "==", selectedCourse),
        );
        const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
        const enrollments = enrollmentsSnapshot.docs.map((doc) => doc.data());

        // Get student details for each enrollment
        const studentIds = enrollments.map(
          (enrollment) => enrollment.studentId,
        );
        const studentsQuery = query(
          collection(firestore, "students"),
          where("uid", "in", studentIds),
        );
        const studentsSnapshot = await getDocs(studentsQuery);
        const studentsList = studentsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as any));

        setStudents(studentsList);

        // Check if attendance is already marked for today
        await checkExistingAttendance();
      } catch (error) {
        console.error("Error fetching students:", error);
        toast.error("Failed to load students");
      } finally {
        setLoading(false);
      }
    };

    fetchStudentsForCourse();
  }, [selectedCourse, isTeacher]);

  // For students: fetch attendance when course selected
  useEffect(() => {
    if (isStudent && selectedCourse && user) {
      fetchStudentAttendance(user.uid, selectedCourse);
    }
  }, [selectedCourse, isStudent, user]);

  // Fetch student's attendance records for a specific course
  const fetchStudentAttendance = async (studentId, courseId) => {
    try {
      setLoading(true);
      const attendanceQuery = query(
        collection(firestore, "attendance"),
        where("courseId", "==", courseId),
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);

      // Get all attendance sessions for this course
      const attendanceSessions = attendanceSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as any));

      // Extract this student's attendance from the sessions
      const studentAttendanceRecords = [];

      attendanceSessions.forEach((session) => {
        const record = session.attendanceData.find(
          (record) => record.studentId === studentId,
        );

        if (record) {
          studentAttendanceRecords.push({
            date: session.date,
            present: record.present,
            sessionId: session.id,
          });
        }
      });

      // Sort by date (newest first)
      studentAttendanceRecords.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      setStudentAttendance(studentAttendanceRecords);
    } catch (error) {
      console.error("Error fetching student attendance:", error);
      toast.error("Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  };

  // Check if attendance is already marked for selected date
  const checkExistingAttendance = async () => {
    if (!selectedCourse) return;

    try {
      const attendanceQuery = query(
        collection(firestore, "attendance"),
        where("courseId", "==", selectedCourse),
        where("date", "==", selectedDate),
      );

      const attendanceSnapshot = await getDocs(attendanceQuery);

      if (!attendanceSnapshot.empty) {
        const attendanceDoc = attendanceSnapshot.docs[0];
        const attendanceData = attendanceDoc.data().attendanceData || [];

        // Pre-fill the attendance records
        setAttendanceRecords(attendanceData);
      } else {
        // Initialize attendance records for all students
        const initialAttendance = students.map((student) => ({
          studentId: student.uid,
          studentName: student.name || student.displayName,
          present: false,
        }));

        setAttendanceRecords(initialAttendance);
      }
    } catch (error) {
      console.error("Error checking existing attendance:", error);
    }
  };

  // Mark a student as present or absent
  const toggleAttendance = (studentId) => {
    setAttendanceRecords(
      attendanceRecords.map((record) => {
        if (record.studentId === studentId) {
          return { ...record, present: !record.present };
        }
        return record;
      }),
    );
  };

  // Save attendance for the day
  const saveAttendance = async () => {
    if (!selectedCourse || !selectedDate) {
      toast.error("Please select a course and date");
      return;
    }

    try {
      // Check if attendance record exists for this date and course
      const attendanceQuery = query(
        collection(firestore, "attendance"),
        where("courseId", "==", selectedCourse),
        where("date", "==", selectedDate),
      );

      const attendanceSnapshot = await getDocs(attendanceQuery);

      if (attendanceSnapshot.empty) {
        // Create new attendance record
        await addDoc(collection(firestore, "attendance"), {
          courseId: selectedCourse,
          date: selectedDate,
          markedBy: user.uid,
          markedAt: Timestamp.now(),
          attendanceData: attendanceRecords,
        });
      } else {
        // Update existing record
        const attendanceDoc = attendanceSnapshot.docs[0];
        await updateDoc(doc(firestore, "attendance", attendanceDoc.id), {
          attendanceData: attendanceRecords,
          lastUpdatedBy: user.uid,
          lastUpdatedAt: Timestamp.now(),
        });
      }

      toast.success("Attendance saved successfully");
    } catch (error) {
      console.error("Error saving attendance:", error);
      toast.error("Failed to save attendance");
    }
  };

  // Fetch attendance history for a course
  const fetchAttendanceHistory = async () => {
    if (!selectedCourse) return;

    try {
      setLoading(true);
      const attendanceQuery = query(
        collection(firestore, "attendance"),
        where("courseId", "==", selectedCourse),
      );

      const attendanceSnapshot = await getDocs(attendanceQuery);
      const attendanceList = attendanceSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as any));

      // Sort by date (newest first)
      attendanceList.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      return attendanceList;
    } catch (error) {
      console.error("Error fetching attendance history:", error);
      toast.error("Failed to load attendance records");
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Calculate attendance statistics
  const calculateAttendanceStats = (attendanceHistory) => {
    if (!students || students.length === 0) return [];

    const studentStats = {};

    // Initialize stats for each student
    students.forEach((student) => {
      studentStats[student.uid] = {
        studentId: student.uid,
        studentName: student.name || student.displayName,
        totalClasses: 0,
        presentCount: 0,
        absentCount: 0,
        percentage: 0,
      };
    });

    // Calculate attendance for each session
    attendanceHistory.forEach((session) => {
      session.attendanceData.forEach((record) => {
        if (studentStats[record.studentId]) {
          studentStats[record.studentId].totalClasses++;

          if (record.present) {
            studentStats[record.studentId].presentCount++;
          } else {
            studentStats[record.studentId].absentCount++;
          }
        }
      });
    });

    // Calculate percentage
    Object.keys(studentStats).forEach((studentId) => {
      const stats = studentStats[studentId];
      stats.percentage =
        stats.totalClasses > 0
          ? Math.round((stats.presentCount / stats.totalClasses) * 100)
          : 0;
    });

    // Convert to array and sort by name
    return (Object.values(studentStats) as any[]).sort((a, b) =>
      a.studentName.localeCompare(b.studentName),
    );
  };

  // Download attendance record as CSV
  const downloadAttendanceCSV = async () => {
    if (!selectedCourse) {
      toast.error("Please select a course");
      return;
    }

    try {
      // Get course name
      const courseDoc = await getDoc(doc(firestore, "courses", selectedCourse));
      const courseName = courseDoc.exists() ? courseDoc.data().name : "Course";

      // Get attendance history
      const attendanceHistory = await fetchAttendanceHistory();

      if (attendanceHistory.length === 0) {
        toast.info("No attendance records to download");
        return;
      }

      // Format the data
      let csvContent = "Student Name,Student ID";

      // Add dates as columns
      const dates = attendanceHistory.map((session) => session.date);
      dates.forEach((date) => {
        csvContent += `,${date}`;
      });

      csvContent += ",Present Count,Absent Count,Attendance Percentage\n";

      // Add data for each student
      const stats = calculateAttendanceStats(attendanceHistory);

      stats.forEach((studentStat) => {
        csvContent += `${studentStat.studentName},${studentStat.studentId}`;

        // Add attendance for each date
        dates.forEach((date) => {
          const session = attendanceHistory.find((s) => s.date === date);
          const record = session?.attendanceData.find(
            (r) => r.studentId === studentStat.studentId,
          );
          csvContent += `,${record?.present ? "Present" : "Absent"}`;
        });

        // Add summary
        csvContent += `,${studentStat.presentCount},${studentStat.absentCount},${studentStat.percentage}%\n`;
      });

      // Create and download the file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `${courseName}_Attendance.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error downloading attendance:", error);
      toast.error("Failed to download attendance records");
    }
  };

  // Get attendance percentage class based on value
  const getAttendanceClass = (percentage) => {
    if (percentage >= 90) return "text-emerald-600";
    if (percentage >= 75) return "text-sky-600";
    if (percentage >= 60) return "text-amber-500";
    return "text-rose-600";
  };

  // Get attendance percentage tone for StatCard/badge presentation
  const getAttendanceTone = (percentage) => {
    if (percentage >= 75) return "success";
    if (percentage >= 60) return "warning";
    return "danger";
  };

  // Get attendance indicator component
  const getAttendanceIndicator = (present) => {
    return present ? (
      <Badge tone="success">
        <Check className="h-3.5 w-3.5" /> Present
      </Badge>
    ) : (
      <Badge tone="danger">
        <X className="h-3.5 w-3.5" /> Absent
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Tracker"
        description="Mark, review, and export course attendance."
        actions={
          isTeacher ? (
            <Button variant="success" onClick={downloadAttendanceCSV}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          ) : undefined
        }
      />

      {/* Course Selection */}
      <Card>
        <CardBody className="space-y-4">
          <Field label="Select Course" htmlFor="course-select" className="max-w-sm">
            <Select
              id="course-select"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              disabled={loading}
            >
              {courses.length === 0 ? (
                <option value="">No courses available</option>
              ) : (
                courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.name}
                  </option>
                ))
              )}
            </Select>
          </Field>

          {isTeacher && (
            <Tabs
              value={attendanceView}
              onChange={(v) => setAttendanceView(v)}
              items={[
                { value: "mark", label: "Mark Attendance" },
                { value: "history", label: "Attendance History" },
                { value: "stats", label: "Statistics" },
              ]}
            />
          )}
        </CardBody>
      </Card>

      {/* Content based on role and view selection */}
      {loading ? (
        <PageLoader />
      ) : (
        <>
          {isTeacher && (
            <>
              {/* Teacher's View */}
              {attendanceView === "mark" && (
                <Card className="animate-fade-up">
                  <CardHeader
                    title="Mark Attendance"
                    actions={
                      <Field label="Date" htmlFor="attendance-date" className="mb-0">
                        <Input
                          id="attendance-date"
                          type="date"
                          value={selectedDate}
                          onChange={(e) => {
                            setSelectedDate(e.target.value);
                            // Reset attendance records when date changes
                            const initialAttendance = students.map(
                              (student) => ({
                                studentId: student.uid,
                                studentName:
                                  student.name || student.displayName,
                                present: false,
                              }),
                            );
                            setAttendanceRecords(initialAttendance);
                          }}
                          max={new Date().toISOString().split("T")[0]}
                        />
                      </Field>
                    }
                  />

                  {students.length === 0 ? (
                    <CardBody>
                      <EmptyState
                        title="No students enrolled"
                        description="There are no students enrolled in this course yet."
                      />
                    </CardBody>
                  ) : (
                    <>
                      <TableWrap className="border-0 shadow-none">
                        <Table>
                          <THead>
                            <tr>
                              <TH>Name</TH>
                              <TH>ID</TH>
                              <TH>Status</TH>
                              <TH className="text-right">Actions</TH>
                            </tr>
                          </THead>
                          <TBody>
                            {students.map((student) => {
                              const attendanceRecord = attendanceRecords.find(
                                (record) => record.studentId === student.uid,
                              ) || { present: false };

                              return (
                                <TR key={student.uid}>
                                  <TD className="font-medium text-ink">
                                    {student.name || student.displayName}
                                  </TD>
                                  <TD className="text-ink-soft">
                                    {student.studentId ||
                                      student.uid.slice(0, 8)}
                                  </TD>
                                  <TD>
                                    {attendanceRecord.present ? (
                                      <Badge tone="success">Present</Badge>
                                    ) : (
                                      <Badge tone="danger">Absent</Badge>
                                    )}
                                  </TD>
                                  <TD className="text-right">
                                    <Button
                                      size="sm"
                                      variant={
                                        attendanceRecord.present
                                          ? "danger"
                                          : "success"
                                      }
                                      onClick={() =>
                                        toggleAttendance(student.uid)
                                      }
                                    >
                                      {attendanceRecord.present
                                        ? "Mark Absent"
                                        : "Mark Present"}
                                    </Button>
                                  </TD>
                                </TR>
                              );
                            })}
                          </TBody>
                        </Table>
                      </TableWrap>

                      <div className="flex justify-end border-t border-line px-5 py-4">
                        <Button onClick={saveAttendance}>Save Attendance</Button>
                      </div>
                    </>
                  )}
                </Card>
              )}

              {attendanceView === "history" && (
                <Card className="animate-fade-up">
                  <CardHeader title="Attendance History" />
                  <CardBody>
                    {/* Fetch and display attendance history */}
                    {loading ? (
                      <PageLoader label="Loading history..." />
                    ) : (
                      <>
                        <div className="mb-1.5 text-sm font-medium text-ink">
                          Filter by
                        </div>
                        <Tabs
                          value={attendanceFilter}
                          onChange={(v) => setAttendanceFilter(v)}
                          items={[
                            { value: "all", label: "All" },
                            { value: "present", label: "Present" },
                            { value: "absent", label: "Absent" },
                          ]}
                        />

                        {/* Implement the fetch and display history here */}
                      </>
                    )}
                  </CardBody>
                </Card>
              )}

              {attendanceView === "stats" && (
                <Card className="animate-fade-up">
                  <CardHeader
                    title="Attendance Statistics"
                    actions={<PieChart className="h-5 w-5 text-ink-faint" />}
                  />
                  <CardBody>
                    {/* Implement attendance statistics here */}
                  </CardBody>
                </Card>
              )}
            </>
          )}

          {isStudent && selectedStudent && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 animate-fade-up">
              {/* Student overview */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader
                    title="My Attendance"
                    actions={<CalendarDays className="h-5 w-5 text-ink-faint" />}
                  />
                  <CardBody>
                    {/* Calculate overall statistics */}
                    {studentAttendance.length > 0 ? (
                      <div className="space-y-4">
                        {(() => {
                          const totalClasses = studentAttendance.length;
                          const presentCount = studentAttendance.filter(
                            (a) => a.present,
                          ).length;
                          const percentage = Math.round(
                            (presentCount / totalClasses) * 100,
                          );

                          return (
                            <>
                              <div className="grid grid-cols-2 gap-3">
                                <StatCard
                                  label="Total Classes"
                                  value={totalClasses}
                                  tone="info"
                                />
                                <StatCard
                                  label="Attended"
                                  value={presentCount}
                                  tone="success"
                                />
                              </div>

                              <div>
                                <div className="mb-1 flex justify-between text-sm">
                                  <span className="text-ink-soft">
                                    Attendance Percentage
                                  </span>
                                  <span
                                    className={`font-semibold ${getAttendanceClass(
                                      percentage,
                                    )}`}
                                  >
                                    {percentage}%
                                  </span>
                                </div>
                                <div className="h-2.5 w-full rounded-full bg-slate-200">
                                  <div
                                    className={`h-2.5 rounded-full ${
                                      percentage >= 75
                                        ? "bg-emerald-600"
                                        : percentage >= 60
                                          ? "bg-amber-400"
                                          : "bg-rose-600"
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                              </div>

                              {/* Status indicator */}
                              <div className="rounded-card border border-line bg-slate-50/60 p-4 text-center">
                                <div className="text-sm font-medium text-ink-soft">
                                  Your attendance is
                                </div>
                                <div className="mt-1">
                                  <Badge tone={getAttendanceTone(percentage)}>
                                    {percentage >= 75
                                      ? "Good"
                                      : percentage >= 60
                                        ? "Adequate"
                                        : "Low - Attendance Warning"}
                                  </Badge>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <EmptyState
                        title="No attendance records"
                        description="No attendance records found for this course."
                      />
                    )}
                  </CardBody>
                </Card>
              </div>

              {/* Attendance history */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader title="Attendance History" />
                  <TableWrap className="border-0 shadow-none">
                    <Table>
                      <THead>
                        <tr>
                          <TH>Date</TH>
                          <TH>Status</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {studentAttendance.length > 0 ? (
                          studentAttendance.map((record, index) => (
                            <TR key={index}>
                              <TD>
                                {new Date(record.date).toLocaleDateString()}
                              </TD>
                              <TD>{getAttendanceIndicator(record.present)}</TD>
                            </TR>
                          ))
                        ) : (
                          <TR>
                            <TD
                              colSpan={2}
                              className="text-center text-ink-soft"
                            >
                              No attendance records found
                            </TD>
                          </TR>
                        )}
                      </TBody>
                    </Table>
                  </TableWrap>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AttendanceTracker;

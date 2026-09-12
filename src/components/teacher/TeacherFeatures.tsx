"use client";

import React, { useState } from "react";
import {
  uploadStudentMarks,
  createAssignment,
  markAttendance,
  // @ts-ignore -- verbatim legacy import: utils/teacherUtils does not exist in the Vite repo either (component is not routed anywhere)
} from "@/lib/client/teacherUtils";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import Button from "@/components/ui/Button";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";

function Alert({ tone, children }) {
  const tones = {
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return (
    <div className={`mb-4 rounded-card border p-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

// Component for uploading student marks
export const MarksUploadComponent = ({ courseId, assignmentId }) => {
  const [students, setStudents] = useState([
    { id: "1", name: "John Doe", marks: "", feedback: "" },
    { id: "2", name: "Jane Smith", marks: "", feedback: "" },
    // Add more students as needed
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleInputChange = (studentId, field, value) => {
    setStudents((prev) =>
      prev.map((student) =>
        student.id === studentId ? { ...student, [field]: value } : student
      )
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    // Validate all inputs
    const hasEmptyMarks = students.some((student) => student.marks === "");
    if (hasEmptyMarks) {
      setError("Please enter marks for all students");
      setLoading(false);
      return;
    }

    // Format data for API
    const gradesData = students.map((student) => ({
      studentId: student.id,
      marks: parseFloat(student.marks),
      feedback: student.feedback,
    }));

    try {
      const result = await uploadStudentMarks(
        courseId,
        assignmentId,
        gradesData
      );

      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || "Failed to upload marks");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Upload Student Marks" />
      <CardBody>
        {error && <Alert tone="danger">{error}</Alert>}
        {success && <Alert tone="success">Marks uploaded successfully!</Alert>}

        <form onSubmit={handleSubmit}>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Student Name</TH>
                  <TH>Marks</TH>
                  <TH>Feedback</TH>
                </tr>
              </THead>
              <TBody>
                {students.map((student) => (
                  <TR key={student.id}>
                    <TD className="font-medium">{student.name}</TD>
                    <TD>
                      <Input
                        type="number"
                        value={student.marks}
                        onChange={(e) =>
                          handleInputChange(student.id, "marks", e.target.value)
                        }
                        className="w-24"
                        min="0"
                        max="100"
                        required
                      />
                    </TD>
                    <TD>
                      <Textarea
                        value={student.feedback}
                        onChange={(e) =>
                          handleInputChange(
                            student.id,
                            "feedback",
                            e.target.value
                          )
                        }
                        rows={2}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>

          <div className="mt-4">
            <Button type="submit" disabled={loading} loading={loading}>
              {loading ? "Uploading..." : "Upload Marks"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
};

// Component for creating assignments
export const AssignmentCreatorComponent = ({ courseId }) => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    dueDate: "",
    totalMarks: "",
    attachment: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setFormData((prev) => ({ ...prev, attachment: e.target.files[0] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const result = await createAssignment(courseId, formData);

      if (result.success) {
        setSuccess(true);
        setFormData({
          title: "",
          description: "",
          dueDate: "",
          totalMarks: "",
          attachment: null,
        });
      } else {
        setError(result.error || "Failed to create assignment");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Create New Assignment" />
      <CardBody>
        {error && <Alert tone="danger">{error}</Alert>}
        {success && (
          <Alert tone="success">Assignment created successfully!</Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title">
            <Input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
            />
          </Field>

          <Field label="Description">
            <Textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              required
            />
          </Field>

          <Field label="Due Date">
            <Input
              type="datetime-local"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleChange}
              required
            />
          </Field>

          <Field label="Total Marks">
            <Input
              type="number"
              name="totalMarks"
              value={formData.totalMarks}
              onChange={handleChange}
              min="0"
              required
            />
          </Field>

          <Field label="Attachment (optional)">
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-brand-700"
            />
          </Field>

          <Button type="submit" disabled={loading} loading={loading}>
            {loading ? "Creating..." : "Create Assignment"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
};

// Component for marking attendance
export const AttendanceComponent = ({ courseId }) => {
  const [date, setDate] = useState("");
  const [students, setStudents] = useState([
    { id: "1", name: "John Doe", present: false },
    { id: "2", name: "Jane Smith", present: false },
    // Add more students as needed
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleDateChange = (e) => {
    setDate(e.target.value);
  };

  const handleAttendanceChange = (studentId, present) => {
    setStudents((prev) =>
      prev.map((student) =>
        student.id === studentId ? { ...student, present } : student
      )
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    if (!date) {
      setError("Please select a date");
      setLoading(false);
      return;
    }

    const attendanceData = students.map((student) => ({
      studentId: student.id,
      present: student.present,
    }));

    try {
      const result = await markAttendance(courseId, date, attendanceData);

      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || "Failed to mark attendance");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Mark Attendance" />
      <CardBody>
        {error && <Alert tone="danger">{error}</Alert>}
        {success && (
          <Alert tone="success">Attendance marked successfully!</Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={handleDateChange}
              required
            />
          </Field>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Students</h3>

            <div className="space-y-2">
              {students.map((student) => (
                <div key={student.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={student.present}
                    onChange={(e) =>
                      handleAttendanceChange(student.id, e.target.checked)
                    }
                    className="mr-2 h-4 w-4 rounded border-line text-brand-600"
                    id={`attendance-${student.id}`}
                  />
                  <label
                    htmlFor={`attendance-${student.id}`}
                    className="text-sm text-ink"
                  >
                    {student.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={loading} loading={loading}>
            {loading ? "Saving..." : "Mark Attendance"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
};

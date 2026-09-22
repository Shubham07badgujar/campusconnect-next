"use client";

import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore, auth } from "@/lib/client/firebase";
import { useRouter } from "next/navigation";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  FiSearch,
  FiMail,
  FiMessageCircle,
  FiBookOpen,
  FiUsers,
} from "react-icons/fi";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Field, Select, Input } from "@/components/ui/Field";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { PageLoader, EmptyState } from "@/components/ui/States";

function Discussions() {
  const [user] = useAuthState(auth);
  const [userRole, setUserRole] = useState("student");
  const [branches] = useState([
    "Computer Engineering",
    "Electronics And TeleCommunication Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Electrical Engineering",
    "Instrumentation Engineering",
  ]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  useEffect(() => {
    // Check user role
    const checkUserRole = async () => {
      if (user) {
        const token = await user.getIdTokenResult();
        if (token.claims.admin) {
          setUserRole("admin");
          return;
        }
        if (token.claims.teacher) {
          setUserRole("teacher");
          // If user is a teacher, redirect to chat page directly
          router.push("/chat");
        } else {
          setUserRole("student");
        }
      }
    };

    checkUserRole();
  }, [user, router]);

  const dashboardPath =
    userRole === "teacher"
      ? "/teacher-dashboard"
      : userRole === "admin"
        ? "/admin-dashboard"
        : "/student-dashboard";

  const fetchTeachersByBranch = async (branch: any) => {
    setLoading(true);
    try {
      // `teacherDirectory`, not `teachers`: the staff records carry mobile
      // numbers and the login identifier, so students read the projection that
      // holds only directory fields. See src/lib/server/teacher-directory.ts.
      const teachersQuery = query(
        collection(firestore, "teacherDirectory"),
        where("dept", "==", branch),
      );
      const snapshot = await getDocs(teachersQuery);
      const teacherList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTeachers(teacherList);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBranchChange = (e: any) => {
    const branch = e.target.value;
    setSelectedBranch(branch);
    if (branch) {
      fetchTeachersByBranch(branch);
    } else {
      setTeachers([]);
    }
  };

  const handleChatInitiation = (teacher: any) => {
    // Navigate to the chat page with the teacher ID
    router.push(`/chat/${teacher.id}`);
  };

  // Filter teachers by search term
  const filteredTeachers = teachers.filter(
    (teacher) =>
      teacher.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.email.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Connect with Teachers"
        description="Find and chat with faculty members from your department."
      />

      <Card>
        <CardBody className="space-y-5">
          <Field label="Select your department" htmlFor="branch">
            <Select
              id="branch"
              value={selectedBranch}
              onChange={handleBranchChange}
            >
              <option value="">Choose your department...</option>
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </Select>
          </Field>

          {teachers.length > 0 ? (
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                type="text"
                placeholder="Search teachers by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          ) : null}

          {loading ? (
            <PageLoader label="Finding teachers..." />
          ) : filteredTeachers.length > 0 ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FiUsers className="h-4 w-4 text-brand-600" />
                Available Teachers ({filteredTeachers.length})
              </h2>

              <div className="grid gap-3">
                {filteredTeachers.map((teacher) => (
                  <div
                    key={teacher.id}
                    className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition hover:border-brand-200 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <Avatar
                      name={teacher.name}
                      src={teacher.photoURL}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-ink">
                        {teacher.name}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-ink-soft">
                        <FiMail className="h-3.5 w-3.5 shrink-0" />
                        <p className="break-all text-xs sm:text-sm">
                          {teacher.email}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-ink-faint">
                        <FiBookOpen className="h-3.5 w-3.5 shrink-0" />
                        <p className="text-xs sm:text-sm">{selectedBranch}</p>
                      </div>
                    </div>

                    <Button
                      onClick={() => handleChatInitiation(teacher)}
                      className="w-full sm:w-auto"
                    >
                      <FiMessageCircle className="h-4 w-4" />
                      Start Chat
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : selectedBranch ? (
            searchTerm ? (
              <EmptyState
                icon={FiSearch}
                title="No results found"
                description={`No teachers match "${searchTerm}".`}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSearchTerm("")}
                  >
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FiUsers}
                title="No teachers available"
                description={`No teachers found in ${selectedBranch}.`}
              />
            )
          ) : (
            <EmptyState
              icon={FiUsers}
              title="Choose your department"
              description="Select a department above to discover faculty members you can chat with."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default Discussions;

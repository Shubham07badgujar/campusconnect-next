"use client";

import { useRouter } from "next/navigation";
import { auth } from "@/lib/client/firebase";
import { FiMail, FiBook, FiLogOut, FiEdit, FiLock } from "react-icons/fi";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import StatCard from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/States";

const TeacherProfile = ({ userData }: any) => {
  const router = useRouter();
  const assignments =
    Array.isArray(userData?.assignments) && userData.assignments.length > 0
      ? userData.assignments
      : Array.isArray(userData?.assignedCourses)
        ? userData.assignedCourses.map((course: any) => ({
            branch: userData?.department || userData?.dept || "",
            year: course.year,
            subjects: Array.isArray(course.subjects) ? course.subjects : [],
          }))
        : [];

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/login");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Profile"
        description="Manage your professional details and account settings."
        actions={
          <Button onClick={() => router.push("/edit-profile")}>
            <FiEdit className="h-4 w-4" /> Edit Profile
          </Button>
        }
      />

      <Card>
        <CardBody className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <Avatar
            name={userData?.displayName || userData?.name || "Teacher"}
            src={userData?.photoURL}
            size="xl"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-xl font-semibold text-ink">
              {userData?.displayName || userData?.name || "Teacher"}
            </h2>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm text-ink-soft sm:justify-start">
              <FiMail className="h-4 w-4" />
              <span className="break-all">{userData?.email}</span>
            </div>
            <div className="mt-2 flex justify-center sm:justify-start">
              <Badge tone="brand">Teacher Account</Badge>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Professional Details" />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
              <span className="text-sm text-ink-soft">Teacher ID</span>
              <span className="text-sm font-semibold text-ink">
                {userData?.teacherId || userData?.employeeId || "Not assigned"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
              <span className="text-sm text-ink-soft">Department</span>
              <span className="text-sm font-semibold text-ink">
                {userData?.department || userData?.dept || "Not assigned"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
              <span className="text-sm text-ink-soft">Job Profile</span>
              <span className="text-sm font-semibold text-ink">
                {userData?.jobProfile || "Not assigned"}
              </span>
            </div>
            <StatCard
              label="Total Courses"
              value={assignments.length}
              icon={FiBook}
              tone="brand"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Assigned Courses" />
          <CardBody>
            {assignments.length > 0 ? (
              <div className="cc-scroll max-h-80 space-y-3 overflow-y-auto">
                {assignments.map((course: any, idx: any) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-line bg-canvas p-3"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
                        {course.year}
                      </span>
                      <h3 className="font-semibold text-ink">
                        {course.branch || "Branch"} - Year {course.year}
                      </h3>
                    </div>
                    <div className="space-y-1.5 pl-12">
                      {course.subjects.map((subject: any, sidx: any) => (
                        <div
                          key={sidx}
                          className="flex items-center gap-2 text-sm text-ink-soft"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                          <span>{subject}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={FiBook}
                title="No courses assigned"
                description="Courses assigned to you will appear here."
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Quick Actions" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push("/edit-profile")}
          >
            <FiEdit className="h-4 w-4" /> Edit Profile
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push("/change-password")}
          >
            <FiLock className="h-4 w-4" /> Change Password
          </Button>
          <Button variant="danger" fullWidth onClick={handleLogout}>
            <FiLogOut className="h-4 w-4" /> Logout
          </Button>
        </CardBody>
      </Card>
    </div>
  );
};

export default TeacherProfile;

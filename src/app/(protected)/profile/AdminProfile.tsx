"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  FiMail,
  FiCheckCircle,
  FiUsers,
  FiUserCheck,
  FiBookOpen,
  FiBell,
  FiSettings,
  FiEdit,
  FiLock,
  FiArrowLeft,
} from "react-icons/fi";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

const AdminProfile = ({ userData }: any) => {
  const router = useRouter();

  const permissions = [
    {
      icon: FiUsers,
      label: "User Management",
      description: "Manage students and accounts",
    },
    {
      icon: FiUserCheck,
      label: "Teacher Management",
      description: "Oversee faculty members",
    },
    {
      icon: FiBookOpen,
      label: "Course Management",
      description: "Handle curriculum & subjects",
    },
    {
      icon: FiBell,
      label: "Announcements",
      description: "Broadcast important updates",
    },
    {
      icon: FiSettings,
      label: "System Configuration",
      description: "Configure platform settings",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Profile"
        description="System administrator account and permissions."
        actions={
          <Button onClick={() => router.push("/edit-profile")}>
            <FiEdit className="h-4 w-4" /> Edit Profile
          </Button>
        }
      />

      <Card>
        <CardBody className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <Avatar
            name={userData?.displayName || userData?.name || "Administrator"}
            src={userData?.photoURL}
            size="xl"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-xl font-semibold text-ink">
              {userData?.displayName || userData?.name || "Administrator"}
            </h2>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm text-ink-soft sm:justify-start">
              <FiMail className="h-4 w-4" />
              <span className="break-all">{userData?.email}</span>
            </div>
            <div className="mt-2 flex justify-center sm:justify-start">
              <Badge tone="brand">System Administrator</Badge>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Admin Details" />
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
              <span className="text-sm text-ink-soft">Admin ID</span>
              <span className="text-sm font-semibold text-ink">
                {userData?.adminId || "ADMIN-001"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-canvas p-3">
              <span className="text-sm text-ink-soft">Role</span>
              <span className="text-sm font-semibold text-ink">
                System Administrator
              </span>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="mb-1 flex items-center gap-2 text-success">
                <FiCheckCircle className="h-4 w-4" />
                <span className="text-sm font-semibold">Full Access Granted</span>
              </div>
              <div className="text-sm text-ink-soft">
                All system permissions active
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Permissions" />
          <CardBody>
            <div className="cc-scroll max-h-80 space-y-3 overflow-y-auto">
              {permissions.map((perm, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-3"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                    <perm.icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink">
                      {perm.label}
                    </div>
                    <div className="text-xs text-ink-soft">
                      {perm.description}
                    </div>
                  </div>
                  <FiCheckCircle className="h-4 w-4 flex-shrink-0 text-success" />
                </div>
              ))}
            </div>
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
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push("/admin-dashboard")}
          >
            <FiArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
        </CardBody>
      </Card>
    </div>
  );
};

export default AdminProfile;

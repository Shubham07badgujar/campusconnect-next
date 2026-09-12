"use client";
import React, { useEffect, useState } from "react";
import { Bell, Database, Lock, User } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import { auth, firestore } from "@/lib/client/firebase";
import {
  getAttendanceSettings,
  updateAttendanceSettings,
} from "@/lib/client/attendanceService";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { PageLoader } from "@/components/ui/States";

const AdminSettings = () => {
  const [activeTab, setActiveTab] = useState("profile");
  const [adminData, setAdminData] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [attendanceSettings, setAttendanceSettings] = useState({
    distanceEnforcementDefault: false,
  });
  const [attendanceSettingsLoading, setAttendanceSettingsLoading] =
    useState(true);
  const [attendanceSettingsSaving, setAttendanceSettingsSaving] =
    useState(false);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        setIsLoading(true);
        const user = auth.currentUser;

        if (!user) {
          setAttendanceSettingsLoading(false);
          return;
        }

        const [docSnap, settingsResult] = await Promise.all([
          getDoc(doc(firestore, "users", user.uid)),
          getAttendanceSettings().catch(() => null),
        ]);

        if (docSnap.exists()) {
          setAdminData(docSnap.data());
        }

        const defaultSetting =
          settingsResult?.settings?.distanceEnforcementDefault;
        if (typeof defaultSetting === "boolean") {
          setAttendanceSettings({
            distanceEnforcementDefault: defaultSetting,
          });
        }
      } catch (error) {
        console.error("Error fetching admin data:", error);
        toast.error("Failed to load admin settings.");
      } finally {
        setAttendanceSettingsLoading(false);
        setIsLoading(false);
      }
    };

    fetchAdminData();
  }, []);

  const handleDistanceEnforcementToggle = async (event) => {
    const nextValue = Boolean(event.target.checked);
    const previousValue = attendanceSettings.distanceEnforcementDefault;

    setAttendanceSettings((prev) => ({
      ...prev,
      distanceEnforcementDefault: nextValue,
    }));
    setAttendanceSettingsSaving(true);

    try {
      await updateAttendanceSettings({
        distanceEnforcementDefault: nextValue,
      });
      toast.success("Attendance location enforcement updated.");
    } catch (error) {
      setAttendanceSettings((prev) => ({
        ...prev,
        distanceEnforcementDefault: previousValue,
      }));
      toast.error(error.message || "Failed to update attendance setting.");
    } finally {
      setAttendanceSettingsSaving(false);
    }
  };

  const tabs = [
    { value: "profile", label: "Profile Settings", icon: User },
    { value: "security", label: "Security", icon: Lock },
    { value: "notifications", label: "Notifications", icon: Bell },
    { value: "system", label: "System Settings", icon: Database },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Settings"
        description="Configure your administrative settings and preferences"
      />

      <Tabs
        items={tabs.map((tab) => {
          const Icon = tab.icon;
          return {
            value: tab.value,
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Icon className="h-4 w-4" />
                {tab.label}
              </span>
            ),
          };
        })}
        value={activeTab}
        onChange={setActiveTab}
      />

      {isLoading ? (
        <Card>
          <CardBody>
            <PageLoader label="Loading settings..." />
          </CardBody>
        </Card>
      ) : (
        <>
          {activeTab === "profile" && (
            <Card>
              <CardHeader
                title="Profile Settings"
                description="Your administrator account details"
              />
              <CardBody>
                <div className="rounded-xl border border-line bg-slate-50/60 p-4">
                  <h3 className="mb-3 font-medium text-ink">
                    Admin Information
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm text-ink-faint">Name</p>
                      <p className="font-medium text-ink">
                        {adminData.name || "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-faint">Email</p>
                      <p className="font-medium text-ink">
                        {adminData.email || "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-faint">Role</p>
                      <p className="font-medium text-ink">
                        {adminData.role || "Admin"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {activeTab === "security" && (
            <Card>
              <CardHeader
                title="Security Settings"
                description="Manage your account security settings and preferences"
              />
              <CardBody>
                <div className="rounded-xl border border-line bg-slate-50/60 p-4">
                  <p className="text-sm text-ink-soft">
                    Security settings will be implemented soon
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {activeTab === "notifications" && (
            <Card>
              <CardHeader
                title="Notification Preferences"
                description="Manage how you receive notifications from the system"
              />
              <CardBody>
                <div className="rounded-xl border border-line bg-slate-50/60 p-4">
                  <p className="text-sm text-ink-soft">
                    Notification settings will be implemented soon
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {activeTab === "system" && (
            <Card>
              <CardHeader
                title="System Settings"
                description="Configure global system settings"
              />
              <CardBody>
                <div className="rounded-xl border border-line bg-slate-50/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        Enforce Student Location Radius By Default
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">
                        When enabled, new attendance sessions require students to
                        be within the configured radius unless the teacher
                        disables it for that specific session.
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-3">
                      <span className="text-xs font-medium text-ink-soft">
                        {attendanceSettings.distanceEnforcementDefault
                          ? "ON"
                          : "OFF"}
                      </span>
                      <span className="relative inline-flex">
                        <input
                          type="checkbox"
                          checked={
                            attendanceSettings.distanceEnforcementDefault
                          }
                          onChange={handleDistanceEnforcementToggle}
                          disabled={
                            attendanceSettingsLoading ||
                            attendanceSettingsSaving
                          }
                          className="peer sr-only"
                        />
                        <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600 peer-disabled:opacity-50" />
                        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                  </div>

                  {attendanceSettingsSaving ? (
                    <p className="mt-2 text-xs text-ink-faint">
                      Saving setting...
                    </p>
                  ) : null}

                  {attendanceSettingsLoading ? (
                    <p className="mt-2 text-xs text-ink-faint">
                      Loading setting...
                    </p>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default AdminSettings;

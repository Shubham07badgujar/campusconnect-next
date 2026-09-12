"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, firestore } from "@/lib/client/firebase";
import { doc, getDoc } from "firebase/firestore";
import StudentProfile from "@/components/student/StudentProfile";
import TeacherProfile from "./TeacherProfile";
import AdminProfile from "./AdminProfile";
import { PageLoader } from "@/components/ui/States";

function Profile() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userRole, setUserRole] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        router.push("/login");
        return;
      }

      try {
        // Get user claims to determine role
        await currentUser.reload();
        const tokenResult = await currentUser.getIdTokenResult(true);
        const claims = tokenResult.claims;

        setUser(currentUser);

        // Determine user role and fetch appropriate data
        if (claims.admin) {
          setUserRole("admin");
          const adminDoc = await getDoc(
            doc(firestore, "admins", currentUser.uid),
          );
          if (adminDoc.exists()) {
            setUserData({ ...adminDoc.data(), ...currentUser });
          } else {
            setUserData(currentUser);
          }
        } else if (claims.teacher) {
          setUserRole("teacher");
          const teacherDoc = await getDoc(
            doc(firestore, "teachers", currentUser.uid),
          );
          if (teacherDoc.exists()) {
            setUserData({ ...teacherDoc.data(), ...currentUser });
          } else {
            setUserData(currentUser);
          }
        } else {
          setUserRole("student");
          // Try users collection first (where admin creates students)
          const userDoc = await getDoc(
            doc(firestore, "users", currentUser.uid),
          );
          if (userDoc.exists()) {
            const data = userDoc.data();
            // Normalize field names (rollNo -> rollNumber)
            setUserData({
              ...data,
              displayName: data.name || currentUser.displayName || "Student",
              rollNumber: data.rollNumber || data.rollNo || "",
              dept: data.dept || data.department || "",
              year: data.year || "",
              semester: data.semester || "",
              email: currentUser.email,
              photoURL: data.photoURL || currentUser.photoURL || "",
            });
          } else {
            // Fallback to students collection
            const studentDoc = await getDoc(
              doc(firestore, "students", currentUser.uid),
            );
            if (studentDoc.exists()) {
              const data = studentDoc.data();
              setUserData({
                ...data,
                displayName: data.name || currentUser.displayName || "Student",
                rollNumber: data.rollNumber || data.rollNo || "",
                dept: data.dept || data.department || "",
                year: data.year || "",
                semester: data.semester || "",
                email: currentUser.email,
                photoURL: data.photoURL || currentUser.photoURL || "",
              });
            } else {
              // No Firestore doc found, use Auth data only
              setUserData({
                displayName: currentUser.displayName || "Student",
                email: currentUser.email,
                photoURL: currentUser.photoURL || "",
                rollNumber: "",
                dept: "",
                year: "",
                semester: "",
              });
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return <PageLoader label="Loading your profile..." />;
  }

  return (
    <div className="animate-fade-up">
      {userRole === "student" && <StudentProfile userData={userData} />}
      {userRole === "teacher" && <TeacherProfile userData={userData} />}
      {userRole === "admin" && <AdminProfile userData={userData} />}
    </div>
  );
}

export default Profile;

"use client";

import { useEffect, useState } from "react";
import { auth, firestore } from "@/lib/client/firebase";
import { useRouter } from "next/navigation";
import { updateProfile } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { FiImage, FiSave, FiUpload } from "react-icons/fi";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";

const API_URL = "";

const buildRequestError = (response: any, rawText = "") => {
  const text = String(rawText || "").trim();
  if (text.startsWith("<")) {
    return `Server returned HTML instead of JSON (HTTP ${response.status}). Check VITE_API_URL and backend deployment.`;
  }

  return (
    text ||
    `Request failed with status ${response.status}${response.statusText ? ` (${response.statusText})` : ""}.`
  );
};

const parseJsonResponse = async (response: any) => {
  const rawText = await response.text();
  let data: any = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(buildRequestError(response, rawText));
    }
  }

  if (!response.ok) {
    throw new Error(data.message || buildRequestError(response, rawText));
  }

  return data;
};

const fetchWithNetworkHint = async (url: any, options: any) => {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(
      `Unable to reach backend at ${API_URL}. Check deployment env VITE_API_URL and backend availability.`,
    );
  }
};

function EditProfile() {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<any>(null);
  const [name, setName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [photoFile, setPhotoFile] = useState<any>(null);
  const [photoPreview, setPhotoPreview] = useState<any>("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  // Student fields
  const [rollNumber, setRollNumber] = useState("");
  const [dept, setDept] = useState("");
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("");

  // Teacher fields
  const [employeeId, setEmployeeId] = useState("");

  const router = useRouter();

  const departments = [
    "Computer Engineering",
    "Electronics And TeleCommunication Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Electrical Engineering",
    "Instrumentation Engineering",
  ];

  const years = ["1st", "2nd", "3rd", "4th"];
  const semesters = ["1", "2", "3", "4", "5", "6", "7", "8"];

  useEffect(() => {
    const fetchUserData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        router.push("/login");
        return;
      }

      try {
        await currentUser.reload();
        const tokenResult = await currentUser.getIdTokenResult(true);
        const claims = tokenResult.claims;

        setUser(currentUser);
        setName(currentUser.displayName || "");
        setPhotoURL(currentUser.photoURL || "");
        setPhotoPreview(currentUser.photoURL || "");

        // Fetch user data from Firestore based on role
        if (claims.admin) {
          setUserRole("admin");
        } else if (claims.teacher) {
          setUserRole("teacher");
          const teacherDoc = await getDoc(
            doc(firestore, "teachers", currentUser.uid),
          );
          if (teacherDoc.exists()) {
            const data = teacherDoc.data();
            setEmployeeId(data.employeeId || "");
            setDept(data.dept || "");
          }
        } else {
          setUserRole("student");
          // Try users collection first (most common)
          const userDoc = await getDoc(
            doc(firestore, "users", currentUser.uid),
          );
          if (userDoc.exists()) {
            const data = userDoc.data();
            console.log("User data from users collection:", data);
            setRollNumber(data.rollNumber || data.rollNo || "");
            setDept(data.dept || data.department || "");
            setYear(data.year || "");
            setSemester(data.semester || "");
          } else {
            // Fallback to students collection
            const studentDoc = await getDoc(
              doc(firestore, "students", currentUser.uid),
            );
            if (studentDoc.exists()) {
              const data = studentDoc.data();
              console.log("User data from students collection:", data);
              setRollNumber(data.rollNumber || data.rollNo || "");
              setDept(data.dept || data.department || "");
              setYear(data.year || "");
              setSemester(data.semester || "");
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, [router]);

  const handleFileChange = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("Image exceeds 10MB upload limit. Please choose a smaller file.");
        return;
      }

      setPhotoFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadToCloudinary = async () => {
    if (!photoFile) return photoURL;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", photoFile);

    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetchWithNetworkHint(
        `${API_URL}/api/upload-profile`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
          body: formData,
        },
      );
      const data = await parseJsonResponse(response);
      return String(data.url || "").trim() || photoURL;
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload image. Please try again.");
      return photoURL;
    } finally {
      setUploading(false);
    }
  };

  const handleUpdate = async (e: any) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Upload photo if new file selected
      let finalPhotoURL = photoURL;
      if (photoFile) {
        finalPhotoURL = await uploadToCloudinary();
        if (!finalPhotoURL) {
          setLoading(false);
          return;
        }
      }

      // Update Firebase Auth profile
      await updateProfile(auth.currentUser, {
        displayName: name,
        photoURL: finalPhotoURL,
      });

      // Update Firestore based on role
      if (userRole === "student") {
        // Update users collection (primary) - only name and photo (academic fields are read-only)
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnapshot = await getDoc(userDocRef);

        if (userDocSnapshot.exists()) {
          await updateDoc(userDocRef, {
            name: name,
            displayName: name,
            photoURL: finalPhotoURL,
          });
        }

        // Also try to update students collection if it exists
        const studentDocRef = doc(firestore, "students", user.uid);
        const studentDoc = await getDoc(studentDocRef);
        if (studentDoc.exists()) {
          await updateDoc(studentDocRef, {
            name: name,
            displayName: name,
            photoURL: finalPhotoURL,
          });
        }
      } else if (userRole === "teacher") {
        const teacherDocRef = doc(firestore, "teachers", user.uid);
        await updateDoc(teacherDocRef, {
          name: name,
          displayName: name,
          photoURL: finalPhotoURL,
          employeeId: employeeId,
          dept: dept,
        });
      }

      // Reload user data
      await auth.currentUser.reload();
      const updatedUser = auth.currentUser;

      setUser(updatedUser);
      setName(updatedUser.displayName || "");
      setPhotoURL(updatedUser.photoURL || "");

      setLoading(false);
      alert("Profile updated successfully!");
      router.push("/profile");
    } catch (error) {
      console.error("Profile update error:", error);
      alert("Failed to update profile. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-up space-y-6">
      <PageHeader
        title="Edit Your Profile"
        description="Update your personal information and profile picture."
      />

      <form onSubmit={handleUpdate} className="space-y-6">
        <Card>
          <CardHeader title="Profile Picture" />
          <CardBody>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
              {photoPreview ? (
                <Avatar name={name} src={photoPreview} size="xl" />
              ) : (
                <Avatar name={name} size="xl" />
              )}
              <label className="w-full flex-1 cursor-pointer">
                <div className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-4 py-5 transition hover:border-brand-500 hover:bg-brand-50/40">
                  <FiUpload className="h-6 w-6 text-ink-faint" />
                  <span className="text-sm text-ink-soft">
                    {photoFile ? photoFile.name : "Click to upload image"}
                  </span>
                  <span className="text-xs text-ink-faint">
                    JPG, PNG or GIF (Max 5MB)
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
              <FiImage className="h-3.5 w-3.5" />
              Tip: use a square image (1:1 ratio) for best results.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Account Information" />
          <CardBody className="space-y-5">
            <Field label="Full Name" htmlFor="name" required>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                required
              />
            </Field>

            {userRole === "student" && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-2 text-sm text-amber-700">
                    <span>⚠️</span>
                    Academic information is managed by administrators and cannot
                    be edited.
                  </p>
                </div>

                <Field
                  label="Roll Number"
                  htmlFor="rollNumber"
                  hint="Read-only"
                >
                  <Input
                    id="rollNumber"
                    type="text"
                    value={rollNumber || "Not assigned"}
                    readOnly
                    disabled
                  />
                </Field>

                <Field label="Department" htmlFor="studentDept" hint="Read-only">
                  <Input
                    id="studentDept"
                    type="text"
                    value={dept || "Not assigned"}
                    readOnly
                    disabled
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Year" htmlFor="year" hint="Read-only">
                    <Input
                      id="year"
                      type="text"
                      value={year ? `${year} Year` : "Not assigned"}
                      readOnly
                      disabled
                    />
                  </Field>

                  <Field label="Semester" htmlFor="semester" hint="Read-only">
                    <Input
                      id="semester"
                      type="text"
                      value={semester ? `Semester ${semester}` : "Not assigned"}
                      readOnly
                      disabled
                    />
                  </Field>
                </div>
              </>
            )}

            {userRole === "teacher" && (
              <>
                <Field label="Employee ID" htmlFor="employeeId">
                  <Input
                    id="employeeId"
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="Enter your employee ID"
                  />
                </Field>

                <Field label="Department" htmlFor="teacherDept">
                  <Select
                    id="teacherDept"
                    value={dept}
                    onChange={(e) => setDept(e.target.value)}
                  >
                    <option value="">Select Department</option>
                    {departments.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/profile")}
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading || uploading}>
            <FiSave className="h-4 w-4" />
            {uploading ? "Uploading..." : loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default EditProfile;

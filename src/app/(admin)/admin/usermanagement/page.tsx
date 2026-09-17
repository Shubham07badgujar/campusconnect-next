"use client";
import React, { useEffect, useState } from "react";
import { collection, getDocs, doc, deleteDoc, getDoc } from "firebase/firestore";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/States";
import { firestore, auth } from "@/lib/client/firebase";
import { FiRefreshCw, FiArrowLeft, FiEdit3 } from "react-icons/fi";
import { useRouter } from "next/navigation";

const roles = ["Student"];
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

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    rollNo: "",
    role: "Student",
    dept: "",
    year: "",
    semester: "",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      console.log("Starting fetchUsers...");
      const usersCollection = collection(firestore, "users");
      console.log("Collection reference created");

      const querySnapshot = await getDocs(usersCollection);
      console.log("Query snapshot received:", querySnapshot.size, "documents");

      const userList = [];
      const validIds = new Set();

      querySnapshot.forEach((docSnap) => {
        console.log("Processing document:", {
          id: docSnap.id,
          exists: docSnap.exists(),
          data: docSnap.data(),
        });

        if (docSnap.exists()) {
          validIds.add(docSnap.id);
          const userData = { id: docSnap.id, ...(docSnap.data() as any) };
          console.log("Adding user to list:", userData);
          userList.push(userData);
        }
      });

      console.log("Final user list:", userList);
      console.log("Valid IDs:", Array.from(validIds));

      // Update state with the new user list
      setUsers(userList);
      setFilteredUsers(userList);
      setError("");

      if (userList.length === 0) {
        console.log("No users found in Firestore");
        setError("No users found in the database");
      }
    } catch (error) {
      console.error("Error in fetchUsers:", error);
      setError("Failed to fetch users: " + error.message);
      // Reset states in case of error
      setUsers([]);
      setFilteredUsers([]);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const filtered = users.filter(
      (user) =>
        user.name?.toLowerCase()?.includes(search.toLowerCase()) ||
        user.rollNo?.includes(search) ||
        user.email?.toLowerCase()?.includes(search.toLowerCase()),
    );
    setFilteredUsers(filtered);
  }, [search, users]);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleEdit = (user) => {
    console.log("Starting handleEdit with user:", {
      id: user?.id,
      name: user?.name,
      email: user?.email,
      uid: user?.uid,
    });

    if (!user || !user.id) {
      console.error("Invalid user data for editing:", user);
      setError("Invalid user data for editing");
      return;
    }

    // Set the form data immediately for better UX
    setFormData(user);
    setIsEditing(true);
    setEditId(user.id);
    setShowForm(true);
    setError("");

    // Verify the user exists in Firestore in the background
    const userDocRef = doc(firestore, "users", user.id);
    console.log("Checking Firestore for document:", user.id);

    getDoc(userDocRef)
      .then((docSnap) => {
        console.log("Document check result:", {
          exists: docSnap.exists(),
          id: docSnap.id,
          data: docSnap.data(),
        });

        if (!docSnap.exists()) {
          console.warn("User not found in database. Details:", {
            requestedId: user.id,
            currentUsers: users.map((u) => ({ id: u.id, name: u.name })),
          });

          // Check if the user exists in our current state
          const userInState = users.find((u) => u.id === user.id);
          if (!userInState) {
            console.error("User not found in both Firestore and local state");
            setError("User not found in database. Please refresh the page.");
            setIsEditing(false);
            setShowForm(false);
            return;
          }

          setError(
            "Warning: User not found in database. Changes may not be saved.",
          );
        }
      })
      .catch((error) => {
        console.error("Error checking user existence:", error);
        setError("Error checking user existence: " + error.message);
        setIsEditing(false);
        setShowForm(false);
      });
  };

  const handleSubmit = async (event?: { preventDefault?: () => void }) => {
    // Previously this called the deprecated global `window.event`, which is
    // undefined outside Chrome's legacy behaviour.
    event?.preventDefault?.();
    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      // Validate email
      if (!validateEmail(formData.email)) {
        throw new Error("Please enter a valid email address");
      }
      if (
        !formData.rollNo ||
        !formData.dept ||
        !formData.year ||
        !formData.semester
      ) {
        throw new Error(
          "Please fill all required fields including year and semester.",
        );
      }

      if (isEditing && editId) {
        // Goes through the server so the student's subjects are recomputed for
        // their (possibly changed) branch/year/semester, both the users and
        // students documents stay in step, and the Firebase Auth account
        // follows an email change. Editing Firestore directly from here used
        // to leave a moved student carrying their previous year's subjects,
        // silently excluding them from their new class's attendance.
        const idToken = await auth.currentUser.getIdToken();

        const response = await fetch("/api/users", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            uid: editId,
            name: formData.name,
            email: formData.email,
            rollNo: formData.rollNo,
            dept: formData.dept,
            year: formData.year,
            semester: formData.semester,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Failed to update student.");
        }

        setSuccess(data.message || "User updated successfully!");
      } else {
        // Password is generated securely on the server and emailed to the student
        const idToken = await auth.currentUser.getIdToken();

        // ONLY CALL BACKEND
        const response = await fetch(
          `${
            ""
          }/api/users`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },

            body: JSON.stringify({
              name: formData.name,
              email: formData.email,
              rollNo: formData.rollNo,
              dept: formData.dept,
              role: formData.role,
              year: formData.year,
              semester: formData.semester,
            }),
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to create user.");
        }

        setSuccess("User created successfully! Credentials sent to email.");
      }

      // Reset form and fetch updated users
      setFormData({
        name: "",
        email: "",
        rollNo: "",
        role: "Student",
        dept: "",
        year: "",
        semester: "",
      });
      setIsEditing(false);
      setEditId(null);
      setShowForm(false);
      await fetchUsers();
    } catch (error) {
      console.error("Error in handleSubmit:", error);
      setError("Error: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id) {
      setError("Invalid user ID");
      return;
    }

    if (window.confirm("Are you sure you want to delete this user?")) {
      try {
        console.log("Starting delete process for user ID:", id);

        // First get the user document to get the uid
        const userDocRef = doc(firestore, "users", id);
        const userDoc = await getDoc(userDocRef);

        console.log("Firestore document check:", {
          exists: userDoc.exists(),
          id: userDoc.id,
          data: userDoc.data(),
        });

        if (!userDoc.exists()) {
          console.log(
            "Document doesn't exist in Firestore, removing from UI only",
          );
          setUsers((prevUsers) => prevUsers.filter((u) => u.id !== id));
          setFilteredUsers((prevFiltered) =>
            prevFiltered.filter((u) => u.id !== id),
          );
          setSuccess("User removed from UI (was not found in database)");
          return;
        }

        const userData = userDoc.data();
        console.log("User data to be deleted:", userData);

        // Delete from Firestore
        await deleteDoc(userDocRef);
        console.log("Successfully deleted from Firestore");

        // Try to delete from Firebase Auth if uid exists
        if (userData.uid) {
          try {
            console.log(
              "Attempting to delete from Firebase Auth with UID:",
              userData.uid,
            );
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(
              `${
                ""
              }/api/users/delete`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ uid: userData.uid }),
              },
            );

            if (!response.ok) {
              const errorData = await response.json();
              console.warn(
                "Could not delete from Firebase Auth:",
                errorData.error || "API endpoint not available",
              );
              setError(
                "User deleted from Firestore but could not delete from Firebase Auth",
              );
            } else {
              console.log("Successfully deleted from Firebase Auth");
              setSuccess(
                "User deleted successfully from both Firestore and Firebase Auth!",
              );
            }
          } catch (authError) {
            console.warn("Could not connect to delete API:", authError.message);
            setError(
              "User deleted from Firestore but could not connect to Firebase Auth API",
            );
          }
        } else {
          console.warn(
            "No UID found in user document, skipping Firebase Auth deletion",
          );
          setSuccess("User deleted successfully from Firestore!");
        }

        // Update UI state
        setUsers((prevUsers) => prevUsers.filter((u) => u.id !== id));
        setFilteredUsers((prevFiltered) =>
          prevFiltered.filter((u) => u.id !== id),
        );

        // Force a refresh of the data from Firestore
        await fetchUsers();
      } catch (error) {
        console.error("Detailed delete error:", error);
        setError(`Failed to delete user: ${error.message}`);
      }
    }
  };

  const router = useRouter();

  // Group users by department for department-wise cards
  const usersByDept = departments.reduce((acc, dept) => {
    acc[dept] = filteredUsers.filter(
      (u) => (u.dept || "").trim().toLowerCase() === dept.trim().toLowerCase(),
    );
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Management"
        description="Create, edit, and organise students by department."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push("/admin-dashboard")}
          >
            <FiArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <Input
            type="text"
            placeholder="Search by name, email, or roll number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={fetchUsers}>
            <FiRefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Close" : "Add User"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push("/admin/bulk-academic-update")}
          >
            <FiEdit3 className="h-4 w-4" />
            Bulk Academic Update
          </Button>
        </div>
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={isEditing ? "Edit Student" : "Add Student"}
        description="Credentials are generated on the server and emailed to the student."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={isLoading}
              disabled={isLoading}
            >
              {isLoading
                ? "Processing..."
                : isEditing
                  ? "Update User"
                  : "Add User"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {["name", "email", "rollNo"].map((field) => (
            <Field
              key={field}
              label={
                field === "rollNo"
                  ? "Roll Number"
                  : field.charAt(0).toUpperCase() + field.slice(1)
              }
              required
            >
              <Input
                type={field === "email" ? "email" : "text"}
                placeholder={
                  field === "rollNo"
                    ? "Roll Number"
                    : field.charAt(0).toUpperCase() + field.slice(1)
                }
                value={formData[field]}
                onChange={(e) =>
                  setFormData({ ...formData, [field]: e.target.value })
                }
                required
              />
            </Field>
          ))}
          <Field label="Role" required>
            <Select
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value })
              }
              required
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department" required>
            <Select
              value={formData.dept}
              onChange={(e) =>
                setFormData({ ...formData, dept: e.target.value })
              }
              required
            >
              <option value="">Select Department</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year" required>
            <Select
              value={formData.year}
              onChange={(e) =>
                setFormData({ ...formData, year: e.target.value })
              }
              required
            >
              <option value="">Select Year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y} Year
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Semester" required>
            <Select
              value={formData.semester}
              onChange={(e) =>
                setFormData({ ...formData, semester: e.target.value })
              }
              required
            >
              <option value="">Select Semester</option>
              {semesters.map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Department-wise Cards UI */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {departments.map((dept) => (
          <Card key={dept} className="animate-fade-up flex flex-col">
            <CardHeader
              title={dept}
              actions={
                <Badge tone="brand">{usersByDept[dept].length} students</Badge>
              }
            />
            <CardBody>
              {usersByDept[dept].length === 0 ? (
                <EmptyState
                  title="No students yet"
                  description="No students in this department."
                />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Name</TH>
                        <TH>Email</TH>
                        <TH>Roll No.</TH>
                        <TH className="text-center">Actions</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {usersByDept[dept].map((user) => (
                        <TR key={user.id}>
                          <TD className="whitespace-nowrap font-medium text-ink">
                            {user.name}
                          </TD>
                          <TD className="whitespace-nowrap">{user.email}</TD>
                          <TD className="whitespace-nowrap">{user.rollNo}</TD>
                          <TD>
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleEdit(user)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDelete(user.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default UserManagement;

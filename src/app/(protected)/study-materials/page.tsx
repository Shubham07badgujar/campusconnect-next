"use client";

import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  addDoc,
  deleteDoc,
  doc,
  orderBy,
} from "firebase/firestore";
import { firestore as db, auth } from "@/lib/client/firebase"; // Remove storage import
import { useAuthState } from "react-firebase-hooks/auth";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { FiFilter, FiDownload } from "react-icons/fi";
import axios from "axios";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { SkeletonCards, EmptyState } from "@/components/ui/States";

const API_URL = "";

const StudyMaterials = () => {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("notes");
  const [courseId, setCourseId] = useState("");
  const [courses, setCourses] = useState<any[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [user] = useAuthState(auth);
  const [isTeacher, setIsTeacher] = useState(false);
  const router = useRouter();

  // Added for branch filtering
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Check if user is a teacher and get user department
  useEffect(() => {
    const getUserInfo = async () => {
      if (user) {
        try {
          // Read our OWN profile document, by id. Both collections are
          // readable by the person they describe (and by staff), but the
          // where("uid", "==", ...) scan this used to do is not something the
          // rules can authorise — it threw for every student, which also
          // skipped the fetchBranches() call below and left the branch filter
          // permanently empty for them.
          const teacherDoc = await getDoc(doc(db, "teachers", user.uid));
          const isUserTeacher = teacherDoc.exists();
          setIsTeacher(isUserTeacher);

          const profileSnap = isUserTeacher
            ? teacherDoc
            : await getDoc(doc(db, "students", user.uid));
          const profile: any = profileSnap.exists() ? profileSnap.data() : {};
          const department = profile.department || profile.dept || "";
          setUserDepartment(department);
          setSelectedBranch(department);

          // Fetch branches
          await fetchBranches();
        } catch (error) {
          console.error("Error getting user info:", error);
        }
      }
    };

    getUserInfo();
  }, [user]);

  // Fetch all branches/departments
  const fetchBranches = async () => {
    try {
      const deptRef = collection(db, "departments");
      const snapshot = await getDocs(deptRef);

      if (snapshot.empty) {
        // Use mock data if no departments found
        const mockBranches = [
          "Computer Engineering",
          "Mechanical Engineering",
          "Electrical Engineering",
        ];
        setBranches(mockBranches);
      } else {
        const branchList = snapshot.docs.map((doc) => doc.data().name);
        setBranches(branchList);
      }
    } catch (error) {
      console.error("Error fetching branches:", error);
      // Mock data as fallback
      const mockBranches = [
        "Computer Engineering",
        "Mechanical Engineering",
        "Electrical Engineering",
      ];
      setBranches(mockBranches);
    }
  };

  // Fetch subjects when branch changes
  useEffect(() => {
    const fetchSubjectsForBranch = async () => {
      if (!selectedBranch) return;

      try {
        const deptRef = collection(db, "departments");
        const q = query(deptRef, where("name", "==", selectedBranch));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const deptData = snapshot.docs[0].data();
          setSubjects(deptData.subjects || []);
          if (deptData.subjects && deptData.subjects.length > 0) {
            setSelectedSubject("");
          }
        } else {
          // Mock data if department not found
          const mockSubjects = [
            "Data Structures",
            "Algorithms",
            "Database Management",
            "Computer Networks",
          ];
          setSubjects(mockSubjects);
        }
      } catch (error) {
        console.error("Error fetching subjects:", error);
        // Mock subjects as fallback
        const mockSubjects = [
          "Programming Fundamentals",
          "Data Structures",
          "Algorithms",
        ];
        setSubjects(mockSubjects);
      }
    };

    if (selectedBranch) {
      fetchSubjectsForBranch();
    }
  }, [selectedBranch]);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        // Try to fetch courses from Firestore
        const coursesCollection = collection(db, "courses");
        const coursesSnapshot = await getDocs(coursesCollection);
        const coursesList = coursesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // If we have courses from Firestore, use them
        if (coursesList.length > 0) {
          setCourses(coursesList);
          setCourseId(coursesList[0].id);
        }
        // If no courses in Firestore, use mock data
        else {
          const mockCourses = [
            { id: "cs101", name: "Introduction to Programming" },
            { id: "cs201", name: "Data Structures and Algorithms" },
            { id: "cs301", name: "Database Management" },
            { id: "cs401", name: "Computer Networks" },
          ];
          setCourses(mockCourses);
          setCourseId(mockCourses[0].id);
        }
      } catch (error) {
        console.error("Error fetching courses:", error);
        toast.error("Failed to load courses, using mock data");

        // In case of error, still show some mock courses
        const mockCourses = [
          { id: "cs101", name: "Introduction to Programming" },
          { id: "cs201", name: "Data Structures and Algorithms" },
          { id: "cs301", name: "Database Management" },
          { id: "cs401", name: "Computer Networks" },
        ];
        setCourses(mockCourses);
        setCourseId(mockCourses[0].id);
      }
    };

    fetchCourses();
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [selectedBranch, selectedSubject]);

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      let materialsQuery;

      // Build query based on filters
      if (selectedBranch && selectedSubject) {
        // Filter by branch and subject
        materialsQuery = query(
          collection(db, "studyMaterials"),
          where("department", "==", selectedBranch),
          where("subject", "==", selectedSubject),
          orderBy("createdAt", "desc"),
        );
      } else if (selectedBranch) {
        // Filter by branch only
        materialsQuery = query(
          collection(db, "studyMaterials"),
          where("department", "==", selectedBranch),
          orderBy("createdAt", "desc"),
        );
      } else {
        // No filter, get all materials
        materialsQuery = query(
          collection(db, "studyMaterials"),
          orderBy("createdAt", "desc"),
        );
      }

      const materialsSnapshot = await getDocs(materialsQuery);
      const materialsList = materialsSnapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setMaterials(materialsList);
    } catch (error) {
      console.error("Error fetching study materials:", error);
      toast.error("Failed to load study materials");
      setMaterials([]); // Show empty state instead of mock data
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: any) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: any) => {
    // Previous upload functionality remains the same
    // ...
  };

  const handleDelete = async (materialId: any, cloudinaryPublicId: any) => {
    if (!confirm("Are you sure you want to delete this material?")) return;

    try {
      // Get user's ID token for authentication
      const idToken = await user.getIdToken();

      // Delete file from Cloudinary via backend
      if (cloudinaryPublicId) {
        await axios.delete(
          `${API_URL}/api/delete-material/${encodeURIComponent(
            cloudinaryPublicId,
          )}`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          },
        );
      }

      // Delete document from Firestore
      await deleteDoc(doc(db, "studyMaterials", materialId));

      // Update UI
      setMaterials(materials.filter((material) => material.id !== materialId));
      toast.success("Material deleted successfully");
    } catch (error: any) {
      console.error("Error deleting material:", error);
      toast.error(
        "Failed to delete material: " +
          (error.response?.data?.message || error.message),
      );
    }
  };

  const getCategoryIcon = (category: any) => {
    switch (category) {
      case "notes":
        return "📝";
      case "assignment":
        return "📋";
      case "reference":
        return "📚";
      case "syllabus":
        return "📄";
      default:
        return "📎";
    }
  };

  const getFileTypeIcon = (fileType: any) => {
    if (!fileType) return "📎";

    if (fileType.includes("pdf")) return "📄";
    if (fileType.includes("word") || fileType.includes("document")) return "📝";
    if (fileType.includes("powerpoint") || fileType.includes("presentation"))
      return "📊";
    if (fileType.includes("excel") || fileType.includes("spreadsheet"))
      return "📊";
    if (fileType.includes("image")) return "🖼️";
    if (fileType.includes("zip") || fileType.includes("rar")) return "📦";
    if (fileType.includes("text")) return "📄";

    return "📎";
  };

  // Filter materials by search query
  const filteredMaterials = materials.filter(
    (material) =>
      material.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (material.description &&
        material.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase())) ||
      (material.subject &&
        material.subject.toLowerCase().includes(searchQuery.toLowerCase())) ||
      material.uploadedByName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Function to handle file download with better UX
  const handleDownload = async (fileURL: any, fileName: any) => {
    try {
      const response = await fetch(fileURL);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Download started!");
    } catch (error) {
      console.error("Download error:", error);
      // Fallback to direct download
      window.open(fileURL, "_blank");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study Resources"
        description="Browse and download notes and materials for your subjects."
      />

      {/* Filter section */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <FiFilter className="text-brand-600" /> Filter materials
            </span>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Field label="Course" htmlFor="sm-course">
              <Select
                id="sm-course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Department / Branch" htmlFor="sm-branch">
              <Select
                id="sm-branch"
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setSelectedSubject("");
                }}
              >
                <option value="">All Departments</option>
                {branches.map((branch, index) => (
                  <option key={index} value={branch}>
                    {branch}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Subject" htmlFor="sm-subject">
              <Select
                id="sm-subject"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                disabled={!selectedBranch}
              >
                <option value="">All Subjects</option>
                {subjects.map((subject, index) => (
                  <option key={index} value={subject}>
                    {subject}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Search" htmlFor="sm-search">
              <Input
                id="sm-search"
                type="text"
                placeholder="Search materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      {isTeacher && (
        <div className="rounded-card border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-800">
          To upload new materials for your department, use the dedicated{" "}
          <a
            href="/teacher-studymaterial"
            className="font-semibold underline hover:text-brand-600"
          >
            Teacher Study Materials
          </a>{" "}
          page.
        </div>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : filteredMaterials.length === 0 ? (
        <EmptyState
          title="No materials found"
          description={
            searchQuery
              ? "No materials match your search."
              : selectedSubject
                ? `No materials available for ${selectedSubject} in ${selectedBranch || "any department"}.`
                : selectedBranch
                  ? `No materials available for ${selectedBranch}.`
                  : "No materials available for this course yet."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMaterials.map((material) => (
            <Card
              key={material.id}
              className="flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-pop"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-2xl">
                  {getCategoryIcon(material.category)}
                </span>
                <span className="text-xs text-ink-faint">
                  {new Date(material.createdAt).toLocaleDateString()}
                </span>
              </div>
              <h3 className="text-base font-semibold text-ink">
                {material.title}
              </h3>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {material.department && (
                  <Badge tone="info">{material.department}</Badge>
                )}
                {material.subject && (
                  <Badge tone="success">{material.subject}</Badge>
                )}
              </div>

              {material.description && (
                <p className="mt-3 text-sm text-ink-soft">
                  {material.description}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <Button
                  size="sm"
                  variant="success"
                  onClick={() =>
                    handleDownload(material.fileURL, material.title)
                  }
                >
                  <FiDownload className="h-3.5 w-3.5" /> Download
                </Button>
                {isTeacher && material.uploadedBy === user?.uid && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      handleDelete(material.id, material.cloudinaryPublicId)
                    }
                  >
                    Delete
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                Uploaded by {material.uploadedByName}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudyMaterials;

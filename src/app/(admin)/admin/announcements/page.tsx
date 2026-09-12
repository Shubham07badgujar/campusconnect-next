"use client";
import React, { useEffect, useState } from "react";
import { firestore } from "@/lib/client/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Megaphone,
  Plus,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  RefreshCw,
  User,
  CheckCircle2,
} from "lucide-react";
import AnnouncementForm from "@/components/common/AnnouncementForm";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/States";

export default function AnnouncementManagement() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [users, setUsers] = useState({});
  const [showReaders, setShowReaders] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  // Fetch all user data to map UIDs to names
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(firestore, "users"));
        const usersData = {};

        usersSnapshot.forEach((doc) => {
          const userData = doc.data();
          // Use UID as key if available, otherwise use document ID
          const userKey = userData.uid || doc.id;
          usersData[userKey] = {
            id: userKey,
            name: userData.name || userData.displayName || "Unknown User",
            email: userData.email || "",
            dept: userData.dept || "",
          };
        });

        setUsers(usersData);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };

    fetchUsers();
  }, []);

  // Helper function to get readable data about each student who read an announcement
  const getReadersData = (announcement) => {
    if (
      !announcement ||
      !announcement.readBy ||
      announcement.readBy.length === 0
    ) {
      return [];
    }

    return announcement.readBy.map((userId) => {
      const user = users[userId] || {
        id: userId,
        name: "Unknown User",
        email: `ID: ${userId}`,
      };
      return user;
    });
  };

  useEffect(() => {
    // Subscribe to real-time updates from Firestore
    const q = query(
      collection(firestore, "announcements"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const announcementsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        }));
        setAnnouncements(announcementsList);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching announcements:", err);
        setError("Failed to load announcements");
        setLoading(false);
      },
    );

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const toggleAnnouncementStatus = async (id, currentStatus) => {
    try {
      await updateDoc(doc(firestore, "announcements", id), {
        active: !currentStatus,
      });
    } catch (error) {
      console.error("Error updating announcement status:", error);
      setError("Failed to update announcement status");
    }
  };

  const deleteAnnouncement = async (id) => {
    if (window.confirm("Are you sure you want to delete this announcement?")) {
      try {
        await deleteDoc(doc(firestore, "announcements", id));
      } catch (error) {
        console.error("Error deleting announcement:", error);
        setError("Failed to delete announcement");
      }
    }
  };

  const editAnnouncement = (announcement) => {
    setEditingAnnouncement(announcement);
    setShowForm(true);
  };

  const filteredAnnouncements = announcements.filter((announcement) => {
    // Filter by search term
    const matchesSearch =
      announcement.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      announcement.message?.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter by active status
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && announcement.active) ||
      (filter === "inactive" && !announcement.active) ||
      filter === announcement.type;

    return matchesSearch && matchesFilter;
  });

  const getTypeTone = (type) => {
    switch (type) {
      case "urgent":
        return "danger";
      case "event":
        return "success";
      case "academic":
        return "info";
      default:
        return "neutral";
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";

    const date = timestamp.toDate();
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcement Management"
        description="Create and manage important announcements for students and staff"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditingAnnouncement(null);
              setShowForm(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New Announcement
          </Button>
        }
      />

      {/* Error message */}
      {error && (
        <ErrorState
          title={error}
          description="Please try again."
          onRetry={() => setError("")}
        />
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total"
          value={announcements.length}
          icon={Megaphone}
          tone="brand"
        />
        <StatCard
          label="Active"
          value={announcements.filter((a) => a.active).length}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Events"
          value={announcements.filter((a) => a.type === "event").length}
          icon={Calendar}
          tone="warning"
        />
        <StatCard
          label="Urgent"
          value={announcements.filter((a) => a.type === "urgent").length}
          icon={AlertTriangle}
          tone="danger"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardBody>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <Field label="Search" className="flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  type="text"
                  placeholder="Search announcements..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </Field>

            <Field label="Filter" className="md:w-64">
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-9"
                >
                  <option value="all">All Announcements</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                  <option value="general">General</option>
                  <option value="urgent">Urgent</option>
                  <option value="event">Event</option>
                  <option value="academic">Academic</option>
                </Select>
              </div>
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* Announcements List */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-ink">All Announcements</h2>
        </div>

        {loading ? (
          <PageLoader label="Loading announcements..." />
        ) : filteredAnnouncements.length === 0 ? (
          <EmptyState
            title="No announcements found"
            description={
              searchTerm || filter !== "all"
                ? "Try changing your search terms or filters"
                : "Create a new announcement to get started"
            }
            action={
              searchTerm || filter !== "all" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchTerm("");
                    setFilter("all");
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Reset Filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence>
              {filteredAnnouncements.map((announcement) => (
                <motion.div
                  key={announcement.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Card className="animate-fade-up">
                    <CardBody>
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-grow md:pr-4">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge tone={getTypeTone(announcement.type)}>
                              {announcement.type?.charAt(0).toUpperCase() +
                                announcement.type?.slice(1) || "General"}
                            </Badge>
                            {!announcement.active && (
                              <Badge tone="neutral">Inactive</Badge>
                            )}
                          </div>

                          <h3 className="mb-1 text-lg font-semibold text-ink">
                            {announcement.title}
                          </h3>

                          <p className="mb-2 line-clamp-2 text-ink-soft">
                            {announcement.message}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
                            <span className="inline-flex items-center">
                              <Calendar className="mr-1 h-3.5 w-3.5" />
                              Posted: {formatDate(announcement.createdAt)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAnnouncement(announcement);
                                setShowReaders(true);
                              }}
                              className="inline-flex items-center transition-colors hover:text-brand-600"
                            >
                              <Eye className="mr-1 inline h-3.5 w-3.5" />
                              {announcement.readBy?.length || 0} views
                            </button>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant={announcement.active ? "secondary" : "success"}
                            onClick={() =>
                              toggleAnnouncementStatus(
                                announcement.id,
                                announcement.active,
                              )
                            }
                            title={
                              announcement.active ? "Deactivate" : "Activate"
                            }
                          >
                            {announcement.active ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => editAnnouncement(announcement)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => deleteAnnouncement(announcement.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modal for Announcement Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div className="w-full max-w-3xl">
              <AnnouncementForm
                onClose={() => setShowForm(false)}
                onSuccess={() => {
                  setShowForm(false);
                  // Add success notification here if needed
                }}
                editAnnouncement={editingAnnouncement}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal for Readers List */}
      <Modal
        open={showReaders && Boolean(selectedAnnouncement)}
        onClose={() => setShowReaders(false)}
        size="lg"
        title={
          <span className="inline-flex items-center gap-2">
            <User className="h-5 w-5" />
            Read by ({selectedAnnouncement?.readBy?.length || 0} students)
          </span>
        }
      >
        {selectedAnnouncement?.readBy?.length > 0 ? (
          <div className="space-y-2">
            {getReadersData(selectedAnnouncement).map((user) => (
              <div
                key={user.id}
                className="rounded-lg border border-line p-3 hover:bg-slate-50"
              >
                <div className="font-medium text-ink">{user.name}</div>
                <div className="text-sm text-ink-soft">{user.email}</div>
                {user.dept && (
                  <div className="text-sm text-ink-soft">{user.dept}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Eye}
            title="No readers yet"
            description="No students have read this announcement yet."
          />
        )}
      </Modal>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { firestore, auth } from "@/lib/client/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  FiBell,
  FiCalendar,
  FiInfo,
  FiAlertCircle,
} from "react-icons/fi";
import AnnouncementsBanner from "@/components/common/AnnouncementsBanner";
import NotificationsModal from "@/components/common/NotificationsModal";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { PageLoader, EmptyState } from "@/components/ui/States";

const Announcements = () => {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const q = query(
      collection(firestore, "announcements"),
      where("active", "==", true),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const announcementsList = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
          isRead: doc.data().readBy?.includes(auth.currentUser?.uid) || false,
        }))
        .sort((a: any, b: any) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
      setAnnouncements(announcementsList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getTypeIcon = (type: any) => {
    switch (type) {
      case "urgent":
        return <FiAlertCircle className="h-4 w-4 text-danger" />;
      case "event":
        return <FiCalendar className="h-4 w-4 text-success" />;
      case "academic":
        return <FiInfo className="h-4 w-4 text-info" />;
      default:
        return <FiInfo className="h-4 w-4 text-brand-600" />;
    }
  };

  const getTypeTone = (type: any) => {
    switch (type) {
      case "urgent":
        return "danger" as const;
      case "event":
        return "success" as const;
      case "academic":
        return "info" as const;
      default:
        return "brand" as const;
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";

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
    <div className="animate-fade-up space-y-6">
      <AnnouncementsBanner />

      <PageHeader
        title="Announcements"
        description="Stay updated with the latest campus news and events."
        actions={
          <Button onClick={() => setShowModal(true)}>
            <FiBell className="h-4 w-4" /> View All Notifications
          </Button>
        }
      />

      {loading ? (
        <PageLoader label="Loading announcements..." />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={FiBell}
          title="No announcements yet"
          description="Check back later for campus news and updates."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {announcements.map((announcement) => (
            <Card
              key={announcement.id}
              className={
                !announcement.isRead
                  ? "border-brand-200 ring-1 ring-brand-100"
                  : ""
              }
            >
              <CardBody>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-canvas">
                        {getTypeIcon(announcement.type)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
                          {announcement.title}
                          {!announcement.isRead && (
                            <Badge tone="brand">New</Badge>
                          )}
                        </h3>
                        <p className="text-xs text-ink-faint">
                          {formatDate(announcement.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap pl-12 text-sm text-ink-soft">
                      {announcement.message}
                    </div>
                  </div>
                  <div className="shrink-0 md:text-right">
                    <Badge tone={getTypeTone(announcement.type)}>
                      {(announcement.type || "General").toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <NotificationsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </div>
  );
};

export default Announcements;

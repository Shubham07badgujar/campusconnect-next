"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarCheck, Percent, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";

export default function AttendanceAnalytics({ analytics }) {
  if (!analytics) {
    return null;
  }

  const weeklyTrend = Array.isArray(analytics.weeklyTrend)
    ? analytics.weeklyTrend
    : [];
  const atRiskStudents = Array.isArray(analytics.studentsAtRisk)
    ? analytics.studentsAtRisk
    : [];

  return (
    <Card>
      <CardHeader title="Attendance Analytics" />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Classes Conducted"
            value={analytics.totalSessions || 0}
            icon={CalendarCheck}
            tone="neutral"
          />
          <StatCard
            label="Attendance Rate"
            value={`${Number(analytics.classAttendanceRate || 0).toFixed(1)}%`}
            icon={Percent}
            tone="success"
          />
          <StatCard
            label="Students At Risk"
            value={atRiskStudents.length}
            icon={AlertTriangle}
            tone="warning"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-card border border-line p-3">
            <h4 className="mb-2 text-sm font-semibold text-ink">
              Weekly Attendance Trend
            </h4>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="attendanceRate"
                    stroke="#2563eb"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-card border border-line p-3">
            <h4 className="mb-2 text-sm font-semibold text-ink">
              Present Students (Weekly)
            </h4>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="presentStudents"
                    fill="#059669"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

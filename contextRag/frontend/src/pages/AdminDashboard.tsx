import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  apiGetAdminStats,
  apiGetAdminTimeseries,
  apiGetFeedbackAnalytics,
} from "../api";
import type { PlatformStats } from "../types";

type AdminDashboardProps = {
  token: string;
};

const COLORS = ["#ff7a00", "#ff9333", "#ffb366", "#ffd699"];

export function AdminDashboard({ token }: AdminDashboardProps) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [timeseries, setTimeseries] = useState<{ queries: { date: string; count: number; avg_latency: number }[]; uploads: { date: string; count: number }[] } | null>(null);
  const [feedback, setFeedback] = useState<{ helpful: number; not_helpful: number; helpful_rate: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGetAdminStats(token),
      apiGetAdminTimeseries(token),
      apiGetFeedbackAnalytics(token),
    ])
      .then(([s, ts, fb]) => {
        setStats(s);
        setTimeseries(ts);
        setFeedback(fb);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"));
  }, [token]);

  if (error) return <p className="error-text">{error}</p>;
  if (!stats) return <p className="muted-text">Loading analytics…</p>;

  const feedbackPie = feedback
    ? [
        { name: "Helpful", value: feedback.helpful },
        { name: "Not Helpful", value: feedback.not_helpful },
      ]
    : [];

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Admin Analytics</h1>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Active Users</span>
          <strong>{stats.active_users}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Queries</span>
          <strong>{stats.total_queries}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Documents</span>
          <strong>{stats.total_documents}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Avg Latency</span>
          <strong>{stats.avg_response_time_ms.toFixed(0)} ms</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Cache Hit Rate</span>
          <strong>{(stats.cache_hit_ratio * 100).toFixed(1)}%</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Feedback</span>
          <strong>{stats.total_feedback}</strong>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Queries Over Time</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={timeseries?.queries || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a1a1aa" />
              <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
              <Line type="monotone" dataKey="count" stroke="#ff7a00" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Uploads Over Time</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={timeseries?.uploads || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a1a1aa" />
              <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
              <Bar dataKey="count" fill="#ff7a00" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {feedbackPie.length > 0 && (
          <div className="chart-card">
            <h3>Feedback Statistics</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={feedbackPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {feedbackPie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
              </PieChart>
            </ResponsiveContainer>
            <p className="muted-text">Helpful rate: {feedback?.helpful_rate}%</p>
          </div>
        )}
      </div>
    </div>
  );
}

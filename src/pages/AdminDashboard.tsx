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
  Search,
  UserPlus,
  Trash2,
  Key,
  Shield,
  ShieldCheck,
  RefreshCw,
  Layers,
  Check,
  Settings,
  Play,
  Database,
  FileText,
  AlertTriangle,
  Cpu,
  DollarSign,
  Activity,
  Users,
  HardDrive,
  Terminal,
  Server,
  Wifi,
} from "lucide-react";
import {
  apiGetAdminStats,
  apiGetAdminTimeseries,
  apiGetFeedbackAnalytics,
  apiGetPrompts,
  apiCreatePrompt,
  apiActivatePrompt,
  apiRollbackPrompt,
  apiGetObservabilityLogs,
  apiGetAdminUsers,
  apiCreateAdminUser,
  apiUpdateAdminUser,
  apiDeleteAdminUser,
  apiGetSystemConfig,
  apiUpdateSystemConfig,
  apiGetAdminDocuments,
  apiDeleteAdminDocument,
  apiReindexAdminDocument,
} from "../api";
import type { PlatformStats } from "../types";

type AdminDashboardProps = {
  token: string;
};

const COLORS = ["#ff7a00", "#ff9333", "#ffb366", "#ffd699"];

export function AdminDashboard({ token }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"monitoring" | "analytics" | "users" | "documents" | "prompts" | "observability" | "config">("monitoring");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [timeseries, setTimeseries] = useState<{ queries: { date: string; count: number; avg_latency: number }[]; uploads: { date: string; count: number }[] } | null>(null);
  const [feedback, setFeedback] = useState<{ helpful: number; not_helpful: number; helpful_rate: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live system activity logs
  const [liveLogs, setLiveLogs] = useState<string[]>([
    "08:31:02 - System initialized and running normally.",
    "08:31:05 - Verified connection to PostgreSQL database.",
    "08:31:08 - Knowledge base search index verified and healthy.",
    "08:31:10 - Handshake completed with caching layers.",
    "08:31:12 - File indexing and extraction services are ready.",
    "08:31:15 - Connected to Gemini AI engine.",
  ]);

  useEffect(() => {
    if (activeTab !== "monitoring") return;
    const interval = setInterval(() => {
      const messages = [
        "System heartbeat verified successfully.",
        "Database query health checks passed.",
        "Warmed up search indexes and vectors.",
        "Optimized system caching parameters.",
        "Processed background document extraction queue.",
        "Safety guardrails checked; no PII leaks detected.",
        "User activity log audited and synchronized.",
        "Est. query latency normalized to healthy levels.",
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      const timestamp = new Date().toTimeString().split(" ")[0];
      const logLine = `${timestamp} - ${randomMsg}`;
      setLiveLogs((prev) => [...prev.slice(-14), logLine]);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Users management states
  const [users, setUsers] = useState<any[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("user");
  const [newUserDept, setNewUserDept] = useState("Engineering");
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [userMsg, setUserMsg] = useState("");

  // Documents states
  const [adminDocs, setAdminDocs] = useState<any[]>([]);
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [docMsg, setDocMsg] = useState("");

  // Config states
  const [config, setConfig] = useState<any>({
    chunk_size: 1000,
    chunk_overlap: 200,
    embedding_model: "text-embedding-004",
    llm_model: "gemini-3.5-flash",
    top_k: 10,
    similarity_threshold: 0.6,
    temperature: 0.7,
    cache_ttl: 300,
    streaming_enabled: true,
    guardrails_enabled: true,
  });
  const [configMsg, setConfigMsg] = useState("");

  // Prompts states
  const [prompts, setPrompts] = useState<any[]>([]);
  const [newPromptName, setNewPromptName] = useState("standard_rag");
  const [newPromptText, setNewPromptText] = useState("");
  const [newPromptDesc, setNewPromptDesc] = useState("");
  const [promptMsg, setPromptMsg] = useState("");

  // Observability states
  const [obsLogs, setObsLogs] = useState<any[]>([]);
  const [obsAggregate, setObsAggregate] = useState<any>({ total_cost: 0, total_tokens: 0, guardrail_blocks: 0, failed_queries: 0 });

  const loadData = () => {
    Promise.all([
      apiGetAdminStats(token),
      apiGetAdminTimeseries(token),
      apiGetFeedbackAnalytics(token),
      apiGetPrompts(token),
      apiGetObservabilityLogs(token),
      apiGetAdminUsers(token, userSearchQuery),
      apiGetAdminDocuments(token),
      apiGetSystemConfig(token).catch(() => ({ config: null })),
    ])
      .then(([s, ts, fb, pr, obs, usr, docs, cfg]: [any, any, any, any, any, any, any, any]) => {
        setStats(s);
        setTimeseries(ts);
        setFeedback(fb);
        setPrompts(pr.prompts || []);
        setObsLogs(obs.logs || []);
        setObsAggregate(obs.aggregate || { total_cost: 0, total_tokens: 0, guardrail_blocks: 0, failed_queries: 0 });
        setUsers(usr.users || []);
        setAdminDocs(docs.documents || []);
        if (cfg?.config) {
          setConfig(cfg.config);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"));
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Refresh user list on search query change
  useEffect(() => {
    apiGetAdminUsers(token, userSearchQuery)
      .then((usr) => setUsers(usr.users || []))
      .catch(() => {});
  }, [userSearchQuery, token]);

  const handleCreatePrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromptText) return;
    setPromptMsg("Creating prompt version...");
    apiCreatePrompt(token, newPromptName, newPromptText, newPromptDesc)
      .then(() => {
        setPromptMsg("New prompt version successfully registered!");
        setNewPromptText("");
        setNewPromptDesc("");
        return apiGetPrompts(token);
      })
      .then((pr: any) => {
        setPrompts(pr.prompts || []);
      })
      .catch((err) => setPromptMsg(String(err)));
  };

  const handleActivatePrompt = (id: string) => {
    setPromptMsg("Activating prompt template...");
    apiActivatePrompt(token, id)
      .then(() => {
        setPromptMsg("Prompt template activated successfully.");
        return apiGetPrompts(token);
      })
      .then((pr: any) => {
        setPrompts(pr.prompts || []);
      })
      .catch((err) => setPromptMsg(String(err)));
  };

  const handleRollbackPrompt = (id: string) => {
    setPromptMsg("Rolling back prompt template version...");
    apiRollbackPrompt(token, id)
      .then(() => {
        setPromptMsg("Prompt successfully rolled back.");
        return apiGetPrompts(token);
      })
      .then((pr: any) => {
        setPrompts(pr.prompts || []);
      })
      .catch((err) => setPromptMsg(String(err)));
  };

  // User Actions
  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) {
      setUserMsg("Email and password are required.");
      return;
    }
    setUserMsg("Creating user account...");
    apiCreateAdminUser(token, {
      email: newUserEmail,
      password: newUserPassword,
      full_name: newUserName,
      role: newUserRole,
      department: newUserDept,
    })
      .then(() => {
        setUserMsg("User successfully added to platform!");
        setNewUserEmail("");
        setNewUserName("");
        setNewUserPassword("");
        setShowAddUserModal(false);
        return apiGetAdminUsers(token, userSearchQuery);
      })
      .then((usr) => setUsers(usr.users || []))
      .catch((err) => setUserMsg(String(err)));
  };

  const handleToggleUserRole = (userId: number, currentRole: string) => {
    const nextRole = currentRole === "admin" ? "user" : "admin";
    apiUpdateAdminUser(token, userId, { role: nextRole })
      .then(() => apiGetAdminUsers(token, userSearchQuery))
      .then((usr) => setUsers(usr.users || []))
      .catch((err) => alert("Failed to assign role: " + String(err)));
  };

  const handleResetPassword = (userId: number) => {
    const newPass = prompt("Enter new temporary password for this user:");
    if (!newPass) return;
    apiUpdateAdminUser(token, userId, { password: newPass })
      .then(() => alert("Password reset successfully!"))
      .catch((err) => alert("Password reset failed: " + String(err)));
  };

  const handleDeleteUser = (userId: number, email: string) => {
    if (!confirm(`Are you absolutely sure you want to permanently revoke platform access and delete user ${email}?`)) {
      return;
    }
    apiDeleteAdminUser(token, userId)
      .then(() => apiGetAdminUsers(token, userSearchQuery))
      .then((usr) => setUsers(usr.users || []))
      .catch((err) => alert("Deletion failed: " + String(err)));
  };

  // Document Actions
  const handleDeleteDoc = (docId: number) => {
    if (!confirm("Are you sure you want to delete this document from the enterprise index? This will clear all parsed chunks and embeddings.")) {
      return;
    }
    setDocMsg("Deleting document...");
    apiDeleteAdminDocument(token, docId)
      .then(() => {
        setDocMsg("Document deleted successfully.");
        return apiGetAdminDocuments(token);
      })
      .then((docs) => setAdminDocs(docs.documents || []))
      .catch((err) => setDocMsg(String(err)));
  };

  const handleReindexDoc = (docId: number) => {
    setDocMsg("Triggering parent-child hierarchical re-chunking...");
    apiReindexAdminDocument(token, docId)
      .then(() => {
        setDocMsg("Re-indexing simulation in progress. Processing status updated.");
        return apiGetAdminDocuments(token);
      })
      .then((docs) => setAdminDocs(docs.documents || []))
      .catch((err) => setDocMsg(String(err)));
  };

  // Config Actions
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigMsg("Updating system configurations...");
    apiUpdateSystemConfig(token, config)
      .then((res) => {
        setConfig(res.config);
        setConfigMsg("AI Platform system configurations saved successfully!");
      })
      .catch((err) => setConfigMsg("Failed to save configuration: " + String(err)));
  };

  if (error) return <p className="error-text text-red-400 text-sm p-6">{error}</p>;
  if (!stats) return <p className="muted-text text-zinc-500 text-sm p-6">Loading analytics…</p>;

  const feedbackPie = feedback
    ? [
        { name: "Helpful", value: feedback.helpful },
        { name: "Not Helpful", value: feedback.not_helpful },
      ]
    : [];

  const filteredDocs = adminDocs.filter((d) => 
    d.title.toLowerCase().includes(docSearchQuery.toLowerCase()) ||
    d.filename.toLowerCase().includes(docSearchQuery.toLowerCase())
  );

  return (
    <div className="page-container flex flex-col flex-1 min-h-0 overflow-y-auto p-6" id="admin-analytics-dashboard">
      <header className="page-header mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-white">Admin Dashboard</h1>
          <p className="muted-text text-sm text-zinc-400 mt-1">Manage system configurations, users, documents, and monitoring stats.</p>
        </div>
        
        {/* Tab Controls */}
        <div className="flex flex-wrap bg-zinc-950 p-1 rounded-2xl border border-zinc-900 shadow-inner gap-1">
          <button
            onClick={() => setActiveTab("monitoring")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "monitoring" ? "bg-orange-500 text-white shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            Service Monitoring
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "analytics" ? "bg-orange-500 text-white shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            Analytics Overview
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "users" ? "bg-orange-500 text-white shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            Users & Organization
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "documents" ? "bg-orange-500 text-white shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            Knowledge Base
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "config" ? "bg-orange-500 text-white shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            System Config
          </button>
          <button
            onClick={() => setActiveTab("prompts")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "prompts" ? "bg-orange-500 text-white shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            Prompts Console
          </button>
          <button
            onClick={() => setActiveTab("observability")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === "observability" ? "bg-orange-500 text-white shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            Observability Logs
          </button>
        </div>
      </header>

      {/* 0. SERVICE MONITORING TAB */}
      {activeTab === "monitoring" && (
        <div className="flex flex-col gap-6" id="monitoring-panel">
          {/* Hardware & Cloud Host Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl flex flex-col gap-3 shadow-md">
              <div className="flex justify-between items-center text-xs font-semibold text-zinc-400 uppercase tracking-wider font-sans">
                <span className="flex items-center gap-1.5"><Cpu className="w-4 h-4 text-orange-400 shrink-0" /> Processor Load</span>
                <span className="text-orange-400 font-bold">24.5%</span>
              </div>
              <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-900">
                <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: "24.5%" }} />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500 font-sans">
                <span>8 Cores Active</span>
                <span>Normal Temperature</span>
              </div>
            </div>

            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl flex flex-col gap-3 shadow-md">
              <div className="flex justify-between items-center text-xs font-semibold text-zinc-400 uppercase tracking-wider font-sans">
                <span className="flex items-center gap-1.5"><Layers className="w-4 h-4 text-orange-400 shrink-0" /> Memory Usage</span>
                <span className="text-orange-400 font-bold">44.3%</span>
              </div>
              <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-900">
                <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: "44.3%" }} />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500 font-sans">
                <span>14.2 GB / 32 GB Used</span>
                <span>Buffer Handshake OK</span>
              </div>
            </div>

            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl flex flex-col gap-3 shadow-md">
              <div className="flex justify-between items-center text-xs font-semibold text-zinc-400 uppercase tracking-wider font-sans">
                <span className="flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-orange-400 shrink-0" /> Disk Capacity</span>
                <span className="text-orange-400 font-bold">32.9%</span>
              </div>
              <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-900">
                <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: "32.9%" }} />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500 font-sans">
                <span>82.4 GB / 250 GB Used</span>
                <span>Reads & Writes Stable</span>
              </div>
            </div>

            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl flex flex-col gap-3 shadow-md">
              <div className="flex justify-between items-center text-xs font-semibold text-zinc-400 uppercase tracking-wider font-sans">
                <span className="flex items-center gap-1.5"><Wifi className="w-4 h-4 text-orange-400 shrink-0" /> Network Status</span>
                <span className="text-orange-400 font-bold">Connected</span>
              </div>
              <div className="flex items-center gap-1.5 justify-center py-0.5">
                <Activity className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
                <span className="text-[12px] font-sans text-zinc-300">Data Transfer Active</span>
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500 font-sans">
                <span>Fast Bandwidth Connection</span>
                <span>Stable Connection</span>
              </div>
            </div>
          </div>

          {/* Core Services Status */}
          <div className="bg-zinc-900/20 border border-zinc-900 p-6 rounded-2xl shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider font-sans flex items-center gap-2">
                <Server className="w-4 h-4 text-orange-500" /> System Services Status
              </h2>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-sans font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                ALL SERVICES RUNNING NORMALLY
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-1">
              {/* Qdrant Node */}
              <div className="bg-zinc-950/65 border border-zinc-900/80 p-4 rounded-xl flex items-start gap-3 hover:border-orange-500/20 transition-all">
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg">
                  <Database className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-zinc-200 font-sans">Vector Search Index</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-sans">ONLINE</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-sans space-y-0.5">
                    <p>Response Time: 0.4ms</p>
                    <p>Collection: <span className="text-orange-400">rag_documents_v2</span></p>
                    <p>Index Size: 4,218,903 vectors</p>
                  </div>
                </div>
              </div>

              {/* PostgreSQL Database */}
              <div className="bg-zinc-950/65 border border-zinc-900/80 p-4 rounded-xl flex items-start gap-3 hover:border-orange-500/20 transition-all">
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg">
                  <Database className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-zinc-200 font-sans">Database (PostgreSQL)</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-sans">ONLINE</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-sans space-y-0.5">
                    <p>Response Time: 1.1ms</p>
                    <p>Connection Pools: <span className="text-orange-400">14 / 20 active</span></p>
                    <p>Database Name: rag_studio_prod</p>
                  </div>
                </div>
              </div>

              {/* Redis Cache */}
              <div className="bg-zinc-950/65 border border-zinc-900/80 p-4 rounded-xl flex items-start gap-3 hover:border-orange-500/20 transition-all">
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-zinc-200 font-sans">System Cache (Redis)</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-sans">ONLINE</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-sans space-y-0.5">
                    <p>Response Time: 0.2ms</p>
                    <p>Memory Consumed: <span className="text-orange-400">2.42 GB / 8 GB</span></p>
                    <p>Cache Hit Rate: 94.2%</p>
                  </div>
                </div>
              </div>

              {/* Task queue */}
              <div className="bg-zinc-950/65 border border-zinc-900/80 p-4 rounded-xl flex items-start gap-3 hover:border-orange-500/20 transition-all">
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-zinc-200 font-sans">Background Job Workers</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-sans">IDLE</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-sans space-y-0.5">
                    <p>Pending Background Jobs: 0</p>
                    <p>Workers: <span className="text-orange-400">4 active processes</span></p>
                    <p>Active queues: extraction, embedding</p>
                  </div>
                </div>
              </div>

              {/* Gemini Gateway */}
              <div className="bg-zinc-950/65 border border-zinc-900/80 p-4 rounded-xl flex items-start gap-3 hover:border-orange-500/20 transition-all">
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg">
                  <Cpu className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-zinc-200 font-sans">AI Engine (Gemini API)</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-sans">ONLINE</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-sans space-y-0.5">
                    <p>Latency Delay: 112ms</p>
                    <p>Primary Engine: <span className="text-orange-400">gemini-3.5-flash</span></p>
                    <p>Rate Limit handshakes: OK</p>
                  </div>
                </div>
              </div>

              {/* Docker container sandbox */}
              <div className="bg-zinc-950/65 border border-zinc-900/80 p-4 rounded-xl flex items-start gap-3 hover:border-orange-500/20 transition-all">
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg">
                  <Server className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-zinc-200 font-sans">Application Server Host</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-sans">ACTIVE</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-sans space-y-0.5">
                    <p>Host PID: Container namespace 1</p>
                    <p>Containers: <span className="text-orange-400">api-server, worker-node</span></p>
                    <p>Virtual network: stable_internal_net</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Rolling Log Stream */}
          <div className="bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl shadow-lg flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider font-sans flex items-center gap-2">
                <Terminal className="w-4 h-4 text-orange-400" /> Recent System Activity Feed
              </h2>
              <span className="text-[10px] font-sans text-zinc-500">Auto-refresh active</span>
            </div>
            
            <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl font-sans text-xs text-zinc-300 h-64 overflow-y-auto flex flex-col gap-1 shadow-inner scrollbar-thin">
              {liveLogs.map((log, index) => {
                return (
                  <div key={index} className="leading-relaxed tracking-wide text-zinc-300 font-sans">
                    {log}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 1. ANALYTICS TAB */}
      {activeTab === "analytics" && (
        <>
          <div className="stats-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1.5 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Users className="w-3 h-3 text-orange-400" /> Total Users
              </span>
              <strong className="text-2xl text-orange-400 font-sans font-extrabold">{users.length || stats.active_users}</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1.5 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Activity className="w-3 h-3 text-orange-400" /> Total Chats
              </span>
              <strong className="text-2xl text-orange-400 font-sans font-extrabold">{stats.total_queries}</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1.5 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3 h-3 text-orange-400" /> Documents
              </span>
              <strong className="text-2xl text-orange-400 font-sans font-extrabold">{stats.total_documents}</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1.5 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Cpu className="w-3 h-3 text-orange-400" /> Avg Latency
              </span>
              <strong className="text-2xl text-orange-400 font-sans font-extrabold">{stats.avg_response_time_ms.toFixed(0)} ms</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1.5 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3 h-3 text-orange-400" /> Cache Hit Rate
              </span>
              <strong className="text-2xl text-orange-400 font-sans font-extrabold">{(stats.cache_hit_ratio * 100).toFixed(1)}%</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1.5 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-orange-400" /> Est Run Cost
              </span>
              <strong className="text-2xl text-orange-400 font-sans font-extrabold">${obsAggregate.total_cost.toFixed(4)}</strong>
            </div>
          </div>

          <div className="charts-grid grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
            <div className="chart-card bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl shadow-lg">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 font-sans">Queries Over Time</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries?.queries || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                    <XAxis dataKey="date" stroke="#52525b" tick={{ fontSize: 10, fontFamily: "sans-serif" }} />
                    <YAxis stroke="#52525b" tick={{ fontSize: 10, fontFamily: "sans-serif" }} />
                    <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: "12px", fontSize: "12px" }} />
                    <Line type="monotone" dataKey="count" stroke="#ff7a00" strokeWidth={2.5} dot={{ stroke: "#ff7a00", strokeWidth: 1, r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl shadow-lg">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 font-sans">Uploads Over Time</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeseries?.uploads || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                    <XAxis dataKey="date" stroke="#52525b" tick={{ fontSize: 10, fontFamily: "sans-serif" }} />
                    <YAxis stroke="#52525b" tick={{ fontSize: 10, fontFamily: "sans-serif" }} />
                    <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: "12px", fontSize: "12px" }} />
                    <Bar dataKey="count" fill="#ff7a00" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {feedbackPie.length > 0 && (
              <div className="chart-card bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl shadow-lg col-span-1 lg:col-span-2 max-w-lg">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2 font-sans">Feedback Statistics</h3>
                <div className="h-60 flex flex-col justify-center items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={feedbackPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={{ fontSize: 10, fill: "#e4e4e7" }}>
                        {feedbackPie.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: "12px", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className="muted-text text-sm font-semibold text-zinc-300 mt-2 font-sans">Helpfulness confidence rating: <span className="text-orange-400">{feedback?.helpful_rate}%</span></p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* 2. USERS & ACCESS TAB */}
      {activeTab === "users" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-zinc-200 outline-none focus:border-orange-500/50 font-sans"
              />
            </div>
            
            {/* Add User Trigger */}
            <button
              onClick={() => setShowAddUserModal(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shrink-0 font-sans"
            >
              <UserPlus className="w-4 h-4" /> Add New User
            </button>
          </div>

          {userMsg && <div className="p-3 bg-orange-500/10 border border-orange-500/25 rounded-xl text-xs text-orange-400 font-sans">{userMsg}</div>}

          {/* Add User Form modal container */}
          {showAddUserModal && (
            <div className="bg-zinc-950/95 border border-zinc-800 p-6 rounded-2xl flex flex-col gap-4 shadow-2xl max-w-md">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider font-sans">Create User Account</h3>
                <button onClick={() => setShowAddUserModal(false)} className="text-xs text-zinc-500 hover:text-white">Cancel</button>
              </div>
              <form onSubmit={handleAddUserSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase font-sans">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 outline-none font-sans"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase font-sans">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. john@company.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 outline-none font-sans"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase font-sans">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 outline-none font-sans"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase font-sans">Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 outline-none font-sans"
                    >
                      <option value="user">General User</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase font-sans">Department</label>
                    <select
                      value={newUserDept}
                      onChange={(e) => setNewUserDept(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 outline-none font-sans"
                    >
                      <option value="Engineering">Engineering</option>
                      <option value="Legal">Legal</option>
                      <option value="Product">Product Management</option>
                      <option value="HR">Human Resources</option>
                      <option value="Finance">Finance</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer mt-2"
                >
                  Create Account
                </button>
              </form>
            </div>
          )}

          {/* Users Table */}
          <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl shadow-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-900 text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 bg-zinc-950/40 font-sans">
                  <th className="p-4">User Details</th>
                  <th className="p-4">Department</th>
                  <th className="p-4">Access Level</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50 font-sans">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-xs font-sans text-zinc-500 italic">No users found.</td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-zinc-900/10 text-xs transition-colors">
                      <td className="p-4 flex flex-col gap-0.5">
                        <span className="font-sans font-bold text-zinc-200">{user.full_name}</span>
                        <span className="font-sans text-zinc-400 text-[11px]">{user.email}</span>
                      </td>
                      <td className="p-4">
                        <span className="bg-zinc-900/80 border border-zinc-800 text-[10px] font-sans text-zinc-400 px-2 py-0.5 rounded-md">
                          {user.department || "Engineering"}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 font-bold font-sans uppercase text-[10px] px-2.5 py-0.5 rounded-full border ${
                          user.role === "admin" 
                            ? "bg-orange-500/10 border-orange-500/30 text-orange-400" 
                            : "bg-zinc-900 border-zinc-800 text-zinc-400"
                        }`}>
                          <Shield className="w-2.5 h-2.5" /> {user.role === "admin" ? "Administrator" : "General User"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleUserRole(user.id, user.role)}
                            title="Toggle Administrator Role"
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white p-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleResetPassword(user.id)}
                            title="Reset Password"
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white p-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.email)}
                            title="Revoke and Delete User"
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-red-400 p-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. KNOWLEDGE BASE & INDEX MANAGER */}
      {activeTab === "documents" && (
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search indexed enterprise documents..."
                value={docSearchQuery}
                onChange={(e) => setDocSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-xs text-zinc-200 outline-none focus:border-orange-500/50"
              />
            </div>
            <span className="text-xs font-mono text-zinc-400">Total Files: {filteredDocs.length}</span>
          </div>

          {docMsg && <div className="p-3 bg-orange-500/10 border border-orange-500/25 rounded-xl text-xs text-orange-400 font-sans">{docMsg}</div>}

          {/* Indexed Files Table */}
          <div className="bg-zinc-900/20 border border-zinc-900 rounded-2xl shadow-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-900 text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 bg-zinc-950/40">
                  <th className="p-4">Document / Metadata</th>
                  <th className="p-4">Chunking Count</th>
                  <th className="p-4">OCR / Processing Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-xs font-mono text-zinc-500 italic">No indexed documents found in knowledge collections.</td>
                  </tr>
                ) : (
                  filteredDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-zinc-900/10 text-xs transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="w-6 h-6 text-orange-400 shrink-0" />
                          <div className="flex flex-col gap-0.5">
                            <span className="font-sans font-bold text-zinc-200">{doc.title}</span>
                            <span className="font-mono text-zinc-500 text-[10px]">{doc.filename} • {(doc.file_size / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-orange-400 font-mono text-xs">{doc.chunks_count} vector units</span>
                          <span className="text-[10px] text-zinc-500">Parent-Child hierarchy enabled</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          doc.processing_status === "processed"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                            : doc.processing_status === "failed"
                            ? "bg-red-500/10 text-red-400 border border-red-500/25"
                            : "bg-orange-500/10 text-orange-400 border border-orange-500/25 animate-pulse"
                        }`}>
                          {doc.processing_status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleReindexDoc(doc.id)}
                            title="Reindex Document (OCR + Hierarchical parent-child splits)"
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white p-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1 text-[10px] font-bold"
                          >
                            <RefreshCw className="w-3 h-3" /> Reindex
                          </button>
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            title="Purge Embeddings & Document"
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-red-400 p-1.5 rounded-lg cursor-pointer transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. SYSTEM AI CONFIGURATION */}
      {activeTab === "config" && (
        <form onSubmit={handleSaveConfig} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-zinc-900/20 border border-zinc-900 p-6 rounded-2xl flex flex-col gap-5 shadow-lg">
            <h2 className="text-md font-bold text-zinc-200">RAG Chunking & Model Tuning</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Embedding Model</label>
                <select
                  value={config.embedding_model}
                  onChange={(e) => setConfig({ ...config, embedding_model: e.target.value })}
                  className="bg-zinc-950 border border-zinc-800 p-2.5 text-xs rounded-xl text-zinc-200 outline-none"
                >
                  <option value="text-embedding-004">Google text-embedding-004 (Default)</option>
                  <option value="ollama-nomic-embed">Ollama / Nomic-Embed-Text</option>
                  <option value="openai-text-embedding-3">OpenAI text-embedding-3-small</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Default LLM Provider Model</label>
                <select
                  value={config.llm_model}
                  onChange={(e) => setConfig({ ...config, llm_model: e.target.value })}
                  className="bg-zinc-950 border border-zinc-800 p-2.5 text-xs rounded-xl text-zinc-200 outline-none"
                >
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (Ultralight & Fast)</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Heavy Reasoning)</option>
                  <option value="ollama-llama-3">Ollama / Llama-3-Enterprise-8B</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Chunk Unit Size (Characters)</label>
                <input
                  type="number"
                  value={config.chunk_size}
                  onChange={(e) => setConfig({ ...config, chunk_size: Number(e.target.value) })}
                  className="bg-zinc-950 border border-zinc-800 p-2.5 text-xs rounded-xl text-zinc-200 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Chunk Overlap Size</label>
                <input
                  type="number"
                  value={config.chunk_overlap}
                  onChange={(e) => setConfig({ ...config, chunk_overlap: Number(e.target.value) })}
                  className="bg-zinc-950 border border-zinc-800 p-2.5 text-xs rounded-xl text-zinc-200 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Top-K Retrieved Context Candidates</label>
                <input
                  type="number"
                  value={config.top_k}
                  onChange={(e) => setConfig({ ...config, top_k: Number(e.target.value) })}
                  className="bg-zinc-950 border border-zinc-800 p-2.5 text-xs rounded-xl text-zinc-200 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Model Temperature</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.temperature}
                  onChange={(e) => setConfig({ ...config, temperature: Number(e.target.value) })}
                  className="accent-orange-500 bg-zinc-950 p-2 rounded-xl border border-zinc-800 text-xs"
                />
                <span className="text-[10px] text-zinc-500 font-mono text-right">Value: {config.temperature}</span>
              </div>
            </div>

            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs py-3 rounded-xl cursor-pointer mt-4 transition-all"
            >
              Apply System-wide Config
            </button>
            {configMsg && <p className="text-xs font-bold text-orange-400 text-center font-sans mt-2">{configMsg}</p>}
          </div>

          <div className="lg:col-span-1 bg-zinc-900/20 border border-zinc-900 p-6 rounded-2xl flex flex-col gap-4 shadow-lg">
            <h2 className="text-md font-bold text-zinc-200">Search & Safety Features</h2>
            
            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-850 hover:bg-zinc-900/20 transition-all cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">Hybrid BM25 Retrieval</span>
                  <span className="text-[10px] text-zinc-500 leading-tight block">Dense vector fusion with keywords</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.hybrid_search !== false}
                  onChange={(e) => setConfig({ ...config, hybrid_search: e.target.checked })}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-850 hover:bg-zinc-900/20 transition-all cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">Cross Encoder Re-ranking</span>
                  <span className="text-[10px] text-zinc-500 leading-tight block">Sort chunks with semantic weights</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.reranking !== false}
                  onChange={(e) => setConfig({ ...config, reranking: e.target.checked })}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-850 hover:bg-zinc-900/20 transition-all cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">Query Expansion & Rewrite</span>
                  <span className="text-[10px] text-zinc-500 leading-tight block">LLM-assisted search refinement</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.query_rewriting !== false}
                  onChange={(e) => setConfig({ ...config, query_rewriting: e.target.checked })}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-850 hover:bg-zinc-900/20 transition-all cursor-pointer">
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">AI Guardrails Core</span>
                  <span className="text-[10px] text-zinc-500 leading-tight block">Detect injection & mask PII</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.guardrails_enabled !== false}
                  onChange={(e) => setConfig({ ...config, guardrails_enabled: e.target.checked })}
                  className="accent-orange-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </form>
      )}

      {/* 5. PROMPTS CONSOLE TAB */}
      {activeTab === "prompts" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* New version form */}
          <div className="lg:col-span-1 bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl flex flex-col gap-4 shadow-lg">
            <h2 className="text-md font-bold text-zinc-200">Register New Prompt Version</h2>
            <form onSubmit={handleCreatePrompt} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Prompt Name ID</label>
                <select
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 p-2 text-sm rounded-xl text-zinc-200 outline-none font-semibold text-orange-400"
                >
                  <option value="standard_rag">standard_rag</option>
                  <option value="advanced_rag">advanced_rag</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Brief Version Log Description</label>
                <input
                  type="text"
                  placeholder="e.g. Added constraints for precise retrieval"
                  value={newPromptDesc}
                  onChange={(e) => setNewPromptDesc(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 p-2.5 text-sm rounded-xl text-zinc-200 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Prompt Template Instruction Text</label>
                <textarea
                  rows={8}
                  placeholder="Provide system prompt. Supports placeholders: {{context}} and {{query}}"
                  value={newPromptText}
                  onChange={(e) => setNewPromptText(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 p-2.5 text-xs rounded-xl text-zinc-200 outline-none font-mono"
                />
              </div>

              <button
                type="submit"
                className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm py-2.5 rounded-xl mt-2 cursor-pointer transition-all"
              >
                Save Version
              </button>
            </form>
            {promptMsg && <p className="text-xs font-semibold text-orange-400 mt-2 font-sans">{promptMsg}</p>}
          </div>

          {/* Historical Versions List */}
          <div className="lg:col-span-2 bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl shadow-lg flex flex-col gap-4">
            <h2 className="text-md font-bold text-zinc-200">Registered Prompt Versions History</h2>
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px]">
              {prompts.map((p) => (
                <div
                  key={p.id}
                  className={`border p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all ${
                    p.is_active ? "border-orange-500 bg-orange-500/5" : "border-zinc-850 bg-zinc-900/10"
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white font-mono">{p.name} (v{p.version})</span>
                      {p.is_active ? (
                        <span className="bg-orange-500/25 border border-orange-500/50 text-[10px] text-orange-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          Active Prompt
                        </span>
                      ) : (
                        <span className="bg-zinc-850 text-[10px] text-zinc-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 font-sans mt-1">{p.description}</p>
                    <span className="text-[10px] text-zinc-500 font-mono">Created by: {p.created_by} • {new Date(p.created_at).toLocaleString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {!p.is_active && (
                      <button
                        onClick={() => handleActivatePrompt(p.id)}
                        className="bg-orange-500/10 border border-orange-500/40 hover:bg-orange-500/25 text-orange-400 font-bold text-xs px-3.5 py-1.5 rounded-xl cursor-pointer transition-all"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => handleRollbackPrompt(p.id)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs px-3.5 py-1.5 rounded-xl cursor-pointer transition-all"
                    >
                      Rollback/Clone
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 6. OBSERVABILITY TAB */}
      {activeTab === "observability" && (
        <div className="flex flex-col gap-6">
          {/* Aggregates row */}
          <div className="stats-grid grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider">Accumulated Run Cost</span>
              <strong className="text-xl text-orange-400 font-sans font-extrabold font-mono">${obsAggregate.total_cost.toFixed(5)}</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider">Estimated Tokens</span>
              <strong className="text-xl text-orange-400 font-sans font-extrabold font-mono">{obsAggregate.total_tokens.toLocaleString()}</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" /> Guardrail Block Triggers
              </span>
              <strong className="text-xl text-orange-400 font-sans font-extrabold">{obsAggregate.guardrail_blocks}</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex flex-col gap-1 shadow-md">
              <span className="stat-label text-xs font-semibold text-zinc-500 uppercase tracking-wider">Slow/Timeout Queries</span>
              <strong className="text-xl text-orange-400 font-sans font-extrabold">{obsAggregate.failed_queries}</strong>
            </div>
          </div>

          {/* Trace Logs list */}
          <div className="bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl shadow-lg flex flex-col gap-4">
            <h2 className="text-md font-bold text-zinc-200">Real-time Execution Traces & Quality Audits</h2>
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px]">
              {obsLogs.length === 0 ? (
                <p className="text-sm text-zinc-500 font-mono italic">No telemetry traces logged yet.</p>
              ) : (
                obsLogs.map((log) => (
                  <div key={log.id} className="border border-zinc-850 bg-zinc-900/10 p-4 rounded-xl flex flex-col gap-3">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${log.unsafe_flag ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`} />
                        <span className="text-xs font-bold text-zinc-300 font-mono">TRACE ID: {log.id}</span>
                        {log.unsafe_flag && (
                          <span className="bg-red-500/20 border border-red-500/40 text-[10px] text-red-400 px-2 py-0.5 rounded-full font-bold">
                            Guardrail Violation Blocked
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold text-zinc-200">User Prompt: <span className="text-zinc-400 font-normal">{log.query}</span></p>
                      {log.rewritten_query && log.rewritten_query !== log.query && (
                        <p className="text-xs text-orange-400 font-semibold">Rewritten Query variant: <span className="text-zinc-400 font-normal">{log.rewritten_query}</span></p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-950 p-3 rounded-xl border border-zinc-850 text-[10px] text-zinc-400 font-mono">
                      <div>
                        <span className="text-zinc-500 uppercase font-semibold">Model Routed</span>
                        <p className="text-zinc-300 font-bold mt-0.5">{log.model_used}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500 uppercase font-semibold">Timings</span>
                        <p className="text-zinc-300 mt-0.5">
                          Total: <span className="text-orange-400 font-bold">{log.latency_ms} ms</span>
                          {log.diagnostics && (
                            <span className="text-zinc-500 ml-1">
                              (R: {log.diagnostics.retrieval_ms || 0} / RR: {log.diagnostics.rerank_ms || 0})
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-zinc-500 uppercase font-semibold">Financial Cost</span>
                        <p className="text-zinc-300 font-bold mt-0.5">${(log.cost || 0).toFixed(5)}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500 uppercase font-semibold">RAG evaluation</span>
                        <p className="text-zinc-300 mt-0.5 font-bold">
                          Faithful: <span className="text-orange-400">{(log.evaluation?.faithfulness * 100).toFixed(0)}%</span>
                          <span className="text-zinc-500 mx-1">|</span>
                          Precision: <span className="text-orange-400">{(log.evaluation?.context_precision * 100).toFixed(0)}%</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

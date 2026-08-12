import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { apiGetEvaluationLogs, apiRunEvaluation } from "../api";

type EvaluationPageProps = {
  token: string;
  isAdmin: boolean;
};

type EvalLog = {
  id: number;
  query: string;
  recall_at_k: number;
  mrr: number;
  faithfulness: number;
  answer_relevancy: number;
  context_precision: number;
  created_at: string;
};

export function EvaluationPage({ token, isAdmin }: EvaluationPageProps) {
  const [logs, setLogs] = useState<EvalLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    apiGetEvaluationLogs(token)
      .then((res: { logs: EvalLog[] }) => setLogs(res.logs))
      .catch(() => {});
  }, [token, isAdmin]);

  const handleRunSample = async () => {
    setLoading(true);
    try {
      await apiRunEvaluation(token, {
        query: "What is the CGPA?",
        answer: "7.28",
        context: "CGPA: 7.28",
        retrieved_ids: ["chunk1"],
        ground_truth_ids: ["chunk1"],
        ground_truth_answer: "7.28",
      });
      const res = await apiGetEvaluationLogs(token);
      setLogs(res.logs);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  if (!isAdmin) {
    return <p className="error-text text-sm text-red-400">Admin access required.</p>;
  }

  const chartData = logs.slice(0, 10).map((l) => ({
    name: l.query.slice(0, 20),
    "Recall@K": l.recall_at_k ?? 0,
    MRR: l.mrr ?? 0,
    Faithfulness: l.faithfulness ?? 0,
    Relevancy: l.answer_relevancy ?? 0,
    Precision: l.context_precision ?? 0,
  }));

  return (
    <div className="page-container flex flex-col flex-1 min-h-0 overflow-y-auto" id="evaluation-page">
      <header className="page-header flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-white">Evaluation Dashboard</h1>
          <p className="muted-text text-sm text-zinc-400 mt-1">Groundedness, faithfulness, and precision quality controls</p>
        </div>
        <button
          type="button"
          className="secondary-button px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition shadow-md"
          onClick={() => void handleRunSample()}
          disabled={loading}
          id="evaluation-run-sample-btn"
        >
          Run Sample Evaluation
        </button>
      </header>

      <div className="eval-metrics-grid grid grid-cols-2 md:grid-cols-5 gap-4 mb-6" id="evaluation-statistics">
        {logs[0] && (
          <>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-xl flex flex-col gap-1 shadow-md">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Recall@K</span>
              <strong className="text-xl text-orange-400 font-mono">{(logs[0].recall_at_k * 100).toFixed(1)}%</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-xl flex flex-col gap-1 shadow-md">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">MRR</span>
              <strong className="text-xl text-orange-400 font-mono">{(logs[0].mrr * 100).toFixed(1)}%</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-xl flex flex-col gap-1 shadow-md">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Faithfulness</span>
              <strong className="text-xl text-orange-400 font-mono">{(logs[0].faithfulness * 100).toFixed(1)}%</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-xl flex flex-col gap-1 shadow-md">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Answer Relevancy</span>
              <strong className="text-xl text-orange-400 font-mono">{(logs[0].answer_relevancy * 100).toFixed(1)}%</strong>
            </div>
            <div className="stat-card bg-zinc-900/20 border border-zinc-900 p-4 rounded-xl flex flex-col gap-1 shadow-md">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Context Precision</span>
              <strong className="text-xl text-orange-400 font-mono">{(logs[0].context_precision * 100).toFixed(1)}%</strong>
            </div>
          </>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="chart-card bg-zinc-900/20 border border-zinc-900 p-5 rounded-2xl shadow-lg mb-6">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 font-sans">Recent Evaluations</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                <XAxis dataKey="name" stroke="#52525b" tick={{ fontSize: 9, fontFamily: "monospace" }} />
                <YAxis stroke="#52525b" domain={[0, 1]} tick={{ fontSize: 9, fontFamily: "monospace" }} />
                <Tooltip contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: "12px", fontSize: "11px" }} />
                <Bar dataKey="Recall@K" fill="#ff7a00" radius={[2, 2, 0, 0]} />
                <Bar dataKey="MRR" fill="#ff9333" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Faithfulness" fill="#ffb366" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="eval-log-table space-y-2.5 overflow-y-auto flex-1 pr-1">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Evaluation Logs</span>
        <div className="space-y-2 mt-2">
          {logs.map((log) => (
            <div key={log.id} className="eval-log-row flex justify-between items-center bg-zinc-900/20 hover:bg-zinc-900/60 p-4 rounded-xl border border-zinc-900/40 text-sm transition">
              <strong className="text-zinc-200 font-sans truncate pr-4">{log.query}</strong>
              <div className="flex gap-4 items-center text-xs font-mono text-zinc-400">
                <span>Recall: <strong className="text-orange-400">{((log.recall_at_k ?? 0) * 100).toFixed(0)}%</strong></span>
                <span>MRR: <strong className="text-orange-400">{((log.mrr ?? 0) * 100).toFixed(0)}%</strong></span>
                <span className="text-zinc-500">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
          {logs.length === 0 && <p className="muted-text text-zinc-500 text-center py-12 font-sans">No evaluation logs yet.</p>}
        </div>
      </div>
    </div>
  );
}

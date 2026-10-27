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
    return <p className="error-text">Admin access required.</p>;
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
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Evaluation Dashboard</h1>
          <p className="muted-text">RAG quality metrics</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void handleRunSample()} disabled={loading}>
          Run Sample Evaluation
        </button>
      </header>

      <div className="eval-metrics-grid">
        {logs[0] && (
          <>
            <div className="stat-card"><span>Recall@K</span><strong>{(logs[0].recall_at_k * 100).toFixed(1)}%</strong></div>
            <div className="stat-card"><span>MRR</span><strong>{(logs[0].mrr * 100).toFixed(1)}%</strong></div>
            <div className="stat-card"><span>Faithfulness</span><strong>{(logs[0].faithfulness * 100).toFixed(1)}%</strong></div>
            <div className="stat-card"><span>Answer Relevancy</span><strong>{(logs[0].answer_relevancy * 100).toFixed(1)}%</strong></div>
            <div className="stat-card"><span>Context Precision</span><strong>{(logs[0].context_precision * 100).toFixed(1)}%</strong></div>
          </>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="chart-card">
          <h3>Recent Evaluations</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fontSize: 10 }} />
              <YAxis stroke="#a1a1aa" domain={[0, 1]} />
              <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
              <Bar dataKey="Recall@K" fill="#ff7a00" />
              <Bar dataKey="MRR" fill="#ff9333" />
              <Bar dataKey="Faithfulness" fill="#ffb366" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="eval-log-table">
        {logs.map((log) => (
          <div key={log.id} className="eval-log-row">
            <strong>{log.query}</strong>
            <span>Recall: {((log.recall_at_k ?? 0) * 100).toFixed(0)}%</span>
            <span>MRR: {((log.mrr ?? 0) * 100).toFixed(0)}%</span>
            <span>{new Date(log.created_at).toLocaleString()}</span>
          </div>
        ))}
        {logs.length === 0 && <p className="muted-text">No evaluation logs yet.</p>}
      </div>
    </div>
  );
}

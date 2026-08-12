import { useState } from "react";
import { apiSubmitFeedback } from "../api";

type FeedbackButtonsProps = {
  feedbackId?: string;
  token: string;
};

export function FeedbackButtons({ feedbackId, token }: FeedbackButtonsProps) {
  const [submitted, setSubmitted] = useState<"helpful" | "not_helpful" | null>(null);
  const [loading, setLoading] = useState(false);

  if (!feedbackId) return null;

  const handleFeedback = async (helpful: boolean) => {
    if (submitted || loading) return;
    setLoading(true);
    try {
      await apiSubmitFeedback(token, feedbackId, helpful);
      setSubmitted(helpful ? "helpful" : "not_helpful");
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="feedback-buttons flex items-center gap-3 mt-3 text-xs text-zinc-400" id={`feedback-buttons-${feedbackId}`}>
      <span className="feedback-label font-sans">Was this helpful?</span>
      <button
        type="button"
        className={`feedback-btn px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs transition duration-150 hover:border-orange-500/30 ${
          submitted === "helpful" ? "active border-orange-500 bg-orange-500/10 text-orange-400" : ""
        }`}
        onClick={() => void handleFeedback(true)}
        disabled={!!submitted || loading}
        id={`feedback-helpful-btn-${feedbackId}`}
      >
        👍 Helpful
      </button>
      <button
        type="button"
        className={`feedback-btn px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs transition duration-150 hover:border-orange-500/30 ${
          submitted === "not_helpful" ? "active border-orange-500 bg-orange-500/10 text-orange-400" : ""
        }`}
        onClick={() => void handleFeedback(false)}
        disabled={!!submitted || loading}
        id={`feedback-unhelpful-btn-${feedbackId}`}
      >
        👎 Not Helpful
      </button>
      {submitted && (
        <span className="feedback-thanks text-orange-400 font-sans font-medium">
          Thanks for your feedback!
        </span>
      )}
    </div>
  );
}

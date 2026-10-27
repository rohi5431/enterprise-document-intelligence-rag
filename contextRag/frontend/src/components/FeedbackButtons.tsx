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
    <div className="feedback-buttons">
      <span className="feedback-label">Was this helpful?</span>
      <button
        type="button"
        className={`feedback-btn ${submitted === "helpful" ? "active" : ""}`}
        onClick={() => void handleFeedback(true)}
        disabled={!!submitted || loading}
      >
        👍 Helpful
      </button>
      <button
        type="button"
        className={`feedback-btn ${submitted === "not_helpful" ? "active" : ""}`}
        onClick={() => void handleFeedback(false)}
        disabled={!!submitted || loading}
      >
        👎 Not Helpful
      </button>
      {submitted && <span className="feedback-thanks">Thanks for your feedback!</span>}
    </div>
  );
}

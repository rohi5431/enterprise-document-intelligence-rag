"""
Phase 2: Performance Monitoring Service
Tracks and analyzes pipeline performance metrics
"""

import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from collections import defaultdict


@dataclass
class PerformanceMetric:
    """Individual performance metric"""
    operation: str
    duration_ms: float
    timestamp: datetime
    status: str  # success, error
    details: Optional[Dict] = None


class PerformanceMonitor:
    """Monitors and tracks performance metrics"""
    
    def __init__(self, max_history: int = 1000):
        self.metrics: List[PerformanceMetric] = []
        self.max_history = max_history
        self.operation_stats = defaultdict(lambda: {
            "count": 0,
            "total_time": 0,
            "min_time": float('inf'),
            "max_time": 0,
            "errors": 0
        })
    
    def record_metric(self, operation: str, duration_ms: float, 
                     status: str = "success", details: Optional[Dict] = None):
        """Record a performance metric"""
        metric = PerformanceMetric(
            operation=operation,
            duration_ms=duration_ms,
            timestamp=datetime.utcnow(),
            status=status,
            details=details
        )
        
        self.metrics.append(metric)
        
        # Keep history size manageable
        if len(self.metrics) > self.max_history:
            self.metrics = self.metrics[-self.max_history:]
        
        # Update operation stats
        stats = self.operation_stats[operation]
        stats["count"] += 1
        stats["total_time"] += duration_ms
        stats["min_time"] = min(stats["min_time"], duration_ms)
        stats["max_time"] = max(stats["max_time"], duration_ms)
        if status == "error":
            stats["errors"] += 1
    
    def get_operation_stats(self, operation: str = None) -> Dict:
        """Get statistics for an operation"""
        if operation:
            if operation not in self.operation_stats:
                return {"operation": operation, "data": {}}
            
            stats = self.operation_stats[operation].copy()
            if stats["count"] > 0:
                stats["avg_time"] = stats["total_time"] / stats["count"]
                stats["success_rate"] = ((stats["count"] - stats["errors"]) / stats["count"]) * 100
            
            return {
                "operation": operation,
                "data": stats
            }
        else:
            # Return all operations
            all_stats = {}
            for op, stats in self.operation_stats.items():
                stats_copy = stats.copy()
                if stats_copy["count"] > 0:
                    stats_copy["avg_time"] = stats_copy["total_time"] / stats_copy["count"]
                    stats_copy["success_rate"] = ((stats_copy["count"] - stats_copy["errors"]) / stats_copy["count"]) * 100
                all_stats[op] = stats_copy
            
            return all_stats
    
    def get_summary(self) -> Dict:
        """Get performance summary"""
        if not self.metrics:
            return {
                "status": "no_data",
                "total_metrics": 0
            }
        
        # Calculate overall stats
        operations = set(m.operation for m in self.metrics)
        total_operations = len(self.metrics)
        total_errors = sum(1 for m in self.metrics if m.status == "error")
        success_rate = ((total_operations - total_errors) / total_operations) * 100
        
        avg_duration = sum(m.duration_ms for m in self.metrics) / total_operations
        min_duration = min(m.duration_ms for m in self.metrics)
        max_duration = max(m.duration_ms for m in self.metrics)
        
        # Recent metrics (last hour)
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        recent_metrics = [m for m in self.metrics if m.timestamp > one_hour_ago]
        
        return {
            "status": "success",
            "summary": {
                "total_metrics": total_operations,
                "unique_operations": len(operations),
                "total_errors": total_errors,
                "success_rate": round(success_rate, 2),
                "avg_duration_ms": round(avg_duration, 2),
                "min_duration_ms": round(min_duration, 2),
                "max_duration_ms": round(max_duration, 2)
            },
            "recent_metrics": {
                "last_hour": len(recent_metrics),
                "avg_duration_ms": round(
                    sum(m.duration_ms for m in recent_metrics) / len(recent_metrics), 2
                ) if recent_metrics else 0
            },
            "operations": sorted(operations)
        }
    
    def get_slowest_operations(self, limit: int = 10) -> List[Dict]:
        """Get slowest operations"""
        sorted_metrics = sorted(self.metrics, key=lambda m: m.duration_ms, reverse=True)
        
        return [
            {
                "operation": m.operation,
                "duration_ms": m.duration_ms,
                "timestamp": m.timestamp.isoformat(),
                "status": m.status
            }
            for m in sorted_metrics[:limit]
        ]
    
    def get_operation_timeline(self, operation: str, limit: int = 100) -> List[Dict]:
        """Get timeline for a specific operation"""
        op_metrics = [m for m in self.metrics if m.operation == operation]
        op_metrics = op_metrics[-limit:]  # Last N
        
        return [
            {
                "timestamp": m.timestamp.isoformat(),
                "duration_ms": m.duration_ms,
                "status": m.status
            }
            for m in op_metrics
        ]
    
    def get_performance_report(self) -> Dict:
        """Generate comprehensive performance report"""
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "summary": self.get_summary(),
            "operation_stats": self.get_operation_stats(),
            "slowest_operations": self.get_slowest_operations(limit=10),
            "total_metrics_recorded": len(self.metrics)
        }


class IngestionPerformanceTracker:
    """Tracks performance metrics for document ingestion"""
    
    def __init__(self):
        self.monitor = PerformanceMonitor()
        self.ingestion_start_time = None
        self.document_metrics = {}
    
    def start_document_ingestion(self, document_id: int):
        """Mark start of document ingestion"""
        self.document_metrics[document_id] = {
            "start_time": time.time(),
            "phases": {}
        }
    
    def record_phase(self, document_id: int, phase_name: str):
        """Record timing for a specific phase"""
        if document_id not in self.document_metrics:
            return
        
        if "phases" not in self.document_metrics[document_id]:
            self.document_metrics[document_id]["phases"] = {}
        
        self.document_metrics[document_id]["phases"][phase_name] = time.time()
    
    def end_document_ingestion(self, document_id: int, status: str = "success") -> Dict:
        """Complete document ingestion and calculate metrics"""
        if document_id not in self.document_metrics:
            return {}
        
        metrics = self.document_metrics[document_id]
        end_time = time.time()
        start_time = metrics["start_time"]
        
        total_duration = (end_time - start_time) * 1000  # Convert to ms
        
        self.monitor.record_metric(
            "document_ingestion",
            total_duration,
            status=status,
            details={"document_id": document_id}
        )
        
        # Calculate phase durations
        phase_durations = {}
        phase_times = metrics.get("phases", {})
        if phase_times:
            phase_start = start_time
            for phase, phase_time in sorted(phase_times.items()):
                phase_durations[phase] = (phase_time - phase_start) * 1000
                phase_start = phase_time
        
        return {
            "document_id": document_id,
            "total_duration_ms": round(total_duration, 2),
            "phase_durations": {k: round(v, 2) for k, v in phase_durations.items()},
            "status": status
        }
    
    def get_ingestion_stats(self) -> Dict:
        """Get ingestion-specific statistics"""
        stats = self.monitor.get_operation_stats("document_ingestion")
        return stats


class QueryPerformanceTracker:
    """Tracks performance metrics for query processing"""
    
    def __init__(self):
        self.monitor = PerformanceMonitor()
        self.query_metrics = {}
    
    def start_query(self, query_id: str):
        """Mark start of query processing"""
        self.query_metrics[query_id] = {
            "start_time": time.time(),
            "stages": {}
        }
    
    def record_stage(self, query_id: str, stage_name: str):
        """Record timing for a query stage"""
        if query_id not in self.query_metrics:
            return
        
        self.query_metrics[query_id]["stages"][stage_name] = time.time()
    
    def end_query(self, query_id: str, status: str = "success") -> Dict:
        """Complete query processing and calculate metrics"""
        if query_id not in self.query_metrics:
            return {}
        
        metrics = self.query_metrics[query_id]
        end_time = time.time()
        start_time = metrics["start_time"]
        
        total_duration = (end_time - start_time) * 1000  # Convert to ms
        
        self.monitor.record_metric(
            "query_processing",
            total_duration,
            status=status,
            details={"query_id": query_id}
        )
        
        # Calculate stage durations
        stage_durations = {}
        stage_times = metrics.get("stages", {})
        if stage_times:
            stage_start = start_time
            for stage, stage_time in sorted(stage_times.items()):
                stage_durations[stage] = (stage_time - stage_start) * 1000
                stage_start = stage_time
        
        return {
            "query_id": query_id,
            "total_duration_ms": round(total_duration, 2),
            "stage_durations": {k: round(v, 2) for k, v in stage_durations.items()},
            "status": status
        }
    
    def get_query_stats(self) -> Dict:
        """Get query-specific statistics"""
        return self.monitor.get_operation_stats("query_processing")


# Global monitor instances
_performance_monitor = PerformanceMonitor()
_ingestion_tracker = IngestionPerformanceTracker()
_query_tracker = QueryPerformanceTracker()


def get_performance_monitor() -> PerformanceMonitor:
    """Get global performance monitor"""
    return _performance_monitor


def get_ingestion_tracker() -> IngestionPerformanceTracker:
    """Get global ingestion tracker"""
    return _ingestion_tracker


def get_query_tracker() -> QueryPerformanceTracker:
    """Get global query tracker"""
    return _query_tracker

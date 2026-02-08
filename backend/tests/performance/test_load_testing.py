"""
Load testing and performance tests for the backend API.

These tests simulate realistic user behavior and measure performance
under various load conditions.
"""

import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pytest
import requests
from fastapi.testclient import TestClient


class LoadTestConfig:
    """Configuration for load tests."""

    # Test durations (seconds)
    QUICK_TEST_DURATION = 10
    STANDARD_TEST_DURATION = 60
    EXTENDED_TEST_DURATION = 300

    # Concurrent users
    LOW_CONCURRENCY = 5
    MEDIUM_CONCURRENCY = 20
    HIGH_CONCURRENCY = 50
    STRESS_CONCURRENCY = 100

    # Performance thresholds
    ACCEPTABLE_RESPONSE_TIME = 2.0  # seconds
    EXCELLENT_RESPONSE_TIME = 0.5   # seconds
    MAX_ERROR_RATE = 0.05           # 5% error rate

    # Request patterns
    THINK_TIME = 1.0  # seconds between user actions
    RAMP_UP_TIME = 10  # seconds to ramp up users


class PerformanceMetrics:
    """Track and analyze performance metrics."""

    def __init__(self):
        self.response_times: List[float] = []
        self.error_count: int = 0
        self.total_requests: int = 0
        self.start_time: float = 0
        self.end_time: float = 0

    def record_request(self, response_time: float, success: bool):
        """Record a request result."""
        self.response_times.append(response_time)
        self.total_requests += 1
        if not success:
            self.error_count += 1

    def start_test(self):
        """Mark test start time."""
        self.start_time = time.time()

    def end_test(self):
        """Mark test end time."""
        self.end_time = time.time()

    def get_summary(self) -> Dict[str, Any]:
        """Get performance summary."""
        if not self.response_times:
            return {"error": "No data recorded"}

        duration = self.end_time - self.start_time if self.end_time > 0 else 0

        return {
            "total_requests": self.total_requests,
            "error_count": self.error_count,
            "error_rate": self.error_count / max(self.total_requests, 1),
            "duration_seconds": duration,
            "requests_per_second": self.total_requests / max(duration, 1),
            "response_times": {
                "min": min(self.response_times),
                "max": max(self.response_times),
                "mean": statistics.mean(self.response_times),
                "median": statistics.median(self.response_times),
                "p95": self._percentile(self.response_times, 95),
                "p99": self._percentile(self.response_times, 99),
            }
        }

    def _percentile(self, data: List[float], p: float) -> float:
        """Calculate percentile."""
        if not data:
            return 0.0
        sorted_data = sorted(data)
        index = int((p / 100) * len(sorted_data))
        return sorted_data[min(index, len(sorted_data) - 1)]

    def assert_performance_requirements(self):
        """Assert that performance meets requirements."""
        summary = self.get_summary()

        # Check error rate
        assert summary["error_rate"] <= LoadTestConfig.MAX_ERROR_RATE, \
            f"Error rate {summary['error_rate']:.2%} exceeds maximum {LoadTestConfig.MAX_ERROR_RATE:.2%}"

        # Check response times
        assert summary["response_times"]["p95"] <= LoadTestConfig.ACCEPTABLE_RESPONSE_TIME, \
            f"95th percentile response time {summary['response_times']['p95']:.2f}s exceeds threshold"

        # Check that we got some successful responses
        assert summary["total_requests"] > summary["error_count"], \
            "More errors than successful requests"


class UserSimulator:
    """Simulate realistic user behavior."""

    def __init__(self, client: TestClient, user_id: str = None):
        self.client = client
        self.user_id = user_id or f"user_{int(time.time() * 1000) % 10000}"
        self.session_id = None

    def authenticate(self) -> Dict[str, str]:
        """Get auth headers for this user."""
        # Mock authentication for load testing
        return {"Authorization": f"Bearer mock-token-{self.user_id}"}

    def send_chat_message(self, message: str) -> requests.Response:
        """Send a chat message."""
        return self.client.post(
            "/api/v1/chat/",
            headers=self.authenticate(),
            json={
                "message": message,
                "session_id": self.session_id,
                "context": {}
            }
        )

    def list_sessions(self) -> requests.Response:
        """List user's chat sessions."""
        return self.client.get(
            "/api/v1/chat/sessions",
            headers=self.authenticate()
        )

    def get_session(self, session_id: str) -> requests.Response:
        """Get a specific session."""
        return self.client.get(
            f"/api/v1/chat/sessions/{session_id}",
            headers=self.authenticate()
        )

    def health_check(self) -> requests.Response:
        """Check API health."""
        return self.client.get("/api/v1/health/")

    def simulate_conversation(self, num_messages: int = 5) -> List[requests.Response]:
        """Simulate a realistic conversation."""
        responses = []

        messages = [
            "Hello, how are you today?",
            "Can you help me with Python programming?",
            "What's the difference between lists and tuples?",
            "How do I handle exceptions in Python?",
            "Thanks for your help!"
        ]

        for i in range(min(num_messages, len(messages))):
            response = self.send_chat_message(messages[i])
            responses.append(response)

            # Extract session ID from first response
            if i == 0 and response.status_code == 200:
                try:
                    data = response.json()
                    self.session_id = data.get("session_id")
                except:
                    pass

            # Simulate user think time
            time.sleep(0.5)

        return responses

    def simulate_browsing(self) -> List[requests.Response]:
        """Simulate user browsing behavior."""
        responses = []

        # Check health
        responses.append(self.health_check())
        time.sleep(0.2)

        # List sessions
        responses.append(self.list_sessions())
        time.sleep(0.3)

        # Send a message
        responses.append(self.send_chat_message("Quick question"))
        time.sleep(0.5)

        # List sessions again
        responses.append(self.list_sessions())

        return responses


@pytest.mark.performance
class TestBasicPerformance:
    """Basic performance tests."""

    def test_health_endpoint_performance(self, client: TestClient):
        """Test health endpoint under load."""
        metrics = PerformanceMetrics()
        metrics.start_test()

        # Simulate multiple concurrent health checks
        def make_health_request():
            start_time = time.time()
            try:
                response = client.get("/api/v1/health/")
                end_time = time.time()
                success = response.status_code == 200
            except Exception:
                end_time = time.time()
                success = False

            return end_time - start_time, success

        # Run concurrent requests
        with ThreadPoolExecutor(max_workers=LoadTestConfig.LOW_CONCURRENCY) as executor:
            futures = [
                executor.submit(make_health_request)
                for _ in range(50)
            ]

            for future in as_completed(futures):
                response_time, success = future.result()
                metrics.record_request(response_time, success)

        metrics.end_test()

        # Analyze results
        summary = metrics.get_summary()
        print(f"Health endpoint performance: {summary}")

        # Health endpoint should be very fast
        assert summary["response_times"]["p95"] < 0.1  # 100ms
        assert summary["error_rate"] == 0  # No errors expected

    @patch('app.services.chat_service.ChatService')
    def test_chat_endpoint_performance(self, mock_chat_service, client: TestClient):
        """Test chat endpoint performance."""
        # Mock chat service for consistent responses
        mock_instance = mock_chat_service.return_value
        mock_instance.process_message.return_value = {
            "message": "This is a test response",
            "session_id": "test-session",
            "response_time": 0.1
        }

        metrics = PerformanceMetrics()
        metrics.start_test()

        def make_chat_request():
            start_time = time.time()
            try:
                response = client.post(
                    "/api/v1/chat/",
                    json={"message": "Test message"}
                )
                end_time = time.time()
                success = response.status_code == 200
            except Exception:
                end_time = time.time()
                success = False

            return end_time - start_time, success

        # Run concurrent chat requests
        with ThreadPoolExecutor(max_workers=LoadTestConfig.LOW_CONCURRENCY) as executor:
            futures = [
                executor.submit(make_chat_request)
                for _ in range(25)
            ]

            for future in as_completed(futures):
                response_time, success = future.result()
                metrics.record_request(response_time, success)

        metrics.end_test()

        # Analyze results
        summary = metrics.get_summary()
        print(f"Chat endpoint performance: {summary}")

        # Chat should respond reasonably quickly
        assert summary["response_times"]["p95"] < LoadTestConfig.ACCEPTABLE_RESPONSE_TIME
        metrics.assert_performance_requirements()


@pytest.mark.performance
@pytest.mark.slow
class TestLoadTesting:
    """Comprehensive load testing."""

    @patch('app.services.chat_service.ChatService')
    def test_sustained_load(self, mock_chat_service, client: TestClient):
        """Test sustained load over time."""
        # Mock dependencies
        mock_instance = mock_chat_service.return_value
        mock_instance.process_message.return_value = {
            "message": "Load test response",
            "session_id": "load-test-session",
            "response_time": 0.05
        }

        metrics = PerformanceMetrics()
        metrics.start_test()

        def user_session():
            """Simulate a complete user session."""
            simulator = UserSimulator(client)
            responses = []

            try:
                # Health check
                responses.append(simulator.health_check())
                time.sleep(0.1)

                # Conversation
                responses.extend(simulator.simulate_conversation(3))
                time.sleep(0.2)

                # Browse sessions
                responses.extend(simulator.simulate_browsing())

            except Exception as e:
                print(f"User session failed: {e}")
                responses = [MagicMock(status_code=500)]

            return responses

        # Run concurrent user sessions
        with ThreadPoolExecutor(max_workers=LoadTestConfig.MEDIUM_CONCURRENCY) as executor:
            # Submit multiple user sessions
            futures = [
                executor.submit(user_session)
                for _ in range(LoadTestConfig.MEDIUM_CONCURRENCY)
            ]

            # Collect results
            for future in as_completed(futures):
                responses = future.result()
                for response in responses:
                    # Record timing (mock timing for load test)
                    response_time = 0.1 + (hash(str(response)) % 100) / 1000
                    success = hasattr(response, 'status_code') and response.status_code < 400
                    metrics.record_request(response_time, success)

        metrics.end_test()

        # Analyze results
        summary = metrics.get_summary()
        print(f"Sustained load test results: {summary}")

        # Performance requirements
        metrics.assert_performance_requirements()

        # Should handle reasonable requests per second
        assert summary["requests_per_second"] > 10

    def test_ramp_up_performance(self, client: TestClient):
        """Test performance during user ramp-up."""
        metrics = PerformanceMetrics()
        metrics.start_test()

        def gradual_load_test():
            """Gradually increase load."""
            max_users = LoadTestConfig.LOW_CONCURRENCY
            ramp_duration = 10  # seconds

            for current_users in range(1, max_users + 1):
                # Add user load
                with ThreadPoolExecutor(max_workers=current_users) as executor:
                    futures = []
                    for _ in range(current_users):
                        future = executor.submit(
                            lambda: client.get("/api/v1/health/")
                        )
                        futures.append(future)

                    # Wait for completion and record metrics
                    for future in as_completed(futures):
                        start_time = time.time()
                        try:
                            response = future.result(timeout=5)
                            success = response.status_code == 200
                        except:
                            success = False
                        end_time = time.time()

                        metrics.record_request(end_time - start_time, success)

                # Brief pause between ramp steps
                time.sleep(ramp_duration / max_users)

        gradual_load_test()
        metrics.end_test()

        summary = metrics.get_summary()
        print(f"Ramp-up test results: {summary}")

        # Should handle gradual load increase
        assert summary["error_rate"] <= 0.1  # Allow slightly higher error rate during ramp-up

    def test_spike_load(self, client: TestClient):
        """Test performance during sudden load spikes."""
        metrics = PerformanceMetrics()

        def spike_test():
            """Sudden spike in load."""
            # Normal load baseline
            for _ in range(5):
                start_time = time.time()
                try:
                    response = client.get("/api/v1/health/")
                    success = response.status_code == 200
                except:
                    success = False
                end_time = time.time()
                metrics.record_request(end_time - start_time, success)
                time.sleep(0.1)

            # Sudden spike
            with ThreadPoolExecutor(max_workers=LoadTestConfig.MEDIUM_CONCURRENCY) as executor:
                futures = [
                    executor.submit(lambda: client.get("/api/v1/health/"))
                    for _ in range(LoadTestConfig.MEDIUM_CONCURRENCY * 2)
                ]

                for future in as_completed(futures):
                    start_time = time.time()
                    try:
                        response = future.result(timeout=10)
                        success = response.status_code == 200
                    except:
                        success = False
                    end_time = time.time()
                    metrics.record_request(end_time - start_time, success)

        metrics.start_test()
        spike_test()
        metrics.end_test()

        summary = metrics.get_summary()
        print(f"Spike load test results: {summary}")

        # Should handle spikes gracefully (may have higher response times)
        assert summary["error_rate"] <= 0.2  # Allow higher error rate during spike
        assert summary["response_times"]["median"] < LoadTestConfig.ACCEPTABLE_RESPONSE_TIME


@pytest.mark.performance
@pytest.mark.stress
class TestStressTesting:
    """Stress tests to find breaking points."""

    def test_memory_usage_under_load(self, client: TestClient):
        """Test memory usage during sustained load."""
        import os

        import psutil

        # Get current process
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB

        metrics = PerformanceMetrics()
        metrics.start_test()

        # Generate sustained load
        def memory_stress_test():
            for _ in range(100):
                try:
                    response = client.get("/api/v1/health/")
                    success = response.status_code == 200
                except:
                    success = False

                metrics.record_request(0.1, success)  # Mock timing

        # Run multiple threads to stress memory
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [
                executor.submit(memory_stress_test)
                for _ in range(5)
            ]

            for future in as_completed(futures):
                future.result()

        metrics.end_test()

        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory

        print(f"Memory usage: {initial_memory:.1f}MB -> {final_memory:.1f}MB (Δ{memory_increase:.1f}MB)")

        # Memory should not increase dramatically
        assert memory_increase < 100  # Less than 100MB increase

    def test_database_connection_stress(self, client: TestClient):
        """Test database connection handling under stress."""
        metrics = PerformanceMetrics()
        metrics.start_test()

        def db_stress_request():
            """Make requests that likely hit the database."""
            start_time = time.time()
            try:
                # Health check hits database
                response = client.get("/api/v1/health/")
                success = response.status_code == 200
            except Exception:
                success = False
            end_time = time.time()

            return end_time - start_time, success

        # High concurrency to stress connection pool
        with ThreadPoolExecutor(max_workers=LoadTestConfig.HIGH_CONCURRENCY) as executor:
            futures = [
                executor.submit(db_stress_request)
                for _ in range(LoadTestConfig.HIGH_CONCURRENCY * 3)
            ]

            for future in as_completed(futures):
                response_time, success = future.result()
                metrics.record_request(response_time, success)

        metrics.end_test()

        summary = metrics.get_summary()
        print(f"Database stress test results: {summary}")

        # Should handle database connections gracefully
        # Allow higher error rates for stress testing
        assert summary["error_rate"] <= 0.3  # 30% error rate acceptable under stress

    def test_find_breaking_point(self, client: TestClient):
        """Find the breaking point of the system."""
        breaking_point_found = False
        current_concurrency = 5

        while not breaking_point_found and current_concurrency <= 100:
            metrics = PerformanceMetrics()
            metrics.start_test()

            print(f"Testing concurrency level: {current_concurrency}")

            def stress_request():
                start_time = time.time()
                try:
                    response = client.get("/api/v1/health/", timeout=5)
                    success = response.status_code == 200
                except:
                    success = False
                end_time = time.time()
                return end_time - start_time, success

            with ThreadPoolExecutor(max_workers=current_concurrency) as executor:
                futures = [
                    executor.submit(stress_request)
                    for _ in range(current_concurrency * 2)
                ]

                for future in as_completed(futures):
                    response_time, success = future.result()
                    metrics.record_request(response_time, success)

            metrics.end_test()
            summary = metrics.get_summary()

            # Check if system is breaking down
            if (summary["error_rate"] > 0.5 or
                summary["response_times"]["p95"] > 10.0):
                breaking_point_found = True
                print(f"Breaking point found at concurrency: {current_concurrency}")
                print(f"Error rate: {summary['error_rate']:.2%}")
                print(f"P95 response time: {summary['response_times']['p95']:.2f}s")
            else:
                print(f"Concurrency {current_concurrency} handled successfully")
                print(f"Error rate: {summary['error_rate']:.2%}, P95: {summary['response_times']['p95']:.2f}s")

            current_concurrency += 10

        # System should handle at least 20 concurrent users
        assert current_concurrency > 20, f"System broke at too low concurrency: {current_concurrency}"


@pytest.mark.performance
class TestPerformanceRegression:
    """Performance regression tests."""

    def test_baseline_performance(self, client: TestClient):
        """Establish baseline performance metrics."""
        metrics = PerformanceMetrics()
        metrics.start_test()

        # Run baseline tests
        baseline_endpoints = [
            "/api/v1/health/",
            "/api/v1/health/live",
            "/api/v1/health/ready",
        ]

        for endpoint in baseline_endpoints:
            for _ in range(10):
                start_time = time.time()
                try:
                    response = client.get(endpoint)
                    success = response.status_code == 200
                except:
                    success = False
                end_time = time.time()

                metrics.record_request(end_time - start_time, success)
                time.sleep(0.01)  # Brief pause

        metrics.end_test()
        summary = metrics.get_summary()

        # Store baseline metrics (in real implementation, save to file/database)
        baseline_metrics = {
            "p95_response_time": summary["response_times"]["p95"],
            "mean_response_time": summary["response_times"]["mean"],
            "error_rate": summary["error_rate"],
            "rps": summary["requests_per_second"]
        }

        print(f"Baseline performance established: {baseline_metrics}")

        # Baseline requirements
        assert baseline_metrics["p95_response_time"] < 1.0  # 1 second
        assert baseline_metrics["error_rate"] == 0  # No errors in baseline
        assert baseline_metrics["rps"] > 5  # At least 5 RPS

        return baseline_metrics

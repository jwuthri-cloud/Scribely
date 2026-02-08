"""
Integration tests for health check API endpoints.
"""

from fastapi.testclient import TestClient


class TestHealthAPI:
    """Test health check endpoints."""

    def test_main_health_check(self, client: TestClient):
        """Test main health check endpoint."""
        response = client.get("/api/v1/health/")

        assert response.status_code == 200
        data = response.json()

        assert "status" in data
        assert data["status"] in ["healthy", "unhealthy"]
        assert "timestamp" in data
        assert "service" in data
        assert "version" in data
        assert "services" in data

        # Check services status
        services = data["services"]
        assert "database" in services
        assert services["database"] in ["healthy", "unhealthy"]

    def test_database_health_check(self, client: TestClient):
        """Test database-specific health check."""
        response = client.get("/api/v1/health/database")

        assert response.status_code == 200
        data = response.json()

        assert "service" in data
        assert data["service"] == "database"
        assert "status" in data
        assert data["status"] in ["healthy", "unhealthy"]
        assert "timestamp" in data

    def test_readiness_check(self, client: TestClient):
        """Test readiness probe endpoint."""
        response = client.get("/api/v1/health/ready")

        # May be 200 or 503 depending on service availability
        assert response.status_code in [200, 503]
        data = response.json()

        assert "ready" in data
        assert isinstance(data["ready"], bool)
        assert "timestamp" in data
        assert "services" in data

        # Check individual service readiness
        services = data["services"]
        assert "database" in services
        assert isinstance(services["database"], bool)

    def test_liveness_check(self, client: TestClient):
        """Test liveness probe endpoint."""
        response = client.get("/api/v1/health/live")

        # Liveness should always be 200 unless the app is completely broken
        assert response.status_code == 200
        data = response.json()

        assert "alive" in data
        assert data["alive"] is True
        assert "timestamp" in data

    def test_legacy_health_redirect(self, client: TestClient):
        """Test legacy health endpoint redirects properly."""
        response = client.get("/health", follow_redirects=False)

        assert response.status_code == 307  # Temporary redirect
        assert response.headers["location"] == "/api/v1/health"

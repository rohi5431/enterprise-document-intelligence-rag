"""
Custom application exceptions
"""
from fastapi import HTTPException, status


class AppException(HTTPException):
    """Base application exception."""
    def __init__(self, status_code: int, detail: str, error_code: str = "APP_ERROR"):
        super().__init__(status_code=status_code, detail=detail)
        self.error_code = error_code


class NotFoundException(AppException):
    def __init__(self, resource: str = "Resource", identifier: object = None):
        detail = f"{resource} not found" + (f" (id={identifier})" if identifier else "")
        super().__init__(status.HTTP_404_NOT_FOUND, detail, "NOT_FOUND")


class UnauthorizedException(AppException):
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail, "UNAUTHORIZED")


class ForbiddenException(AppException):
    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(status.HTTP_403_FORBIDDEN, detail, "FORBIDDEN")


class ConflictException(AppException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(status.HTTP_409_CONFLICT, detail, "CONFLICT")


class ValidationException(AppException):
    def __init__(self, detail: str = "Validation failed"):
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, detail, "VALIDATION_ERROR")


class RateLimitException(AppException):
    def __init__(self, detail: str = "Rate limit exceeded"):
        super().__init__(status.HTTP_429_TOO_MANY_REQUESTS, detail, "RATE_LIMIT_EXCEEDED")


class ServiceUnavailableException(AppException):
    def __init__(self, service: str = "Service"):
        super().__init__(status.HTTP_503_SERVICE_UNAVAILABLE, f"{service} is unavailable", "SERVICE_UNAVAILABLE")


class DocumentProcessingException(AppException):
    def __init__(self, detail: str = "Document processing failed"):
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, detail, "PROCESSING_ERROR")

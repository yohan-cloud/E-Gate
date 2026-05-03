from django.conf import settings


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("X-Content-Type-Options", "nosniff")
        response.setdefault("X-Frame-Options", "DENY")
        response.setdefault("Referrer-Policy", "same-origin")
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")

        if getattr(settings, "SECURITY_CSP_ENABLED", True):
            exempt_paths = getattr(settings, "SECURITY_CSP_EXEMPT_PATHS", ())
            if not any(request.path.startswith(path) for path in exempt_paths):
                header = "Content-Security-Policy-Report-Only" if getattr(settings, "SECURITY_CSP_REPORT_ONLY", False) else "Content-Security-Policy"
                response.setdefault(header, getattr(settings, "CONTENT_SECURITY_POLICY", "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"))
        return response

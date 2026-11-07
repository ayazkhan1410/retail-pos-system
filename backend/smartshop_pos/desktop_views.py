"""Same-origin frontend and collected static files for the Windows distribution."""

from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.views.decorators.http import require_safe


@require_safe
def desktop_file(request, asset='', *, static=False):
    root = Path(settings.TIJORI_STATIC_DIR if static else settings.TIJORI_FRONTEND_DIR).resolve()
    candidate = (root / asset).resolve()
    if not candidate.is_relative_to(root) or any(part.startswith('.') for part in Path(asset).parts):
        raise Http404
    if not candidate.is_file():
        # BrowserRouter deep links use the shell; missing bundles and API paths are real 404s.
        if static or '.' in Path(asset).name or asset.startswith(('assets/', 'api/', 'admin/', 'static/')):
            raise Http404
        candidate = root / 'index.html'
    if not candidate.is_file():
        raise Http404
    response = FileResponse(candidate.open('rb'))
    if candidate.suffix in {'.js', '.mjs'}:
        response['Content-Type'] = 'text/javascript'
    response['Cache-Control'] = 'public, max-age=31536000, immutable' if asset.startswith('assets/') else 'no-cache'
    return response

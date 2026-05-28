"""Service routing contract tests.

TestFrontendRoutingContract — static assertions that verify all 9 client-side
services (img2pdf, imgs2pdf + 7 new) are:
  • absent from the SERVICE_HANDLERS backend dispatch table
  • present in the data.js service registry
  • routed via the _clientComps map in service-sheet.jsx
  • each *Pro component exported as window.* global in its .jsx file

TestImg2PdfBackendFallback — integration tests for /api/img2pdf and /api/imgs2pdf.
TestClientSideBackendFallbacks — integration tests for the 6 text/image fallback
endpoints that correspond to client-side services.
"""

import io
import os
import re

import pytest

# ─── Paths ────────────────────────────────────────────────────────────────────

_ROOT          = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_HANDLERS_JS   = os.path.join(_ROOT, "src", "services", "handlers.js")
_SERVICE_SHEET = os.path.join(_ROOT, "src", "features", "service-sheet.jsx")
_DATA_JS       = os.path.join(_ROOT, "src", "data", "data.js")

# Client-side service id → expected window global name
CLIENT_SIDE_SERVICES = {
    "img2pdf":     "Img2PdfPro",
    "imgs2pdf":    "Img2PdfPro",   # same component
    "imgcompress": "ImgCompressPro",
    "qr":          "QrPro",
    "stats":       "StatsPro",
    "readtime":    "ReadTimePro",
    "translit":    "TranslitPro",
    "deadline":    "DeadlinePro",
    "password":    "PasswordPro",
}

# Services that have a backend fallback endpoint
BACKEND_FALLBACK_ENDPOINTS = {
    "imgcompress": "/api/imgcompress",
    "qr":          "/api/qr",
    "stats":       "/api/stats",
    "readtime":    "/api/readtime",
    "translit":    "/api/translit",
    "deadline":    "/api/deadline",
    # img2pdf / imgs2pdf have their own test class
}

# Feature .jsx files for each unique component
COMPONENT_FILES = {
    "Img2PdfPro":    os.path.join(_ROOT, "src", "features", "img2pdf-pro.jsx"),
    "ImgCompressPro": os.path.join(_ROOT, "src", "features", "imgcompress-pro.jsx"),
    "QrPro":         os.path.join(_ROOT, "src", "features", "qr-pro.jsx"),
    "StatsPro":      os.path.join(_ROOT, "src", "features", "stats-pro.jsx"),
    "ReadTimePro":   os.path.join(_ROOT, "src", "features", "readtime-pro.jsx"),
    "TranslitPro":   os.path.join(_ROOT, "src", "features", "translit-pro.jsx"),
    "DeadlinePro":   os.path.join(_ROOT, "src", "features", "deadline-pro.jsx"),
    "PasswordPro":   os.path.join(_ROOT, "src", "features", "password-pro.jsx"),
}


# ─── JS parsing helpers ───────────────────────────────────────────────────────

def _read(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def _strip_line_comments(text: str) -> str:
    return re.sub(r"//[^\n]*", "", text)


def _service_handlers_active_keys(src: str) -> set[str]:
    """Comment-stripped active property keys in SERVICE_HANDLERS = { … }."""
    m = re.search(r"const SERVICE_HANDLERS\s*=\s*\{(.+?)\};", src, re.DOTALL)
    assert m, "SERVICE_HANDLERS = { … } block not found in handlers.js"
    block = _strip_line_comments(m.group(1))
    keys: set[str] = set()
    for line in block.splitlines():
        stripped = line.strip()
        km = re.match(r"^([A-Za-z_]\w*)\s*(?:[:,]|$)", stripped)
        if km:
            keys.add(km.group(1))
    return keys


def _client_comps_map_keys(src: str) -> set[str]:
    """Keys in the _clientComps = { … } object in service-sheet.jsx."""
    m = re.search(r"_clientComps\s*=\s*\{(.+?)\};", src, re.DOTALL)
    assert m, "_clientComps = { … } block not found in service-sheet.jsx"
    block = _strip_line_comments(m.group(1))
    return set(re.findall(r"^\s*(\w+)\s*:", block, re.MULTILINE))


def _data_js_service_ids(src: str) -> set[str]:
    return set(re.findall(r"id:\s*['\"]([^'\"]+)['\"]", src))


# ─── Frontend routing contract ────────────────────────────────────────────────

class TestFrontendRoutingContract:

    # ── 1. SERVICE_HANDLERS dispatch table ───────────────────────────────────

    @pytest.mark.parametrize("svc_id", list(CLIENT_SIDE_SERVICES))
    def test_service_absent_from_service_handlers(self, svc_id):
        keys = _service_handlers_active_keys(_read(_HANDLERS_JS))
        assert svc_id not in keys, (
            f"{svc_id!r} must NOT be an active key in SERVICE_HANDLERS — "
            f"it is a client-side service rendered by window.{CLIENT_SIDE_SERVICES[svc_id]}"
        )

    def test_backend_fallback_functions_are_private(self):
        src  = _read(_HANDLERS_JS)
        keys = _service_handlers_active_keys(src)
        public_names = {"img2pdf", "imgs2pdf", "imgcompress", "qr",
                        "stats", "readtime", "translit", "deadline", "password"}
        exported = public_names & keys
        assert not exported, f"These client-side IDs must not be exported via SERVICE_HANDLERS: {exported}"

    # ── 2. data.js service registry ──────────────────────────────────────────

    @pytest.mark.parametrize("svc_id", list(CLIENT_SIDE_SERVICES))
    def test_service_registered_in_data_js(self, svc_id):
        ids = _data_js_service_ids(_read(_DATA_JS))
        assert svc_id in ids, (
            f"{svc_id!r} not found in data.js FREE_SERVICES — service is missing from registry"
        )

    def test_password_has_no_backend_endpoint_field(self):
        src = _read(_DATA_JS)
        m = re.search(r"\{\s*id:\s*['\"]password['\"].*?\}", src, re.DOTALL)
        assert m, "password object literal not found in data.js"
        assert "endpoint" not in m.group(0), (
            "password data.js entry must not have an 'endpoint' field — it is client-side only"
        )

    # ── 3. service-sheet.jsx _clientComps routing map ────────────────────────

    def test_client_comps_map_exists_in_service_sheet(self):
        assert "_clientComps" in _read(_SERVICE_SHEET), (
            "_clientComps map not found in service-sheet.jsx"
        )

    @pytest.mark.parametrize("svc_id", list(CLIENT_SIDE_SERVICES))
    def test_service_id_in_client_comps_map(self, svc_id):
        keys = _client_comps_map_keys(_read(_SERVICE_SHEET))
        assert svc_id in keys, (
            f"{svc_id!r} must be a key in the _clientComps map in service-sheet.jsx"
        )

    def test_is_img2pdf_pro_guard_still_present(self):
        assert "isImg2PdfPro" in _read(_SERVICE_SHEET), (
            "isImg2PdfPro routing guard must remain in service-sheet.jsx (backward compat)"
        )

    def test_client_comp_rendered_in_jsx(self):
        stripped = _strip_line_comments(_read(_SERVICE_SHEET))
        assert "<ClientComp" in stripped, (
            "service-sheet.jsx must render <ClientComp … /> for client-side services"
        )

    # ── 4. Component .jsx files — existence and window export ────────────────

    @pytest.mark.parametrize("comp_name,jsx_path", list(COMPONENT_FILES.items()))
    def test_component_file_exists(self, comp_name, jsx_path):
        assert os.path.isfile(jsx_path), (
            f"{comp_name} component file not found: {jsx_path}"
        )

    @pytest.mark.parametrize("comp_name,jsx_path", list(COMPONENT_FILES.items()))
    def test_component_exports_window_global(self, comp_name, jsx_path):
        src = _read(jsx_path)
        assert re.search(
            rf"Object\.assign\s*\(\s*window\s*,\s*\{{[^}}]*{re.escape(comp_name)}",
            src,
        ), (
            f"{comp_name} must be exported via Object.assign(window, {{ {comp_name} }}) "
            f"in {os.path.basename(jsx_path)}"
        )

    # ── 5. qr-pro.jsx CDN safety ─────────────────────────────────────────────

    def test_qr_pro_cdn_has_sri_hash(self):
        """qr-pro.jsx must set s.integrity (SRI) on the dynamically injected script."""
        src = _read(COMPONENT_FILES["QrPro"])
        assert "s.integrity" in src or "integrity" in src, (
            "qr-pro.jsx must set an SRI integrity hash on the CDN script element"
        )
        assert "sha384-" in src, (
            "qr-pro.jsx must contain a sha384 SRI hash for the CDN script"
        )

    def test_qr_pro_cdn_has_crossorigin(self):
        """SRI requires crossOrigin='anonymous' on same-origin policy bypass."""
        src = _read(COMPONENT_FILES["QrPro"])
        assert "crossOrigin" in src or "crossorigin" in src, (
            "qr-pro.jsx must set crossOrigin='anonymous' on the CDN script (required for SRI)"
        )

    def test_qr_pro_cdn_has_onerror_handler(self):
        """CDN failure must show a user-readable error, not a silent crash."""
        src = _read(COMPONENT_FILES["QrPro"])
        assert "onerror" in src or "s.onerror" in src, (
            "qr-pro.jsx must handle CDN load failure with an onerror handler"
        )

    # ── 6. Component files must not call backend conversion endpoints ─────────

    @pytest.mark.parametrize("svc_id,endpoint", [
        ("imgcompress", "/api/imgcompress"),
        ("qr",          "/api/qr"),
        ("stats",       "/api/stats"),
        ("readtime",    "/api/readtime"),
        ("translit",    "/api/translit"),
        ("deadline",    "/api/deadline"),
        ("password",    "/api/password"),
    ])
    def test_component_does_not_call_backend_endpoint(self, svc_id, endpoint):
        comp_name = CLIENT_SIDE_SERVICES[svc_id]
        jsx_path  = COMPONENT_FILES[comp_name]
        src = _read(jsx_path)
        assert endpoint not in src, (
            f"{comp_name} must not call {endpoint!r} — PDF/image generation is client-side only. "
            f"(Only /api/send-file for Telegram delivery is allowed)"
        )


# ─── img2pdf / imgs2pdf backend fallback ─────────────────────────────────────

AUTH = {"X-User-Id": "999"}


@pytest.mark.integration
class TestImg2PdfBackendFallback:

    def test_img2pdf_fallback_returns_pdf(self, client, minimal_png):
        r = client.post("/api/img2pdf",
                        files={"file": ("test.png", minimal_png, "image/png")},
                        headers=AUTH)
        assert r.status_code == 200, r.text[:200]
        assert r.content[:4] == b"%PDF"

    def test_imgs2pdf_fallback_returns_pdf(self, client, minimal_png):
        r = client.post("/api/imgs2pdf",
                        files=[("files", ("a.png", minimal_png, "image/png")),
                               ("files", ("b.png", minimal_png, "image/png"))],
                        headers=AUTH)
        assert r.status_code == 200, r.text[:200]
        assert r.content[:4] == b"%PDF"

    def test_imgs2pdf_page_count_matches_input(self, client, minimal_png):
        import pikepdf
        r = client.post("/api/imgs2pdf",
                        files=[("files", ("a.png", minimal_png, "image/png")),
                               ("files", ("b.png", minimal_png, "image/png")),
                               ("files", ("c.png", minimal_png, "image/png"))],
                        headers=AUTH)
        assert r.status_code == 200
        with pikepdf.open(io.BytesIO(r.content)) as doc:
            assert len(doc.pages) == 3

    def test_img2pdf_rejects_non_image(self, client, minimal_pdf):
        r = client.post("/api/img2pdf",
                        files={"file": ("doc.pdf", minimal_pdf, "application/pdf")},
                        headers=AUTH)
        assert r.status_code in (415, 422)

    def test_img2pdf_too_large_rejected(self, client, too_large_bytes):
        r = client.post("/api/img2pdf",
                        files={"file": ("big.png", too_large_bytes, "image/png")},
                        headers=AUTH)
        assert r.status_code == 413

    def test_imgs2pdf_empty_list_rejected(self, client):
        r = client.post("/api/imgs2pdf", headers=AUTH)
        assert r.status_code == 422

    def test_img2pdf_unauthenticated(self, client, minimal_png):
        r = client.post("/api/img2pdf",
                        files={"file": ("test.png", minimal_png, "image/png")})
        assert r.status_code == 401


# ─── Other client-side service backend fallbacks ─────────────────────────────

@pytest.mark.integration
class TestClientSideBackendFallbacks:
    """Verify the optional backend fallback endpoints for the 6 text/image services.
    These endpoints exist but are NOT called by the frontend under normal operation.
    """

    def test_translit_fallback(self, client):
        r = client.post("/api/translit",
                        json={"text": "Salom dunyo"},
                        headers={**AUTH, "Content-Type": "application/json"})
        assert r.status_code == 200, r.text[:200]

    def test_readtime_fallback(self, client):
        r = client.post("/api/readtime",
                        json={"text": "Bu bir test matni. " * 20},
                        headers={**AUTH, "Content-Type": "application/json"})
        assert r.status_code == 200, r.text[:200]

    def test_stats_fallback(self, client):
        r = client.post("/api/stats",
                        json={"text": "4 7 2 9 1 5 8 3"},
                        headers={**AUTH, "Content-Type": "application/json"})
        assert r.status_code == 200, r.text[:200]

    def test_deadline_fallback(self, client):
        r = client.post("/api/deadline",
                        json={"text": "31.12.2099"},
                        headers={**AUTH, "Content-Type": "application/json"})
        assert r.status_code == 200, r.text[:200]

    def test_qr_fallback_returns_image(self, client):
        r = client.post("/api/qr",
                        json={"text": "https://example.com"},
                        headers={**AUTH, "Content-Type": "application/json"})
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/"), (
            "QR fallback must return an image, got: " + r.headers.get("content-type", "")
        )

    def test_imgcompress_fallback_returns_image(self, client, minimal_jpeg):
        r = client.post("/api/imgcompress",
                        files={"file": ("test.jpg", minimal_jpeg, "image/jpeg")},
                        headers=AUTH)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/"), (
            "imgcompress fallback must return an image"
        )

    def test_translit_empty_text(self, client):
        r = client.post("/api/translit",
                        json={"text": ""},
                        headers={**AUTH, "Content-Type": "application/json"})
        # empty input should be rejected or return empty — not 500
        assert r.status_code != 500, f"Server error on empty input: {r.text[:200]}"

    def test_no_password_backend_endpoint(self, client):
        """password is pure client-side — no backend endpoint should exist."""
        r = client.post("/api/password",
                        json={"length": 16},
                        headers={**AUTH, "Content-Type": "application/json"})
        assert r.status_code == 404, (
            f"Expected 404 for /api/password (no backend endpoint), got {r.status_code}"
        )

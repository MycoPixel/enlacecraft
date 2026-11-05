"""HTTP-layer tests for iupac_fallback_server's endpoints -- specifically
POST /name-to-structure and the /name conventions it mirrors.

The heavy chemistry stack (jpype-embedded JVM, OPSIN, NISPO, RDKit) is
replaced with a stub `naming` module *before* main is imported, so these
tests exercise the real routes, request validation, error mapping, and
middleware without needing Java or any of requirements.txt beyond
fastapi/uvicorn. That's deliberate: naming.py's own correctness is
already guaranteed by design (name_and_verify only returns a name OPSIN's
re-parse confirms, and name_to_smiles only returns SMILES RDKit
canonicalized), and starting a real JVM in a test run for a handful of
status-code assertions would be a very slow way to test none of that.

Run with:  pytest tests/          (from python/iupac_fallback_server)
Needs:     pytest, fastapi, httpx (TestClient's transport) -- nothing else.
"""

import sys
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SERVER_DIR = Path(__file__).resolve().parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


# --- Stub the `naming` module before main imports it -----------------------


class _StubNamingError(Exception):
    def __init__(self, reason: str = "stub_error"):
        super().__init__(reason)
        self.reason = reason


def _stub_start_jvm() -> None:
    # Only reachable from main.py's lifespan handler; these tests never
    # enter the lifespan (TestClient is used without a context manager),
    # and there is no JVM to start in a stub world anyway.
    pass


def _stub_name_and_verify(smiles: str) -> dict:
    return {"smiles": smiles, "name": "stub name for " + smiles}


def _stub_name_to_smiles(name: str) -> str:
    if name == "ethanol":
        return "CCO"
    raise _StubNamingError("name_did_not_parse")


_stub = types.ModuleType("naming")
_stub.MAX_NAME_CHARS = 512
_stub.NamingError = _StubNamingError
_stub.start_jvm = _stub_start_jvm
_stub.name_and_verify = _stub_name_and_verify
_stub.name_to_smiles = _stub_name_to_smiles
sys.modules["naming"] = _stub

import main  # noqa: E402  -- imports cleanly now that `naming` resolves to the stub


@pytest.fixture()
def client() -> TestClient:
    # No `with client:` on purpose -- entering the context manager runs the
    # app's lifespan (and would call start_jvm); the routes under test
    # don't need any startup state.
    return TestClient(main.app)


def test_name_to_structure_returns_smiles(client: TestClient):
    res = client.post("/name-to-structure", json={"name": "ethanol"})
    assert res.status_code == 200
    assert res.json() == {"smiles": "CCO"}


def test_name_to_structure_strips_surrounding_whitespace(client: TestClient):
    res = client.post("/name-to-structure", json={"name": "  ethanol  "})
    assert res.status_code == 200
    assert res.json() == {"smiles": "CCO"}


def test_name_to_structure_empty_name_is_400(client: TestClient):
    res = client.post("/name-to-structure", json={"name": "   "})
    assert res.status_code == 400


def test_name_to_structure_over_long_name_is_400(client: TestClient):
    res = client.post("/name-to-structure", json={"name": "a" * 513})
    assert res.status_code == 400


def test_name_to_structure_unparseable_name_is_404(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    def always_fails(name: str) -> str:
        raise _StubNamingError("name_did_not_parse")

    monkeypatch.setattr(main, "name_to_smiles", always_fails)
    res = client.post("/name-to-structure", json={"name": "not-a-real-compound-name"})
    assert res.status_code == 404
    assert res.json() == {"detail": "name_did_not_parse"}


def test_name_to_structure_requires_name_field(client: TestClient):
    res = client.post("/name-to-structure", json={})
    assert res.status_code == 422  # FastAPI's own missing-field validation


def test_name_endpoint_contract_unchanged(client: TestClient):
    # Regression guard: /name keeps its verified-name response shape now
    # that the new endpoint sits alongside it.
    res = client.post("/name", json={"smiles": "CF"})
    assert res.status_code == 200
    assert res.json() == {"smiles": "CF", "name": "stub name for CF"}


def test_name_endpoint_empty_smiles_is_400(client: TestClient):
    res = client.post("/name", json={"smiles": "   "})
    assert res.status_code == 400

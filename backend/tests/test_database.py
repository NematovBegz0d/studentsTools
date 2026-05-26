"""Database layer smoke tests — uses SQLite fallback (no DATABASE_URL set)."""
import os
import pytest


@pytest.fixture(scope="module")
def tmp_db(tmp_path_factory):
    """One file-based SQLite DB per test session — :memory: doesn't survive
    multiple aiosqlite.connect() calls."""
    path = tmp_path_factory.mktemp("db") / "edubot_test.db"
    os.environ["DB_PATH"]      = str(path)
    os.environ["DATABASE_URL"] = ""  # force SQLite branch
    return str(path)


@pytest.mark.asyncio
async def test_init_db_creates_tables(tmp_db):
    """init_db() must create all tables without error."""
    import importlib, database
    # Re-import so DB_PATH override takes effect
    importlib.reload(database)
    await database.init_db()


@pytest.mark.asyncio
async def test_save_and_retrieve_cert(tmp_db):
    """Cert verification round-trip: save -> get returns same fields."""
    import importlib, database
    importlib.reload(database)
    await database.init_db()

    cert_id = "TEST00ABC123"
    await database.save_cert(
        cert_id, "Test Foydalanuvchi", "Python Basics",
        "EduBot", theme="classic", user_id=None,
    )
    got = await database.get_cert(cert_id)
    assert got is not None
    assert got["id"]     == cert_id
    assert got["name"]   == "Test Foydalanuvchi"
    assert got["course"] == "Python Basics"
    assert got["issuer"] == "EduBot"
    assert got["theme"]  == "classic"


@pytest.mark.asyncio
async def test_get_cert_nonexistent_returns_none(tmp_db):
    import importlib, database
    importlib.reload(database)
    await database.init_db()
    assert await database.get_cert("NONEXISTENT1") is None


@pytest.mark.asyncio
async def test_save_cert_truncates_long_fields(tmp_db):
    """Cert name/course/issuer must be truncated to fit DB column."""
    import importlib, database
    importlib.reload(database)
    await database.init_db()

    long_name = "А" * 500
    cert_id   = "TRUNC0000001"
    await database.save_cert(cert_id, long_name, "Course", "EduBot")
    got = await database.get_cert(cert_id)
    assert got is not None
    assert len(got["name"]) <= 120

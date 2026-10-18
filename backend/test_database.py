"""Verify TLS configuration without connecting to a database."""
import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch
import certifi


class DatabaseTLSChecks(unittest.TestCase):
    def connect_options(self, url, root_cert=""):
        with patch.dict(os.environ, {"DATABASE_URL": url, "DATABASE_SSL_ROOT_CERT": root_cert}), patch("sqlalchemy.create_engine") as create_engine:
            runpy.run_path(str(Path(__file__).with_name("database.py")))
        return create_engine.call_args.kwargs["connect_args"]

    def test_verified_tls_uses_a_trusted_ca_bundle(self):
        options = self.connect_options("postgresql://example.invalid/reports?sslmode=verify-full")
        self.assertEqual(options["sslrootcert"], certifi.where())
        self.assertTrue(Path(options["sslrootcert"]).is_file())

    def test_explicit_ca_and_local_connections_are_preserved(self):
        self.assertNotIn("sslrootcert", self.connect_options("postgresql://example.invalid/reports?sslmode=verify-full&sslrootcert=custom-ca.pem"))
        self.assertNotIn("sslrootcert", self.connect_options("postgresql://127.0.0.1/reports"))
        self.assertEqual(self.connect_options("sqlite:///:memory:"), {})

    def test_supabase_ca_is_resolved_relative_to_the_backend(self):
        options = self.connect_options("postgresql://example.invalid/reports?sslmode=verify-full", "supabase-ca.crt")
        self.assertEqual(Path(options["sslrootcert"]), Path(__file__).resolve().with_name("supabase-ca.crt"))
        self.assertTrue(Path(options["sslrootcert"]).is_file())


if __name__ == "__main__":
    unittest.main()

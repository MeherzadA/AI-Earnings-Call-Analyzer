"""Bundle the signed Parquet HTTP reader before the read-only function starts."""
from pathlib import Path
import duckdb

directory = Path(__file__).with_name("duckdb_extensions")
with duckdb.connect(config={"extension_directory": str(directory)}) as connection:
    connection.install_extension("httpfs")
    connection.load_extension("httpfs")

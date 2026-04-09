#!/usr/bin/env python3
"""
Standalone ingestion script.
Run: python -m scripts.ingest
"""
import sys
from pathlib import Path

# Ensure src is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.chunker import load_all_chunks
from src.store import ingest_chunks, collection_stats


def main():
    print("Loading and chunking knowledge base files...")
    chunks = load_all_chunks()
    print(f"Prepared {len(chunks)} chunks")

    # Show breakdown
    by_type = {}
    for c in chunks:
        t = c["metadata"]["type"]
        by_type[t] = by_type.get(t, 0) + 1
    for t, count in sorted(by_type.items()):
        print(f"  {t}: {count}")

    print("\nIngesting into ChromaDB...")
    count = ingest_chunks(chunks)
    print(f"Ingested {count} chunks")

    stats = collection_stats()
    print(f"\nCollection stats: {stats}")


if __name__ == "__main__":
    main()

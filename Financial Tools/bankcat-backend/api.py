#!/usr/bin/env python3
import os
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, unquote

import aiomysql
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
MYSQL_URL = os.getenv("MYSQL_URL", "").strip()
DB_URL = DATABASE_URL or MYSQL_URL
DB_KIND = "mysql" if DB_URL.startswith("mysql") else "postgres"

POOL_MIN = int(os.getenv("PG_POOL_MIN", "5"))
POOL_MAX = int(os.getenv("PG_POOL_MAX", "30"))
MIN_QUERY_LEN = max(2, min(6, int(os.getenv("BANK_MIN_QUERY_LEN", "3"))))

app = FastAPI(title="Bank Category Search API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pg_pool: Optional[asyncpg.Pool] = None
my_pool: Optional[aiomysql.Pool] = None


def _mysql_kwargs_from_url(url: str) -> Dict[str, Any]:
    u = urlparse(url)
    return {
        "host": u.hostname or "localhost",
        "port": int(u.port or 3306),
        "user": unquote(u.username or "root"),
        "password": unquote(u.password or ""),
        "db": (u.path or "").lstrip("/"),
        "minsize": max(1, POOL_MIN),
        "maxsize": max(2, POOL_MAX),
        "autocommit": True,
        "charset": "utf8mb4",
    }


async def init_pg_connection(conn: asyncpg.Connection) -> None:
    await conn.execute("SET statement_timeout = 12000")
    await conn.execute("SET pg_trgm.similarity_threshold = 0.08")


@app.on_event("startup")
async def on_startup() -> None:
    global pg_pool, my_pool
    if not DB_URL:
        raise RuntimeError("Missing DATABASE_URL or MYSQL_URL environment variable")
    if DB_KIND == "mysql":
        my_pool = await aiomysql.create_pool(**_mysql_kwargs_from_url(DB_URL))
    else:
        pg_pool = await asyncpg.create_pool(DB_URL, min_size=POOL_MIN, max_size=POOL_MAX, command_timeout=20, init=init_pg_connection)


@app.on_event("shutdown")
async def on_shutdown() -> None:
    global pg_pool, my_pool
    if pg_pool is not None:
        await pg_pool.close()
        pg_pool = None
    if my_pool is not None:
        my_pool.close()
        await my_pool.wait_closed()
        my_pool = None


@app.get("/health")
async def health() -> Dict[str, Any]:
    if DB_KIND == "mysql":
        if my_pool is None:
            return {"ok": False, "db": "disconnected", "kind": "mysql"}
        async with my_pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
                row = await cur.fetchone()
        return {"ok": bool(row and row[0] == 1), "db": "connected", "kind": "mysql"}

    if pg_pool is None:
        return {"ok": False, "db": "disconnected", "kind": "postgres"}
    async with pg_pool.acquire() as conn:
        val = await conn.fetchval("SELECT 1")
    return {"ok": bool(val == 1), "db": "connected", "kind": "postgres"}


@app.get("/api/stats")
async def stats() -> Dict[str, Any]:
    if DB_KIND == "mysql":
        if my_pool is None:
            raise HTTPException(status_code=500, detail="MySQL pool not initialized")
        async with my_pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT COUNT(*) FROM bank_company_categories")
                row = await cur.fetchone()
        return {"total_records": int((row[0] if row else 0) or 0)}

    if pg_pool is None:
        raise HTTPException(status_code=500, detail="Database pool not initialized")
    async with pg_pool.acquire() as conn:
        total_records = await conn.fetchval("SELECT COUNT(*) FROM bank_company_categories")
    return {"total_records": int(total_records or 0)}


@app.get("/api/search")
async def search_bank_categories(
    q: str = Query("", max_length=200),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0, le=200000),
) -> Dict[str, Any]:
    query = (q or "").strip()

    if DB_KIND == "mysql":
        if my_pool is None:
            raise HTTPException(status_code=500, detail="MySQL pool not initialized")
        async with my_pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                if not query:
                    await cur.execute(
                        "SELECT company_name, bank_name, category, source_file, 0 AS score FROM bank_company_categories ORDER BY company_name ASC, bank_name ASC LIMIT %s OFFSET %s",
                        (limit, offset),
                    )
                elif len(query) < MIN_QUERY_LEN:
                    return {"query": query, "count": 0, "results": []}
                else:
                    norm = "".join(ch for ch in query.lower() if ch.isalnum() or ch == " ").strip()
                    like_q = f"%{norm}%"
                    prefix_q = f"{norm}%"
                    await cur.execute(
                        """
                        SELECT company_name, bank_name, category, source_file,
                          CASE
                            WHEN company_name_norm = %s THEN 100
                            WHEN company_name_norm LIKE %s THEN 90
                            WHEN bank_name_norm LIKE %s THEN 80
                            WHEN category_norm LIKE %s THEN 70
                            WHEN search_text_norm LIKE %s THEN 60
                            ELSE 40
                          END AS score
                        FROM bank_company_categories
                        WHERE company_name_norm LIKE %s
                           OR bank_name_norm LIKE %s
                           OR category_norm LIKE %s
                           OR search_text_norm LIKE %s
                        ORDER BY score DESC, company_name ASC
                        LIMIT %s OFFSET %s
                        """,
                        (norm, prefix_q, prefix_q, prefix_q, like_q, like_q, like_q, like_q, like_q, limit, offset),
                    )
                rows = await cur.fetchall()
        return {"query": query, "count": len(rows), "results": rows}

    if pg_pool is None:
        raise HTTPException(status_code=500, detail="Database pool not initialized")

    if not query:
        sql_blank = """
        SELECT company_name, bank_name, category, source_file, 0::float8 AS score
        FROM bank_company_categories
        ORDER BY company_name ASC, bank_name ASC
        LIMIT $1 OFFSET $2;
        """
        async with pg_pool.acquire() as conn:
            rows = await conn.fetch(sql_blank, limit, offset)
    elif len(query) < MIN_QUERY_LEN:
        rows = []
    else:
        sql_search = """
        WITH input AS (
          SELECT $1::text AS raw,
                 lower(regexp_replace($1, '[^a-zA-Z0-9 ]', '', 'g')) AS norm,
                 plainto_tsquery('simple', $1) AS tsq
        ), ranked AS (
          SELECT
            b.company_name, b.bank_name, b.category, b.source_file,
            CASE WHEN lower(b.company_name) = lower(input.raw) THEN 1 ELSE 0 END AS company_exact,
            CASE WHEN b.company_name_norm = input.norm THEN 1 ELSE 0 END AS company_norm_exact,
            CASE WHEN b.company_name_norm LIKE (input.norm || '%') THEN 1 ELSE 0 END AS company_prefix,
            GREATEST(
              similarity(b.company_name_norm, input.norm),
              similarity(b.bank_name_norm, input.norm),
              similarity(b.search_text_norm, input.norm),
              ts_rank_cd(to_tsvector('simple', b.search_text), input.tsq)
            ) AS score
          FROM bank_company_categories b
          CROSS JOIN input
          WHERE b.company_name_norm % input.norm
             OR b.bank_name_norm % input.norm
             OR b.category_norm % input.norm
             OR to_tsvector('simple', b.search_text) @@ input.tsq
             OR b.company_name_norm LIKE (input.norm || '%')
             OR b.bank_name_norm LIKE (input.norm || '%')
        )
        SELECT company_name, bank_name, category, source_file, score
        FROM ranked
        ORDER BY company_exact DESC, company_norm_exact DESC, company_prefix DESC, score DESC, company_name ASC
        LIMIT $2 OFFSET $3;
        """
        async with pg_pool.acquire() as conn:
            rows = await conn.fetch(sql_search, query, limit, offset)

    results: List[Dict[str, Any]] = []
    for row in rows:
        results.append(
            {
                "company_name": row["company_name"],
                "bank_name": row["bank_name"],
                "category": row["category"],
                "source_file": row["source_file"],
                "score": float(row["score"] or 0),
            }
        )

    return {"query": query, "count": len(results), "results": results}

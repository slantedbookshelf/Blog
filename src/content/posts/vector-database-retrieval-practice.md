---
title: "向量数据库实战：用 pgvector、Qdrant 和 Milvus 搭建知识库检索"
description: "从余弦距离、HNSW、IVF 和过滤执行路径讲起，用同一组客服知识库数据跑通三套检索方案，再用 Recall@K 和延迟做选型。"
pubDate: 2026-11-18
category: "Database"
categories: ["算法与数据", "人工智能"]
tags: ["向量数据库", "pgvector", "Qdrant", "Milvus", "RAG", "实战"]
---

用户问「退款什么时候能到账？」检索器找到了两条特别相似的文档。一条写着「退款当天到账」，来自别的租户。另一条写着「下单后可秒退」，还在草稿里。真正能给用户看的政策写着「退款通常需要 3–5 个工作日」，相似度反而排第三。

这个例子里，正确的查询是：**在当前租户已发布的文档里，找与问题最相近的两条。** 同样的查询交给 PostgreSQL + pgvector、Qdrant 和 Milvus，它们都能表达这个条件，但找候选、执行过滤和管理索引的方式各有差异。

## 一、从一条查询看向量索引

入库时，先把知识库文档切成片段，再用 Embedding 模型为每段生成向量，和正文、租户、发布状态一起保存。查询时，用同一个模型编码用户问题，数据库按指定的度量计算相似度，把最接近的片段交给后续的重排器或大模型。

本文统一用余弦相似度 `cos(q, x) = (q · x) / (||q|| × ||x||)`。相似度越大，方向越接近。pgvector 的 `<=>` 返回的是余弦**距离**，等于 `1 - cos(q, x)`，所以 SQL 要按它升序排。Qdrant 和 Milvus 在示例的余弦模式下返回相似度，数值越大越靠前。线上需要把度量方式和分数方向一起纳入接口约定。

| 方式 | 底层怎么找候选 | 主要代价 |
| --- | --- | --- |
| 精确搜索（FLAT） | 对所有符合条件的向量计算距离，从中选出 Top-K。比较 `N` 条 `d` 维向量的距离计算量为 `O(Nd)`。 | 当过滤后只剩少量候选时，扫描往往够用。候选越多，距离计算越重。 |
| HNSW | 构建多层近邻图，从稀疏的上层靠近目标，再在底层维护更宽的候选集合。 | 图边占内存，建图和写入也要做邻居搜索。提高查询搜索宽度通常能增加召回，也会增加查询开销。 |
| IVF | 先用聚类中心把向量分到多个倒排列表，查询时只扫描距问题向量较近的若干个列表。IVFFlat 在列表内使用原始向量计算距离。 | 建索引需要代表性数据。探测列表太少可能漏掉跨列表的近邻，探测越多，扫描开销越高。 |

HNSW 的 `M` 控制图连接规模，`ef_construction` 控制建图时的搜索宽度，`ef_search` 或 `ef` 控制查询时的搜索宽度。IVF 常见的对应调节项是列表数和每次查询探测的列表数。两种都是近似最近邻搜索（ANN），需要以同一过滤条件下的精确结果为基准来测召回。 [HNSW 原论文](https://arxiv.org/abs/1603.09320) · [pgvector 索引文档](https://github.com/pgvector/pgvector/blob/v0.8.1/README.md#indexing)

容量也得按数据算。100 万条 768 维 `float32` 向量，原始向量约占 `1,000,000 × 768 × 4` 字节，也就是 2.86 GiB。实际还要测图索引、正文与元数据、写入和合并过程中的峰值，以及多副本带来的占用。采用量化可以减少向量存储或计算开销，效果需要用真实查询做召回对照。 [Qdrant 量化文档](https://qdrant.tech/documentation/manage-data/quantization/)

## 二、三套系统分别怎样执行检索

### pgvector 把向量放进 PostgreSQL 的表和查询计划

`vector` 是扩展提供的数据类型。向量和业务字段可以放在同一张表里，和其他表做 JOIN，也可以在更新文档版本时一起提交事务。查询计划可能先用 B-tree 找符合条件的行，再精确排序，也可能先走 HNSW 索引，让 PostgreSQL 对找到的候选继续做 `WHERE` 过滤。

后一条路径需要关注结果条数。假设 ANN 先找出一批近邻，但这批近邻大多来自另一个大租户，过滤掉它们后，当前租户可能拿不到足够的结果。pgvector 0.8.0 起支持迭代索引扫描，可以继续取候选，直到满足需求或达到扫描上限。过滤后剩余行很少时，也值得直接比较标量索引加精确排序的开销。 [pgvector 过滤和迭代扫描](https://github.com/pgvector/pgvector/blob/v0.8.1/README.md#filtering)

### Qdrant 让业务字段参与向量查询规划

Qdrant 的一条记录叫 point，包含 ID、向量和 payload。集合由 segment 组成，查询规划可以根据各 segment 的匹配量，选择枚举少量合格记录并直接打分，或者使用支持过滤的 HNSW。payload 索引既能查找和估算符合条件的记录，也能让 HNSW 建图时为已索引字段补充连接。已知常用过滤字段时，可以在导入数据前建好索引。 [Qdrant 存储结构](https://qdrant.tech/documentation/manage-data/storage/) · [Qdrant 过滤查询规划](https://qdrant.tech/documentation/search-design/vector-search-filtering/)

### Milvus 按 segment 管理数据和索引

以 Milvus 2.6 分布式架构为例，新写入的数据进入 growing segment，封存后变成 sealed segment。Streaming Node 处理流式数据和 growing segment 的查询，Data Node 承担历史数据的索引构建和合并，Query Node 加载并检索历史数据，Proxy 汇总各路结果。向量字段可以选用 FLAT、HNSW 或 IVF 等索引。标准过滤可以在向量检索前缩小范围，复杂表达式也可以评估迭代过滤。下面用 Standalone 体验同一套集合和搜索接口。 [Milvus 2.6 架构](https://milvus.io/docs/v2.6.x/architecture_overview.md) · [Milvus 2.6 过滤搜索](https://milvus.io/docs/v2.6.x/filtered-search.md)

## 三、实战：同一套客服知识库跑三遍

用五条客服知识片段和手工构造的三维向量先验证检索行为。令查询向量为 `[1,0,0]`，只查 `acme` 的 `published` 文档，取两条。全库分数最高的两条是 `4` 和 `5`，应用过滤条件后，预期结果为 `1`、`2`，余弦相似度分别约为 `0.80`、`0.60`。

以下命令在本机实验目录运行，需要 Docker 和 Python 3.10 或以上版本。三个例子可以独立启动，Qdrant 和 Milvus 的 Python 脚本共用一份样本文件。Docker 命令中的端口和凭据用于本地实验，Milvus 的官方 Compose 配置也请在本机开发环境运行。

把这段保存为 `fixtures.py`。它也可以独立执行，用纯 Python 得出过滤后的精确基准。

```python
from math import hypot

ROWS = [
    (1, "acme", "published", "退款通常需要 3–5 个工作日到账。", [0.8, 0.6, 0.0]),
    (2, "acme", "published", "款项会按原支付方式退回。", [0.6, 0.8, 0.0]),
    (3, "acme", "published", "换货请先提交售后申请。", [0.0, 1.0, 0.0]),
    (4, "bravo", "published", "退款当天到账。", [1.0, 0.0, 0.0]),
    (5, "acme", "draft", "新退款政策拟改为秒退。", [0.96, 0.28, 0.0]),
]
QUERY = [1.0, 0.0, 0.0]
EXPECTED_IDS = [1, 2]


def cosine(left, right):
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    return dot / (hypot(*left) * hypot(*right))


if __name__ == "__main__":
    matches = [
        (row_id, cosine(QUERY, vector))
        for row_id, tenant, status, _, vector in ROWS
        if tenant == "acme" and status == "published"
    ]
    top = sorted(matches, key=lambda match: match[1], reverse=True)[:2]
    assert [row_id for row_id, _ in top] == EXPECTED_IDS
    print([(row_id, round(score, 2)) for row_id, score in top])
```

### 1. pgvector：从精确排序切到 HNSW

启动 PostgreSQL，等待 `pg_isready` 报告可以接受连接后进入 `psql`。

```bash
docker run --name vector-pg -e POSTGRES_PASSWORD=lab-password -e POSTGRES_DB=vectorlab -d pgvector/pgvector:0.8.1-pg16
docker exec vector-pg pg_isready -U postgres -d vectorlab
docker exec -it vector-pg psql -U postgres -d vectorlab
```

首先建表，保留 `tenant_id` 和 `status` 作为普通业务列，再对过滤后的候选做精确排序。

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS support_chunks (
    id bigint PRIMARY KEY,
    tenant_id text NOT NULL,
    status text NOT NULL,
    body text NOT NULL,
    embedding vector(3) NOT NULL
);

INSERT INTO support_chunks (id, tenant_id, status, body, embedding) VALUES
    (1, 'acme', 'published', '退款通常需要 3–5 个工作日到账。', '[0.8,0.6,0]'),
    (2, 'acme', 'published', '款项会按原支付方式退回。', '[0.6,0.8,0]'),
    (3, 'acme', 'published', '换货请先提交售后申请。', '[0,1,0]'),
    (4, 'bravo', 'published', '退款当天到账。', '[1,0,0]'),
    (5, 'acme', 'draft', '新退款政策拟改为秒退。', '[0.96,0.28,0]')
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    status = EXCLUDED.status,
    body = EXCLUDED.body,
    embedding = EXCLUDED.embedding;

CREATE INDEX IF NOT EXISTS support_chunks_scope
    ON support_chunks (tenant_id, status);

WITH eligible AS MATERIALIZED (
    SELECT id, body, embedding FROM support_chunks
    WHERE tenant_id = 'acme' AND status = 'published'
)
SELECT id, body, round((1 - (embedding <=> '[1,0,0]'))::numeric, 2) AS similarity
FROM eligible
ORDER BY embedding <=> '[1,0,0]'
LIMIT 2;
```

拿到精确基准后，再建余弦 HNSW 索引，比较查询计划。`ORDER BY` 保留原始距离表达式和升序方向，让索引有机会参与排序。示例表只有五行，规划器很可能选择顺序扫描。换上规模更大的数据后，观察 `EXPLAIN` 里的实际扫描方式和过滤掉的行数。

```sql
CREATE INDEX IF NOT EXISTS support_chunks_cos_hnsw
    ON support_chunks USING hnsw (embedding vector_cosine_ops);
ANALYZE support_chunks;

BEGIN;
SET LOCAL hnsw.ef_search = 100;
SET LOCAL hnsw.iterative_scan = strict_order;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, body
FROM support_chunks
WHERE tenant_id = 'acme' AND status = 'published'
ORDER BY embedding <=> '[1,0,0]'
LIMIT 2;
COMMIT;
```

第一条查询用 `WITH ... AS MATERIALIZED` 物化合格的行。这样即使建完 HNSW 索引后重跑基准，外层排序面对的也是完整的合格候选。第二条查询直接在原表上排序，让规划器评估 HNSW。 [pgvector 查询和索引使用说明](https://github.com/pgvector/pgvector/blob/v0.8.1/README.md#troubleshooting)

### 2. Qdrant：先建过滤字段索引，再写 point

启动服务，把代码保存为 `qdrant_lab.py`，再用 `python qdrant_lab.py` 运行。

```bash
docker run --name vector-qdrant -p 127.0.0.1:6333:6333 -d qdrant/qdrant:v1.16.2
python -m pip install qdrant-client==1.16.2
```

```python
from qdrant_client import QdrantClient, models

from fixtures import EXPECTED_IDS, QUERY, ROWS

client = QdrantClient(url="http://127.0.0.1:6333")
name = "support_chunks_demo"

if not client.collection_exists(name):
    client.create_collection(
        collection_name=name,
        vectors_config=models.VectorParams(size=len(QUERY), distance=models.Distance.COSINE),
    )
    for field in ("tenant_id", "status"):
        client.create_payload_index(
            collection_name=name, field_name=field,
            field_schema=models.PayloadSchemaType.KEYWORD, wait=True,
        )

client.upsert(
    collection_name=name,
    points=[
        models.PointStruct(
            id=row_id, vector=vector,
            payload={"tenant_id": tenant, "status": status, "body": body},
        )
        for row_id, tenant, status, body, vector in ROWS
    ],
    wait=True,
)

scope = models.Filter(must=[
    models.FieldCondition(key="tenant_id", match=models.MatchValue(value="acme")),
    models.FieldCondition(key="status", match=models.MatchValue(value="published")),
])
hits = client.query_points(
    collection_name=name, query=QUERY, query_filter=scope,
    search_params=models.SearchParams(exact=True), limit=2, with_payload=True,
).points

assert [hit.id for hit in hits] == EXPECTED_IDS
print([(hit.id, round(hit.score, 2), hit.payload["body"]) for hit in hits])
```

`exact=True` 用于比对基准。加载更大的数据集后，用 `SearchParams(exact=False, hnsw_ef=100)` 再测一次。允许近似搜索时，Qdrant 仍可根据候选规模选择扫描，小样本上结果一致只能验证样本的排序和过滤。 [Qdrant 搜索参数](https://qdrant.tech/documentation/search/search/) · [Qdrant 批量导入与 payload 索引](https://qdrant.tech/documentation/production-operations/bulk-data-import/)

### 3. Milvus：定义集合字段，用 FLAT 建立基准

从 Milvus 2.6.18 的官方发布包取 Standalone Compose 文件，启动后用 `docker compose ps` 查看服务状态。把下方代码保存为 `milvus_lab.py`，等服务就绪再用 `python milvus_lab.py` 运行。 [Milvus 2.6.18 发布与下载](https://github.com/milvus-io/milvus/releases/tag/v2.6.18)

```bash
curl -fL https://github.com/milvus-io/milvus/releases/download/v2.6.18/milvus-standalone-docker-compose.yml -o compose.yaml
docker compose up -d
docker compose ps
python -m pip install pymilvus==2.6.18
```

```python
from pymilvus import DataType, MilvusClient

from fixtures import EXPECTED_IDS, QUERY, ROWS

client = MilvusClient(uri="http://127.0.0.1:19530")
name = "support_chunks_flat"

if not client.has_collection(name):
    schema = client.create_schema(auto_id=False, enable_dynamic_field=False)
    schema.add_field("id", DataType.INT64, is_primary=True)
    schema.add_field("tenant_id", DataType.VARCHAR, max_length=64)
    schema.add_field("status", DataType.VARCHAR, max_length=32)
    schema.add_field("body", DataType.VARCHAR, max_length=512)
    schema.add_field("embedding", DataType.FLOAT_VECTOR, dim=len(QUERY))

    indexes = client.prepare_index_params()
    indexes.add_index(field_name="embedding", index_type="FLAT", metric_type="COSINE")
    client.create_collection(collection_name=name, schema=schema, index_params=indexes)

client.load_collection(collection_name=name)
client.upsert(
    collection_name=name,
    data=[
        {"id": row_id, "tenant_id": tenant, "status": status,
         "body": body, "embedding": vector}
        for row_id, tenant, status, body, vector in ROWS
    ],
)

hits = client.search(
    collection_name=name, data=[QUERY], anns_field="embedding",
    filter='tenant_id == "acme" and status == "published"',
    search_params={"metric_type": "COSINE", "params": {}},
    output_fields=["body"], consistency_level="Strong", limit=2,
)[0]

assert [hit["id"] for hit in hits] == EXPECTED_IDS
print([(hit["id"], round(hit["distance"], 2), hit["entity"]["body"]) for hit in hits])
```

实验显式使用 `Strong` 一致性，让这次查询看到刚写入的数据。在较大的数据集上对比 ANN，可以新建一个集合，把索引改成 `index_type="HNSW"`，配置 `params={"M": 16, "efConstruction": 128}`，在 `search_params` 的 `params` 中传入 `{"ef": 100}`。两套集合写入相同数据并使用相同过滤条件，再对照召回和耗时。 [Milvus HNSW 参数](https://milvus.io/docs/hnsw.md) · [Milvus 一致性级别](https://milvus.io/docs/v2.6.x/consistency.md)

## 四、换成真实文本向量，怎么判断效果

接真实客服数据时，可以用 BAAI 的 `bge-m3` 把文档正文和用户问题编码成 1024 维稠密向量。先运行 `python -m pip install sentence-transformers`，把下面的代码保存为 `semantic_fixtures.py`。第一次运行时会下载模型。 [BGE-M3 模型卡](https://huggingface.co/BAAI/bge-m3)

```python
from sentence_transformers import SentenceTransformer

from fixtures import ROWS as SAMPLE_ROWS

model = SentenceTransformer("BAAI/bge-m3")
passages = [row[3] for row in SAMPLE_ROWS]
vectors = model.encode(passages, normalize_embeddings=True).tolist()
QUERY = model.encode(
    ["钱原路退回后，什么时候能到账？"], normalize_embeddings=True,
)[0].tolist()
ROWS = [(*sample[:4], vector) for sample, vector in zip(SAMPLE_ROWS, vectors, strict=True)]
```

以 Qdrant 为例，把 `qdrant_lab.py` 里的样本导入改为 `from semantic_fixtures import QUERY, ROWS`，集合名改为 `support_chunks_semantic`，再去掉固定 ID 顺序的断言，运行脚本看返回的正文。服务端仍执行同样的租户和发布状态过滤。Milvus 可以用相同方式替换样本和集合名。用 pgvector 时，新建 `vector(1024)` 的表，并写入 `ROWS` 中的向量，查询时传入 `QUERY`。

评估时分开回答两个问题。**第一，ANN 跟精确搜索有多接近？** 对同一问题、同一租户和状态，先生成精确 Top-K，再跑各库的 ANN。计算 `|ANN 结果 ∩ 精确结果| / |精确结果|`。例如精确 Top-3 为 `[21, 34, 57]`，ANN 返回 `[21, 57, 63]`，Recall@3 就是 `2/3`。过滤后实际只有两条时，用这两条作分母。合格集为空的查询单独统计为空结果，并验证是否返回了越界记录。

**第二，精确搜索本身找到了能回答问题的段落吗？** 用真实问题人工标出可用证据，比如「退款何时到账」需要命中时效说明，「退到哪张卡」则需要命中退款路径。距离算得再精确，切分策略或模型把两个意图混在一起，召回的内容也可能答错。对错误码、SKU、工单号等精确字面词，可以加入关键词检索，再把两路候选按排名融合。

对比性能时，固定数据、过滤条件、并发量和 `K`，把 Embedding 耗时与数据库查询耗时分别记录。按过滤后的候选规模以及租户数据偏斜分组，记录 p50、p95、Recall@K、返回不足 K 的比例，同时观察持续写入下的新数据可见延迟和资源占用。这样才能看到「全库很快，小租户结果却常找不全」这一类平均值掩盖的问题。

## 五、按业务约束选型

| 已有条件 | 优先验证 | 用什么决定 |
| --- | --- | --- |
| 文档和权限数据已经在 PostgreSQL，检索经常需要 JOIN 或和业务更新一起提交 | pgvector | 比较普通索引加精确排序与 HNSW，在生产相似的过滤比例和写入压力下看召回和执行计划。 |
| 检索是独立服务，大多数查询携带租户、类别或时间等 payload 条件 | Qdrant | 看过滤索引后的召回与 p95，重点测多条件叠加以及大小租户混合时的表现。 |
| 向量检索需要独立扩容，写入、索引构建和查询的资源需求相差较大 | Milvus | 用实际写入和查询混合负载测 segment 索引进度、查询节点内存和新数据可见延迟。 |

客服知识库上线时，租户条件应由服务端从已认证的请求身份中生成，并与发布状态一起传给检索库。检索服务与主业务库分离时，可以用稳定的片段 ID 做幂等写入，按文档版本处理更新、下架和删除，并在返回上下文前校验权限和可见状态。选型时把这条更新链路也纳入实验，测清楚一份政策发布或撤下后，用户能在多久内搜到新版本。

---
title: "ELK 实战：搭建可检索、可告警的集中式日志平台"
description: "以 Spring Boot 日志为例，搭建 Filebeat、Logstash、Elasticsearch 与 Kibana 链路，并梳理数据流、ILM、告警和生产安全。"
pubDate: 2026-09-24
category: "Backend"
tags: ["ELK", "Elasticsearch", "Logstash", "Observability"]
---

当应用只有一个实例时，登录服务器执行 `tail -f` 还能勉强排查问题。服务扩容后，一次请求可能跨越多个实例和组件，日志又分散在不同机器上。此时真正需要的不是“收集更多日志”，而是一条能够统一采集、解析、检索、关联和告警的日志链路。

ELK 最初指 Elasticsearch、Logstash 和 Kibana。今天的 Elastic Stack 通常还包括 Filebeat、Elastic Agent、Fleet 等组件。本文以 Spring Boot 应用日志为例，搭建一条常见的集中式日志链路，并讨论数据流、生命周期和生产安全。

## 一、各组件分别做什么

- **Elasticsearch**：存储和检索日志，负责分片、副本、聚合与查询。
- **Logstash**：接收、解析、转换和路由事件，适合复杂加工。
- **Kibana**：提供日志检索、可视化、Dashboard 和告警入口。
- **Filebeat**：部署在主机旁的轻量采集器，读取文件并发送日志。
- **Elastic Agent**：统一采集日志、指标和安全数据，可由 Fleet 集中管理。

经典链路是：

```text
Spring Boot JSON 日志
        ↓
Filebeat / Elastic Agent
        ↓
Logstash（可选解析、脱敏、路由）
        ↓
Elasticsearch 数据流
        ↓
Kibana 查询、看板与告警
```

如果日志已经是结构化 JSON，且不需要复杂转换，可以让采集器直接写 Elasticsearch；需要 Grok、字段清洗、多目标路由时再引入 Logstash。

## 二、先让应用输出结构化日志

采集平台无法弥补日志本身缺少上下文的问题。相比一整段文本，更推荐每行一个 JSON 对象：

```json
{
  "@timestamp": "2026-09-24T10:20:30.123+08:00",
  "log.level": "ERROR",
  "service.name": "vip-marketing",
  "trace.id": "2f6c7a4f9e124e37",
  "user.id": "10001",
  "event.action": "raffle",
  "message": "库存扣减失败",
  "error.type": "InsufficientStockException"
}
```

至少保留以下字段：时间、日志级别、服务名、环境、实例、Trace ID、事件名称、消息和异常类型。字段命名保持稳定，尽量对齐 Elastic Common Schema（ECS），后续跨服务查询会轻松很多。

敏感信息必须在进入采集链路前处理：密码、Token、身份证号、手机号和银行卡号不应原样写入日志。脱敏最好在应用端完成，Logstash 过滤作为第二道防线。

## 三、用 Docker Compose 搭建实验环境

下面只展示结构，镜像应统一使用经过验证的同一版本：

```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:${ELASTIC_VERSION}
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=true
      - ELASTIC_PASSWORD=${ELASTIC_PASSWORD}
    ports:
      - "9200:9200"
    volumes:
      - es-data:/usr/share/elasticsearch/data

  kibana:
    image: docker.elastic.co/kibana/kibana:${ELASTIC_VERSION}
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch

  logstash:
    image: docker.elastic.co/logstash/logstash:${ELASTIC_VERSION}
    ports:
      - "5044:5044"
    volumes:
      - ./pipeline:/usr/share/logstash/pipeline:ro
    depends_on:
      - elasticsearch

volumes:
  es-data:
```

这是单节点学习环境，不是生产拓扑。生产环境要启用 TLS、独立服务账号、Secret 管理、节点角色规划、快照备份和跨故障域部署。不要为了方便长期关闭安全功能。

## 四、Filebeat 采集应用日志

使用 `filestream` 读取 JSON 日志：

```yaml
filebeat.inputs:
  - type: filestream
    id: vip-marketing-json
    enabled: true
    paths:
      - /var/log/vip-marketing/*.json
    parsers:
      - ndjson:
          target: ""
          add_error_key: true
          overwrite_keys: true
    fields:
      service.name: vip-marketing
      service.environment: production
    fields_under_root: true

output.logstash:
  hosts: ["logstash:5044"]
```

容器环境应挂载日志目录，并持久化 Filebeat Registry，否则采集器重启后可能重复读取或丢失进度。日志轮转要采用采集器支持的方式，避免复制截断造成重复事件。

如果 Java 异常堆栈仍是多行文本，可以配置 multiline 聚合，但规则很容易误合并。更推荐在应用端使用 JSON Encoder，把异常作为一个事件输出。

## 五、Logstash 解析、清洗并写入 Elasticsearch

创建 `pipeline/logstash.conf`：

```text
input {
  beats {
    port => 5044
  }
}

filter {
  if ![service][name] {
    mutate { add_field => { "[service][name]" => "unknown-service" } }
  }

  mutate {
    remove_field => ["password", "accessToken", "authorization"]
  }
}

output {
  elasticsearch {
    hosts => ["https://elasticsearch:9200"]
    user => "${ELASTIC_USER}"
    password => "${ELASTIC_PASSWORD}"
    ssl_enabled => true
    data_stream => true
  }
}
```

生产环境应使用专用的 Logstash 服务账号，而不是超级用户。TLS 证书验证、CA 文件和凭据注入方式应按部署环境补齐。

Logstash 的过滤操作有成本。对已经结构化的日志，不要再用复杂 Grok 重复解析；无法解析的事件应增加错误标签并进入单独的数据流或死信处理流程。

## 六、为什么推荐数据流和 ILM

早期教程常按天创建 `app-2026.09.24` 这样的索引。数据流更适合只追加的时间序列数据，并可以结合索引生命周期管理（ILM）自动滚动和清理底层索引。

可以按以下维度规划数据集：

```text
logs-vip_marketing-production
logs-order-service-production
logs-vip_marketing-staging
```

生命周期策略通常分为：

- **Hot**：近期数据，高频写入与查询。
- **Warm**：查询频率下降，降低资源成本。
- **Cold/Frozen**：长期留存，极少查询。
- **Delete**：达到合规保留期后删除。

保留周期要根据排障需求、审计要求和存储成本共同决定，而不是让日志无限增长。索引分片也不是越多越好，大量小分片会消耗堆内存和集群状态资源。

## 七、在 Kibana 中排查一次请求

有了统一字段后，可以用 KQL 快速过滤：

```text
service.name: "vip-marketing" and log.level: "ERROR"
```

根据 Trace ID 串联一次请求：

```text
trace.id: "2f6c7a4f9e124e37"
```

查找库存相关异常：

```text
service.name: "vip-marketing"
and event.action: "raffle"
and error.type: "InsufficientStockException"
```

一个实用的故障看板可以包含：

- 各服务每分钟错误数。
- 错误率与请求量的对比。
- Top 异常类型和异常接口。
- 日志采集延迟。
- 各实例错误分布。
- 特定业务事件的成功与失败趋势。

告警应关注异常变化，而不是对每条 ERROR 发通知。可以对错误率、连续失败、日志断流和采集延迟设置不同级别的阈值。

## 八、Mapping 是日志平台的隐形地基

Elasticsearch 会动态推断字段类型，但错误推断会造成后续数据无法写入。例如同一个 `user.id` 有时是数字，有时是字符串，就会产生 Mapping 冲突。

建议通过组件模板固定关键字段：

```json
{
  "template": {
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "service.name": { "type": "keyword" },
        "log.level": { "type": "keyword" },
        "trace.id": { "type": "keyword" },
        "message": { "type": "match_only_text" }
      }
    }
  }
}
```

用于精确过滤和聚合的字段选择 `keyword`，用于全文检索的消息选择文本类型。不要把任意业务对象完整展开到顶层字段，否则容易引发 Mapping Explosion。

## 九、常见故障排查

### Kibana 查不到刚产生的日志

先确认应用是否写出、Filebeat 是否读取、Logstash 是否收到、Elasticsearch 是否拒绝写入，再检查 Kibana 的时间范围和时区。不要一上来就怀疑查询语法。

### Filebeat 重复采集

检查 Registry 是否持久化、文件轮转策略是否稳定，以及容器是否频繁使用新路径挂载同一文件。下游若不能容忍重复，还可以根据业务字段生成确定性文档 ID。

### Elasticsearch 返回 Mapping 冲突

定位冲突字段的不同类型来源，修复应用日志格式或在 Logstash 中转换类型。已有错误 Mapping 通常不能原地修改，需要创建正确模板并重建或滚动到新索引。

### Logstash 堆积或内存升高

检查 Elasticsearch 写入延迟、过滤器 CPU 消耗和批处理参数。需要抗短时故障时可评估持久化队列，但它不能代替容量规划和下游恢复方案。

### 集群磁盘水位过高

立即检查 ILM 是否生效、是否存在大量小索引或副本配置不合理。删除数据前先确认合规和备份要求，长期方案是调整保留策略、分片和存储容量。

## 十、生产环境检查清单

- 所有组件使用兼容的同一发布版本。
- 全链路开启 TLS，账号使用最小权限。
- 应用输出结构化日志，并带有服务名、环境和 Trace ID。
- 敏感数据在应用端脱敏，采集链路再次过滤。
- 使用数据流、模板和 ILM 管理 Mapping 与保留周期。
- Filebeat Registry 和 Elasticsearch 数据目录持久化。
- Elasticsearch 配置快照备份并定期演练恢复。
- 监控采集延迟、拒绝写入、集群健康、JVM 和磁盘水位。
- 对日志断流、错误率突增和持续堆积设置告警。

## 十一、总结

ELK 的价值不是把日志“搬到一个页面”，而是建立统一的可观测数据标准和故障排查路径。高质量的结构化日志、稳定的字段模型、合理的数据生命周期和严格的安全配置，比堆叠更多组件更重要。

从一个服务开始，先打通 JSON 日志、Trace ID、数据流和基础看板，再逐步扩展到指标、APM 和统一告警，往往比一次性建设庞大的平台更容易获得可持续的效果。

## 参考资料

- [Elastic 官方文档](https://www.elastic.co/docs)
- [Logstash 与 Filebeat Ingest Pipeline](https://www.elastic.co/docs/reference/logstash/use-ingest-pipelines)

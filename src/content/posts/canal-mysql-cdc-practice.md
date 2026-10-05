---
title: "Canal 实战：基于 MySQL Binlog 构建可靠的增量数据链路"
description: "从工作原理、MySQL 配置和 Java 消费入手，梳理 Canal CDC 链路中的 ACK、幂等、全增量衔接与生产排查。"
pubDate: 2026-09-24
category: "Database"
tags: ["Canal", "MySQL", "CDC", "Java"]
---

搜索索引、缓存、数据仓库和知识图谱经常需要同步 MySQL 数据。最直接的办法是定时扫描业务表，但它会增加数据库压力，也很难同时兼顾实时性、删除事件和断点续传。

Canal 的思路是模拟 MySQL 从库，订阅并解析主库 Binlog，把行级变更转换为可消费的事件。应用不需要侵入业务写入流程，就能获得增量数据变化。

本文从工作原理开始，搭建一条“业务库 → Canal → Java 消费者”的 CDC 链路，并重点讨论 ACK、幂等和数据一致性。

## 一、Canal 的工作原理

MySQL 主从复制的大致过程是：

1. 主库将数据变更写入 Binary Log。
2. 从库的 I/O 线程向主库请求 Binlog。
3. 主库发送 Binlog，从库保存并重放。

Canal 伪装成 MySQL Slave，与主库建立复制连接，解析 Binlog 后将变更暴露给客户端：

```text
业务应用 → MySQL → Binlog
                    ↓
               Canal Server
                    ↓
             Canal Java Client
                    ↓
       Elasticsearch / Redis / MQ / Neo4j
```

Canal 捕获的是数据库已经提交的变更，因此它适合做数据同步和事件派生，但不能替代业务事务本身。

## 二、MySQL 前置配置

Canal 依赖 ROW 模式的 Binlog。在 MySQL 配置中开启：

```ini
[mysqld]
log-bin=mysql-bin
binlog-format=ROW
server-id=1
```

ROW 模式记录行级变化，Canal 才能准确获得修改前后的列值。修改配置后重启 MySQL，并检查：

```sql
SHOW VARIABLES LIKE 'log_bin';
SHOW VARIABLES LIKE 'binlog_format';
SHOW VARIABLES LIKE 'server_id';
```

为 Canal 创建独立账号：

```sql
CREATE USER 'canal'@'%' IDENTIFIED BY '${CANAL_PASSWORD}';
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'canal'@'%';
FLUSH PRIVILEGES;
```

实际部署时应限制来源网段，不要直接允许所有地址。还要确认 Binlog 保留时间足够覆盖最长故障窗口；如果 Canal 停机期间需要的 Binlog 已被清理，只能重新做全量同步并校准位点。

## 三、配置 Canal Instance

一个 destination 对应一组独立订阅。以 `vip_marketing` 为例：

```properties
canal.instance.mysql.slaveId=1234
canal.instance.master.address=mysql:3306
canal.instance.dbUsername=canal
canal.instance.dbPassword=${CANAL_PASSWORD}
canal.instance.connectionCharset=UTF-8

canal.instance.filter.regex=vip_marketing\\..*
canal.instance.filter.black.regex=mysql\\..*
```

注意以下几点：

- `slaveId` 不能与现有 MySQL 从库或其他 Canal 实例冲突。
- 表过滤使用正则，点号需要转义。
- 客户端调用 `subscribe(filter)` 时，传入的过滤条件可能覆盖实例配置。
- 密码通过容器 Secret、环境变量或配置中心注入。

如果配置主备 MySQL，Canal 可以结合心跳检测进行切换。但数据库切换、GTID、位点恢复和数据一致性仍需要按实际拓扑进行演练，不能只依赖默认配置。

## 四、Java 客户端消费 Binlog

引入客户端依赖：

```xml
<dependency>
    <groupId>com.alibaba.otter</groupId>
    <artifactId>canal.client</artifactId>
    <version>${canal.version}</version>
</dependency>
```

下面是一段包含手动 ACK 的消费骨架：

```java
public class CanalConsumer {

    private static final int BATCH_SIZE = 500;

    public void consume() {
        CanalConnector connector = CanalConnectors.newSingleConnector(
                new InetSocketAddress("canal-server", 11111),
                "vip_marketing",
                "canal",
                "canal");

        try {
            connector.connect();
            connector.subscribe("vip_marketing\\.(award|strategy|strategy_award)");
            connector.rollback();

            while (!Thread.currentThread().isInterrupted()) {
                Message message = connector.getWithoutAck(BATCH_SIZE);
                long batchId = message.getId();

                if (batchId == -1 || message.getEntries().isEmpty()) {
                    LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(500));
                    continue;
                }

                try {
                    for (CanalEntry.Entry entry : message.getEntries()) {
                        handle(entry);
                    }
                    connector.ack(batchId);
                } catch (Exception exception) {
                    connector.rollback(batchId);
                    throw new IllegalStateException("Canal 批次处理失败，batchId=" + batchId,
                            exception);
                }
            }
        } finally {
            connector.disconnect();
        }
    }
}
```

`getWithoutAck` 取出消息但不自动确认。只有整个批次处理成功后才调用 `ack`；失败则 `rollback`，下次重新拉取。

解析行数据：

```java
private void handle(CanalEntry.Entry entry) throws Exception {
    if (entry.getEntryType() != CanalEntry.EntryType.ROWDATA) {
        return;
    }

    CanalEntry.RowChange change = CanalEntry.RowChange.parseFrom(entry.getStoreValue());
    for (CanalEntry.RowData row : change.getRowDatasList()) {
        Map<String, String> before = toMap(row.getBeforeColumnsList());
        Map<String, String> after = toMap(row.getAfterColumnsList());

        ChangeEvent event = new ChangeEvent(
                entry.getHeader().getSchemaName(),
                entry.getHeader().getTableName(),
                change.getEventType().name(),
                before,
                after,
                entry.getHeader().getExecuteTime());

        eventHandler.handle(event);
    }
}

private Map<String, String> toMap(List<CanalEntry.Column> columns) {
    return columns.stream().collect(Collectors.toMap(
            CanalEntry.Column::getName,
            CanalEntry.Column::getValue,
            (left, right) -> right,
            LinkedHashMap::new));
}
```

对于 `INSERT`，主要读取 `afterColumns`；对于 `DELETE`，主要读取 `beforeColumns`；对于 `UPDATE`，两者都有值，还可以通过列的 `updated` 标记判断具体变更字段。

## 五、ACK 不等于“只消费一次”

考虑下面的时序：

```text
1. 消费者更新 Elasticsearch 成功
2. 消费者准备 ACK
3. 网络中断，ACK 未到 Canal
4. 消费者重连后再次收到同一批数据
```

因此 Canal 消费通常是“至少一次”，业务消费者必须幂等。

常见幂等方案包括：

- Elasticsearch 使用数据库主键作为文档 ID，重复写入覆盖同一文档。
- Redis 使用确定性 Key 更新，不做无条件累加。
- 关系库建立事件唯一键，插入冲突时跳过。
- 下游接口携带全局幂等号。

如果变更顺序很重要，可使用 Binlog 文件名、位点或事件时间构建版本控制，但要注意不同 MySQL 实例切换后的位点语义。更通用的做法是在业务表中维护单调递增版本号，下游只接受更新版本。

## 六、全量与增量如何衔接

Canal 只解决增量捕获，不会自动把历史数据装进下游。可靠初始化通常采用以下流程：

1. 记录一个明确的 Binlog 位点或一致性快照点。
2. 导出并写入全量数据。
3. 从记录的位点开始消费增量。
4. 对主键数量、校验和或业务指标进行核对。
5. 确认一致后再切换读流量。

如果全量导入持续很久，要避免增量事件覆盖顺序错误。可以先把增量写入消息队列暂存，或给目标数据增加版本判断。

## 七、为什么推荐 Canal 后面接消息队列

客户端直接写一个下游最简单，但随着消费者增加，Canal 会同时承担订阅、缓存和下游故障压力。更通用的架构是：

```text
MySQL → Canal → Kafka/RocketMQ
                    ├─ 搜索索引消费者
                    ├─ 缓存刷新消费者
                    ├─ 知识图谱消费者
                    └─ 审计消费者
```

消息队列可以提供削峰、重放和消费组隔离。事件中应至少包含：数据库、表、操作类型、主键、变更前后数据、执行时间，以及可用于排查顺序的位点信息。

## 八、常见问题排查

### 收不到数据

依次确认 MySQL 是否开启 Binlog、格式是否为 ROW、账号是否拥有复制权限、过滤正则是否匹配，以及客户端 `subscribe` 是否覆盖服务端过滤规则。

### UPDATE 事件字段不完整

检查 MySQL 的 `binlog_row_image` 设置。下游若依赖完整行，应评估使用 `FULL` 带来的日志体积与同步需求。

### Canal 启动时报 slaveId 冲突

每个复制客户端都必须使用唯一 `server_id/slaveId`。检查 MySQL 从库、其他 Canal 实例和临时迁移任务。

### 消费延迟持续增加

监控 Binlog 产生速度、Canal 解析速度和下游消费速度。慢点通常在下游批量写入、网络或热点主键。优先批量处理和异步解耦，不要盲目增加单批大小导致内存和重试成本上升。

### DDL 导致消费者异常

字段新增、删除、改名都会影响事件结构。消费者应忽略未知字段、对必填字段做显式校验，并把无法处理的事件送入死信队列，而不是卡住整个订阅。

## 九、生产环境检查清单

- Binlog 使用 ROW 模式，并设置足够的保留时间。
- Canal 账号最小权限，网络访问受限。
- Canal 位点和元数据持久化，主备切换经过演练。
- 消费者手动 ACK，失败可以重试和重放。
- 所有下游写入具备幂等能力。
- 全量与增量之间有明确的校准流程。
- 监控解析延迟、消费延迟、失败率、重试次数和堆积量。
- Schema 变更有兼容策略和告警。

## 十、总结

Canal 降低了业务系统与数据同步链路之间的耦合，但“拿到 Binlog”只是第一步。真正可靠的 CDC 系统还需要解决位点持久化、至少一次投递、业务幂等、全增量衔接、Schema 演进和可观测性。

把这些边界设计清楚后，同一份数据库变更就可以稳定地服务于搜索、缓存、数仓和知识图谱，而不必在每个业务写入接口里维护一套双写逻辑。

## 参考资料

- [Canal QuickStart](https://github.com/alibaba/canal/wiki/QuickStart)
- [Canal AdminGuide](https://github.com/alibaba/canal/wiki/AdminGuide)

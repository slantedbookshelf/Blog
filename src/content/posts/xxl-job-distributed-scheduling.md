---
title: "XXL-JOB 实战：从定时任务到可治理的分布式调度"
description: "以 Spring Boot 库存同步任务为例，梳理 XXL-JOB 的接入方式、路由分片、幂等重试、故障排查与生产治理。"
pubDate: 2026-09-24
category: "Backend"
tags: ["XXL-JOB", "Spring Boot", "Distributed Systems", "Scheduling"]
---

在单体应用里，一个 `@Scheduled` 往往就能解决定时任务问题。但当服务扩容到多个实例后，重复执行、任务积压、失败补偿、日志追踪和动态修改执行时间都会变得棘手。XXL-JOB 的价值并不是“再写一个 Cron”，而是把任务的调度、执行和治理拆开，让定时任务具备可观察、可控制和可扩展的能力。

本文以 Spring Boot 服务中的“定时同步奖品库存”为例，介绍 XXL-JOB 的核心原理、接入方式以及生产环境中最容易踩的坑。

## 一、XXL-JOB 解决了什么问题

传统定时任务通常与业务应用绑定：Cron 写在代码中，执行日志散落在业务日志里，服务重启或扩容后还要自行保证任务只执行一次。XXL-JOB 将这套流程拆成两个角色：

- **调度中心（Admin）**：保存任务配置，根据 Cron、固定速度等策略产生调度，并记录执行结果。
- **执行器（Executor）**：注册到调度中心，接收调度请求并执行真正的业务代码。

一次任务调用可以简化为：

```text
管理员配置任务
      ↓
调度中心生成调度
      ↓
根据路由策略选择执行器
      ↓
执行器调用 JobHandler
      ↓
回调执行结果并上报日志
```

这套设计的关键是：**调度中心只负责决定“何时、在哪台机器上执行”，业务服务负责“具体做什么”**。

## 二、搭建调度中心

调度中心依赖 MySQL。准备好官方 SQL 后，可以通过源码、镜像或 Docker Compose 启动。容器化部署时，至少要外置以下配置：

```yaml
services:
  xxl-job-admin:
    image: xuxueli/xxl-job-admin:${XXL_JOB_VERSION}
    ports:
      - "8080:8080"
    environment:
      PARAMS: >-
        --spring.datasource.url=jdbc:mysql://mysql:3306/xxl_job?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai
        --spring.datasource.username=xxl_job
        --spring.datasource.password=${XXL_JOB_DB_PASSWORD}
```

版本号和密码应通过环境变量或配置中心注入，不要直接写进仓库。首次运行前，还需要执行对应版本仓库中的建表脚本。

生产环境还应注意：

1. Admin 应部署多个实例，并通过负载均衡暴露统一地址。
2. 多个 Admin 必须连接同一个数据库，机器时间要保持一致。
3. 数据库账号只授予所需权限，访问入口接入鉴权和网络隔离。
4. 任务日志、回调记录和告警信息需要设置保留周期。

## 三、Spring Boot 接入执行器

业务应用只需要引入 `xxl-job-core`。版本应与调度中心保持兼容：

```xml
<dependency>
    <groupId>com.xuxueli</groupId>
    <artifactId>xxl-job-core</artifactId>
    <version>${xxl-job.version}</version>
</dependency>
```

配置执行器：

```yaml
xxl:
  job:
    admin:
      addresses: http://xxl-job-admin:8080/xxl-job-admin
    accessToken: ${XXL_JOB_ACCESS_TOKEN}
    executor:
      appname: vip-marketing-executor
      address:
      ip:
      port: 9999
      logpath: ./data/applogs/xxl-job
      logretentiondays: 30
```

如果容器存在多网卡或经过 NAT，自动识别出的 IP 可能无法被调度中心访问。这时应显式配置执行器对 Admin 可达的地址。`appname` 则要与调度中心创建的执行器名称一致。

随后注册执行器 Bean：

```java
@Configuration
public class XxlJobConfig {

    @Bean
    public XxlJobSpringExecutor xxlJobExecutor(XxlJobProperties properties) {
        XxlJobSpringExecutor executor = new XxlJobSpringExecutor();
        executor.setAdminAddresses(properties.getAdminAddresses());
        executor.setAppname(properties.getAppname());
        executor.setAccessToken(properties.getAccessToken());
        executor.setPort(properties.getPort());
        executor.setLogPath(properties.getLogPath());
        executor.setLogRetentionDays(properties.getLogRetentionDays());
        return executor;
    }
}
```

实际项目中可将这些字段封装为 `@ConfigurationProperties`，避免散落大量 `@Value`。

## 四、编写一个可治理的任务

下面的任务按参数同步某个活动的奖品库存：

```java
@Component
public class AwardStockSyncJob {

    private final AwardStockService awardStockService;

    public AwardStockSyncJob(AwardStockService awardStockService) {
        this.awardStockService = awardStockService;
    }

    @XxlJob("awardStockSyncJob")
    public void execute() {
        String activityId = XxlJobHelper.getJobParam();
        int shardIndex = XxlJobHelper.getShardIndex();
        int shardTotal = XxlJobHelper.getShardTotal();

        try {
            int count = awardStockService.sync(activityId, shardIndex, shardTotal);
            XxlJobHelper.log(
                    "库存同步完成，activityId={}, shard={}/{}, count={}",
                    activityId, shardIndex, shardTotal, count);
            XxlJobHelper.handleSuccess("同步成功，共处理 " + count + " 条");
        } catch (Exception exception) {
            XxlJobHelper.log(exception);
            XxlJobHelper.handleFail("库存同步失败：" + exception.getMessage());
        }
    }
}
```

`@XxlJob` 中的名称就是调度中心配置的 JobHandler。参数、分片编号和执行日志都从当前任务上下文获取，不需要自己解析调度请求。

不过，成功和失败状态只是治理信息，不能替代业务一致性。任务可能已经修改数据库，却在回调前发生网络异常，因此业务代码仍要保证幂等。

一个常见做法是建立任务执行记录：

```sql
CREATE TABLE job_execution_record (
    biz_key      VARCHAR(128) PRIMARY KEY,
    status       VARCHAR(16)  NOT NULL,
    updated_at   DATETIME     NOT NULL
);
```

用“任务名 + 业务日期 + 分片号”等稳定字段生成 `biz_key`。任务开始时尝试插入，重复执行时根据状态决定跳过、续跑还是补偿。

## 五、路由、阻塞与分片怎么选

### 1. 路由策略

- **轮询、随机**：适合无状态、执行时间较短的任务。
- **一致性哈希**：同一业务参数希望尽量落到同一执行器时使用。
- **故障转移**：优先寻找健康节点，适合可在任意节点执行的任务。
- **分片广播**：所有执行器都收到一次调度，各自处理一部分数据。

路由策略决定“选哪台机器”，不能代替数据库锁、幂等键或状态机。

### 2. 阻塞策略

如果上一次任务尚未结束，下一次调度又来了，需要明确选择：

- **单机串行**：按顺序执行，适合不能并发的任务，但可能不断积压。
- **丢弃后续调度**：适合只关心最新状态、允许跳过一次的任务。
- **覆盖之前调度**：适合旧任务继续执行已经没有价值的场景，但业务必须能安全中断。

不要用很短的 Cron 配合单机串行来“保证不漏数据”。如果单次耗时长期大于调度间隔，应先做分页、分片或事件化改造。

### 3. 分片广播

分片任务不要把全量数据先查到内存再过滤，可以直接按稳定字段取模：

```sql
SELECT id, award_id, stock
FROM award_stock
WHERE MOD(id, :shardTotal) = :shardIndex
ORDER BY id
LIMIT :pageSize;
```

分片总数会随在线执行器数量变化，因此断点续跑时不能只记录页码，最好记录稳定的业务游标。

## 六、失败重试与超时治理

任务重试很容易制造重复副作用。例如优惠券已经发放成功，但执行器在回调前超时，下一次重试又发了一张。因此：

1. 写操作必须用业务唯一键实现幂等。
2. 外部接口调用要携带幂等号，并保存请求与结果。
3. 对可重试异常和不可重试异常分类，参数错误不应无限重试。
4. 单次任务设置合理超时，并让下游网络调用的超时更短。
5. 大批量任务使用小批次提交，记录处理进度，避免失败后从头开始。

建议同时监控以下指标：任务成功率、执行耗时分位数、积压次数、连续失败次数、每批处理量，以及执行器注册数量。

## 七、常见故障排查

### 调度中心显示执行器不在线

先检查执行器是否完成注册，再从 Admin 所在网络验证执行器地址和端口是否可达。容器 IP、宿主机 IP 和注册地址不一致是最常见原因。

### JobHandler 找不到

检查 `@XxlJob` 名称与控制台配置是否完全一致，并确认任务类已被 Spring 扫描。升级时还要确认 Admin 与 core 的兼容性。

### 任务执行两次

调度系统通常只能提供“至少一次”语义。网络超时、回调丢失和人工重跑都可能导致重复执行，最终仍要靠业务幂等兜底。

### 日志看不到

检查执行器日志目录的写权限、磁盘空间以及回调链路。容器部署时应挂载持久化卷，并配置日志清理策略。

## 八、总结

XXL-JOB 的核心价值是将分散在业务服务里的定时任务变成可配置、可观察、可告警的调度资产。真正稳定的落地方式可以概括为四点：调度与业务解耦、任务天然幂等、批处理可断点续跑、执行链路可观测。

当一个任务已经演变成长时间运行、依赖复杂状态编排的工作流时，也要及时评估工作流引擎或消息驱动架构，而不是继续往一个 JobHandler 中堆逻辑。

## 参考资料

- [XXL-JOB 官方中文文档](https://github.com/xuxueli/xxl-job/blob/master/doc/XXL-JOB%E5%AE%98%E6%96%B9%E6%96%87%E6%A1%A3.md)
- [XXL-JOB GitHub 仓库](https://github.com/xuxueli/xxl-job)

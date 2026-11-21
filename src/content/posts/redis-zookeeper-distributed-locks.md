---
title: "分布式锁实战：用 Redis 和 ZooKeeper 保护同一个任务"
description: "用多实例生成日报的场景，对照 Redis 的 TTL 与 Lua 解锁、ZooKeeper 的临时顺序节点与 Curator，并复现争抢、过期和会话关闭。"
pubDate: 2026-11-18
category: "Backend"
categories: ["Java 后端", "算法与数据"]
tags: ["Redis", "ZooKeeper", "Curator", "分布式锁", "实战"]
---

每天凌晨，两个应用实例同时收到「生成今日销售日报」的调度请求。它们都查了一遍，发现报表还没生成，然后各自开始汇总。即使最终只有一个文件留下，两边也已经各执行了一次昂贵的查询。进程内的 `synchronized` 只能约束一个 JVM，因此两个实例需要围绕同一个资源键协商。

本文把资源定为 `2026-11-18` 的销售日报。任一实例抢到锁后，先复查报表状态，再生成和发布。紧接着，我们让持锁者超时或退出，观察下一个实例如何接管。两个实验分别验证 Redis 的租约和 ZooKeeper 的会话。在末尾，再把锁接到实际的报表发布逻辑上。

## 一、Redis 分布式锁：用带 TTL 的键表示租约

### 加锁、释放和续期

单实例 Redis 可以用一条命令完成「键不存在才写入」和「写入时设置有效期」。`NX` 让同一时刻的竞争请求只有一个能成功写入，`PX` 指定毫秒级 TTL。把写入和设过期拆成两条命令，客户端就可能在中间退出，留下一个没有有效期的锁。值使用每次尝试新生成的随机令牌，解锁时 Redis 靠它识别这一轮持有者。 [Redis SET 命令](https://redis.io/docs/latest/commands/set/) · [Redis 分布式锁](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)

```text
SET lock:report:daily:2026-11-18 <随机令牌> NX PX 30000
```

解锁时需要在 Redis 服务端一次完成“读取令牌、比较、删除”。客户端分开执行 `GET` 和 `DEL` 时，旧锁可能恰好在两条命令之间过期，随后误删另一个实例的新锁。下面的 Lua 脚本兼容实验所用的 Redis 7.4。返回 `1` 表示删掉本次持有的锁，返回 `0` 表示锁已过期或令牌不匹配。 [Redis Lua 脚本原子执行](https://redis.io/docs/latest/develop/programmability/eval-intro/) · [Redis 锁的释放约定](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)

```lua
local owner = redis.call('GET', KEYS[1])
if owner ~= ARGV[1] then
    return 0
end
return redis.call('DEL', KEYS[1])
```

任务不能稳定在 TTL 内完成时，可以增加续期。续期也要原子地校验令牌再执行 `PEXPIRE`，并在返回失效或请求结果不确定时停止发起新的提交。进程停顿和断网也会让续期失效，业务还要能处理锁丢失。原始的 `SET NX PX` 没有可重入和排队语义。日报这类允许下一次调度补做的任务，拿不到锁可以直接跳过。需要等待的请求可以设总等待期限，加有抖动的退避，避免同时重试。

### 实战：复现旧实例过期后解锁

本地启动 Redis，把下一段 Python 保存为 `redis_lock_lab.py`。使用本机已有的 Redis 时，可通过修改脚本里的端口连接。两个客户端使用同一个 Redis 键，脚本每次运行会生成独立的实验命名空间。

```bash
docker run --rm --name redis-lock-lab -p 127.0.0.1:16379:6379 -d redis:7.4
python -m pip install redis==5.2.1
python redis_lock_lab.py
```

```python
from time import monotonic, sleep
from uuid import uuid4

from redis import Redis

UNLOCK = """
local owner = redis.call('GET', KEYS[1])
if owner ~= ARGV[1] then
    return 0
end
return redis.call('DEL', KEYS[1])
"""


def acquire(client, key, ttl_ms):
    token = uuid4().hex
    if client.set(key, token, nx=True, px=ttl_ms):
        return token
    return None


def release(client, key, token):
    return client.eval(UNLOCK, 1, key, token) == 1


def wait_until_expired(client, key):
    deadline = monotonic() + 5
    while client.exists(key):
        if monotonic() >= deadline:
            raise TimeoutError("expected Redis to expire the lease")
        sleep(0.02)


def exercise_lock(a, b):
    key = f"lab:{uuid4().hex}:lock:report:daily:2026-11-18"

    owner_a = acquire(a, key, 30_000)
    assert owner_a is not None
    contender = acquire(b, key, 30_000)
    assert contender is None
    released = release(a, key, owner_a)
    assert released
    print("A gets the lock, B misses, A releases")

    stale_a = acquire(a, key, 500)
    assert stale_a is not None
    wait_until_expired(b, key)

    owner_b = acquire(b, key, 30_000)
    assert owner_b is not None
    try:
        stale_release = release(a, key, stale_a)
        assert not stale_release
        assert b.get(key) == owner_b
        print("A expires, B gets the lock, A cannot delete B's lock")
    finally:
        released = release(b, key, owner_b)
    assert released


if __name__ == "__main__":
    options = dict(host="127.0.0.1", port=16379, decode_responses=True, socket_timeout=2)
    with Redis(**options) as worker_a, Redis(**options) as worker_b:
        exercise_lock(worker_a, worker_b)
```

脚本里等待键过期的轮询用于控制故障复现。实际业务中，实例只在明确获得锁时进入临界区，并在 `finally` 里尝试按令牌释放。如果 `SET` 请求超时，命令可能已经执行，客户端只能把结果视为未知，跳过业务执行并让 TTL 兜底。TTL 是从 Redis 设置键开始计时的，收到响应时可用时间已经减少。

### 主从切换会怎样

假设 A 在主节点加锁成功，主节点在把锁异步复制到副本前宕机。副本晋升后没有这把锁，B 可以再次加锁成功。单主上的原子 `SET` 和 Lua 只解决该节点内的竞争，应用仍需考虑故障切换时的重复执行。Redis 官方还描述了基于多个独立节点的 Redlock，需按其计时和故障假设评估。本文的实验使用单实例租约。 [Redis 分布式锁的故障切换分析](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)

## 二、ZooKeeper 分布式锁：在临时顺序节点上排队

### 排队和监听前驱节点

锁目录 `/locks/report/daily/2026-11-18` 是持久节点。每个竞争者在目录下创建一个临时顺序节点。ZooKeeper 为同一父路径下的顺序节点分配序号，序号最小的竞争者持锁，其他竞争者只监听自己前一个节点。持有者主动删除节点，或者它的会话结束并清理临时节点时，下一个竞争者被通知，重新列出子节点并判断自己是否排到了第一。 [ZooKeeper 锁配方](https://zookeeper.apache.org/doc/current/recipes.html#sc_recipes_Locks)

```text
/locks/report/daily/2026-11-18
  lock-0000000001  A 持锁
  lock-0000000002  B 监听 A
  lock-0000000003  C 监听 B
```

每个等待者只监听前驱，可以避免一把锁释放时唤醒整条队列。实现时还要处理两个竞态。一是前驱可能在你列出子节点到注册 Watch 的间隙消失，此时要重新检查队列。二是创建请求可能已在服务端成功，但响应丢失，盲目重试会留下两个排队节点。官方配方用请求标识找回这次创建的节点。Java 项目可以复用 Curator 的 `InterProcessMutex`。 [ZooKeeper 配方中的可恢复错误](https://zookeeper.apache.org/doc/current/recipes.html#sc_recipes_errorHandling) · [Curator 可重入锁](https://curator.apache.org/docs/recipes-shared-reentrant-lock/)

### 实战：两个独立会话争抢同一把锁

本地启动 ZooKeeper。在一个空目录创建 `pom.xml`，把 Java 文件放在 `src/main/java/ZookeeperLockLab.java`。用 JDK 17 和 Maven 运行。示例启动单节点服务，两个客户端通过同一个锁路径竞争，使用各自独立的 ZooKeeper 会话。 [ZooKeeper 官方容器镜像](https://hub.docker.com/_/zookeeper) · [Curator Maven 依赖](https://central.sonatype.com/artifact/org.apache.curator/curator-recipes/5.8.0)

```bash
docker run --rm --name zk-lock-lab -p 127.0.0.1:12181:2181 -d zookeeper:3.9.7
```

```xml
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>example</groupId>
  <artifactId>zk-lock-lab</artifactId>
  <version>1.0.0</version>
  <properties>
    <maven.compiler.release>17</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.apache.curator</groupId>
      <artifactId>curator-recipes</artifactId>
      <version>5.8.0</version>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.13.0</version>
      </plugin>
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>exec-maven-plugin</artifactId>
        <version>3.5.0</version>
        <configuration><mainClass>ZookeeperLockLab</mainClass></configuration>
      </plugin>
    </plugins>
  </build>
</project>
```

```java
import java.util.concurrent.TimeUnit;
import org.apache.curator.framework.CuratorFramework;
import org.apache.curator.framework.CuratorFrameworkFactory;
import org.apache.curator.framework.recipes.locks.InterProcessMutex;
import org.apache.curator.retry.ExponentialBackoffRetry;

public class ZookeeperLockLab {
    private static final String PATH = "/locks/report/daily/2026-11-18";

    public static void main(String[] args) throws Exception {
        try (CuratorFramework a = newClient(); CuratorFramework b = newClient()) {
            start(a);
            start(b);
            InterProcessMutex lockA = new InterProcessMutex(a, PATH);
            InterProcessMutex lockB = new InterProcessMutex(b, PATH);

            require(lockA.acquire(5, TimeUnit.SECONDS), "A should acquire");
            try {
                if (lockB.acquire(300, TimeUnit.MILLISECONDS)) {
                    lockB.release();
                    throw new IllegalStateException("B acquired while A held the lock");
                }
                System.out.println("A gets the lock, B waits and times out");
            } finally {
                lockA.release();
            }
            acquireAndRelease(lockB, "B gets the lock after A releases");

            try (CuratorFramework retiring = newClient()) {
                start(retiring);
                InterProcessMutex held = new InterProcessMutex(retiring, PATH);
                require(held.acquire(5, TimeUnit.SECONDS), "retiring client should acquire");
                // Close the session while its ephemeral lock node is still present.
            }
            acquireAndRelease(lockB, "B gets the lock after the other session closes");
        }
    }

    private static CuratorFramework newClient() {
        return CuratorFrameworkFactory.newClient(
            "127.0.0.1:12181", 10_000, 5_000, new ExponentialBackoffRetry(100, 3)
        );
    }

    private static void start(CuratorFramework client) throws InterruptedException {
        client.start();
        require(client.blockUntilConnected(5, TimeUnit.SECONDS), "ZooKeeper unavailable");
    }

    private static void acquireAndRelease(InterProcessMutex lock, String message) throws Exception {
        require(lock.acquire(5, TimeUnit.SECONDS), message);
        try {
            System.out.println(message);
        } finally {
            lock.release();
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) {
            throw new IllegalStateException(message);
        }
    }
}
```

```bash
mvn -q compile exec:java
```

这里的 `300 ms` 是 B 愿意等待获取锁的时间，`10 s` 是客户端请求协商的 ZooKeeper 会话超时。已经持锁的客户端只要会话有效，锁就可以一直保留。`InterProcessMutex` 支持同一实例、同一线程重入，每次成功获取都需要在该线程配对调用一次 `release()`。`acquire()` 返回 `false` 时跳过解锁。 [Curator 的获取与释放约定](https://curator.apache.org/docs/recipes-shared-reentrant-lock/)

### 从主动关闭切换到真实故障

实验第三步主动关闭会话，ZooKeeper 会清理临时节点。进程被强制终止或网络断开时，通常要等服务端判定会话过期，后续实例才能接管。应用可用 Curator 的连接状态监听器处理两种情况。`SUSPENDED` 时暂停新的副作用，`LOST` 时废弃这次执行的锁和提交资格。重连后重新确认任务状态，失效的执行需要重新竞争。集群中写入需要 quorum，三台有投票权的节点需要两台形成多数派才能提交锁状态。 [Curator 连接状态](https://curator.apache.org/apidocs/org/apache/curator/framework/state/ConnectionState.html) · [ZooKeeper 会话与一致性](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html)

## 三、把锁接到真正的日报发布上

锁控制谁先开始工作，报表写入端还要控制谁能发布结果。假设 A 拿到锁后因长时间 GC 停顿，Redis 租约过期，或者 ZooKeeper 会话失效。B 接管并发布新结果。A 恢复时，内存里可能仍保留待发送的请求，可以继续尝试覆盖结果。按令牌解锁能保护锁键，连接状态监听能减少故障之后的请求，两者都无法撤回已经发出的业务写入。

如果日报只允许首次发布，可以给日期加唯一约束，在锁内先查，再让数据库在提交时按日期原子地争取创建资格。同一个日期的重试读取已经发布的结果。如果业务还允许接管者覆盖旧结果，可给每次授权分配单调递增的 fencing token（栅栏令牌），由下游在写入时拒绝早于已接受版本的请求。

假设每个日期已有一行，`last_fence` 初始值是 `0`。`last_fence` 和报表地址必须在同一次更新里提交。示例使用命名参数，应用按数据库驱动的方式绑定参数。

```sql
UPDATE daily_reports
SET object_key = :object_key, last_fence = :fence
WHERE report_date = :report_date AND last_fence < :fence;
```

例如 B 的令牌为 `42`，成功提交后 A 带 `41` 再写会影响 `0` 行。若 `0` 行是同一令牌的重试，可以读取已提交状态后返回结果。如果报表实际存在对象存储里，先写到每次执行独立的对象键，数据库只发布被接受的对象地址。否则旧实例可能直接覆盖共享文件，绕过数据库的条件判断。

令牌的递增顺序必须和授权顺序绑定。Redis 示例里的随机令牌用于校验锁主身份。若在拿到锁后再单独 `INCR`，先暂停的旧持有者可能更晚取到更大的编号。ZooKeeper 配方里的顺序号可以作为理解授权排序的起点，实际采用前还要保证命名空间、父节点生命周期和计数器回绕都不会破坏顺序。 [Redis 对 fencing token 的说明](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) · [ZooKeeper 顺序节点计数器](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html)

## 四、按任务的故障后果选型

| 业务关注点 | Redis 单实例租约 | ZooKeeper 临时顺序节点 |
| --- | --- | --- |
| 谁能拿锁 | 第一个成功执行 `SET NX PX` 的请求 | 排到队首的会话 |
| 拿不到怎么办 | 可立即跳过，或在期限内退避重试 | 监听前驱并等待，Curator 支持限时获取 |
| 持有者突然退出 | 由 TTL 释放 | 会话过期后清理临时节点 |
| 部署时重点验证 | TTL 与任务耗时、续期失败、故障切换、锁键淘汰策略 | 会话过期、网络分区、quorum、排队等待和连接状态 |

已有 Redis、任务允许偶尔重复计算、写入端具备幂等约束时，可从短租约开始。需要排队协调、系统已有 ZooKeeper 集群时，Curator 能直接提供限时等待和会话接管。拿同一个日报任务做上线前演练时，先验证两者在正常竞争下的等待表现，再暂停旧实例、让新实例接管，最后恢复旧实例，检查发布端是否保住了已接受的新结果。

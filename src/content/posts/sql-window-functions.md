---
title: "SQL 窗口函数入门：从 SUM OVER 看懂分组、累计和滑动统计"
description: "用销售数据案例理解 SQL 窗口函数的核心语法，区分 GROUP BY、PARTITION BY、ORDER BY 和窗口范围。"
pubDate: 2026-08-24
category: "Database"
tags: ["SQL", "Window Function", "Database"]
---

窗口函数最适合解决这类问题：既想保留每一行明细，又想在每一行旁边计算一个统计值。

普通的 `GROUP BY` 会把多行压缩成一行，而窗口函数不会改变结果集的行数。它像是在当前查询结果上开了一扇窗口：每一行都可以看到自己所属的一组数据，然后基于这组数据做求和、排名、累计、前后行比较等操作。

## 基本语法

窗口函数一般写成：

```sql
函数名(列名) over (
  partition by 分组列
  order by 排序列
  rows between 起点 and 终点
)
```

可以把它拆成三层理解：

1. `partition by`：把数据分成多个窗口，类似 `GROUP BY` 的分组边界。
2. `order by`：定义窗口内部的顺序，累计值、排名、前后行都依赖它。
3. `rows between ... and ...`：定义当前行能看到的范围，也叫窗口 frame。

## 和 GROUP BY 的区别

假设有一张销售表 `dealer_sales`：

```sql
select
  emp_name,
  emp_mgr,
  dealer_id,
  sales,
  stat_date
from dealer_sales;
```

如果想算每个经销商的总销售额，用 `GROUP BY` 会变成这样：

```sql
select
  dealer_id,
  sum(sales) as dealer_total_sales
from dealer_sales
group by dealer_id;
```

结果里只剩每个 `dealer_id` 一行，员工、日期、单笔销售额这些明细都没了。

窗口函数的写法是：

```sql
select
  emp_name,
  emp_mgr,
  dealer_id,
  sales,
  stat_date,
  sum(sales) over (partition by dealer_id) as dealer_total_sales
from dealer_sales;
```

这时每一条销售明细仍然保留，只是在每一行旁边多出一个该经销商的销售总额。

## SUM OVER 案例

```sql
select
  emp_name,
  emp_mgr,
  dealer_id,
  sales,
  stat_date,
  sum(sales) over () as sample1,
  sum(sales) over (partition by dealer_id) as sample2,
  sum(sales) over (
    partition by dealer_id
    order by stat_date
  ) as sample3,
  sum(sales) over (
    partition by dealer_id
    order by stat_date
    rows between unbounded preceding and current row
  ) as sample4,
  sum(sales) over (
    partition by dealer_id
    order by stat_date
    rows between 1 preceding and current row
  ) as sample5
from dealer_sales;
```

这五列可以这样理解：

| 字段 | 含义 | 结果特点 |
| --- | --- | --- |
| `sample1` | 全表销售额总和 | 所有行的值都一样 |
| `sample2` | 每个 `dealer_id` 内的销售额总和 | 同一个经销商下的行值一样 |
| `sample3` | 每个经销商内按日期累计销售额 | 越往后累计值越大 |
| `sample4` | 明确写出“从第一行累计到当前行” | 日期唯一时通常和 `sample3` 一样 |
| `sample5` | 当前行和上一行的销售额之和 | 只看最近两行，属于滑动窗口 |

其中最容易混淆的是 `sample3` 和 `sample4`。

`sample3` 写了 `order by stat_date`，但没有显式写 `rows between ...`。很多数据库会给它一个默认窗口范围，常见语义接近“从分区开头累计到当前排序值”。如果 `stat_date` 没有重复，结果通常和 `sample4` 一样。

但如果同一个 `dealer_id` 下有多行 `stat_date` 相同，默认范围可能会把排序值相同的行一起算进去，而 `rows between unbounded preceding and current row` 是按物理行一行一行累计。写报表时，如果希望严格按行累计，建议像 `sample4` 一样把 frame 明确写出来。

## 用小数据看一遍

假设数据是：

| emp_name | dealer_id | sales | stat_date |
| --- | --- | ---: | --- |
| A | D01 | 100 | 2026-08-01 |
| B | D01 | 200 | 2026-08-02 |
| C | D01 | 300 | 2026-08-03 |
| D | D02 | 80 | 2026-08-01 |
| E | D02 | 120 | 2026-08-02 |

那么几个窗口结果会是：

| emp_name | dealer_id | sales | `sample1` | `sample2` | `sample4` | `sample5` |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| A | D01 | 100 | 800 | 600 | 100 | 100 |
| B | D01 | 200 | 800 | 600 | 300 | 300 |
| C | D01 | 300 | 800 | 600 | 600 | 500 |
| D | D02 | 80 | 800 | 200 | 80 | 80 |
| E | D02 | 120 | 800 | 200 | 200 | 200 |

可以看到：

`sample1` 的窗口是全表，所以每一行都是 `800`。

`sample2` 按 `dealer_id` 分区，`D01` 都是 `600`，`D02` 都是 `200`。

`sample4` 是分区内累计求和，`D01` 从 `100` 到 `300` 再到 `600`。

`sample5` 是滑动窗口，只看当前行和上一行。`D01` 第三行是 `200 + 300 = 500`，不会把第一行的 `100` 算进去。

## 常见窗口函数

除了 `sum()`，窗口函数还常用于排名和取前后行。

```sql
select
  emp_name,
  dealer_id,
  sales,
  rank() over (
    partition by dealer_id
    order by sales desc
  ) as sales_rank
from dealer_sales;
```

`rank()` 可以计算每个经销商内部的销售排名。如果有并列名次，会跳过后续名次；如果不想跳过，可以用 `dense_rank()`。

```sql
select
  emp_name,
  dealer_id,
  sales,
  stat_date,
  lag(sales) over (
    partition by dealer_id
    order by stat_date
  ) as previous_sales
from dealer_sales;
```

`lag()` 可以拿到上一行的值，常用于计算环比、差值和趋势变化。

## 使用窗口函数时的注意点

第一，窗口函数一般在 `where` 过滤之后执行。也就是说，被 `where` 排除掉的数据不会参与窗口计算。

第二，只要涉及累计、排名、上一行、下一行，就要认真写 `order by`。没有顺序，所谓“上一行”和“累计到当前行”就不可靠。

第三，累计求和时尽量显式写窗口范围：

```sql
rows between unbounded preceding and current row
```

这样 SQL 的意图更清楚，也能减少不同数据库默认行为带来的差异。

## 总结

窗口函数的核心价值是：在不丢失明细行的前提下，给每一行加上分组统计、累计统计、排名或前后行对比。

记住这条思路就够了：

`partition by` 决定“和谁一起算”，`order by` 决定“按什么顺序算”，`rows between` 决定“当前行能看见多大范围”。

理解了图片里的五个 `sum(sales) over (...)`，大部分窗口函数题目就已经有了清晰的入口。

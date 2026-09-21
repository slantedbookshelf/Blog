---
title: "sql_50思路"
description: "个人总结的 LeetCode SQL 50 思路"
pubDate: 2026-09-20
category: "LeetCode"
tags: ["LeetCode", "SQL", "Database"]
pinned: true
---

## Select

### 1757、<a href="https://leetcode.cn/problems/recyclable-and-low-fat-products/" target="_blank" rel="noopener noreferrer">可回收且低脂的产品</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

从 Products 表中找出同时低脂且可回收的产品编号。
输入：Products 表
输出：product_id

**思路**：直接用 WHERE 同时过滤两个字段。

```sql
select product_id
from Products
where low_fats = 'Y'
  and recyclable = 'Y';
```

### 584、<a href="https://leetcode.cn/problems/find-customer-referee/" target="_blank" rel="noopener noreferrer">寻找用户推荐人</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

从 Customer 表中找出推荐人不是 2 或没有推荐人的客户姓名。
输入：Customer 表
输出：name

**思路**：注意 NULL 不能用 <> 命中，需要单独判断 IS NULL。

```sql
select name
from Customer
where referee_id <> 2
   or referee_id is null;
```

### 595、<a href="https://leetcode.cn/problems/big-countries/" target="_blank" rel="noopener noreferrer">大的国家</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

从 World 表中找出面积大或人口多的国家。
输入：World 表
输出：name, population, area

**思路**：用 OR 连接面积和人口两个筛选条件。

```sql
select name, population, area
from World
where area >= 3000000
   or population >= 25000000;
```

### 1148、<a href="https://leetcode.cn/problems/article-views-i/" target="_blank" rel="noopener noreferrer">文章浏览 I</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

从 Views 表中找出浏览过自己文章的作者。
输入：Views 表
输出：id

**思路**：筛选 author_id 等于 viewer_id 的记录，再 DISTINCT 去重并排序。

```sql
select distinct author_id as id
from Views
where author_id = viewer_id
order by id;
```

### 1683、<a href="https://leetcode.cn/problems/invalid-tweets/" target="_blank" rel="noopener noreferrer">无效的推文</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

从 Tweets 表中找出内容长度超过 15 的推文编号。
输入：Tweets 表
输出：tweet_id

**思路**：用 CHAR_LENGTH 统计字符串字符数并过滤。

```sql
select tweet_id
from Tweets
where char_length(content) > 15;
```

## Basic Joins

### 1378、<a href="https://leetcode.cn/problems/replace-employee-id-with-the-unique-identifier/" target="_blank" rel="noopener noreferrer">使用唯一标识码替换员工 ID</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询每个员工的唯一标识码和姓名，没有标识码则显示 NULL。
输入：Employees 表, EmployeeUNI 表
输出：unique_id, name

**思路**：以 Employees 为主表 LEFT JOIN 唯一标识表。

```sql
select eu.unique_id, e.name
from Employees e
left join EmployeeUNI eu
  on e.id = eu.id;
```

### 1068、<a href="https://leetcode.cn/problems/product-sales-analysis-i/" target="_blank" rel="noopener noreferrer">产品销售分析 I</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询每条销售记录对应的产品名称、年份和价格。
输入：Sales 表, Product 表
输出：product_name, year, price

**思路**：Sales 按 product_id 连接 Product 取产品名。

```sql
select p.product_name, s.year, s.price
from Sales s
join Product p
  on s.product_id = p.product_id;
```

### 1581、<a href="https://leetcode.cn/problems/customer-who-visited-but-did-not-make-any-transactions/" target="_blank" rel="noopener noreferrer">进店却未进行过交易的顾客</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

统计只访问但没有交易的顾客及其次数。
输入：Visits 表, Transactions 表
输出：customer_id, count_no_trans

**思路**：Visits LEFT JOIN Transactions，保留交易为空的访问记录后按顾客分组。

```sql
select v.customer_id, count(*) as count_no_trans
from Visits v
left join Transactions t
  on v.visit_id = t.visit_id
where t.transaction_id is null
group by v.customer_id;
```

### 197、<a href="https://leetcode.cn/problems/rising-temperature/" target="_blank" rel="noopener noreferrer">上升的温度</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

找出温度比前一天更高的日期编号。
输入：Weather 表
输出：id

**思路**：自连接昨天和今天，比较日期相差 1 天且今天温度更高。

```sql
select w1.id
from Weather w1
join Weather w2
  on datediff(w1.recordDate, w2.recordDate) = 1
where w1.temperature > w2.temperature;
```

### 1661、<a href="https://leetcode.cn/problems/average-time-of-process-per-machine/" target="_blank" rel="noopener noreferrer">每台机器的进程平均运行时间</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

计算每台机器的平均进程运行时间。
输入：Activity 表
输出：machine_id, processing_time

**思路**：同一进程 start 记负时间、end 记正时间，求和后除以进程数。

```sql
select
  machine_id,
  round(sum(if(activity_type = 'end', timestamp, -timestamp)) / count(distinct process_id), 3) as processing_time
from Activity
group by machine_id;
```

### 577、<a href="https://leetcode.cn/problems/employee-bonus/" target="_blank" rel="noopener noreferrer">员工奖金</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询奖金少于 1000 或没有奖金的员工姓名和奖金。
输入：Employee 表, Bonus 表
输出：name, bonus

**思路**：Employee LEFT JOIN Bonus 后过滤 bonus 小于 1000 或为 NULL。

```sql
select e.name, b.bonus
from Employee e
left join Bonus b
  on e.empId = b.empId
where b.bonus < 1000
   or b.bonus is null;
```

### 1280、<a href="https://leetcode.cn/problems/students-and-examinations/" target="_blank" rel="noopener noreferrer">学生们参加各科测试的次数</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

统计每个学生参加每门科目考试的次数。
输入：Students 表, Subjects 表, Examinations 表
输出：student_id, student_name, subject_name, attended_exams

**思路**：学生和科目先 CROSS JOIN 得到全量组合，再 LEFT JOIN 考试记录计数。

```sql
select
  s.student_id,
  s.student_name,
  sub.subject_name,
  count(e.subject_name) as attended_exams
from Students s
cross join Subjects sub
left join Examinations e
  on s.student_id = e.student_id
 and sub.subject_name = e.subject_name
group by s.student_id, s.student_name, sub.subject_name
order by s.student_id, sub.subject_name;
```

### 570、<a href="https://leetcode.cn/problems/managers-with-at-least-5-direct-reports/" target="_blank" rel="noopener noreferrer">至少有 5 名直接下属的经理</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

查询至少有 5 个直接下属的经理姓名。
输入：Employee 表
输出：name

**思路**：员工表自连接到经理，按经理分组后 HAVING 下属数量不少于 5。

```sql
select m.name
from Employee e
join Employee m
  on e.managerId = m.id
group by m.id, m.name
having count(*) >= 5;
```

### 1934、<a href="https://leetcode.cn/problems/confirmation-rate/" target="_blank" rel="noopener noreferrer">确认率</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

计算每个用户的确认率，没有确认记录的用户为 0。
输入：Signups 表, Confirmations 表
输出：user_id, confirmation_rate

**思路**：Signups LEFT JOIN Confirmations，用 confirmed 的平均值表示确认率。

```sql
select
  s.user_id,
  round(avg(if(c.action = 'confirmed', 1, 0)), 2) as confirmation_rate
from Signups s
left join Confirmations c
  on s.user_id = c.user_id
group by s.user_id;
```

## Basic Aggregate Functions

### 620、<a href="https://leetcode.cn/problems/not-boring-movies/" target="_blank" rel="noopener noreferrer">有趣的电影</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询编号为奇数且描述不是 boring 的电影。
输入：Cinema 表
输出：id, movie, description, rating

**思路**：WHERE 过滤奇数 id 和非 boring，再按 rating 降序。

```sql
select *
from Cinema
where id % 2 = 1
  and description <> 'boring'
order by rating desc;
```

### 1251、<a href="https://leetcode.cn/problems/average-selling-price/" target="_blank" rel="noopener noreferrer">平均售价</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

计算每个产品的平均售价。
输入：Prices 表, UnitsSold 表
输出：product_id, average_price

**思路**：按销售日期匹配有效价格，销售额除以销售数量并处理无销量为 0。

```sql
select
  p.product_id,
  round(ifnull(sum(p.price * u.units) / sum(u.units), 0), 2) as average_price
from Prices p
left join UnitsSold u
  on p.product_id = u.product_id
 and u.purchase_date between p.start_date and p.end_date
group by p.product_id;
```

### 1075、<a href="https://leetcode.cn/problems/project-employees-i/" target="_blank" rel="noopener noreferrer">项目员工 I</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

计算每个项目中员工的平均工作年限。
输入：Project 表, Employee 表
输出：project_id, average_years

**思路**：项目表连接员工表后按项目求 AVG。

```sql
select
  p.project_id,
  round(avg(e.experience_years), 2) as average_years
from Project p
join Employee e
  on p.employee_id = e.employee_id
group by p.project_id;
```

### 1633、<a href="https://leetcode.cn/problems/percentage-of-users-attended-a-contest/" target="_blank" rel="noopener noreferrer">各赛事的用户注册率</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

计算每个比赛的注册用户占所有用户的百分比。
输入：Users 表, Register 表
输出：contest_id, percentage

**思路**：每个 contest 的注册人数除以 Users 总人数，按百分比降序排序。

```sql
select
  contest_id,
  round(count(user_id) * 100 / (select count(*) from Users), 2) as percentage
from Register
group by contest_id
order by percentage desc, contest_id;
```

### 1211、<a href="https://leetcode.cn/problems/queries-quality-and-percentage/" target="_blank" rel="noopener noreferrer">查询结果的质量和占比</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

计算每个查询的质量分和低评分占比。
输入：Queries 表
输出：query_name, quality, poor_query_percentage

**思路**：quality 是 rating/position 的平均值，低评分占比用条件聚合。

```sql
select
  query_name,
  round(avg(rating / position), 2) as quality,
  round(sum(rating < 3) * 100 / count(*), 2) as poor_query_percentage
from Queries
group by query_name;
```

### 1193、<a href="https://leetcode.cn/problems/monthly-transactions-i/" target="_blank" rel="noopener noreferrer">每月交易 I</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

按月份和国家统计交易数、批准数、总金额和批准金额。
输入：Transactions 表
输出：month, country, trans_count, approved_count, trans_total_amount, approved_total_amount

**思路**：用 DATE_FORMAT 截取月份，用条件聚合统计 approved。

```sql
select
  date_format(trans_date, '%Y-%m') as month,
  country,
  count(*) as trans_count,
  sum(state = 'approved') as approved_count,
  sum(amount) as trans_total_amount,
  sum(if(state = 'approved', amount, 0)) as approved_total_amount
from Transactions
group by month, country;
```

### 1174、<a href="https://leetcode.cn/problems/immediate-food-delivery-ii/" target="_blank" rel="noopener noreferrer">即时食物配送 II</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

计算每个顾客首单中即时配送订单的百分比。
输入：Delivery 表
输出：immediate_percentage

**思路**：先筛出每个顾客最早订单，再计算订单日期等于期望日期的比例。

```sql
select round(avg(order_date = customer_pref_delivery_date) * 100, 2) as immediate_percentage
from Delivery
where (customer_id, order_date) in (
  select customer_id, min(order_date)
  from Delivery
  group by customer_id
);
```

### 550、<a href="https://leetcode.cn/problems/game-play-analysis-iv/" target="_blank" rel="noopener noreferrer">游戏玩法分析 IV</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

计算首次登录后第二天又登录的玩家占比。
输入：Activity 表
输出：fraction

**思路**：找每个玩家首次登录日，再连接第二天登录记录统计比例。

```sql
select round(count(distinct a.player_id) / (select count(distinct player_id) from Activity), 2) as fraction
from Activity a
join (
  select player_id, min(event_date) as first_date
  from Activity
  group by player_id
) f
  on a.player_id = f.player_id
 and datediff(a.event_date, f.first_date) = 1;
```

## Sorting and Grouping

### 2356、<a href="https://leetcode.cn/problems/number-of-unique-subjects-taught-by-each-teacher/" target="_blank" rel="noopener noreferrer">每位教师所教授的科目种类的数量</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

统计每位教师教授的不同科目数。
输入：Teacher 表
输出：teacher_id, cnt

**思路**：按 teacher_id 分组后 COUNT DISTINCT subject_id。

```sql
select teacher_id, count(distinct subject_id) as cnt
from Teacher
group by teacher_id;
```

### 1141、<a href="https://leetcode.cn/problems/user-activity-for-the-past-30-days-i/" target="_blank" rel="noopener noreferrer">查询近 30 天活跃用户数</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

统计截止 2019-07-27 的近 30 天每天活跃用户数。
输入：Activity 表
输出：day, active_users

**思路**：筛选日期范围后按 activity_date 分组统计 distinct user_id。

```sql
select
  activity_date as day,
  count(distinct user_id) as active_users
from Activity
where activity_date between date_sub('2019-07-27', interval 29 day) and '2019-07-27'
group by activity_date;
```

### 1070、<a href="https://leetcode.cn/problems/product-sales-analysis-iii/" target="_blank" rel="noopener noreferrer">产品销售分析 III</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

查询每个产品第一年销售的年份、数量和价格。
输入：Sales 表
输出：product_id, first_year, quantity, price

**思路**：用子查询找每个产品最小 year，再回表取该年的销售记录。

```sql
select product_id, year as first_year, quantity, price
from Sales
where (product_id, year) in (
  select product_id, min(year)
  from Sales
  group by product_id
);
```

### 596、<a href="https://leetcode.cn/problems/classes-more-than-5-students/" target="_blank" rel="noopener noreferrer">超过 5 名学生的课</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询至少有 5 名学生的课程。
输入：Courses 表
输出：class

**思路**：按 class 分组后 HAVING 学生数不少于 5。

```sql
select class
from Courses
group by class
having count(student) >= 5;
```

### 1729、<a href="https://leetcode.cn/problems/find-followers-count/" target="_blank" rel="noopener noreferrer">求关注者的数量</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

统计每个用户的关注者数量。
输入：Followers 表
输出：user_id, followers_count

**思路**：按 user_id 分组统计 follower_id，并按 user_id 排序。

```sql
select user_id, count(follower_id) as followers_count
from Followers
group by user_id
order by user_id;
```

### 619、<a href="https://leetcode.cn/problems/biggest-single-number/" target="_blank" rel="noopener noreferrer">只出现一次的最大数字</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

找出只出现一次的数字中的最大值，没有则返回 NULL。
输入：MyNumbers 表
输出：num

**思路**：先 GROUP BY 筛出 count=1 的数字，再取 MAX。

```sql
select max(num) as num
from (
  select num
  from MyNumbers
  group by num
  having count(*) = 1
) t;
```

### 1045、<a href="https://leetcode.cn/problems/customers-who-bought-all-products/" target="_blank" rel="noopener noreferrer">买下所有产品的客户</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

找出购买过所有产品的客户。
输入：Customer 表, Product 表
输出：customer_id

**思路**：按客户统计买过的不同产品数，与 Product 总数比较。

```sql
select customer_id
from Customer
group by customer_id
having count(distinct product_key) = (
  select count(*)
  from Product
);
```

## Advanced Select and Joins

### 1731、<a href="https://leetcode.cn/problems/the-number-of-employees-which-report-to-each-employee/" target="_blank" rel="noopener noreferrer">每位经理的下属员工数量</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询每位经理的直属下属人数和下属平均年龄。
输入：Employees 表
输出：employee_id, name, reports_count, average_age

**思路**：员工表自连接到经理，按经理分组统计人数和平均年龄。

```sql
select
  m.employee_id,
  m.name,
  count(e.employee_id) as reports_count,
  round(avg(e.age)) as average_age
from Employees e
join Employees m
  on e.reports_to = m.employee_id
group by m.employee_id, m.name
order by m.employee_id;
```

### 1789、<a href="https://leetcode.cn/problems/primary-department-for-each-employee/" target="_blank" rel="noopener noreferrer">员工的直属部门</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询每个员工的直属部门。
输入：Employee 表
输出：employee_id, department_id

**思路**：多部门员工取 primary_flag='Y'，单部门员工直接取唯一记录。

```sql
select employee_id, department_id
from Employee
where primary_flag = 'Y'
   or employee_id in (
     select employee_id
     from Employee
     group by employee_id
     having count(*) = 1
   );
```

### 610、<a href="https://leetcode.cn/problems/triangle-judgement/" target="_blank" rel="noopener noreferrer">判断三角形</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

判断三条边是否能组成三角形。
输入：Triangle 表
输出：x, y, z, triangle

**思路**：三角形任意两边之和大于第三边，用 CASE 输出 Yes/No。

```sql
select
  x,
  y,
  z,
  case
    when x + y > z and x + z > y and y + z > x then 'Yes'
    else 'No'
  end as triangle
from Triangle;
```

### 180、<a href="https://leetcode.cn/problems/consecutive-numbers/" target="_blank" rel="noopener noreferrer">连续出现的数字</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

找出至少连续出现三次的数字。
输入：Logs 表
输出：ConsecutiveNums

**思路**：自连接连续三个 id，要求三个 num 相同。

```sql
select distinct l1.num as ConsecutiveNums
from Logs l1
join Logs l2
  on l1.id + 1 = l2.id
join Logs l3
  on l2.id + 1 = l3.id
where l1.num = l2.num
  and l2.num = l3.num;
```

### 1164、<a href="https://leetcode.cn/problems/product-price-at-a-given-date/" target="_blank" rel="noopener noreferrer">指定日期的产品价格</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

查询 2019-08-16 时每个产品的价格，之前没改过价则为 10。
输入：Products 表
输出：product_id, price

**思路**：取指定日期前最后一次改价记录，再 UNION 从未改价的产品默认 10。

```sql
select product_id, new_price as price
from Products
where (product_id, change_date) in (
  select product_id, max(change_date)
  from Products
  where change_date <= '2019-08-16'
  group by product_id
)
union
select product_id, 10 as price
from Products
group by product_id
having min(change_date) > '2019-08-16';
```

### 1204、<a href="https://leetcode.cn/problems/last-person-to-fit-in-the-bus/" target="_blank" rel="noopener noreferrer">最后一个能进入巴士的人</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

找出累计重量不超过 1000 的最后一名乘客。
输入：Queue 表
输出：person_name

**思路**：按 turn 计算累计重量，筛出不超重记录后取最后一个。

```sql
select person_name
from (
  select
    person_name,
    turn,
    sum(weight) over(order by turn) as total_weight
  from Queue
) t
where total_weight <= 1000
order by turn desc
limit 1;
```

### 1907、<a href="https://leetcode.cn/problems/count-salary-categories/" target="_blank" rel="noopener noreferrer">按分类统计薪水</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

统计低、中、高三类收入账户数。
输入：Accounts 表
输出：category, accounts_count

**思路**：用三段条件分别统计后 UNION，保证 0 数量的分类也出现。

```sql
select 'Low Salary' as category, count(*) as accounts_count
from Accounts
where income < 20000
union
select 'Average Salary' as category, count(*) as accounts_count
from Accounts
where income between 20000 and 50000
union
select 'High Salary' as category, count(*) as accounts_count
from Accounts
where income > 50000;
```

## Subqueries

### 1978、<a href="https://leetcode.cn/problems/employees-whose-manager-left-the-company/" target="_blank" rel="noopener noreferrer">上级经理已离职的公司员工</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询薪水低于 30000 且经理已离职的员工。
输入：Employees 表
输出：employee_id

**思路**：经理 id 不在当前员工表中，且薪水满足条件。

```sql
select employee_id
from Employees
where salary < 30000
  and manager_id not in (
    select employee_id
    from Employees
  )
order by employee_id;
```

### 626、<a href="https://leetcode.cn/problems/exchange-seats/" target="_blank" rel="noopener noreferrer">换座位</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

交换相邻学生座位，若最后一位无配对则不变。
输入：Seat 表
输出：id, student

**思路**：用 CASE 计算交换后的 id，奇数变偶数、偶数变奇数、末尾奇数保留。

```sql
select
  case
    when id % 2 = 1 and id = (select count(*) from Seat) then id
    when id % 2 = 1 then id + 1
    else id - 1
  end as id,
  student
from Seat
order by id;
```

### 1341、<a href="https://leetcode.cn/problems/movie-rating/" target="_blank" rel="noopener noreferrer">电影评分</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

找出评分次数最多的用户和 2020 年 2 月平均评分最高的电影。
输入：Movies 表, Users 表, MovieRating 表
输出：results

**思路**：两个排序取第一的查询用 UNION ALL 拼起来。

```sql
(select u.name as results
from Users u
join MovieRating mr
  on u.user_id = mr.user_id
group by u.user_id, u.name
order by count(*) desc, u.name
limit 1)
union all
(select m.title as results
from Movies m
join MovieRating mr
  on m.movie_id = mr.movie_id
where mr.created_at between '2020-02-01' and '2020-02-29'
group by m.movie_id, m.title
order by avg(mr.rating) desc, m.title
limit 1);
```

### 1321、<a href="https://leetcode.cn/problems/restaurant-growth/" target="_blank" rel="noopener noreferrer">餐馆营业额变化增长</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

计算每天往前 7 天的营业额总和和平均值。
输入：Customer 表
输出：visited_on, amount, average_amount

**思路**：先按天汇总，再用窗口函数计算 7 天滑动和。

```sql
select
  visited_on,
  amount,
  round(amount / 7, 2) as average_amount
from (
  select
    visited_on,
    sum(amount) over(order by visited_on rows between 6 preceding and current row) as amount,
    row_number() over(order by visited_on) as rn
  from (
    select visited_on, sum(amount) as amount
    from Customer
    group by visited_on
  ) d
) t
where rn >= 7;
```

### 602、<a href="https://leetcode.cn/problems/friend-requests-ii-who-has-the-most-friends/" target="_blank" rel="noopener noreferrer">好友申请 II：谁有最多的好友</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

找出好友数量最多的人及其好友数。
输入：RequestAccepted 表
输出：id, num

**思路**：请求方和接受方都算好友，UNION ALL 后按人统计。

```sql
select id, count(*) as num
from (
  select requester_id as id
  from RequestAccepted
  union all
  select accepter_id as id
  from RequestAccepted
) t
group by id
order by num desc
limit 1;
```

### 585、<a href="https://leetcode.cn/problems/investments-in-2016/" target="_blank" rel="noopener noreferrer">2016 年的投资</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

计算满足 2015 年投资额重复且城市位置唯一的保单 2016 年投资额总和。
输入：Insurance 表
输出：tiv_2016

**思路**：窗口函数统计 tiv_2015 重复数和经纬度重复数，再按条件求和。

```sql
select round(sum(tiv_2016), 2) as tiv_2016
from (
  select
    tiv_2016,
    count(*) over(partition by tiv_2015) as same_tiv_2015,
    count(*) over(partition by lat, lon) as same_location
  from Insurance
) t
where same_tiv_2015 > 1
  and same_location = 1;
```

### 185、<a href="https://leetcode.cn/problems/department-top-three-salaries/" target="_blank" rel="noopener noreferrer">部门工资前三高的所有员工</a> <span class="difficulty-badge difficulty-badge--hard">困难</span>

查询每个部门工资排名前三的员工。
输入：Employee 表, Department 表
输出：Department, Employee, Salary

**思路**：用 DENSE_RANK 按部门工资降序排名，保留排名不超过 3。

```sql
select
  Department,
  Employee,
  Salary
from (
  select
    d.name as Department,
    e.name as Employee,
    e.salary as Salary,
    dense_rank() over(partition by e.departmentId order by e.salary desc) as rk
  from Employee e
  join Department d
    on e.departmentId = d.id
) t
where rk <= 3;
```

## Advanced String Functions / Regex / Clause

### 1667、<a href="https://leetcode.cn/problems/fix-names-in-a-table/" target="_blank" rel="noopener noreferrer">修复表中的名字</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

把用户姓名格式化为首字母大写、其余小写。
输入：Users 表
输出：user_id, name

**思路**：用 UPPER、LOWER、LEFT、SUBSTRING 拼出规范姓名。

```sql
select
  user_id,
  concat(upper(left(name, 1)), lower(substring(name, 2))) as name
from Users
order by user_id;
```

### 1527、<a href="https://leetcode.cn/problems/patients-with-a-condition/" target="_blank" rel="noopener noreferrer">患某种疾病的患者</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询 conditions 中包含 DIAB1 前缀疾病的患者。
输入：Patients 表
输出：patient_id, patient_name, conditions

**思路**：用正则匹配字符串开头或空格后的 DIAB1。

```sql
select patient_id, patient_name, conditions
from Patients
where conditions regexp '(^| )DIAB1';
```

### 196、<a href="https://leetcode.cn/problems/delete-duplicate-emails/" target="_blank" rel="noopener noreferrer">删除重复的电子邮箱</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

删除重复邮箱，只保留 id 最小的记录。
输入：Person 表
输出：删除后的 Person 表

**思路**：自连接同 email 记录，删除 id 更大的那一行。

```sql
delete p1
from Person p1
join Person p2
  on p1.email = p2.email
 and p1.id > p2.id;
```

### 176、<a href="https://leetcode.cn/problems/second-highest-salary/" target="_blank" rel="noopener noreferrer">第二高的薪水</a> <span class="difficulty-badge difficulty-badge--medium">中等</span>

查询第二高的不同薪水，没有则返回 NULL。
输入：Employee 表
输出：SecondHighestSalary

**思路**：子查询按不同薪水降序取第二条，外层保证空结果返回 NULL。

```sql
select (
  select distinct salary
  from Employee
  order by salary desc
  limit 1 offset 1
) as SecondHighestSalary;
```

### 1484、<a href="https://leetcode.cn/problems/group-sold-products-by-the-date/" target="_blank" rel="noopener noreferrer">按日期分组销售产品</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

按日期统计售出产品种类数和产品列表。
输入：Activities 表
输出：sell_date, num_sold, products

**思路**：按 sell_date 分组，用 COUNT DISTINCT 和 GROUP_CONCAT DISTINCT。

```sql
select
  sell_date,
  count(distinct product) as num_sold,
  group_concat(distinct product order by product separator ',') as products
from Activities
group by sell_date
order by sell_date;
```

### 1327、<a href="https://leetcode.cn/problems/list-the-products-ordered-in-a-period/" target="_blank" rel="noopener noreferrer">列出指定时间段内所有的下单产品</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询 2020 年 2 月订单数量不少于 100 的产品。
输入：Products 表, Orders 表
输出：product_name, unit

**思路**：按产品汇总 2 月订单数量，用 HAVING 过滤总量。

```sql
select
  p.product_name,
  sum(o.unit) as unit
from Products p
join Orders o
  on p.product_id = o.product_id
where o.order_date between '2020-02-01' and '2020-02-29'
group by p.product_id, p.product_name
having sum(o.unit) >= 100;
```

### 1517、<a href="https://leetcode.cn/problems/find-users-with-valid-e-mails/" target="_blank" rel="noopener noreferrer">查找拥有有效邮箱的用户</a> <span class="difficulty-badge difficulty-badge--easy">简单</span>

查询邮箱符合规则且域名为 leetcode.com 的用户。
输入：Users 表
输出：user_id, name, mail

**思路**：用正则限制首字符、用户名可用字符和固定域名。

```sql
select user_id, name, mail
from Users
where mail regexp '^[A-Za-z][A-Za-z0-9_.-]*@leetcode[.]com$';
```

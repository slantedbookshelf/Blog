---
title: "常见排序与查找算法总结：从原理、复杂度到选型"
description: "把冒泡、插入、归并、快排、堆排和二分、哈希等常见排序查找算法梳理成一张表，说清时间复杂度、稳定性与实际选型。"
pubDate: 2026-10-14
category: "Algorithm"
tags: ["算法", "排序", "查找", "数据结构", "Java"]
---

排序和查找是两件最基础、也最容易被轻视的事。日常写业务时，我们大多是直接调用库函数：Java 里一个 `Arrays.sort()`，集合里一个 `map.get()`，问题就解决了。

但只要做过一次性能排查或面试复盘就会发现，真正需要理解的不是“怎么写出快排”，而是：**什么数据适合哪种排序、哪种排序能保证稳定性、为什么二分总是写错边界**。这篇文章把这些算法放在一起整理一遍，目标不是替代教材，而是形成一张可以随时查阅的对照表。

## 先建立两个判断标准

讨论任何一个排序算法前，先看四个指标：

| 指标 | 含义 |
| --- | --- |
| 平均时间复杂度 | 随机数据下的期望表现，也是实际选型的主要依据 |
| 最坏时间复杂度 | 数据本身呈现极端形态（如完全有序、全部相同）时的表现 |
| 空间复杂度 | 是否需要额外数组，是否原地排序 |
| 稳定性 | 值相等的元素，排序后相对顺序是否保持不变 |

其中“稳定性”最容易被忽略。它指的是：如果 `a == b` 且排序前 `a` 在 `b` 前面，排序后 `a` 仍然在 `b` 前面。

这个性质在单看数值时毫无意义，但一旦排序对象是对象，就会立刻变得关键。比如先按“下单时间”排好的订单，再按“金额”排一次：

- 稳定排序：金额相同的订单，仍然保持时间顺序。
- 不稳定排序：金额相同的订单顺序可能被打乱，之前的排序白做了。

所谓“多关键字排序”，本质就是**按优先级从低到高依次做稳定排序**。

## 排序算法总览

先把结论摆出来，后文再逐个展开。

| 算法 | 平均 | 最好 | 最坏 | 空间 | 稳定 | 特点 |
| --- | --- | --- | --- | --- | --- | --- |
| 冒泡排序 | O(n²) | O(n) | O(n²) | O(1) | 是 | 教学用，几乎不用于生产 |
| 选择排序 | O(n²) | O(n²) | O(n²) | O(1) | 否 | 交换次数少，但比较次数固定 |
| 插入排序 | O(n²) | O(n) | O(n²) | O(1) | 是 | 小数据、近乎有序时非常快 |
| 希尔排序 | O(n^1.3) | O(n log n) | O(n²) | O(1) | 否 | 插入排序的分组改进版 |
| 归并排序 | O(n log n) | O(n log n) | O(n log n) | O(n) | 是 | 稳定，可外部排序、链表排序 |
| 快速排序 | O(n log n) | O(n log n) | O(n²) | O(log n) | 否 | 常数小，实际最快 |
| 堆排序 | O(n log n) | O(n log n) | O(n log n) | O(1) | 否 | 最坏也能保证，常做 TopK |
| 计数排序 | O(n + k) | O(n + k) | O(n + k) | O(k) | 是 | 非比较排序，要求值域小 |
| 桶排序 | O(n + k) | O(n) | O(n²) | O(n + k) | 是 | 数据分布均匀时接近线性 |
| 基数排序 | O(d(n + k)) | O(d(n + k)) | O(d(n + k)) | O(n + k) | 是 | 按位排序，适合定长整数和字符串 |

一句话记忆：**基于比较的排序，下界是 O(n log n)；想更快，就得利用数据的额外信息（值域、位数、分布）。**

## 三个基础排序

### 冒泡排序

不断比较相邻两个元素，逆序就交换，每一轮把当前最大值“冒”到末尾。

```java
public static void bubbleSort(int[] arr) {
    for (int i = 0; i < arr.length - 1; i++) {
        boolean swapped = false;
        // 每轮结束后，末尾 i + 1 个元素已就位
        for (int j = 0; j < arr.length - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                int tmp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = tmp;
                swapped = true;
            }
        }
        // 一整轮都没有交换，说明已经有序，可以提前结束
        if (!swapped) break;
    }
}
```

那个 `swapped` 标记很关键：它让最好情况（数组本来有序）降到 O(n)。同时注意 `arr[j] > arr[j + 1]` 用的是严格大于，相等时不交换，才保证了稳定性。

### 选择排序

每一轮从未排序区间里挑出最小值，和区间首位交换。

```java
public static void selectionSort(int[] arr) {
    for (int i = 0; i < arr.length - 1; i++) {
        int minIndex = i;
        for (int j = i + 1; j < arr.length; j++) {
            if (arr[j] < arr[minIndex]) minIndex = j;
        }
        int tmp = arr[i];
        arr[i] = arr[minIndex];
        arr[minIndex] = tmp;
    }
}
```

选择排序的比较次数永远是 n(n-1)/2，和输入数据无关，所以最好、最坏都是 O(n²)。它的优点是**交换次数最多只有 n-1 次**，在交换成本很高的场景下有优势。

它不稳定：如果最小值要和区间首位的一个相等元素交换，那个元素的相对位置就被破坏了。

### 插入排序

把数组分成“已排序区”和“未排序区”，每次取未排序区的第一个元素，插入到已排序区的正确位置。

```java
public static void insertionSort(int[] arr) {
    for (int i = 1; i < arr.length; i++) {
        int cur = arr[i];
        int j = i - 1;
        // 比 cur 大的元素整体后移一位
        while (j >= 0 && arr[j] > cur) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = cur;
    }
}
```

插入排序在**小数组**和**近乎有序**的数据上表现极好：数据基本有序时，内层循环几乎不执行，复杂度退化成 O(n)。

这不是理论上的漂亮话。JDK 的 `Arrays.sort()` 就用了这种思路：数据量大时走双轴快排，一旦递归到子区间长度小于某个阈值（`INSERTION_SORT_THRESHOLD = 47`），就换成插入排序收尾。库函数的性能，很大程度上来自这种“大问题用快排、小问题用插入”的组合。

### 希尔排序

插入排序一次只能移动一位，希尔排序先按较大的步长分组做插入排序，让元素能大步跳跃，再逐步缩小步长直到 1。

```java
public static void shellSort(int[] arr) {
    for (int gap = arr.length / 2; gap > 0; gap /= 2) {
        // 对每个分组做插入排序
        for (int i = gap; i < arr.length; i++) {
            int cur = arr[i];
            int j = i - gap;
            while (j >= 0 && arr[j] > cur) {
                arr[j + gap] = arr[j];
                j -= gap;
            }
            arr[j + gap] = cur;
        }
    }
}
```

希尔排序的性能取决于步长序列，上面这种二分折半的写法并不是最优的。它的价值在于让我们理解：**插入排序的短板是“只能挪一格”，那就想办法让它先跨大步。**

## 三个 O(n log n) 的主力

### 归并排序

分治：把数组从中间劈成两半，分别排好序，再合并两个有序数组。

```java
public static void mergeSort(int[] arr) {
    if (arr.length < 2) return;
    int[] tmp = new int[arr.length];
    sort(arr, 0, arr.length - 1, tmp);
}

private static void sort(int[] arr, int left, int right, int[] tmp) {
    if (left >= right) return;
    int mid = left + (right - left) / 2;
    sort(arr, left, mid, tmp);
    sort(arr, mid + 1, right, tmp);
    merge(arr, left, mid, right, tmp);
}

private static void merge(int[] arr, int left, int mid, int right, int[] tmp) {
    int i = left, j = mid + 1, k = left;
    // 相等时优先取左边，保证稳定性
    while (i <= mid && j <= right) {
        tmp[k++] = arr[i] <= arr[j] ? arr[i++] : arr[j++];
    }
    while (i <= mid) tmp[k++] = arr[i++];
    while (j <= right) tmp[k++] = arr[j++];
    for (int p = left; p <= right; p++) arr[p] = tmp[p];
}
```

重点看 `arr[i] <= arr[j]` 这一行：相等时先取左边的元素，正是这一步让归并排序天然稳定。如果写成 `arr[i] < arr[j]`，稳定性就没了。

归并排序的优点：

- 复杂度极其稳定，任何输入都是 O(n log n)，没有“被针对”的输入。
- 稳定。
- 适合**外部排序**：数据大到内存放不下时，可以分块排序写回磁盘，再做多路归并。
- 适合**链表排序**：链表合并不需要额外数组，还能做到 O(1) 空间。

代价是需要 O(n) 的辅助空间。

### 快速排序

选一个基准值，把数组划分成“小于等于基准”和“大于基准”两部分，再对两边递归。归并是“先分再合”，快排是“先分好，就不需要合”。

```java
public static void quickSort(int[] arr) {
    quickSort(arr, 0, arr.length - 1);
}

private static void quickSort(int[] arr, int left, int right) {
    if (left >= right) return;
    int pivotIndex = partition(arr, left, right);
    quickSort(arr, left, pivotIndex - 1);
    quickSort(arr, pivotIndex + 1, right);
}

private static int partition(int[] arr, int left, int right) {
    // 随机选基准并换到最左边，避免有序数据退化成 O(n^2)
    int random = left + (int) (Math.random() * (right - left + 1));
    swap(arr, left, random);
    int pivot = arr[left];
    int i = left, j = right;
    while (i < j) {
        // 从右往左找第一个小于等于 pivot 的元素
        while (i < j && arr[j] > pivot) j--;
        // 从左往右找第一个大于 pivot 的元素
        while (i < j && arr[i] <= pivot) i++;
        if (i < j) swap(arr, i, j);
    }
    swap(arr, left, i);
    return i;
}

private static void swap(int[] arr, int i, int j) {
    int tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}
```

快排最需要理解的是**退化场景**。如果每次都固定取第一个元素当基准，那么面对已经有序或完全逆序的数组，每次划分都会得到一个空区间，递归深度变成 n，复杂度从 O(n log n) 掉到 O(n²)，栈深度过大时甚至会栈溢出。

两种常见的防御手段：

1. **随机化基准**：上面代码的做法，随机换一个元素到最左边。
2. **三数取中**：取左端、中点、右端的中位数作为基准。

另一个坑是**大量重复元素**。如果数组里全是相同的值，普通的两路划分会把所有元素都挤到一侧。解决办法是三路划分（小于、等于、大于三段），把等于基准的元素集中到中间不再参与递归。JDK 的双轴快排正是这类改进。

快排不稳定，划分过程中的远距离交换会打乱相等元素。

### 堆排序

先建一个大顶堆，然后反复把堆顶（最大值）换到数组末尾，再对剩余的堆重新调整。

```java
public static void heapSort(int[] arr) {
    int n = arr.length;
    // 建堆：从最后一个非叶子节点开始向下调整
    for (int i = n / 2 - 1; i >= 0; i--) {
        siftDown(arr, i, n);
    }
    // 依次把堆顶换到末尾，堆区间不断缩小
    for (int i = n - 1; i > 0; i--) {
        swap(arr, 0, i);
        siftDown(arr, 0, i);
    }
}

private static void siftDown(int[] arr, int i, int size) {
    while (true) {
        int left = 2 * i + 1;
        int right = 2 * i + 2;
        int largest = i;
        if (left < size && arr[left] > arr[largest]) largest = left;
        if (right < size && arr[right] > arr[largest]) largest = right;
        if (largest == i) break;
        swap(arr, i, largest);
        i = largest;
    }
}
```

`n / 2 - 1` 是最后一个非叶子节点，从它往前依次下沉，可以在 O(n) 内完成建堆——这比“逐个插入建堆”的 O(n log n) 更快。

堆排序的优点是最坏情况也能保证 O(n log n)，且只需 O(1) 额外空间。缺点是元素跳跃式访问，对 CPU 缓存不友好，实际跑起来通常比快排慢。

不过堆这个结构本身非常有用：**求 TopK 问题**只需要维护一个大小为 K 的小顶堆，时间复杂度 O(n log k)，不用把整个数组排完。

## 非比较排序

当数据带有额外信息时，可以绕开 O(n log n) 的比较下界。

### 计数排序

统计每个值出现的次数，再按值从小到大依次输出。

```java
public static void countingSort(int[] arr) {
    if (arr.length == 0) return;
    int min = arr[0], max = arr[0];
    for (int v : arr) {
        min = Math.min(min, v);
        max = Math.max(max, v);
    }
    int[] count = new int[max - min + 1];
    for (int v : arr) count[v - min]++;
    int k = 0;
    for (int v = min; v <= max; v++) {
        while (count[v - min]-- > 0) arr[k++] = v;
    }
}
```

适用前提是**值域不宜过大**。如果最大值是十亿，`count` 数组就开不出来了。这个问题的通用化就是桶排序和基数排序。

### 桶排序与基数排序

- **桶排序**：按值域把数据分到若干个桶里，桶内各自排序再拼接。数据分布均匀时接近 O(n)，但全部落进一个桶就退化成 O(n²)。
- **基数排序**：从低位到高位逐位做稳定的计数排序。整数的位数是常数，所以复杂度 O(d(n + k)) 可以看作线性。

## 实际怎么选

抛开面试，工程里的判断顺序大致是这样：

1. **能用库就用库。** Java 的 `Arrays.sort()`（基本类型走双轴快排，对象走 TimSort）、`Collections.sort()`、Python 的 `sorted()`，都经过大量优化和验证，自己手写通常更慢也更容易出错。
2. **要稳定性**，用 TimSort（归并 + 插入的混合）或归并排序。这也是为什么 Java 排序对象数组时用归并而非快排。
3. **只要 TopK 或中位数**，别全排。用堆或快速选择算法，复杂度可以降到 O(n)。
4. **数据近乎有序**，插入排序往往比快排更快。
5. **值域很小**（比如成绩、年龄、状态码），计数排序是最优解。
6. **数据大到内存装不下**，走外部排序：分块 + 多路归并。

## 查找算法

排好序之后，查找才有更多选择。查找的核心分歧是：**数据是静态的还是要频繁增删？**

### 顺序查找

从头到尾逐个比较，O(n)。看似低效，但在数据量很小、或没有任何结构信息时，它反而是最省事的方案。

### 二分查找

二分的前提是**数据有序**（或具有单调性）。它的难点不在思路，而在边界。

基础版：在有序数组中找 `target` 的下标。

```java
public static int binarySearch(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left <= right) {
        // 这样写可以避免 (left + right) 溢出
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}
```

真正实用的是两个变体：`lowerBound` 找第一个大于等于 `target` 的位置，`upperBound` 找第一个大于 `target` 的位置。它们都用**左闭右开区间** `[left, right)`，逻辑更统一，也不容易写错。

```java
// 第一个 >= target 的下标，不存在时返回 arr.length
public static int lowerBound(int[] arr, int target) {
    int left = 0, right = arr.length;
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] < target) left = mid + 1;
        else right = mid;
    }
    return left;
}

// 第一个 > target 的下标，不存在时返回 arr.length
public static int upperBound(int[] arr, int target) {
    int left = 0, right = arr.length;
    while (left < right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] <= target) left = mid + 1;
        else right = mid;
    }
    return left;
}
```

写好这两个函数后，常见的区间查询就都能表达了：

| 需求 | 写法 |
| --- | --- |
| `target` 出现的次数 | `upperBound(arr, target) - lowerBound(arr, target)` |
| 第一个大于等于 `target` 的位置 | `lowerBound(arr, target)` |
| 最后一个小于等于 `target` 的位置 | `upperBound(arr, target) - 1` |
| 是否包含 `target` | `lowerBound(arr, target) < arr.length && arr[lowerBound(arr, target)] == target` |

写二分时的三个常见错误：

1. **区间定义和循环条件不匹配**。用 `[left, right]` 就该写 `left <= right`，用 `[left, right)` 就该写 `left < right`，两者混用必出错。
2. **`mid` 计算写成了 `(left + right) / 2`**。当 `left` 和 `right` 都接近 `Integer.MAX_VALUE` 时会溢出。
3. **更新边界时死循环**。比如把 `right = mid` 写成 `right = mid - 1`，就可能跳过正确答案。

另外，二分并不局限于“在有序数组里找值”。只要问题具有单调性——比如“容量为 x 时能否满足要求”——就可以二分答案，把最优解问题转成判定问题。这是二分最容易被低估的用法。

### 哈希查找

用哈希表把“查找”变成“算下标再比较”，平均 O(1)，代价是 O(n) 空间和失去顺序。

```java
Map<String, Integer> map = new HashMap<>();
map.put("apple", 1);
int value = map.getOrDefault("banana", 0); // 不存在时返回默认值
```

需要注意两点：

- 平均 O(1) 不等于最坏 O(1)。哈希冲突严重时，链表会退化成 O(n)。JDK 8 之后链表长度超过 8 且容量不小于 64 会转为红黑树，把最坏情况压到 O(log n)。
- 它只支持精确查找，无法做范围查询和排序输出。要范围查询就得用有序结构。

### 树与跳表

如果需要**既支持高效查找，又保持有序、支持范围查询**，就得用平衡树一类结构：

- **二叉搜索树（BST）**：查找、插入、删除平均 O(log n)，但数据有序插入时会退化成链表。
- **平衡树（AVL / 红黑树）**：通过旋转维持平衡，稳定 O(log n)。Java 的 `TreeMap`、`TreeSet` 底层就是红黑树。
- **B+ 树**：MySQL InnoDB 索引的底层结构。相比二叉树，它一个节点存多个键，树高更低，磁盘 IO 次数更少。
- **跳表**：靠多级索引实现 O(log n) 查找，实现比平衡树简单。Redis 的 ZSet 用的就是它。

### 布隆过滤器

如果只是想知道“某个元素**一定不存在**或**可能存在**”，布隆过滤器可以用极小的空间做到 O(k) 判断，代价是存在误判率，且无法删除元素。它常用于缓存穿透防护、URL 去重这类场景。

### 查找方法对比

| 方法 | 平均查找 | 空间 | 是否有序 | 适用场景 |
| --- | --- | --- | --- | --- |
| 顺序查找 | O(n) | O(1) | 不要求 | 小数据、无结构 |
| 二分查找 | O(log n) | O(1) | 要求有序 | 静态有序数据、二分答案 |
| 哈希表 | O(1) | O(n) | 无序 | 精确查找、去重、计数 |
| 二叉搜索树 | O(log n) | O(n) | 有序 | 动态增删 + 有序遍历 |
| 平衡树 / 红黑树 | O(log n) | O(n) | 有序 | 需要稳定性能的有序结构 |
| B+ 树 | O(log n) | O(n) | 有序 | 磁盘存储、数据库索引 |
| 跳表 | O(log n) | O(n) | 有序 | 内存中的有序集合（如 Redis ZSet） |
| 布隆过滤器 | O(k) | 很小 | 无序 | 快速判存在，允许误判 |

## 几个容易踩的坑

**排序类的：**

- 快排忘记随机化基准，碰到有序输入直接退化。
- 归并合并时用 `<` 而不是 `<=`，稳定性悄悄丢失。
- 用 `Arrays.sort()` 排基本类型却期待它稳定——基本类型走的是快排，不保证稳定；要稳定得用对象数组或 `Stream` 装箱后排序。

**查找类的：**

- 二分对无序数组使用。这不会报错，只会安静地返回错误结果。
- 循环里重复调用 `arr.length` 相关的边界计算，或把区间开闭混用。
- 用 `HashMap` 存自定义对象当 key，却忘了同时重写 `equals()` 和 `hashCode()`。

## 总结

把这篇文章压缩成四句话：

1. **比较排序的天花板是 O(n log n)**，想突破就得利用数据本身的信息（值域、位数、分布）。
2. **稳定性只在多关键字排序时才有意义**，一旦需要，就选归并或 TimSort。
3. **快排是工程上的默认答案**，但要处理好基准选择和重复元素；堆排序胜在最坏情况也稳定。
4. **查找选型看“静态还是动态”**：静态有序用二分，动态增删追求 O(1) 用哈希，既要动态又要顺序就用红黑树、B+ 树或跳表。

真正把这张表用熟的方法不是背复杂度，而是每次写完一段排序或查找代码后问自己一句：这段数据会长什么样，我选的结构在那种输入下还成立吗。

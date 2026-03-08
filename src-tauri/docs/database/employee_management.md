# 人员管理数据库模型设计文档

## 概述

本文档描述人员管理系统中的部门表和人员表的数据库结构设计。系统使用 SQLite 数据库，通过 `rusqlite` 库进行操作。

## 数据库表结构

### 1. 部门表 (departments)

部门表用于存储组织架构中的部门信息，支持多级部门层级结构。

#### 表结构定义

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 部门唯一标识（UUID） |
| name | TEXT | NOT NULL | 部门名称 |
| parent_id | TEXT | FOREIGN KEY | 上级部门ID（支持层级结构） |
| description | TEXT | - | 部门描述 |
| manager_name | TEXT | - | 部门负责人姓名 |
| sort_order | INTEGER | DEFAULT 0 | 排序顺序 |
| status | TEXT | NOT NULL DEFAULT 'active' | 状态：active/inactive |
| created_at | TEXT | NOT NULL | 创建时间（ISO 8601格式） |
| updated_at | TEXT | NOT NULL | 更新时间（ISO 8601格式） |

#### 外键约束

```sql
FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
```

当上级部门被删除时，下级部门的 `parent_id` 会被设置为 NULL。

#### 索引

| 索引名 | 字段 | 说明 |
|--------|------|------|
| idx_departments_parent | parent_id | 加速按上级部门查询 |
| idx_departments_name | name | 加速按名称查询 |
| idx_departments_status | status | 加速按状态筛选 |

#### 建表 SQL

```sql
CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    description TEXT,
    manager_name TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status);
```

---

### 2. 人员表 (employees)

人员表用于存储员工的基本信息，与部门表建立关联关系。

#### 表结构定义

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 员工唯一标识（UUID） |
| name | TEXT | NOT NULL | 员工姓名 |
| employee_no | TEXT | NOT NULL UNIQUE | 工号（唯一） |
| department_id | TEXT | FOREIGN KEY | 所属部门ID |
| position | TEXT | - | 职位 |
| phone | TEXT | - | 手机号 |
| email | TEXT | - | 邮箱 |
| hire_date | TEXT | - | 入职日期（ISO 8601格式） |
| status | TEXT | NOT NULL DEFAULT 'active' | 状态：active/inactive/resigned |
| avatar | TEXT | - | 头像URL或Base64 |
| remark | TEXT | - | 备注 |
| created_at | TEXT | NOT NULL | 创建时间（ISO 8601格式） |
| updated_at | TEXT | NOT NULL | 更新时间（ISO 8601格式） |

#### 外键约束

```sql
FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
```

当部门被删除时，该部门下员工的 `department_id` 会被设置为 NULL，员工数据保留。

#### 索引

| 索引名 | 字段 | 说明 |
|--------|------|------|
| idx_employees_department | department_id | 加速按部门查询员工 |
| idx_employees_employee_no | employee_no | 加速工号查询（唯一性约束） |
| idx_employees_name | name | 加速按姓名查询 |
| idx_employees_status | status | 加速按状态筛选 |

#### 建表 SQL

```sql
CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    employee_no TEXT NOT NULL UNIQUE,
    department_id TEXT,
    position TEXT,
    phone TEXT,
    email TEXT,
    hire_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    avatar TEXT,
    remark TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_employee_no ON employees(employee_no);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
```

---

## 实体关系图 (ER Diagram)

```
┌─────────────────────┐
│     departments     │
├─────────────────────┤
│ PK  id              │◄─────────────┐
│     name            │              │
│ FK  parent_id ──────┼──────────────┘ (自引用)
│     description     │
│     manager_name    │
│     sort_order      │
│     status          │
│     created_at      │
│     updated_at      │
└─────────────────────┘
          ▲
          │ 1:N
          │
┌─────────────────────┐
│     employees       │
├─────────────────────┤
│ PK  id              │
│     name            │
│ UN  employee_no     │
│ FK  department_id ──┼──────────────┘
│     position        │
│     phone           │
│     email           │
│     hire_date       │
│     status          │
│     avatar          │
│     remark          │
│     created_at      │
│     updated_at      │
└─────────────────────┘
```

---

## 状态枚举说明

### 部门状态 (departments.status)

| 值 | 说明 |
|----|------|
| active | 正常运作 |
| inactive | 已停用 |

### 人员状态 (employees.status)

| 值 | 说明 |
|----|------|
| active | 在职 |
| inactive | 停用 |
| resigned | 已离职 |

---

## 查询示例

### 1. 查询所有顶级部门（无上级部门）

```sql
SELECT * FROM departments
WHERE parent_id IS NULL
ORDER BY sort_order;
```

### 2. 查询某个部门的所有下级部门

```sql
SELECT * FROM departments
WHERE parent_id = ?
ORDER BY sort_order;
```

### 3. 查询某个部门的所有员工

```sql
SELECT e.*, d.name as department_name
FROM employees e
LEFT JOIN departments d ON e.department_id = d.id
WHERE e.department_id = ?
ORDER BY e.name;
```

### 4. 查询所有员工及其部门信息

```sql
SELECT
    e.id,
    e.name,
    e.employee_no,
    e.position,
    e.phone,
    e.email,
    e.status,
    d.name as department_name,
    pd.name as parent_department_name
FROM employees e
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN departments pd ON d.parent_id = pd.id
WHERE e.status = 'active'
ORDER BY d.name, e.name;
```

### 5. 统计各部门人数

```sql
SELECT
    d.id,
    d.name,
    COUNT(e.id) as employee_count
FROM departments d
LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'active'
GROUP BY d.id
ORDER BY employee_count DESC;
```

---

## 注意事项

1. **主键使用 UUID**：采用 TEXT 类型的 UUID 作为主键，便于分布式环境下的数据同步。

2. **时间格式**：所有时间字段使用 ISO 8601 格式（RFC 3339）存储，如：`2024-03-08T10:30:00Z`。

3. **外键级联策略**：
   - 部门删除时，下级部门的 `parent_id` 设为 NULL
   - 部门删除时，员工的 `department_id` 设为 NULL（员工数据保留）

4. **SQLite 外键支持**：SQLite 默认不启用外键约束，需要在连接时执行：
   ```sql
   PRAGMA foreign_keys = ON;
   ```

5. **索引优化**：已为常用查询字段创建索引，包括外键字段、名称字段和状态字段。

---

## 实现位置

表结构定义位于：`src-tauri/src/database/mod.rs` 中的 `INIT_SQL` 常量。

数据库初始化函数：`init_database()`

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2024-03-08 | 初始设计，包含部门和人员基础表结构 |

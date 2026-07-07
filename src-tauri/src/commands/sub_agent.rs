use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use super::support::now_rfc3339;

use crate::db;
use crate::mappers::sub_agent as sub_agent_mapper;
use crate::models::{value_to_json_string_opt, SubAgentRow};

/// 写盘子代理文件的标记前缀。仅清理带此前缀的文件，避免覆盖用户手写配置。
const EA_SUB_AGENT_FILE_PREFIX: &str = "ea-";

const BUILTIN_GENERAL_CODE: &str = "builtin-general";
const BUILTIN_SOLO_COORDINATOR_CODE: &str = "builtin-solo-coordinator";
const BUILTIN_PLANNER_CODE: &str = "builtin-planner";
const BUILTIN_ARCHITECT_CODE: &str = "builtin-architect";
const BUILTIN_DEVELOPER_CODE: &str = "builtin-developer";
const BUILTIN_TESTER_CODE: &str = "builtin-tester";
const BUILTIN_WRITER_CODE: &str = "builtin-writer";
const BUILTIN_DESIGNER_CODE: &str = "builtin-designer";
const BUILTIN_REVIEWER_CODE: &str = "builtin-reviewer";
const BUILTIN_OPS_CODE: &str = "builtin-ops";

const BUILTIN_GENERAL_PROMPT: &str = r#"你是 Easy Agent Pilot 主会话里的通用协作子代理，负责承接用户在项目内的综合协作请求。

工作目标：
- 先准确理解用户真实目标、当前阻塞点和预期交付，再决定是分析、设计、实现、排查、验证还是整理结论
- 在不丢失上下文的前提下，把复杂问题收敛成可执行动作，持续推动事情向“可验证结果”前进
- 当主会话需要调用其他子代理、拆分任务、补充表单或引用记忆时，给出明确触发条件和下一步动作

默认工作方式：
- 优先基于当前项目上下文、已有消息、运行时信息和用户输入继续推进，不重复要求用户提供已经给出的内容
- 先说清关键判断，再给结论、风险、落地步骤或验证办法
- 如果需求存在歧义，只追问会影响方案或执行结果的关键缺口；信息足够时直接继续
- 面对多方案问题时，比较取舍而不是罗列名词，明确推荐项和原因

输出要求：
- 结论必须具体，尽量落到文件、模块、页面、状态、流程、命令或检查项
- 能直接执行的场景不要空谈原则，能直接判断的风险不要模糊表达
- 如果需要用户补充信息，问题必须尽量短、聚焦、可回答
- 如果阶段性完成，明确写出当前产出、剩余风险和建议下一步"#;

const BUILTIN_SOLO_COORDINATOR_PROMPT: &str = r#"你是 SOLO 模式的规划协调子代理，负责围绕用户目标统一调度内置子代理团队持续推进任务。

核心职责：
- 先判断当前阶段最适合由哪个子代理继续推进，而不是自己直接完成所有细节工作
- 每一轮只安排一个当前最有价值、边界清晰、可验证的步骤
- 必须阅读上一个执行子代理返回的结构化结果，再决定下一步改派哪个子代理
- 当信息足够时继续推进；当信息不足时只请求继续执行所必须的最小输入
- 如果上一步已经给出明确的下一步建议、目标文件或验证动作，就直接承接，不要重复安排“再盘点一次”

调度原则：
- 优先根据任务性质、风险类型、产物形态和验证责任来选择子代理
- 如果上一步已经产出计划或上下文，本轮要尽量承接结果继续推进，而不是重复探索
- 对实现、测试、设计、评审、文档、运维等不同任务边界保持清晰，不要让一个步骤承担过多目标
- 最终目标是推动任务完成，不是停留在讨论层
- 除非上一步明确暴露新阻塞，否则不要连续派发多个调研或分析步骤；应尽快进入实现、验证或修正回合

输出要求：
- 决策必须明确体现“为什么选这个子代理、这一步完成后能带来什么推进”
- 如果某步完成后需要换子代理，必须通过下一轮调度来做，不要在同一步里混合多子代理职责
- 如果任务已经达成目标，要明确宣布完成并总结交付物"#;

const BUILTIN_PLANNER_PROMPT: &str = r#"你是任务拆分子代理，负责把目标拆成可执行、可交付、可验证的任务体系。

核心职责：
- 识别需求目标、业务边界、实施范围、依赖关系、关键风险、验收口径和执行顺序
- 把需求拆成边界清晰、粒度合适、便于单个子代理持续推进的任务
- 根据任务性质为每个任务分配最匹配的子代理，并保持任务之间的责任边界清楚

拆分原则：
- 任务粒度以“一个子代理能独立完成实现或交付，并能完成自检或验证”为准
- 不要把多个不同技能域强行塞进一个任务，也不要把一个完整动作切成大量低价值碎片
- 优先识别先决条件、共享依赖、阻塞项、可并行项、回滚点和需要人工确认的环节
- 子任务再拆分时，要继承父任务目标，但重新梳理新的边界、依赖和子代理分配，不要机械复制
- 一旦已经获得足够上下文，就停止继续调研，直接输出可执行任务；不要为了“更完整”而扩大分析范围

每个任务至少要体现：
- 任务目标：为什么做，完成后解决什么问题
- 改动范围：涉及的模块、页面、服务、命令、数据结构或运行链路
- 实现方向：核心思路、关键约束、边界条件、兼容性注意点
- 验证方式：测试、回归、手工检查、日志观察、状态确认或验收方式
- 完成标准：什么结果算完成，什么情况仍算未完成

输出要求：
- 信息不足时，只补充继续拆分所必须的关键缺口
- 分配子代理时优先匹配最专长的，而不是一律分给开发子代理
- 结果要让执行者拿到任务后可以直接开工，而不是还需要再次猜测范围"#;

const BUILTIN_ARCHITECT_PROMPT: &str = r#"你是系统架构分析子代理，负责在现有仓库和运行链路基础上给出可落地的技术方案。

核心职责：
- 分析当前系统的模块边界、状态流、数据流、依赖关系、扩展点和技术债
- 判断需求更适合局部改造、增量扩展还是结构调整，并说明为什么
- 对开源方案、第三方组件、框架能力或跨端实现路径进行调研和取舍比较

分析重点：
- 先理解现状：现有目录结构、职责分层、接口关系、运行时约束、平台差异和历史兼容性
- 再比较方案：实现成本、维护复杂度、迁移风险、生态成熟度、许可证风险、团队学习成本
- 最后落地：推荐方案、备选方案、不建议方案，以及分阶段接入或迁移路径

输出要求：
- 结论必须包含推荐方案及其理由，不能只给平铺式候选清单
- 明确指出会影响到的模块、接口、状态、数据结构、部署或测试链路
- 如果需要调研，优先找成熟、稳定、兼容当前技术栈且可渐进接入的方案
- 如果方案有高风险，必须说明前提条件、止损点和回滚思路"#;

const BUILTIN_DEVELOPER_PROMPT: &str = r#"你是任务开发子代理，负责把任务说明转成稳定、可验证、可交付的实现。

工作目标：
- 在理解任务目标和约束后，尽快推进最小闭环改动
- 保持实现与现有仓库结构、命名、状态流和平台差异处理方式一致
- 在交付代码的同时完成必要的自检、验证和异常处理

执行方式：
- 修改前先识别改动边界、关键状态流、调用链路、平台差异和潜在回归面
- 优先选择最小但完整的实现路径，不做与当前目标无关的重构
- 对异常路径、空状态、回退逻辑、兼容性和日志可排查性保持明确处理
- 如果任务涉及跨端链路，要同时关注前端展示、后端命令、状态回写和日志定位能力
- 允许先做少量必要读取来确认入口和依赖，但一旦足够就必须开始编码、执行验证命令并收敛结果
- 不要把回复写成连续的元叙述进度播报；优先让代码改动、命令执行和最终结构化结果构成主要产出
- 除非任务明确要求，不要自行扩展到 MCP bridge、CI、部署脚本或其他无关基础设施

输出要求：
- 回答中要能看出你理解了改动对象、影响范围、验证结果和剩余风险
- 遇到阻塞时先缩小问题、给出定位结果和可执行替代方案，而不是只报告失败
- 如果需要进一步拆分或转交其他子代理，明确说明当前已完成部分、待处理边界和交接建议"#;

const BUILTIN_TESTER_PROMPT: &str = r#"你是测试验证子代理，负责为功能、修复、回归和跨链路稳定性建立可信的验证方案。

核心职责：
- 设计单元测试、集成测试、端到端测试、手工回归和异常场景覆盖范围
- 优先补足最容易阻断回归的自动化验证，而不是堆砌形式化用例
- 对主会话、计划拆分、任务执行、动态表单、日志、状态流转和平台差异保持测试敏感度

测试设计原则：
- 明确前置条件、输入、操作步骤、断言点、稳定性处理、数据清理和复现方式
- 对跨端链路要验证“前端展示 + 后端状态 + 日志/持久化 + 错误提示”是否一致
- 对 Windows / macOS / provider 差异场景，要明确哪些是共性回归，哪些是平台专项回归
- 对难以自动化的场景，也要给出最低成本但有效的人工验证路径
- 如果环境允许，优先使用浏览器自动化、页面交互工具、控制台/网络检查、Tauri MCP、桌面窗口自动化和端到端流程验证，而不是只看代码静态判断
- 对桌面端、Tauri、Vite 或前端项目，优先覆盖真实页面打开、主要交互流程、错误提示、持久化结果和回归路径

输出要求：
- 测试建议必须贴合当前项目已有工具链、目录结构和执行环境
- 结论要指出高优先级回归点、必要自动化补齐项和可延期项
- 如果评估现有实现不可测，要说明具体卡点以及如何改造为可测
- 如果你执行了浏览器、Tauri MCP 或端到端验证，必须明确写出测试路径、观察到的行为、结论和残留风险"#;

const BUILTIN_WRITER_PROMPT: &str = r#"你是文档写作子代理，负责把需求、方案、实现、测试和运维知识沉淀成可直接使用的文档。

核心职责：
- 输出 PRD、技术方案、接入文档、用户手册、发布说明、排障手册和变更说明
- 把复杂流程拆解成目标读者能顺着执行的步骤，而不是仅做概念性描述
- 保持文档与当前实现、限制和实际运行方式一致

写作原则：
- 先确定目标读者是谁，再决定信息粒度、术语密度和示例形式
- 必须补齐前提条件、步骤顺序、示例输入输出、注意事项、失败场景和常见问题
- 对尚未实现、尚未验证或需要人工介入的部分必须明确标注，不能写成既成事实
- 文档结构优先清晰可检索，避免堆段落和口语化空话

输出要求：
- 文档应可被直接采用或稍作修改后落库，不需要读者再二次整理
- 如涉及变更说明，要明确“改了什么、为什么改、如何验证、有什么影响”
- 如涉及操作手册，要明确“准备什么、按什么顺序做、做完看哪里确认成功”"#;

const BUILTIN_DESIGNER_PROMPT: &str = r#"你是前端样式与交互设计子代理，负责提升界面表达力、信息层次和操作完成度。

核心职责：
- 针对页面、面板、表单、列表、看板、消息区和状态组件设计更清晰的视觉与交互层次
- 在现有技术实现和设计系统边界内，优化配色、间距、排版、节奏、强调关系和反馈机制
- 对桌面应用、Tauri、Vue 组件结构和复杂状态页面保持实现敏感度

设计原则：
- 优先尊重现有组件模式和业务结构，在一致性基础上提升辨识度与完成度
- 不做脱离实现边界的空概念设计；每项建议都要能落到组件、状态或交互节点
- 既要关注美观，也要关注可读性、可点击性、可扫描性、错误反馈和密集信息下的稳定性
- 对消息渲染、代码块、表单、状态标签、弹窗和多列布局等高频区域要特别关注间距与层次

输出要求：
- 明确指出涉及的页面、组件、样式层级和预期视觉变化
- 如需改样式，优先说明问题点、设计意图、改动范围和验证方法
- 对不同平台或深浅色主题差异，要明确是否需要单独处理"#;

const BUILTIN_REVIEWER_PROMPT: &str = r#"你是代码评审子代理，负责识别实现中的高风险问题、回归风险和质量缺口。

评审重点：
- 正确性：业务逻辑是否满足目标，边界条件是否覆盖，状态流是否闭合
- 可维护性：命名、结构、耦合、职责边界、可扩展性和一致性是否合理
- 稳定性：异常处理、日志可排查性、平台差异、并发/异步链路和历史兼容性是否充分
- 质量保障：测试覆盖、回归范围、验证链路和交付风险是否到位

评审方式：
- 优先找真实会出问题的点，而不是泛泛而谈“可以更优雅”
- 先给问题，再说明影响场景、触发条件、风险等级和建议修复方向
- 如果没有明显问题，也要指出剩余风险、测试缺口或仍需人工观察的部分

输出要求：
- 结论要尽量落到具体文件、模块、链路、状态或用户场景
- 高优先级问题放前面，低优先级优化建议放后面
- 评论要便于开发者直接行动，不写空泛原则性口号"#;

const BUILTIN_OPS_PROMPT: &str = r#"你是发布运维子代理，负责把构建、部署、运行、监控、回滚和排障链路梳理成可执行方案。

核心职责：
- 分析部署环境、构建链路、配置来源、平台差异、依赖条件和发布风险
- 设计可执行的发布步骤、观察指标、异常诊断路径和回滚方案
- 对日志、监控、运行状态、权限、路径、安装包和多平台问题保持高度敏感

运维原则：
- 先识别前置条件、风险点和不可逆操作，再安排执行顺序
- 对生产环境保持保守判断，优先采用可回退、可观测、可逐步放量的方案
- 对 Windows / macOS / Linux 差异、CLI 路径差异、权限和文件系统特性要单独评估
- 排障时要同时关注用户可见报错、内部日志、命令执行链和状态持久化是否一致

输出要求：
- 给出明确步骤、检查点、成功判据、失败判据和回滚动作
- 对配置项、环境变量、日志位置、命令入口和风险点要写清楚
- 如果需要临时规避方案，也要说明适用范围和后续治理建议"#;

/// 子代理配置数据结构。
///
/// 子代理是纯 persona 层（prompt + 工具约束），不再绑定 ACP 执行载体。
/// 执行器选择上移到会话/计划/SOLO 运行级别；软件经 ACP `_meta.systemPrompt`
/// 把子代理 prompt 自动注入给会话选定的执行器。
///
/// `tools` / `disallowed_tools` / `model` / `permission_mode` / `max_turns`
/// 对齐 CLI 子代理 frontmatter，便于同步写盘成 `.claude/agents/*.md` 等配置。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgent {
    pub id: String,
    pub builtin_code: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub prompt: String,
    pub category: String,
    pub tags: Vec<String>,
    pub recommended_scenes: Vec<String>,
    /// 允许子代理使用的工具列表（写盘 frontmatter tools）。
    pub tools: Vec<String>,
    /// 禁止子代理使用的工具列表（写盘 frontmatter disallowedTools）。
    pub disallowed_tools: Vec<String>,
    /// 子代理专用模型（写盘 frontmatter model），为空则沿用执行器默认模型。
    pub model: Option<String>,
    /// 权限模式（写盘 frontmatter permissionMode）。
    pub permission_mode: Option<String>,
    /// 最大交互轮数（写盘 frontmatter maxTurns）。
    pub max_turns: Option<i32>,
    pub is_builtin: bool,
    pub is_enabled: bool,
    /// 系统级子代理（内置 + 引擎 fallback 用），不显示在用户配置页。
    pub is_system: bool,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubAgentInput {
    pub name: String,
    pub description: Option<String>,
    pub prompt: String,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub recommended_scenes: Option<Vec<String>>,
    pub tools: Option<Vec<String>>,
    pub disallowed_tools: Option<Vec<String>>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub max_turns: Option<i32>,
    pub is_enabled: Option<bool>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSubAgentInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub prompt: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub recommended_scenes: Option<Vec<String>>,
    pub tools: Option<Vec<String>>,
    pub disallowed_tools: Option<Vec<String>>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub max_turns: Option<i32>,
    pub is_enabled: Option<bool>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentReferenceSummary {
    pub plans: i64,
    pub tasks: i64,
    pub sessions: i64,
}

struct BuiltinSubAgentSeed {
    builtin_code: &'static str,
    name: &'static str,
    description: &'static str,
    prompt: &'static str,
    category: &'static str,
    tags: &'static [&'static str],
    recommended_scenes: &'static [&'static str],
    sort_order: i32,
}

fn builtin_sub_agent_seeds() -> Vec<BuiltinSubAgentSeed> {
    vec![
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_GENERAL_CODE,
            name: "主会话通用子代理",
            description: "用于日常问答、需求澄清、方案讨论与项目内协作。",
            prompt: BUILTIN_GENERAL_PROMPT,
            category: "general",
            tags: &["chat", "general", "project"],
            recommended_scenes: &["主会话", "方案讨论", "日常协作"],
            sort_order: 10,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_SOLO_COORDINATOR_CODE,
            name: "规划协调子代理",
            description: "用于 SOLO 模式统一调度、子代理选择、阶段推进与结果回收。",
            prompt: BUILTIN_SOLO_COORDINATOR_PROMPT,
            category: "planner",
            tags: &["solo", "orchestrator", "planner"],
            recommended_scenes: &["SOLO 创建", "SOLO 调度", "统一协调"],
            sort_order: 15,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_PLANNER_CODE,
            name: "任务拆分子代理",
            description: "用于需求分析、任务拆分、依赖规划与子代理分配。",
            prompt: BUILTIN_PLANNER_PROMPT,
            category: "planner",
            tags: &["plan", "split", "requirements"],
            recommended_scenes: &["计划创建", "任务拆分", "继续拆分"],
            sort_order: 20,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_ARCHITECT_CODE,
            name: "架构分析子代理",
            description: "用于系统架构分析、模块边界设计、开源方案选型与演进建议。",
            prompt: BUILTIN_ARCHITECT_PROMPT,
            category: "architect",
            tags: &["architecture", "design", "opensource"],
            recommended_scenes: &["架构分析", "技术选型", "方案设计"],
            sort_order: 30,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_DEVELOPER_CODE,
            name: "任务开发子代理",
            description: "用于具体任务实现、修复、验证与交付。",
            prompt: BUILTIN_DEVELOPER_PROMPT,
            category: "developer",
            tags: &["task", "develop", "delivery"],
            recommended_scenes: &["任务执行", "失败重试", "人工改派"],
            sort_order: 40,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_TESTER_CODE,
            name: "测试验证子代理",
            description: "用于自动化测试设计、Playwright 场景编写、单元测试补齐与回归验证。",
            prompt: BUILTIN_TESTER_PROMPT,
            category: "tester",
            tags: &["test", "playwright", "qa"],
            recommended_scenes: &["测试补齐", "回归验证", "质量保障"],
            sort_order: 50,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_WRITER_CODE,
            name: "文档写作子代理",
            description: "用于整理需求文档、技术方案、使用说明、发布说明与排障文档。",
            prompt: BUILTIN_WRITER_PROMPT,
            category: "writer",
            tags: &["docs", "spec", "guide"],
            recommended_scenes: &["文档编写", "方案整理", "知识沉淀"],
            sort_order: 60,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_DESIGNER_CODE,
            name: "前端样式设计子代理",
            description: "用于页面视觉优化、交互层次设计、组件样式统一与前端体验提升。",
            prompt: BUILTIN_DESIGNER_PROMPT,
            category: "designer",
            tags: &["frontend", "ui", "design"],
            recommended_scenes: &["样式设计", "交互优化", "视觉升级"],
            sort_order: 70,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_REVIEWER_CODE,
            name: "代码评审子代理",
            description: "用于代码审查、风险识别、测试缺口分析与回归问题预判。",
            prompt: BUILTIN_REVIEWER_PROMPT,
            category: "reviewer",
            tags: &["review", "risk", "quality"],
            recommended_scenes: &["代码评审", "风险排查", "交付验收"],
            sort_order: 80,
        },
        BuiltinSubAgentSeed {
            builtin_code: BUILTIN_OPS_CODE,
            name: "发布运维子代理",
            description: "用于部署发布、环境排查、日志分析、监控验证与回滚预案制定。",
            prompt: BUILTIN_OPS_PROMPT,
            category: "ops",
            tags: &["deploy", "ops", "release"],
            recommended_scenes: &["部署发布", "运维排障", "环境核查"],
            sort_order: 90,
        },
    ]
}

fn to_json_array(value: &[String]) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "[]".to_string())
}

fn parse_json_array(raw: Option<String>) -> Vec<String> {
    raw.and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

/// 把 rbatis 行映射 `SubAgentRow` 转成对外 DTO `SubAgent`（含 JSON 数组解析、bool 还原）。
fn row_to_sub_agent(row: SubAgentRow) -> SubAgent {
    SubAgent {
        id: row.id.unwrap_or_default(),
        builtin_code: row.builtin_code,
        name: row.name.unwrap_or_default(),
        description: row.description,
        prompt: row.prompt.unwrap_or_default(),
        category: row.category.unwrap_or_else(|| "custom".to_string()),
        tags: parse_json_array(value_to_json_string_opt(row.tags)),
        recommended_scenes: parse_json_array(value_to_json_string_opt(row.recommended_scenes)),
        tools: parse_json_array(value_to_json_string_opt(row.tools)),
        disallowed_tools: parse_json_array(value_to_json_string_opt(row.disallowed_tools)),
        model: row.model,
        permission_mode: row.permission_mode,
        max_turns: row.max_turns.map(|v| v as i32),
        is_builtin: row.is_builtin.unwrap_or(0) != 0,
        is_enabled: row.is_enabled.unwrap_or(0) != 0,
        is_system: row.is_system.unwrap_or(0) != 0,
        sort_order: row.sort_order.unwrap_or(0) as i32,
        created_at: row.created_at.unwrap_or_default(),
        updated_at: row.updated_at.unwrap_or_default(),
    }
}

/// 确保内置子代理存在（INSERT OR IGNORE + 按 builtin_code 刷新基础字段）。
pub(crate) async fn ensure_builtin_sub_agents() -> Result<(), String> {
    let rb = db::rb();

    // 前置检查：表非空则跳过（避免每次 list 都跑 11×2 次串行 exec）。
    // INSERT OR IGNORE 本身幂等，但重复执行浪费连接池资源。
    let existing: i64 = match rb
        .query("select count(*) as c from sub_agents", vec![])
        .await
    {
        Ok(value) => {
            // 查询结果形如 Value::Array(rows)；取第一行，其内部为单元素 Map，取其 value。
            if let rbs::Value::Array(rows) = &value {
                if let Some(first_row) = rows.first() {
                    if let rbs::Value::Map(m) = first_row {
                        if let Some((_, v)) = m.0.iter().next() {
                            crate::commands::support::value_to_i64(v)
                        } else { 0 }
                    } else { 0 }
                } else { 0 }
            } else { 0 }
        }
        Err(_) => 0,
    };
    if existing > 0 {
        return Ok(());
    }

    let now = now_rfc3339();

    for seed in builtin_sub_agent_seeds() {
        let tags_json = serde_json::to_string(seed.tags).unwrap_or_else(|_| "[]".to_string());
        let scenes_json =
            serde_json::to_string(seed.recommended_scenes).unwrap_or_else(|_| "[]".to_string());
        let new_id = uuid::Uuid::new_v4().to_string();

        // 用 exec 裸 SQL 绕过 #[html_sql] 宏诊断
        let insert_sql = format!(
            "insert or ignore into sub_agents (id, builtin_code, name, description, prompt, category, tags, recommended_scenes, tools, disallowed_tools, model, permission_mode, max_turns, is_builtin, is_enabled, is_system, sort_order, created_at, updated_at) values ('{}','{}','{}','{}','{}','{}','{}','{}','[]','[]',NULL,NULL,NULL,1,1,1,{},{},{})",
            new_id.replace('\'', "''"),
            seed.builtin_code.replace('\'', "''"),
            seed.name.replace('\'', "''"),
            seed.description.replace('\'', "''"),
            seed.prompt.replace('\'', "''"),
            seed.category.replace('\'', "''"),
            tags_json.replace('\'', "''"),
            scenes_json.replace('\'', "''"),
            seed.sort_order,
            // created_at/updated_at 用 sqlite 的 strftime，避免引号问题
            "strftime('%s','now')",
            "strftime('%s','now')"
        );
        if let Err(e) = rb.exec(&insert_sql, vec![]).await {
            return Err(format!("insert_builtin({}): {}", seed.builtin_code, e.to_string()));
        }

        // update 用 exec 裸 SQL（同 insert，避免 #[html_sql] 宏对 JSON 字符串参数的 rbs 解析问题）
        let update_sql = format!(
            "update sub_agents set name='{}', description='{}', prompt='{}', category='{}', tags='{}', recommended_scenes='{}', sort_order={}, updated_at='{}' where builtin_code='{}'",
            seed.name.replace('\'', "''"),
            seed.description.replace('\'', "''"),
            seed.prompt.replace('\'', "''"),
            seed.category.replace('\'', "''"),
            tags_json.replace('\'', "''"),
            scenes_json.replace('\'', "''"),
            seed.sort_order,
            now_rfc3339(),
            seed.builtin_code.replace('\'', "''"),
        );
        if let Err(e) = rb.exec(&update_sql, vec![]).await {
            return Err(format!("update_builtin({}): {}", seed.builtin_code, e.to_string()));
        }
    }

    Ok(())
}

async fn fetch_sub_agent_by_id(id: &str) -> Result<SubAgent, String> {
    // 用 list（Vec 返回，已验证可用）过滤，绕过 #[html_sql] 对 Option<SubAgentRow> 单行解码的差异
    let rows = sub_agent_mapper::list_sub_agents(db::rb())
        .await
        .map_err(|error| error.to_string())?;
    let row = rows
        .into_iter()
        .find(|r| r.id.as_deref() == Some(id))
        .ok_or_else(|| format!("子代理不存在: {}", id))?;
    Ok(row_to_sub_agent(row))
}

async fn count_sub_agent_references_inner(
    sub_agent_id: &str,
) -> Result<SubAgentReferenceSummary, String> {
    let plans = sub_agent_mapper::count_plan_refs(db::rb(), sub_agent_id).await;
    let tasks = sub_agent_mapper::count_task_refs(db::rb(), sub_agent_id).await;
    let sessions = sub_agent_mapper::count_session_refs(db::rb(), sub_agent_id).await;

    Ok(SubAgentReferenceSummary {
        plans,
        tasks,
        sessions,
    })
}

#[tauri::command]
pub async fn seed_builtin_sub_agents() -> Result<(), String> {
    ensure_builtin_sub_agents().await
}

#[tauri::command]
pub async fn list_sub_agents() -> Result<Vec<SubAgent>, String> {
    ensure_builtin_sub_agents().await?;

    let rows = sub_agent_mapper::list_sub_agents(db::rb())
        .await
        .map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(row_to_sub_agent).collect())
}

/// 仅返回用户自建的子代理（`is_system = 0`），供配置页使用。
/// 系统级子代理（引擎 fallback 用）不在其中。
#[tauri::command]
pub async fn list_user_sub_agents() -> Result<Vec<SubAgent>, String> {
    let rows = sub_agent_mapper::list_user_sub_agents(db::rb())
        .await
        .map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(row_to_sub_agent).collect())
}

#[tauri::command]
pub async fn create_sub_agent(input: CreateSubAgentInput) -> Result<SubAgent, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();

    // 用 rb.exec + ? 占位符绕过 #[html_sql] 宏对 JSON 字符串参数的二次解析
    let tags_json = to_json_array(&input.tags.unwrap_or_default());
    let scenes_json = to_json_array(&input.recommended_scenes.unwrap_or_default());
    let tools_json = to_json_array(&input.tools.unwrap_or_default());
    let disallowed_json = to_json_array(&input.disallowed_tools.unwrap_or_default());
    let category = input.category.unwrap_or_else(|| "custom".to_string());
    let model = input.model.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty());
    let permission_mode = input.permission_mode.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty());
    let description = input.description.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty());

    let insert_sql = "insert into sub_agents (id, builtin_code, name, description, prompt, category, tags, recommended_scenes, tools, disallowed_tools, model, permission_mode, max_turns, is_builtin, is_enabled, is_system, sort_order, created_at, updated_at) values (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?, ?)";
    let params = vec![
        rbs::Value::String(id.clone()),
        rbs::Value::String(input.name.trim().to_string()),
        description.map(|s| rbs::Value::String(s.to_string())).unwrap_or(rbs::Value::Null),
        rbs::Value::String(input.prompt.trim().to_string()),
        rbs::Value::String(category),
        rbs::Value::String(tags_json),
        rbs::Value::String(scenes_json),
        rbs::Value::String(tools_json),
        rbs::Value::String(disallowed_json),
        model.map(|s| rbs::Value::String(s.to_string())).unwrap_or(rbs::Value::Null),
        permission_mode.map(|s| rbs::Value::String(s.to_string())).unwrap_or(rbs::Value::Null),
        input.max_turns.map(|v| v as i64).map(rbs::Value::I64).unwrap_or(rbs::Value::Null),
        input.is_enabled.map(|v| if v { 1 } else { 0 }).map(rbs::Value::I64).unwrap_or(rbs::Value::I64(1)),
        rbs::Value::String(now.clone()),
        rbs::Value::String(now),
    ];
    db::rb().exec(insert_sql, params).await.map_err(|e| e.to_string())?;

    fetch_sub_agent_by_id(&id).await
}

#[tauri::command]
pub async fn update_sub_agent(id: String, input: UpdateSubAgentInput) -> Result<SubAgent, String> {
    let now = now_rfc3339();

    sub_agent_mapper::update_sub_agent(
        db::rb(),
        &id,
        &now,
        input.name.as_deref(),
        input.description.as_deref(),
        input.prompt.as_deref(),
        input.category.as_deref(),
        input.tags.as_ref().map(|v| rbs::Value::String(to_json_array(v))),
        input
            .recommended_scenes
            .as_ref()
            .map(|v| rbs::Value::String(to_json_array(v))),
        input.tools.as_ref().map(|v| rbs::Value::String(to_json_array(v))),
        input
            .disallowed_tools
            .as_ref()
            .map(|v| rbs::Value::String(to_json_array(v))),
        input.model.as_deref(),
        input.permission_mode.as_deref(),
        input.max_turns.map(|v| v as i64),
        input.is_enabled.map(|v| if v { 1 } else { 0 }),
        input.sort_order.map(|v| v as i64),
    )
    .await
    .map_err(|error| error.to_string())?;

    fetch_sub_agent_by_id(&id).await
}

#[tauri::command]
pub async fn count_sub_agent_references(id: String) -> Result<SubAgentReferenceSummary, String> {
    count_sub_agent_references_inner(&id).await
}

#[tauri::command]
pub async fn delete_sub_agent(id: String) -> Result<(), String> {
    let sub_agent = fetch_sub_agent_by_id(&id).await?;

    if sub_agent.is_builtin || sub_agent.is_system {
        return Err("内置/系统子代理不可删除".to_string());
    }

    let references = count_sub_agent_references_inner(&id).await?;
    if references.plans > 0 || references.tasks > 0 || references.sessions > 0 {
        return Err("该子代理仍被计划、任务或会话引用，无法删除".to_string());
    }

    sub_agent_mapper::delete_sub_agent(db::rb(), &id)
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

// ==================== 子代理配置写盘（方案 B：CLI 原生委派）====================

/// 待写盘的子代理定义（前端传入，避免重复查询 DB）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubAgentFileInput {
    /// 文件名标识（用 builtin_code 或 id），不含扩展名与前缀。
    pub key: String,
    pub name: String,
    pub description: Option<String>,
    pub prompt: String,
    pub tools: Vec<String>,
    pub disallowed_tools: Vec<String>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub max_turns: Option<i32>,
}

/// 写盘子代理文件入参。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSubAgentFilesInput {
    /// CLI provider：claude → `.claude/agents/`，opencode → `.opencode/agents/`。
    pub provider: String,
    /// 项目根目录（写盘位置）；为空则仅写用户全局目录。
    pub project_path: Option<String>,
    /// 用户全局目录（一般为 home）。
    pub user_home: Option<String>,
    /// 待同步的子代理列表。
    pub sub_agents: Vec<SubAgentFileInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSubAgentFilesResult {
    /// 实际写入的文件绝对路径。
    pub written: Vec<String>,
    /// 被清理的旧标记文件绝对路径。
    pub cleared: Vec<String>,
}

/// 不同 provider 的 CLI 子代理配置目录（相对项目/用户根）。
fn sub_agent_dir_relative(provider: &str) -> Option<&'static str> {
    match provider {
        "claude" => Some(".claude/agents"),
        "opencode" => Some(".opencode/agents"),
        _ => None,
    }
}

/// 构造单个子代理的 markdown 内容：YAML frontmatter + body(prompt)。
///
/// 不同 CLI 的 frontmatter 要求略有差异：
/// - opencode **必须** `mode: subagent`，否则 `opencode agent list` 不识别该文件。
/// - claude-code 不需要 mode（Agent 工具自动把 .claude/agents/ 当子代理），写入也不影响。
fn build_sub_agent_markdown(input: &SubAgentFileInput, provider: &str) -> String {
    let mut frontmatter = String::new();
    frontmatter.push_str("---\n");
    frontmatter.push_str(&format!("name: {}\n", yaml_escape(&input.name)));
    // opencode 必须声明为子代理；claude 写入也无害
    if provider == "opencode" {
        frontmatter.push_str("mode: subagent\n");
    }
    if let Some(desc) = input.description.as_ref().filter(|d| !d.trim().is_empty()) {
        frontmatter.push_str(&format!("description: {}\n", yaml_escape(desc)));
    }
    // tools/disallowedTools 仅对 claude 输出（claude 用字符串数组）。
    // opencode 的 tools 是对象映射（tool -> 权限），格式不兼容，直接省略（子代理可访问全部工具）。
    if provider != "opencode" {
        if !input.tools.is_empty() {
            let items: Vec<String> = input.tools.iter().map(|t| format!("- {}", yaml_escape(t))).collect();
            frontmatter.push_str(&format!("tools:\n{}\n", items.join("\n")));
        }
        if !input.disallowed_tools.is_empty() {
            let items: Vec<String> = input
                .disallowed_tools
                .iter()
                .map(|t| format!("- {}", yaml_escape(t)))
                .collect();
            frontmatter.push_str(&format!("disallowedTools:\n{}\n", items.join("\n")));
        }
    }
    if let Some(model) = input.model.as_ref().filter(|m| !m.trim().is_empty()) {
        frontmatter.push_str(&format!("model: {}\n", yaml_escape(model)));
    }
    if let Some(mode) = input.permission_mode.as_ref().filter(|m| !m.trim().is_empty()) {
        frontmatter.push_str(&format!("permissionMode: {}\n", yaml_escape(mode)));
    }
    if let Some(turns) = input.max_turns {
        frontmatter.push_str(&format!("maxTurns: {}\n", turns));
    }
    frontmatter.push_str("---\n\n");

    // 写盘来源标记，便于排障与清理识别
    let marker = "<!-- managed by Easy Agent Pilot sub-agent sync -->\n";
    format!("{}{}{}", frontmatter, marker, input.prompt)
}

/// 极简 YAML 标量转义：含特殊字符或空则加双引号并转义引号/反斜杠。
fn yaml_escape(value: &str) -> String {
    let trimmed = value.trim();
    let needs_quote = trimmed.is_empty()
        || trimmed
            .chars()
            .any(|c| matches!(c, ':' | '#' | '\n' | '\r' | '"' | '\'' | '\\' | '{' | '}' | '[' | ']' | ',' | '&'));
    if !needs_quote {
        return trimmed.to_string();
    }
    let escaped = trimmed.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{}\"", escaped)
}

// ==================== 磁盘子代理读取（只读扫描）====================

/// 磁盘上的子代理定义（解析自 `.claude/agents/*.md` / `.opencode/agents/*.md`）。
///
/// 只读结构，无 id；用于配置页展示 CLI 已有子代理。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSubAgent {
    pub source: String,
    pub file_name: String,
    pub name: String,
    pub description: Option<String>,
    pub prompt: String,
    pub model: Option<String>,
    pub tools: Vec<String>,
}

/// 解析单条 frontmatter 字段值，去除 YAML 标量引号。
fn unquote_yaml_scalar(raw: &str) -> String {
    let trimmed = raw.trim();
    if (trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2)
        || (trimmed.starts_with('\'') && trimmed.ends_with('\'') && trimmed.len() >= 2)
    {
        trimmed[1..trimmed.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
            .to_string()
    } else {
        trimmed.to_string()
    }
}

/// 解析子代理 markdown：YAML frontmatter（name/description/model/tools）+ 正文(prompt)。
///
/// 不依赖第三方 YAML 库，按 `build_sub_agent_markdown` 的输出格式逆向解析。
/// 容错：无 frontmatter 的纯正文也视为合法（name 取文件名）。
pub(crate) fn parse_sub_agent_markdown(
    content: &str,
    file_stem: &str,
    source: &str,
) -> DiskSubAgent {
    let mut name = file_stem.to_string();
    let mut description: Option<String> = None;
    let mut model: Option<String> = None;
    let mut tools: Vec<String> = Vec::new();
    let prompt: String;

    let body_start = content.strip_prefix("---\n");
    if let Some(rest) = body_start {
        if let Some(end_idx) = rest.find("\n---\n") {
            let frontmatter = &rest[..end_idx];
            // frontmatter 之后（跳过 `\n---\n`）为正文
            let raw_body = &rest[end_idx + "\n---\n".len()..];
            prompt = strip_managed_marker(raw_body).trim().to_string();

            let mut in_tools_block = false;
            let mut in_disallowed_block = false;
            for line in frontmatter.lines() {
                let line = line.trim_end();
                if line.is_empty() {
                    continue;
                }
                // 工具块内的列表项
                if (in_tools_block || in_disallowed_block) && line.starts_with("- ") {
                    let item = unquote_yaml_scalar(&line[2..]);
                    if in_tools_block {
                        tools.push(item);
                    }
                    continue;
                }
                // 离开列表块
                in_tools_block = false;
                in_disallowed_block = false;

                if let Some(value) = line.strip_prefix("name:") {
                    let v = unquote_yaml_scalar(value);
                    if !v.is_empty() {
                        name = v;
                    }
                } else if let Some(value) = line.strip_prefix("description:") {
                    let v = unquote_yaml_scalar(value);
                    description = if v.is_empty() { None } else { Some(v) };
                } else if let Some(value) = line.strip_prefix("model:") {
                    let v = unquote_yaml_scalar(value);
                    model = if v.is_empty() { None } else { Some(v) };
                } else if line.starts_with("tools:") {
                    in_tools_block = true;
                } else if line.starts_with("disallowedTools:") {
                    in_disallowed_block = true;
                }
            }
        } else {
            // frontmatter 未闭合，整段当正文
            prompt = content.trim().to_string();
        }
    } else {
        // 无 frontmatter：纯正文
        prompt = content.trim().to_string();
    }

    DiskSubAgent {
        source: source.to_string(),
        file_name: format!("{}.md", file_stem),
        name,
        description,
        prompt,
        model,
        tools,
    }
}

/// 去除应用自管理的标记注释行。
fn strip_managed_marker(body: &str) -> String {
    body.lines()
        .filter(|line| !line.contains("managed by Easy Agent Pilot sub-agent sync"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// 扫描指定目录下的 `*.md` 子代理文件（跳过 `ea-` 前缀的应用自管理文件），
/// 解析为只读 `DiskSubAgent` 列表。
fn scan_disk_sub_agents(dir: &Path, source: &str) -> Vec<DiskSubAgent> {
    let mut result = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return result;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let file_name = match path.file_stem().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        // 跳过应用自管理文件（避免与 DB 子代理重复）
        if file_name.starts_with(EA_SUB_AGENT_FILE_PREFIX) {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        result.push(parse_sub_agent_markdown(&content, &file_name, source));
    }

    result.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    result
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDiskSubAgentsInput {
    /// CLI provider：claude / opencode。
    pub cli_type: String,
    /// 项目根目录；为空则仅扫描用户全局目录。
    pub project_path: Option<String>,
}

/// 读取磁盘上已有的 CLI 子代理（只读）。
///
/// 优先扫描项目级目录（`{project}/.claude/agents`），回退用户全局目录
/// （`~/.claude/agents`）。仅 claude / opencode 支持。
#[tauri::command]
pub fn list_disk_sub_agents(input: ListDiskSubAgentsInput) -> Result<Vec<DiskSubAgent>, String> {
    let relative = sub_agent_dir_relative(&input.cli_type)
        .ok_or_else(|| format!("不支持的 CLI 类型: {}", input.cli_type))?;

    let mut results = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    // 项目级目录优先
    if let Some(project) = input.project_path.as_ref().filter(|p| !p.trim().is_empty()) {
        let project_dir = PathBuf::from(project).join(relative);
        for agent in scan_disk_sub_agents(&project_dir, &input.cli_type) {
            seen_names.insert(agent.name.clone());
            results.push(agent);
        }
    }
    // 回退用户全局目录
    let user_dir = match dirs::home_dir() {
        Some(home) => home.join(relative),
        None => return Ok(results),
    };
    for agent in scan_disk_sub_agents(&user_dir, &input.cli_type) {
        if !seen_names.contains(&agent.name) {
            results.push(agent);
        }
    }

    Ok(results)
}

/// 计算写盘目录：项目级优先，无项目级时落用户全局。
/// `user_home` 为空时自动解析当前用户主目录。
fn resolve_target_dirs(input: &SyncSubAgentFilesInput) -> Result<Vec<PathBuf>, String> {
    let relative = sub_agent_dir_relative(&input.provider)
        .ok_or_else(|| format!("不支持的子代理委派 provider: {}", input.provider))?;

    let mut dirs = Vec::new();
    if let Some(project) = input.project_path.as_ref().filter(|p| !p.trim().is_empty()) {
        dirs.push(PathBuf::from(project).join(relative));
    }
    let user_home = match input.user_home.as_ref().filter(|p| !p.trim().is_empty()) {
        Some(home) => Some(PathBuf::from(home)),
        None => dirs::home_dir(),
    };
    if let Some(home) = user_home {
        let dir = home.join(relative);
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    if dirs.is_empty() {
        return Err("未提供项目路径，且无法解析用户主目录，无法写盘子代理配置".to_string());
    }
    Ok(dirs)
}

/// 清理目录下旧的 `ea-` 前缀子代理文件。
fn clear_marked_files(dir: &PathBuf) -> Vec<String> {
    let mut cleared = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return cleared;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with(EA_SUB_AGENT_FILE_PREFIX) && name.ends_with(".md") {
                if std::fs::remove_file(&path).is_ok() {
                    cleared.push(path.to_string_lossy().to_string());
                }
            }
        }
    }
    cleared
}

/// 同步子代理定义为 CLI 原生配置文件（`.claude/agents/` 或 `.opencode/agents/`）。
///
/// 仅写带 `ea-` 前缀的标记文件，并在写入前清理目标目录下的旧标记文件，
/// 用户手写配置不受影响。codex 等不支持的 provider 会被拒绝（前端应已过滤）。
#[tauri::command]
pub fn sync_sub_agent_files(input: SyncSubAgentFilesInput) -> Result<SyncSubAgentFilesResult, String> {
    if sub_agent_dir_relative(&input.provider).is_none() {
        return Err(format!("provider {} 不支持子代理委派，跳过写盘", input.provider));
    }
    if input.sub_agents.is_empty() {
        return Ok(SyncSubAgentFilesResult {
            written: vec![],
            cleared: vec![],
        });
    }

    let dirs = resolve_target_dirs(&input)?;
    let mut written = Vec::new();
    let mut cleared = Vec::new();

    for dir in &dirs {
        std::fs::create_dir_all(dir).map_err(|e| format!("创建目录失败 {:?}: {}", dir, e))?;
        cleared.extend(clear_marked_files(dir));

        for sub in &input.sub_agents {
            let file_name = format!("{}{}.md", EA_SUB_AGENT_FILE_PREFIX, sub.key);
            let path = dir.join(&file_name);
            let content = build_sub_agent_markdown(sub, &input.provider);
            std::fs::write(&path, content)
                .map_err(|e| format!("写盘子代理失败 {:?}: {}", path, e))?;
            written.push(path.to_string_lossy().to_string());
        }
    }

    Ok(SyncSubAgentFilesResult { written, cleared })
}

/// 清理指定 provider/目录下的所有 `ea-` 标记子代理文件（会话结束/禁用时调用）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearSubAgentFilesInput {
    pub provider: String,
    pub project_path: Option<String>,
    pub user_home: Option<String>,
}

#[tauri::command]
pub fn clear_sub_agent_files(input: ClearSubAgentFilesInput) -> Result<Vec<String>, String> {
    if sub_agent_dir_relative(&input.provider).is_none() {
        return Ok(vec![]);
    }
    // 复用 resolve 逻辑但不要求目录非空（清理可无目标）
    let relative = match sub_agent_dir_relative(&input.provider) {
        Some(r) => r,
        None => return Ok(vec![]),
    };
    let mut dirs = Vec::new();
    if let Some(project) = input.project_path.as_ref().filter(|p| !p.trim().is_empty()) {
        dirs.push(PathBuf::from(project).join(relative));
    }
    let user_home = match input.user_home.as_ref().filter(|p| !p.trim().is_empty()) {
        Some(home) => Some(PathBuf::from(home)),
        None => dirs::home_dir(),
    };
    if let Some(home) = user_home {
        let dir = home.join(relative);
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }

    let mut cleared = Vec::new();
    for dir in &dirs {
        cleared.extend(clear_marked_files(dir));
    }
    Ok(cleared)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_claude_frontmatter_with_tools_and_model() {
        let content = "---\nname: code-reviewer\ndescription: \"审查代码质量\"\ntools:\n- Read\n- Bash\nmodel: opus4.6\n---\n\n<!-- managed by Easy Agent Pilot sub-agent sync -->\n你是代码审查专家。\n";
        let parsed = parse_sub_agent_markdown(content, "fallback-name", "claude");

        assert_eq!(parsed.name, "code-reviewer");
        assert_eq!(parsed.description.as_deref(), Some("审查代码质量"));
        assert_eq!(parsed.model.as_deref(), Some("opus4.6"));
        assert_eq!(parsed.tools, vec!["Read".to_string(), "Bash".to_string()]);
        assert_eq!(parsed.source, "claude");
        // 标记注释被去除
        assert!(!parsed.prompt.contains("managed by Easy Agent Pilot"));
        assert!(parsed.prompt.contains("你是代码审查专家。"));
    }

    #[test]
    fn parse_opencode_with_mode_subagent() {
        let content = "---\nname: opencode-agent\nmode: subagent\ndescription: helper\n---\n\n做事情。\n";
        let parsed = parse_sub_agent_markdown(content, "file", "opencode");

        assert_eq!(parsed.name, "opencode-agent");
        assert_eq!(parsed.description.as_deref(), Some("helper"));
        assert_eq!(parsed.prompt, "做事情。");
        assert_eq!(parsed.source, "opencode");
    }

    #[test]
    fn parse_plain_body_without_frontmatter() {
        let content = "纯正文内容，没有 frontmatter。\n第二行。\n";
        let parsed = parse_sub_agent_markdown(content, "my-agent", "claude");

        assert_eq!(parsed.name, "my-agent");
        assert_eq!(parsed.description, None);
        assert_eq!(parsed.model, None);
        assert!(parsed.tools.is_empty());
        assert!(parsed.prompt.contains("纯正文内容"));
    }

    #[test]
    fn parse_empty_content() {
        let parsed = parse_sub_agent_markdown("", "empty", "claude");
        assert_eq!(parsed.name, "empty");
        assert_eq!(parsed.prompt, "");
    }

    #[test]
    fn build_claude_markdown_includes_tools_and_disallowed() {
        let input = SubAgentFileInput {
            key: "test".to_string(),
            name: "tester".to_string(),
            description: Some("d".to_string()),
            prompt: "prompt body".to_string(),
            tools: vec!["Read".to_string(), "Bash".to_string()],
            disallowed_tools: vec!["Rm".to_string()],
            model: Some("sonnet".to_string()),
            permission_mode: None,
            max_turns: None,
        };
        let md = build_sub_agent_markdown(&input, "claude");

        assert!(md.contains("name: tester"));
        assert!(md.contains("- Read"));
        assert!(md.contains("- Bash"));
        assert!(md.contains("disallowedTools:"));
        assert!(md.contains("- Rm"));
        assert!(md.contains("model: sonnet"));
        assert!(!md.contains("mode: subagent"));
        assert!(md.contains("prompt body"));
    }

    #[test]
    fn build_opencode_markdown_has_mode_omits_tools() {
        let input = SubAgentFileInput {
            key: "test".to_string(),
            name: "oc-agent".to_string(),
            description: None,
            prompt: "hi".to_string(),
            tools: vec!["Read".to_string()],
            disallowed_tools: vec![],
            model: None,
            permission_mode: None,
            max_turns: None,
        };
        let md = build_sub_agent_markdown(&input, "opencode");

        assert!(md.contains("mode: subagent"));
        // opencode 不输出 tools/disallowedTools
        assert!(!md.contains("tools:"));
        assert!(!md.contains("disallowedTools:"));
    }

    #[test]
    fn yaml_escape_plain_value_unchanged() {
        assert_eq!(yaml_escape("plain"), "plain");
        assert_eq!(yaml_escape("  spaced  "), "spaced");
    }

    #[test]
    fn yaml_escape_special_chars_quoted() {
        let escaped = yaml_escape("a:b#c");
        assert!(escaped.starts_with('"'));
        assert!(escaped.ends_with('"'));
        assert!(escaped.contains("a:b#c"));
    }

    #[test]
    fn yaml_escape_quotes_and_backslash() {
        let escaped = yaml_escape(r#"he said "hi" \end"#);
        // 引号被转义
        assert!(escaped.contains("\\\"hi\\\""));
        assert!(escaped.contains("\\\\end"));
    }

    #[test]
    fn yaml_escape_empty_value() {
        assert_eq!(yaml_escape(""), "\"\"");
        assert_eq!(yaml_escape("   "), "\"\"");
    }

    #[test]
    fn build_and_parse_roundtrip() {
        let input = SubAgentFileInput {
            key: "roundtrip".to_string(),
            name: "回环代理".to_string(),
            description: Some("测试回环".to_string()),
            prompt: "回环提示词正文。".to_string(),
            tools: vec!["Read".to_string(), "Write".to_string()],
            disallowed_tools: vec![],
            model: Some("gpt-5".to_string()),
            permission_mode: Some("plan".to_string()),
            max_turns: Some(10),
        };
        let md = build_sub_agent_markdown(&input, "claude");
        let parsed = parse_sub_agent_markdown(&md, "roundtrip", "claude");

        assert_eq!(parsed.name, "回环代理");
        assert_eq!(parsed.description.as_deref(), Some("测试回环"));
        assert_eq!(parsed.model.as_deref(), Some("gpt-5"));
        assert_eq!(parsed.tools, vec!["Read", "Write"]);
        assert!(parsed.prompt.contains("回环提示词正文。"));
    }
}

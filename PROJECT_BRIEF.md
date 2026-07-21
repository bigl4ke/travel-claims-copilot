# Travel Claims Copilot 项目说明

## 项目定位

这是一个“旅行中断现场行动与沟通助手”。

用户输入自己遇到的酒店或航司异常经历，系统基于：
- 官方政策
- 政府法规
- 航司/酒店公开承诺
- 社区相似案例 DP
- 历史用户反馈结果

帮助用户判断现在该联系谁、先提出什么诉求、保留什么证据，并根据酒店或航司的
实际回复继续给出下一步。政策和案例是行动建议的证据层，不是主要界面。

产品不提供法律意见，不承诺赔偿结果，不做代理索赔。它的核心价值是帮助用户在
旅行中断发生时采取正确的下一步，并记录从首次沟通到解决或升级的完整过程。

## 核心产品流程

1. 用户用自然语言描述问题。
2. LLM 只追问会改变政策适用、联系人或当前诉求的缺失事实；每次只问一个问题。
3. 服务器根据结构化事实、官方依据和已审核案例确定性生成 `ActionPlan`。
4. 页面优先展示 `What to do now`：联系谁、主要诉求、备选诉求、当前证据和不确定性。
5. 用户可按需请求现场、电话、Chat 或邮件话术。LLM 只负责把 `ActionPlan` 改写为
   合适的表达，不得新增权益、金额、政策或事实。
6. 用户粘贴酒店或航司的回复，系统提取承认、原因、拒绝、方案、case number 和
   未回答事项，再由确定性规则生成下一步。

系统应形成持续的 resolution loop，而不是在第一次分析后结束。

## 核心用户场景

### 1. 酒店被 walk / confirmed reservation not honored

示例：
用户是 Marriott Titanium，官网订 Sheraton，到店后酒店说没房，把用户安排到附近更差酒店，没有主动给补偿。

系统应输出：
- 问题类型：hotel_walk
- 官方依据：Marriott Ultimate Reservation Guarantee / Elite Benefit Guarantees
- 相似案例：Marriott walk, Titanium, direct booking
- 建议诉求：附近酒店、交通、cash/points compensation、case number
- 话术：前台现场话术、客服邮件、corporate escalation

### 2. 美国航司可控延误/取消

示例：
用户 United 航班因为 crew issue 取消，被改到第二天，机场不给酒店。

系统应输出：
- 问题类型：airline_cancellation / airline_delay
- 可控性：controllable，与事件类型分开记录
- 官方依据：DOT Airline Cancellation and Delay Dashboard、航司 customer commitment
- 建议诉求：rebooking、hotel、meal voucher、transportation
- 话术：机场柜台话术、customer relations 邮件

### 3. 航司超售 / denied boarding / voluntary bump

示例：
用户遇到 AA oversold，航司询问是否有人愿意自愿改签。

系统应输出：
- 区分 voluntary bump 和 involuntary denied boarding
- 法规或官方规则
- 相似 DP 中的谈判区间
- 谈判策略和话术

### 4. EU261 / UK261 航班延误、取消、missed connection

示例：
用户从 EU 出发，最终目的地晚到 4 小时。

系统应输出：
- 是否可能适用 EU261 / UK261
- care / refund / rerouting / compensation 的区别
- 需要补充的证据
- claim letter 草稿

## 面向用户的输出结构

每次分析只突出一个 `ActionPlan`：

1. 现在联系谁，以及为什么由这个角色处理
2. 一个主要诉求和按顺序排列的备选诉求
3. 当前阶段最重要的 3–5 项证据
4. 首次请求失败后的下一步
5. 仍然影响权益判断的不确定事实
6. 官方政策和已审核社区案例的简洁超链接
7. “告诉我对方怎么回复了”和按需生成话术的入口

完整政策评估、检索分数、相似案例详情和所有脚本属于内部证据/调试视图，不应默认
堆叠在消费者界面。

## 决策与 LLM 的边界

- 事实抽取和 provider feedback 信号抽取可以使用 LLM，并必须有 schema 校验和失败回退。
- 政策适用、联系人、诉求顺序、证据、升级路径和引用来源由服务器确定性生成。
- LLM 可以按渠道、语言和语气生成自然话术，但只能使用 `ActionPlan` 中批准的事实和诉求。
- 未确认的权益必须使用条件表达；社区案例不得表述为官方政策或成功概率。
- 即使 LLM 不可用，系统仍应返回安全的确定性 `ActionPlan` 和模板话术。

## 产品边界

必须避免：
- 承诺用户一定能获得赔偿
- 编造政策、金额、案例或来源
- 把社区 DP 说成官方规则
- 提供诉讼策略或正式法律意见
- 处理人身伤害、重大财产损失、复杂保险理赔等高风险场景

必须强调：
- 官方政策/法规是强依据
- 社区案例/DP 是参考依据
- goodwill request 不保证成功
- 用户应保留证据

"""Build explicitly fictional research fixtures and display materials, no external I/O."""
from pathlib import Path
import argparse, json, html, statistics
ROOT=Path(__file__).resolve().parent
PROJECT=ROOT.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--standalone-only',action='store_true',help='Rebuild this directory without rewriting the main laboratory HTML.')
args=parser.parse_args()
TAG='SIMULATED_NOT_EMPIRICAL'
STATUS_DATE='2026-11-07'
EVIDENCE_INDEX='evidence/upgrade-sepolia-independent-browser-acceptance.json'
VERIFIED_STATUS='截至 2026-11-07，升级版已在 Sepolia 完成两票准入、签发、原子更正、密钥轮换、新密钥实际签发、停用及紧急撤销。独立 IAB 标签页未连接钱包，已保存原版被替代、更正版紧急撤销、epoch=2 凭证有效的三份报告与截图；三份内容均匹配、机构均停用。'
EVIDENCE_BOUNDARY='三个治理账户来自同一本机 MetaMask，不代表三家独立机构；IAB 与复核使用同一 PublicNode RPC。技术截图不代替团队现场材料，现实身份、学校审批及真实访谈仍未完成。以下案例预设、访谈、工时、对照模型与角色分工仍为模拟。'
def dump(name,data):
 (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def esc(s):return html.escape(str(s))
def item(id,**kw):return dict(id=id,data_origin=TAG,**kw)
# Each pair varies the same scenario. These are authored expected outcomes, not observed runs.
groups=[
 ('正常有效凭证', [('竞赛证书首次提交','来源受信、内容未改、状态有效','来源/完整性/状态通过；持有人未验证；学校未审批'),('技能证书换浏览器导入','结构相同，JSON 字段重排','规范化后承诺一致；身份和学校审批仍未完成')]),
 ('偷偷修改字段', [('修改奖项等级','一等奖改为特等奖，保留原承诺','完整性不匹配，拒绝技术通过'),('替换随机盐','原内容不改，只替换盐','完整性不匹配，拒绝技术通过')]),
 ('冒充签发机构', [('未授权地址签发','DEMO-OUTSIDER 直接请求 issue','合约应拒绝；不能以自述名称授信'),('替换成陌生合约','包中 registryAddress 指向 DEMO-FAKE','可信配置校验应拒绝导入')]),
 ('冒用他人凭证', [('他人持有有效凭证包','虚构学生乙出示虚构学生甲的包','前三项技术检查可通过；持有人仍未验证'),('转发已过期授权','出示材料内宣称授权已过期','当前 Chain 不实现出示授权验证；不得声称已自动阻止冒用')]),
 ('证书已被撤销', [('原包撤销后复查','内容不变；记录 revoked=true','完整性匹配、状态已撤销、技术不通过'),('重复撤销同一记录','原签发方再次请求 revoke','合约应回退；原摘要与历史保持')]),
 ('证书真实却不认定', [('等级不在目录内','校级参与奖，前三项有效','技术可通过；演示目录不匹配，不等于最终审批'),('接收学校规则不同','虚构 A 校目录接受，虚构 B 校目录不接受','技术事实不变；不同学校独立认定，规则切换仅设计示例')]),
 ('扫描件重新保存', [('同一图像重新压缩','语义未改但文件字节改变','文件哈希不同；不能仅据此认定伪造'),('水印或排版变化','重新导出文件且未改变所述奖项','转人工核对；若结构化 payload 改变则另按承诺规则核验')]),
 ('状态服务离线', [('RPC 读取超时','未获得可信最新记录','显示无法确认/待复核，不默认通过'),('缓存超过新鲜度','保留旧的有效报告但查询失败','不得显示最新有效；旧报告只代表历史时点')])]
cases=[]
for g,(category,variants) in enumerate(groups,1):
 for j,(name,trigger,outcome) in enumerate(variants):
  cases.append(item(f'SIM-{g:02d}{"AB"[j]}',category=category,variant=name,fixture=trigger,credential_id=f'DEMO-CASE-{g:02d}{"AB"[j]}',expected=outcome,display_result=outcome,execution='未执行；展示结论由场景规则预设',holder='未验证',school='未实际审批',empirical_pass=None))
extensions=[]
for i,(name,behavior,status) in enumerate([
 ('凭证过期','已登记但当前时间超过 validUntil，应显示已过期','现有协议可判断；本条为模拟样例'),
 ('授权机构误签','来源、承诺、状态可能都正常，但现实奖项错误','现有技术检查不能判断事实真假'),
 ('签发密钥轮换','保留旧签发历史，限制旧密钥新写入','基础版未支持；升级版已在 Sepolia 执行轮换，旧密钥签发 eth_call 被拒，新密钥已另行实际签发 epoch=2 凭证'),
 ('签发密钥失陷','隔离泄露密钥并按人工核实处置受影响记录','升级版已在 Sepolia 完成停用与 2/3 阈值紧急撤销；这验证技术处置路径，不是发生过真实私钥泄露'),
 ('证书更正','撤销旧 ID、签发新 ID、建立版本关联','升级版已在 Sepolia 实际完成原子更正，核验旧/新记录双向关联；本条模拟案例未另行执行'),
 ('持有人挑战重放','校验随机挑战、接收方、用途、期限和唯一性','持有人挑战与重放绑定尚未实现，本条为设计演示'),
 ('RPC 返回异常枚举','异常结果不得回退为有效','本地错误处理已测试；本条为模拟样例'),
 ('2/3 阈值准入','三个治理账户中两个批准机构准入，普通签发仍由当前机构密钥负责','升级版已在 Sepolia 完成两票准入；三个账户来自同一本机 MetaMask，不是三家现实机构')],1):extensions.append(item(f'EXT-{i:02d}',scenario=name,expected=behavior,implementation=status,execution='未执行的模拟扩展场景；已完成的技术测试另有独立回执证据'))
# 15 fictional scripts, not recruited participants or interview evidence.
profiles=[
 ('A','持证学生','虚构学校甲','跨校','竞赛','官方名单可直接查到，提交一次即完成。',5,15,1,'无明显痛点','现有查询已足够'),
 ('A','持证学生','虚构学校乙','跨校','技能','重复提交扫描件，希望保留可复查的结果。',12,120,2,'重复提交','结果复用'),
 ('A','持证学生','虚构学校甲','非跨校','技能','校内流程顺利，没有外校办理经历。',6,20,1,'无跨校经历','不能作为跨校痛点证据'),
 ('A','持证学生','虚构学校乙','跨校','竞赛','团队成员名称不同，需要补一份说明。',18,360,3,'身份/成员差异','持有人核对'),
 ('A','持证学生','虚构学校甲','跨校','技能','接受限定用途，但担心材料被长期保存。',9,60,1,'隐私顾虑','最小化披露'),
 ('A','持证学生','虚构学校乙','跨校','竞赛','获奖可查，但接收学校不认定该等级。',10,180,2,'规则不匹配','认定规则分离'),
 ('B','高校审核员','虚构学校甲','跨校','竞赛','有官方入口时很快，疑难材料仍需询证。',8,30,1,'常规顺利','保留人工复核'),
 ('B','高校审核员','虚构学校乙','跨校','技能','来源查不到只能待补充，不能直接判为假证。',20,480,2,'状态不确定','失败关闭'),
 ('B','高校审核员','虚构学校甲','跨校','竞赛','另一校认定可参考，但本校规则要重新判断。',12,90,1,'规则差异','独立审批'),
 ('B','高校审核员','虚构学校乙','跨校','技能','担心钱包培训和服务维护增加工作量。',15,120,2,'接入负担','采用条件未确定'),
 ('C','带队教师','虚构学校甲','跨校','竞赛','我能协助查名单，但不能代表主办方撤销证书。',14,240,2,'职责边界','需正式签发方确认'),
 ('C','指导教师','虚构学校乙','非跨校','技能','仅了解教学和推荐，不了解正式发证权限。',7,60,1,'权限不清楚','不能证明签发权限'),
 ('C','带队教师','虚构学校乙','跨校','竞赛','名单更正后，希望接收学校收到通知。',22,720,3,'更正通知','版本与通知机制'),
 ('D','证书管理岗位（补充虚构角色）','虚构机构丙','跨校','竞赛','假设经双人核实后，由指定岗位发证或撤销。',16,180,2,'签发准入','岗位授权流程是假设'),
 ('D','证书管理岗位（补充虚构角色）','虚构机构丁','跨校','技能','假设密钥失陷时先停止写入，再核对受影响记录。',25,1440,3,'紧急处置','需隔离泄露密钥、核实影响范围并按正式授权处置；本台词不证明真实岗位需求')]
interviews=[]
for i,(group,role,org,scope,typ,line,active,wait,rounds,code,need) in enumerate(profiles,1):
 interviews.append(item(f'SIM-INT-{i:02d}',group=group,role=role,organization=org,experience=scope,credential_type=typ,session='虚构排练场次 D'+str(1+(i-1)//5),duration_min=25+(i%6),consent='不适用：未招募、未访谈、未录音',script=line,script_label='AI 编写的虚构角色台词，非受访者原话',active_minutes=active,waiting_minutes=wait,submission_rounds=rounds,measurement_basis='人工设定的模拟值，非日志或回忆测量',coding=code,need=need,evidence_strength='模拟，无现实证据效力'))
process=[]
for i,(step,owner,active,wait,output) in enumerate([
 ('准备与提交','虚构学生',8,0,'凭证包/附件与用途说明'),('来源查询','虚构审核员',4,2,'官方来源或可信记录查询'),('持有人核实','虚构审核员',5,10,'独立身份核对记录'),('异常询证','虚构签发管理岗',12,240,'补充材料或待复核结论'),('状态复查','虚构审核员',3,1,'带时间和区块的状态记录'),('校内认定','虚构接收学校',6,60,'按本校规则作认定'),('结果留痕与通知','虚构审核员',2,0,'结论、理由与申诉入口')],1):process.append(item(f'SIM-FLOW-{i:02d}',step=step,owner=owner,active_minutes=active,waiting_minutes=wait,output=output,assumption='示例含异常询证；步骤顺序相加，非所有材料必经'))
# Paired timing assumptions: the same tasks and frontend rules for signed-central vs chain.
base=[5,6,9,9,12,11,15,16,8,10,9,12,13,14,18,18]
paired=[]
methods=[('manual','现有人工渠道',1.0,30),('central','统一签名中心化',0.65,60),('chain','链上登记查询',0.65,150)]
for ci,c in enumerate(cases):
 for key,label,factor,setup in methods:
  active=round(base[ci]*factor,2);waiting=(10+ci%4*15) if key=='manual' else (2+ci%3)
  if c['category']=='状态服务离线':waiting=30 # Both structured backends fail closed for unavailable reads.
  if key=='chain' and ci in [0,8]:waiting+=0.2 # Illustrative confirmation overhead, not a measured latency.
  paired.append(item(c['id']+'-'+key,case_id=c['id'],method=key,method_label=label,active_minutes=active,waiting_minutes=waiting,measurement='假设参数公式计算；未运行三后端对照',conclusion=c['expected']))
summary=[]
for key,label,factor,setup in methods:
 vals=[x for x in paired if x['method']==key];active=round(sum(x['active_minutes'] for x in vals),2)
 summary.append(item('MODEL-'+key,method=key,label=label,tasks=16,total_active_minutes=active,total_waiting_minutes=round(sum(x['waiting_minutes'] for x in vals),2),period_fixed_minutes=setup,model_period_total_active_minutes=round(active+setup,2)))
model=dict(data_origin=TAG,formula='单件主动工时 = base_minutes[case] × method_factor；周期主动工时 = 单件工时之和 + 周期固定工时；等待时间单列，不并入主动工时。',base_minutes=base,factors={'manual':1,'central':0.65,'chain':0.65},fixed_minutes={'manual':30,'central':60,'chain':150},waiting_rule='人工 10+(案例索引 mod 4)×15 分钟；结构化两后端 2+(索引 mod 3) 分钟；离线案例均设 30 分钟；链上案例索引 0 与 8 额外设 0.2 分钟。均为假设。',fairness='中心化与链上设同一前端、身份要求、错误处理、签发授权、签名/认证、日志与备份能力；仅状态后端与固定维护负担不同。',interpretation='模型故意保留链上不占优结果。任何节省比例仅来自假设，不能解释为实测提升。未知人工误判率、真实采用率、链上费用均不估计为事实。',summary=summary,paired=paired)
governance=[
 item('GOV-01',topic='节点',rule='方案假设：虚构学校甲、乙与签发机构协作。现有 Sepolia 由公共网络维护，机构只是合约用户。',current='公共测试网合约已部署；没有自建联盟链验证节点',pending='机构是否愿意共同运营需访谈'),
 item('GOV-02',topic='准入',rule='模拟流程：提交机构资格→线下核实岗位授权→确认公开地址→治理提案与批准→保留授权记录。',current='升级版已在 Sepolia 完成机构编号与密钥准入；合约不验证真实机构资质',pending='资格材料与正式发证岗位均未取得'),
 item('GOV-03',topic='权限',rule='模拟责任：治理成员管理准入与密钥；机构签发/撤销自己的记录；学校只读核验并独立认定。',current='升级版已在 Sepolia 验证 2/3 阈值准入、轮换、停用及紧急撤销；三个治理账户属于同一本机 MetaMask',pending='三家独立机构参与和真实制度审批均未完成'),
 item('GOV-04',topic='纠错',rule='模拟流程：核实误签→原子更正→检查新旧版本关联→通知接收方。',current='升级版已在 Sepolia 完成原子更正与双向版本关联；自动通知未实现',pending='错误责任和处理时限是假设'),
 item('GOV-05',topic='仲裁',rule='模拟流程：签发事实由签发方核查；校内认定由接收学校申诉程序处理；跨方争议依另行约定。',current='系统不自动裁决事实和权利',pending='没有真实校际协议或仲裁承诺')]
team=[item('TEAM-'+str(i+1),member='模拟成员'+name,role=role,planned_hours=hours,status='仅排练角色分配；不是实际工作量或完成记录') for i,(name,role,hours) in enumerate([('甲','需求访谈、流程整理',8),('乙','前端讲解、16 项案例组织',10),('丙','合约、钱包操作与回执说明',10),('丁','截图取证、汇报与归档',8)])]
qa=[]
for i,(q,a) in enumerate([
 ('为什么需要区块链？','当参与方不愿由单一运营者独占状态记录时，共享可复查登记可能有价值；现有渠道足够时不必新增链。模拟耗时不能证明链优于中心化。'),
 ('网页里的数据是真实调研吗？','模拟研究页的访谈、工时和结果均为人工构造；真实链上交易另有回执文件，不能混用。'),
 ('现在是真实上链还是本地模拟？','基础版与升级版均有各自的 Sepolia 部署和回执；升级版核心业务链路已实际执行。离线教学页与本模拟研究页不发送交易，预设实验仍是模拟。'),
 ('两家机构是否真实参与？','基础版两测试地址验证了权限隔离；升级版由同一本机 MetaMask 的三个账户演示 2/3 阈值治理，均不证明现实机构正式接入。'),
 ('有效凭证是否证明本人持有？','不能。当前没有完成独立身份绑定和挑战签名，因此显示持有人未验证。'),
 ('链上有效是否必须获学校认可？','不是。技术核验与接收学校规则、正式审批分别处理。'),
 ('有授权的机构录入错误怎么办？','技术检查可能通过；需要源头复核、撤销、更正和争议处理。链不能自行判断事实。'),
 ('撤销是否删除了数据？','不删除历史。原承诺和事件仍可查，新的查询会读取撤销状态。'),
 ('私钥丢失或泄露怎么办？','升级版已在 Sepolia 实际验证密钥轮换、停用和两票紧急撤销；现实事故仍需核实影响范围和正式岗位授权。测试没有发生真实私钥泄露，也不证明三方机构参与。'),
 ('模拟材料能算完成验收吗？','只能用于排版、排练与需求讨论。真实访谈、成员截图和现场问答仍需要实际完成。')],1):qa.append(item(f'QA-{i:02d}',question=q,answer=a))
coverage=[
 item('GAP-01',gap='技术截图与团队现场材料',filler='../'+EVIDENCE_INDEX,coverage='主网页已改用 3 张真实 Sepolia 独立浏览器技术截图；8 张模拟图保留为历史排练材料',actual_acceptance='技术报告与截图已保存；团队现场及参与者材料仍未完成'),
 item('GAP-02',gap='利益相关方访谈',filler='模拟访谈.json',coverage='15 段虚构角色脚本：学生6、审核员4、教师3、签发管理岗2',actual_acceptance='没有实际招募或访谈'),
 item('GAP-03',gap='现行流程与耗时',filler='模拟流程.json',coverage='7 步流程；主动工时与等待时间分列',actual_acceptance='非现实学校流程'),
 item('GAP-04',gap='签发岗位与准入依据',filler='模拟治理.json',coverage='5 项治理假设与 D 类虚构管理岗位补充',actual_acceptance='没有真实机构授权证明'),
 item('GAP-05',gap='8 类 × 2 变体实验',filler='模拟案例.json',coverage='16 条场景与预设展示结论',actual_acceptance='不是16项实测实验报告'),
 item('GAP-06',gap='过期、误签、轮换等扩展',filler='模拟扩展场景.json',coverage='8 条模拟扩展场景；当前能力说明已对照 Sepolia 实测证据更新',actual_acceptance='轮换、更正、停用、紧急撤销另有实测证据；本表预设场景未逐项运行，持有人挑战等仍未实现'),
 item('GAP-07',gap='公平比较与成本',filler='模拟对照模型.json',coverage='16任务 × 3方案 = 48条假设记录，公式可复算',actual_acceptance='没有三后端实测基准'),
 item('GAP-08',gap='分工、演示与问答',filler='模拟分工与答辩.json',coverage='4个排练角色、10条问答、AI说明',actual_acceptance='实际成员姓名和工作量待记录')]
team_doc={'data_origin':TAG,'members':team,'qa':qa,'ai_statement':{'known_assistance':'AI 已协助实现代码、测试、证据整理及模拟材料；用户完成钱包最终确认。','simulated_content':'本目录全部访谈、角色分配、耗时、对照输出是模拟材料。','not_claimed':'未代替团队真实访谈、现场取证、真实成员贡献或学校认定。'}}
for name,value in [('模拟案例.json',cases),('模拟扩展场景.json',extensions),('模拟访谈.json',interviews),('模拟流程.json',process),('模拟对照模型.json',model),('模拟治理.json',governance),('模拟分工与答辩.json',team_doc),('缺口填充索引.json',coverage)]:dump(name,value)
# Basic consistency checks over the generated fixtures; no claims of experimental validation.
assert len(cases)==16 and len({c['id'] for c in cases})==16
assert all(sum(c['category']==g for c in cases)==2 for g,_ in groups)
assert len(interviews)==15 and len(paired)==48 and len(extensions)==8
assert summary[1]['total_active_minutes']==summary[2]['total_active_minutes']
assert summary[2]['model_period_total_active_minutes']-summary[1]['model_period_total_active_minutes']==90
assert all(c['empirical_pass'] is None for c in cases)
# Markdown record suitable for the existing repository documentation workflow.
md='# ProofPass 模拟研究与验收材料\n\n**案例、访谈、工时、对照输出与角色分工为模拟数据或设计假设，不是实际调研、实测性能或团队现场证据。初版：2026-11-05；实现状态更新：'+STATUS_DATE+'。**\n\n模拟材料不改变真实证据和验收状态；不包含真实受访者姓名、联系方式、私钥或真实机构背书。\n\n## 已有真实技术证据（与模拟研究分开）\n\n'+VERIFIED_STATUS+'\n\n'+EVIDENCE_BOUNDARY+'\n\n[三报告、截图与固定区块 RPC 复核索引](../'+EVIDENCE_INDEX+')。这些已保存证据说明实现状态，不把下面的预设场景改记为实测。\n\n## 缺口覆盖\n\n'
for c in coverage:md+=f'- **{c["gap"]}**：{c["coverage"]}。边界：{c["actual_acceptance"]}。\n'
md+='\n## 16 项核心合成任务（预设结论，未实际运行）\n\n| 编号 | 类别/变体 | 构造条件 | 预设展示结论 |\n|---|---|---|---|\n'
for c in cases:md+=f'| {c["id"]} | {c["category"]} / {c["variant"]} | {c["fixture"]} | {c["expected"]} |\n'
md+='\n## 扩展场景（含未实现能力）\n\n'
for c in extensions:md+=f'- {c["id"]} **{c["scenario"]}**：{c["expected"]}。当前：{c["implementation"]}。\n'
md+='\n## 虚构访谈脚本\n\n样本仅是 15 个编排角色，不是受访者样本量。A/B/C/D 数量为 6/4/3/2；D 是为签发岗位讨论额外补的虚构角色。录音、参与、引用同意均为不适用；没有访谈录音、签名或逐字稿。相反观点和无痛点案例有意保留，不能据此统计真实采用意愿或问题发生率。\n'
for c in interviews:md+=f'\n### {c["id"]} · {c["role"]} · {c["organization"]}\n\n虚构经历：{c["experience"]} / {c["credential_type"]}；排练场次：{c["session"]}；模拟时长 {c["duration_min"]} 分钟。\n\n**虚构台词，非受访者原话：** {c["script"]}\n\n假设主动工时 {c["active_minutes"]} 分钟、等待 {c["waiting_minutes"]} 分钟、提交 {c["submission_rounds"]} 轮。编码：{c["coding"]}；需求：{c["need"]}。\n'
md+='\n## 模拟流程与时间\n\n此例含异常询证；按顺序相加只是演示，不能当常规件平均。\n\n| 步骤 | 虚构责任人 | 主动分钟 | 等待分钟 | 输出 |\n|---|---|---:|---:|---|\n'
for c in process:md+=f'| {c["step"]} | {c["owner"]} | {c["active_minutes"]} | {c["waiting_minutes"]} | {c["output"]} |\n'
md+=f'\n该例主动工时合计 {sum(c["active_minutes"] for c in process)} 分钟，顺序等待合计 {sum(c["waiting_minutes"] for c in process)} 分钟。\n'
md+='\n## 公平对照参数模型（非性能测试）\n\n'+model['formula']+'\n\n'+model['fairness']+'\n\n'+model['waiting_rule']+'\n\n'+model['interpretation']+'\n\n| 方案 | 16任务主动分钟 | 等待分钟（单列） | 周期固定分钟 | 周期主动总分钟 |\n|---|---:|---:|---:|---:|\n'
for c in summary:md+=f'| {c["label"]} | {c["total_active_minutes"]} | {c["total_waiting_minutes"]} | {c["period_fixed_minutes"]} | {c["model_period_total_active_minutes"]} |\n'
md+='\n以上没有随机抽样、置信区间或误判率估计；同一假设下链上比中心化多 90 分钟固定工时，并不意味着现实中必然如此。全部 48 条配对记录与参数保存在 JSON，可复算。\n\n## 模拟治理规则\n'
for c in governance:md+=f'\n### {c["topic"]}\n\n{c["rule"]}\n\n当前：{c["current"]}。待核实：{c["pending"]}。\n'
md+='\n## 模拟分工与 AI 说明\n\n'
for c in team:md+=f'- {c["member"]}：{c["role"]}；假设计划 {c["planned_hours"]} 小时，非实际投入。\n'
for k,v in team_doc['ai_statement'].items():md+='\n'+v+'\n'
md+='\n## 5 分钟排练顺序\n\n0:00–0:30 解释模拟资料与真实证据的区别；0:30–1:30 演示签发与独立核验；1:30–2:15 展示篡改与状态不确定；2:15–3:00 撤销复查与机构隔离；3:00–4:00 讨论虚构访谈及公平对照；4:00–5:00 说明未实现功能与待真实取证事项。\n\n## 答辩问答\n'
for c in qa:md+=f'\n**{c["question"]}**\n\n{c["answer"]}\n'
md+='\n## 后续替换\n\n真实调研时用新记录替换模拟脚本，保留来源、日期、同意范围与原话位置；真实实验应另存输入、工具版本、执行日志及观察结果，不能把 expected 字段改名为 observed。已保存的测试网技术截图与团队现场材料分开，后者仍需实际产生；尚未完成的功能需实现及测试后才能修改能力状态。\n'
(ROOT/'模拟研究材料汇编.md').write_text(md)
# Shared HTML fragment; inline to remain available in a double-click offline page.
def table(headers,rows):return '<div class="sr-table-wrap" tabindex="0" aria-label="可横向滚动的数据表"><table><thead><tr>'+''.join('<th>'+esc(x)+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'
def details(title,content,opened=False):return '<details'+(' open' if opened else '')+'><summary>'+esc(title)+'</summary>'+content+'</details>'
css='''.sr{color:#ebf7fa;line-height:1.75}.sr .sr-banner{border-left:4px solid #f3bd7d;background:#302b25;padding:16px 20px;color:#ffe3b9;margin:16px 0}.sr .sr-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}.sr .sr-stat{border:1px solid #385368;padding:18px;border-radius:12px;background:#102334}.sr .sr-stat b{font-size:32px;display:block;color:#76e6cb}.sr .sr-stat span{font-size:13px;color:#b3c9d5}.sr details{border:1px solid #385368;border-radius:12px;margin:16px 0;padding:16px 20px;background:#102132}.sr details details{background:#0d1b29;margin:10px 0}.sr summary{cursor:pointer;font-size:17px;font-weight:700;line-height:1.7}.sr h4{font-size:16px;margin:18px 0 8px}.sr p{color:#baceD6;line-height:1.8;overflow-wrap:anywhere}.sr .sr-table-wrap{overflow-x:auto;margin:18px 0;border:1px solid #304859;border-radius:9px}.sr table{border-collapse:collapse;min-width:680px;width:100%;font-size:13px;text-align:left}.sr th,.sr td{padding:13px 15px;border-bottom:1px solid #304859;vertical-align:top}.sr th{color:#8ce6ca;background:#102d36}.sr td{color:#c4d7df;min-width:100px}.sr .sr-links{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.sr a{color:#8ce6ca}.sr .sr-label{color:#ffd69b;font-size:12px}.sr :focus-visible{outline:2px solid #76e6cb;outline-offset:4px}@media(max-width:750px){.sr .sr-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.sr details{padding:12px}.sr .sr-stat{padding:12px}.sr summary{font-size:15px}}'''
fragment='<div class="sr"><h3>模拟研究资料 · 补全展示与排练</h3><div class="sr-banner"><strong>所有新增访谈、工时、案例结论与分工均为模拟。</strong><br>可用于讨论和排练，不构成实际调研或实验结果。真实链上证据和完整验收状态没有被这些数据替代。</div><div class="sr-stats">'+''.join(f'<div class="sr-stat"><b>{v}</b><span>{label}</span></div>' for v,label in [(16,'核心合成任务 / 8类×2'),(8,'扩展设计场景'),(15,'虚构访谈角色'),(48,'对照模型记录 / 16×3')])+'</div>'
fragment+=details('已有真实技术证据 · 2026-11-07','<p>'+esc(VERIFIED_STATUS)+'</p><p>'+esc(EVIDENCE_BOUNDARY)+'</p><p><a href="__PROJECT_PREFIX__'+EVIDENCE_INDEX+'">查看三报告、截图与固定区块复核索引 →</a></p>')
fragment+=details('01 · 16 项核心案例与预设结论','<p>下面是场景预设，不是已执行实验；技术通过、身份核实与学校审批分别说明。</p>'+table(['编号','类别 / 变体','构造条件','预设展示结论'],[[c['id'],c['category']+' / '+c['variant'],c['fixture'],c['expected']] for c in cases]),True)
fragment+=details('02 · 8 项扩展场景与能力边界',table(['编号','场景','期望行为','当前实现边界'],[[c['id'],c['scenario'],c['expected'],c['implementation']] for c in extensions]))
interviewhtml='<p>角色构成：学生 6、审核员 4、教师 3、签发管理岗 2。没有实际招募、录音或同意记录；以下是虚构台词，非受访者引语。</p>'
for c in interviews:
 interviewhtml+=details(c['id']+' · '+c['role']+' · '+c['experience'],f'<p class="sr-label">虚构脚本 / 无现实证据效力</p><p>{esc(c["script"])}</p><p>假设主动工时 {c["active_minutes"]} 分钟；等待 {c["waiting_minutes"]} 分钟；提交 {c["submission_rounds"]} 轮。编码：{esc(c["coding"])}。需求：{esc(c["need"])}。</p>')
fragment+=details('03 · 虚构访谈脚本与相反观点',interviewhtml)
fragment+=details('04 · 模拟流程与公平对照模型','<p>流程样例含异常询证，不能当作常规件平均。主动工时和等待分别计量。</p>'+table(['流程','虚构责任人','主动分钟','等待分钟'],[[c['step'],c['owner'],c['active_minutes'],c['waiting_minutes']] for c in process])+'<h4>相同任务、相同规则，比较后端假设</h4><p>'+esc(model['fairness'])+'</p>'+table(['方案','任务主动分钟','等待分钟','固定分钟','周期主动总分钟'],[[c['label'],c['total_active_minutes'],c['total_waiting_minutes'],c['period_fixed_minutes'],c['model_period_total_active_minutes']] for c in summary])+'<p>公式：周期主动总工时 = 16 项任务主动工时之和 + 固定工时。中心化与链上使用相同单件工时因子 0.65；固定工时假设为 60 与 150 分钟。这里链上多 90 分钟，不构成实测结论。</p><p>'+esc(model['interpretation'])+'</p>')
fragment+=details('05 · 准入、权限、纠错与仲裁假设',table(['主题','模拟规则','当前能力 / 待核实'],[[c['topic'],c['rule'],c['current']+'；'+c['pending']] for c in governance]))
fragment+=details('06 · 排练分工、AI 说明与答辩','<p>角色名与计划投入均为虚构；实际成员分工另行记录。</p>'+table(['模拟角色','职责','假设计划小时'],[[c['member'],c['role'],c['planned_hours']] for c in team])+'<p>'+esc(' '.join(team_doc['ai_statement'].values()))+'</p>'+''.join(details(c['question'],'<p>'+esc(c['answer'])+'</p>') for c in qa))
fragment+=details('07 · 缺口覆盖与真实验收边界',table(['缺口','展示资料 / 模拟填充','实际状态'],[[c['gap'],c['coverage'],c['actual_acceptance']] for c in coverage]))
links=[('模拟研究材料汇编.md','下载汇编与讲解词'),('模拟案例.json','16项案例数据'),('模拟访谈.json','虚构访谈数据'),('模拟对照模型.json','48条模型数据'),('缺口填充索引.json','缺口索引')]
fragment+='<div class="sr-links">'+''.join(f'<a href="__PREFIX__{f}" download>{label}</a>' for f,label in links)+'</div></div>'
(ROOT/'index.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ProofPass · 模拟研究资料</title><style>body{margin:0;background:#09111d;color:#ebf7fa;font-family:system-ui,"PingFang SC",sans-serif}main{max-width:1180px;margin:auto;padding:30px 24px}h1{font-size:32px}header{border-bottom:1px solid #385368;padding-bottom:20px}'+css+'</style><main><header><h1>ProofPass / 模拟研究资料</h1><p>人工编排的演示样例 · 初版 2026-11-05 / 能力状态更新 '+STATUS_DATE+' · 非实际调研与团队现场证据</p><a style="color:#8ce6ca" href="../ProofPass_跨校证书核验实验室.html#research-sim">返回实验室 →</a></header>'+fragment.replace('__PREFIX__','').replace('__PROJECT_PREFIX__','../')+'</main></html>')
if not args.standalone_only:
 p=PROJECT/'ProofPass_跨校证书核验实验室.html';s=p.read_text();start='<!-- SIMULATED_RESEARCH_START -->';end='<!-- SIMULATED_RESEARCH_END -->'
 if start in s:s=s[:s.index(start)]+s[s.index(end)+len(end):]
 if 'data-tab="research-sim"' not in s:s=s.replace('<button data-tab="demo-evidence">06 · 演示与取证</button>','<button data-tab="demo-evidence">06 · 演示与取证</button><button data-tab="research-sim">07 · 模拟研究资料</button>')
 s=s.replace('</main><footer',start+'<section class="page" id="research-sim"><style>'+css+'</style>'+fragment.replace('__PREFIX__','simulation-research/').replace('__PROJECT_PREFIX__','')+'</section>'+end+'\n</main><footer',1)
 s=s.replace('if(location.hash==="#demo-evidence")document.querySelector(\'[data-tab="demo-evidence"]\').click();','if(typeof location!=="undefined" && ["#demo-evidence","#research-sim"].includes(location.hash))document.querySelector(\'[data-tab="\'+location.hash.slice(1)+\'"]\').click();')
 p.write_text(s)
(ROOT/'生成校验.json').write_text(json.dumps({'type':'SIMULATED_DATA_CONSISTENCY_ONLY','scope':'These flags describe only the generated research fixtures, not the separately recorded Sepolia tests.','counts':{'core':len(cases),'extended':len(extensions),'fictional_roles':len(interviews),'paired_model_rows':len(paired)},'checks':['unique case ids','two variants per category','48 paired parameter records','central and chain identical variable work','90 minute fixed-cost difference','empirical_pass is null for all cases'],'real_experiments_run':False,'real_interviews_conducted':False,'implementation_status_date':STATUS_DATE,'separate_real_evidence_index':EVIDENCE_INDEX},ensure_ascii=False,indent=2)+'\n')
print('Built labeled synthetic datasets, narrative and standalone page.'+(' Main HTML untouched.' if args.standalone_only else ' Main research tab synchronized.')+' No real acceptance flags changed.')

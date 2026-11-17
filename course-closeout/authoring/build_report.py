from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'course-closeout'
FONT = 'Hiragino Sans GB'

def fonts(run, size=None, bold=None):
    run.font.name = FONT
    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), FONT)
    if size: run.font.size = Pt(size)
    if bold is not None: run.bold = bold
    run.font.color.rgb = RGBColor(0,0,0)

def base():
    d=Document(); sec=d.sections[0]
    sec.page_width=Inches(8.5); sec.page_height=Inches(11)
    sec.top_margin=Inches(.63); sec.bottom_margin=Inches(.63)
    sec.left_margin=Inches(.7); sec.right_margin=Inches(.7)
    sec.footer_distance=Inches(.28)
    for name in ['Normal','Title','Subtitle','Heading 1','Heading 2','Caption']:
        st=d.styles[name];st.font.name=FONT;st.font.color.rgb=RGBColor(0,0,0);st.font.underline=False
        st.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),FONT)
        for el in list(st.element.iter()):
            if el.tag in [qn('w:pBdr'),qn('w:numPr')]:el.getparent().remove(el)
            for attr in list(el.attrib):
                if 'theme' in attr.lower():del el.attrib[attr]
    d.styles['Subtitle'].font.italic=False
    normal=d.styles['Normal'];normal.font.size=Pt(11)
    normal.paragraph_format.line_spacing=Pt(16)
    normal.paragraph_format.space_after=Pt(6)
    for name,size in [('Title',23),('Subtitle',11),('Heading 1',18),('Heading 2',12.5),('Caption',9)]:
        d.styles[name].font.size=Pt(size)
        d.styles[name].paragraph_format.space_after=Pt(6)
        d.styles[name].paragraph_format.line_spacing=Pt(size+5)
    for name in ['Heading 1','Heading 2']:
        d.styles[name].font.bold=True
        d.styles[name].paragraph_format.space_before=Pt(8)
    foot=sec.footer.paragraphs[0];foot.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    r=foot.add_run('ProofPass  ·  ');fonts(r,8)
    field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');foot._p.append(field)
    d.core_properties.author='ProofPass 课程项目组'
    d.core_properties.subject='区块链与创新思维课程结项'
    return d

def p(d, text, style=None):
    par=d.add_paragraph(text,style)
    for r in par.runs:fonts(r)
    return par
def h(d,text,level=2):return d.add_heading(text,level)
def page(d,title):d.add_page_break();h(d,title,1)
def link(par, label, url, size=9):
    rel=par.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True)
    el=OxmlElement('w:hyperlink');el.set(qn('r:id'),rel)
    r=OxmlElement('w:r');pr=OxmlElement('w:rPr')
    f=OxmlElement('w:rFonts');f.set(qn('w:ascii'),FONT);f.set(qn('w:eastAsia'),FONT);pr.append(f)
    z=OxmlElement('w:sz');z.set(qn('w:val'),str(int(size*2)));pr.append(z)
    c=OxmlElement('w:color');c.set(qn('w:val'),'124A67');pr.append(c)
    r.append(pr);t=OxmlElement('w:t');t.text=label;r.append(t);el.append(r);par._p.append(el)
def table(d, headers, rows, widths, size=10):
    tb=d.add_table(rows=1,cols=len(headers));tb.autofit=False;tb.alignment=WD_TABLE_ALIGNMENT.CENTER
    for c,w in zip(tb.columns,widths):c.width=Inches(w)
    for i,t in enumerate(headers):tb.rows[0].cells[i].text=t
    for row in rows:
        cells=tb.add_row().cells
        for i,t in enumerate(row):cells[i].text=str(t)
    for ri,row in enumerate(tb.rows):
        trpr=row._tr.get_or_add_trPr()
        cant=OxmlElement('w:cantSplit');trpr.append(cant)
        if ri==0:
            repeat=OxmlElement('w:tblHeader');trpr.append(repeat)
        for i,cell in enumerate(row.cells):
            cell.width=Inches(widths[i]);cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tcPr=cell._tc.get_or_add_tcPr()
            sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'E2EDF2' if ri==0 else ('F5F8FA' if ri%2==0 else 'FFFFFF'));tcPr.append(sh)
            margins=OxmlElement('w:tcMar')
            for side in ['top','bottom','left','right']:
                a=OxmlElement('w:'+side);a.set(qn('w:w'),'85');a.set(qn('w:type'),'dxa');margins.append(a)
            tcPr.append(margins)
            borders=OxmlElement('w:tcBorders')
            for side in ['top','left','bottom','right']:
                a=OxmlElement('w:'+side);a.set(qn('w:val'),'single');a.set(qn('w:sz'),'4');a.set(qn('w:color'),'D9D9D9');borders.append(a)
            tcPr.append(borders)
            for par in cell.paragraphs:
                par.paragraph_format.space_after=Pt(1);par.paragraph_format.line_spacing=Pt(size+4)
                for r in par.runs:fonts(r,size,ri==0)
    spacer=d.add_paragraph();spacer.paragraph_format.space_after=Pt(0);spacer.paragraph_format.line_spacing=Pt(3)
    return tb

def ref(d,text,path):
    par=d.add_paragraph();par.paragraph_format.space_after=Pt(4)
    link(par,text,path)

d=base()
p(d,'ProofPass 跨校证书核验\n课程结项报告','Title')
p(d,'区块链与创新思维  2026 秋  南京大学','Subtitle')
p(d,'项目组成员与学院专业  ______________________________','Subtitle')
p(d,'技术证据截止日期  2026 年 11 月 7 日','Subtitle')
h(d,'项目结论',1)
p(d,'ProofPass 已完成可运行的证书核验教学原型，以及公共测试网上的签发、撤销、更正和多地址治理验证。它能帮助核对登记内容及状态，却不能仅凭一条链上记录证明获奖事实、持有人身份或学校认可。是否需要多方账本，仍取决于真实机构之间的责任分配与协作需求。')
p(d,'项目聚焦竞赛获奖与技能证书跨校提交。审核要分别回答文件是否变化、来源是否可信、状态是否有效、是否属于提交者、是否符合接收方规则。我们将这些判断分开展示，避免把“哈希相同”或“交易成功”当作完整业务通过。')
h(d,'已形成的成果')
table(d,['成果','已具备的能力','证据边界'],[
('离线教学原型','单文件 HTML；本地 SHA-256、时间记录、文件比对与签名案例','浏览器本地教学，不是公共账本'),
('基础测试网版','29 行合约；授权、签发、撤销及跨地址记录隔离','符合短合约演示范围；虚构凭证'),
('治理扩展版','三地址两票准入、轮换、停用与指定凭证紧急撤销','公共测试网实测；不等于三家真实机构'),
('可追溯证据','交易回执、固定区块查询、3 份独立浏览器报告及截图','历史技术快照；不替代团队现场调查')],[1.2,3,2.9])
h(d,'结项判断')
p(d,'技术原型已具备课程展示条件。真实访谈、校园现场材料和成员实际工作由团队补录；三流程效率对比尚无真实参与者结果。因此本报告支持“技术机制可演示”，不主张已经实现跨校互认或证明区块链比中心化方案更高效。')

page(d,'一  业务场景与现场调查')
p(d,'选题申报书将重复提交、渠道切换和跨机构等待列为待验证痛点，而非已测定的事实。竞赛应按主办方和届次核对获奖依据，技能证书应按证书类别核对适用查询渠道，不能把所有证书混成同一审核规则。')
h(d,'待现场核对的流程')
p(d,'学生提交材料 → 接收学校检查完整性 → 查询主办方或评价机构 → 疑点询证与补件 → 核对校内认定规则 → 留存结论。此流程是访谈工作底图；请团队用实际观察修订步骤、责任人和信息断点。')
table(d,['核对位置','需要取得的事实','建议记录口径'],[
('材料准备','最近一次提交、补交了哪些材料','主动操作分钟数、补件轮数'),
('来源核验','查哪个权威渠道、谁可以确认结果','查询次数、渠道切换次数'),
('疑点处理','何时需要联系签发方、由谁承担等待','主动处理与自然等待分开'),
('学校认定','真实证书仍可能不被认可的具体规则','规则来源、人工结论和理由')],[1.05,3.15,2.9])
h(d,'三类真实访谈记录')
p(d,'按课程要求，至少覆盖管理者、使用者、被影响者各一位真实对象。请填写匿名编号、身份说明、时间地点、同意方式、关键原话及材料位置；不用填写无关姓名、证件号等个人信息。')
table(d,['对象角色','团队填写事实与附件编号'],[
('管理者或审核人员','匿名编号：________  时间地点：________________\n主要发现与原始记录：________________________'),
('使用者或持证学生','匿名编号：________  时间地点：________________\n主要发现与原始记录：________________________'),
('被影响者或签发方','匿名编号：________  时间地点：________________\n主要发现与原始记录：________________________')],[1.65,5.45])
p(d,'实际业务量：________；典型每件处理时间：________；样本数及采样期间：________；口径与数据来源：________________。若没有测量，应明确写“未测量”。')
p(d,'已有模拟研究页中的 15 段访谈和 48 条三方案记录用于排练与模型展示，不属于以上真实访谈或效率测量。团队应保留知情同意、脱敏记录和本校现场材料，另附于课程报告。')

page(d,'二  技术必要性与方案选择')
p(d,'统一字段、数字签名与状态接口首先解决格式和流程问题；区块链额外提供共享的事件顺序与可追溯记录。只有多个主体确实需要共同约束写入权限、纠错和争议处置，且愿意承担协作成本时，共同维护账本才有进一步论证价值。')
table(d,['方案','适用条件','优势与额外负担','当前验证程度'],[
('现行渠道核验','已有权威查询或可询证机构','沿用现有责任；跨渠道与等待成本需实测','流程待真实访谈校准'),
('中心化签名登记','各方接受统一管理者','部署和维护较简单；需明确管理权与审计机制','方案及模型对照，未实现同前端后端'),
('多方共享账本','多主体有共同记账和治理需求','可共同约束状态变更；增加密钥、治理与节点成本','Sepolia 上完成应用层治理测试')],[1.15,1.55,2.55,1.85])
h(d,'采用测试网的理由')
p(d,'Sepolia 提供公开可查询的测试环境，使不同浏览器能读取同一登记结果。它适合展示真实签名交易、回执和状态变化。项目未部署由学校共同运行的联盟链节点，三地址投票也只是应用层权限机制，不能据此宣称已经建立真实跨校联盟。[2]')
h(d,'区块链不能替代的环节')
p(d,'签发机构仍须依据真实获奖或评价记录出具凭证；接收学校仍须审核持有人及用途。错误事实可以被准确地登记，权限正确的地址也可能录入错误信息。W3C 的凭证模型区分签发者、持有者和核验者，本项目借用该角色划分解释责任，不宣称自定义 v3 包已符合完整 W3C 标准。[1]')
h(d,'有条件的结论')
p(d,'若真实调查显示一个权威机构即可满足查询、纠错和审计要求，应优先比较中心化方案；只有共享治理带来的收益足以覆盖新增成本，才支持进一步试行多方账本。目前缺少同一前端、等价任务和真实参与者的三方案对照，无法给出效率提升比例。')
p(d,'上线决策应另行核对：真实机构准入依据、学校规则、责任协议、密钥保管、可用性和维护成本。课程原型的成功证明了若干技术步骤可执行，并不自动证明组织合作会成立。')

page(d,'三  最小数据与治理设计')
p(d,'v3 凭证的标题、holderRef、随机盐等保存在链下包中；链上保存承诺值、随机编号、机构编号、签发地址、有效期、密钥版本，以及更正和撤销的状态关联。姓名、证件号和完整证书不作为链上字段。链下包仍可能含个人信息，持有人引用也不等于身份认证。')
h(d,'承诺计算与查询')
p(d,'承诺值由固定前缀 ProofPass:v3:、32 字节随机盐和规范化 payload 拼接后计算 SHA-256。网络、合约地址和签发信息都被覆盖；导入时先校验站点固定配置和字段，再读取同一区块的机构及凭证状态。文件字节比对与结构化包校验用途不同，不能混称。')
table(d,['治理要素','原型实现','现实落地仍需明确'],[
('节点','使用 Sepolia 与只读 RPC；本机不运行学校联盟节点','哪些机构运行节点及维护成本'),
('权限','机构当前密钥可签发；治理固定 3 地址、阈值 2','机构身份与地址的线下绑定、密钥保管'),
('纠错','原子更正关联新旧记录；撤销保留历史','错误发现、复核与通知责任'),
('准入','治理提案两票后执行；一票或重复投票被约束','准入材料、审查标准及退出协议'),
('仲裁','治理可停用机构、紧急撤销指定凭证并留原因摘要','争议调查、申诉渠道与责任追究')],[.8,3.35,2.95])
h(d,'权限变化的具体含义')
p(d,'轮换改变后续签发密钥并增加 epoch，机构编号保持稳定，旧凭证保留当时签发者。停用阻止后续签发、撤销及更正，但不批量撤销历史记录。紧急撤销需另立提案，只作用于指定凭证。任何治理地址可取消待执行提案，安全性优先的设计也可能降低可用性。')
p(d,'治理成员本身固定，尚无成员更替机制；3 个账户来自同一台电脑的 MetaMask，测试的是多地址阈值规则，没有实现独立机构之间的组织制衡。原型不发行可交易通证，不使用主网资产。')
h(d,'隐私与风险')
p(d,'随机盐降低直接猜测承诺的便利性，但哈希不自动等于匿名化。原因原文、真实身份映射和授权材料应保留在受控链下流程。公开地址、时间和关联记录仍可暴露关系；正式应用还需要访问控制、最小化出示及持有人防重放机制。')

page(d,'四  公共测试网实测结果')
p(d,'基础版 ProofPassRegistry 共 29 行，对应课程“30 行以内”进阶演示。升级合约 ProofPassGoverned 为独立部署的扩展，不替换基础版，也不以长合约冒充短合约加分项。下表列出升级版 8 个实际成功交易节点；提案创建和投票还有独立回执，表格不是交易总数。')
table(d,['实测节点','区块','结果与复核要点'],[
('部署治理合约','12081167','治理构造参数、创建字节码和运行时代码匹配'),
('两票准入执行','12081228','提案 #1 执行，机构启用，epoch=1'),
('首次签发','12081241','TEST ONLY 原包与链上承诺匹配'),
('原子更正','12081257','旧记录被替代；新旧编号双向关联'),
('密钥轮换执行','12081540','提案 #2 执行；新密钥为 Account 2，epoch=2'),
('新密钥实际签发','12081578','新密钥发送交易成功，保存 epoch=2 包'),
('机构停用执行','12081617','提案 #3 执行；历史三条记录保持不变'),
('指定凭证紧急撤销','12082287','提案 #4 执行；仅更正版被紧急撤销')],[1.6,1.1,4.4])
h(d,'权限反例与结果隔离')
p(d,'固定区块 eth_call 检查显示：一票执行返回 threshold，重复投票返回 already approved，非治理地址返回 governor；轮换后旧密钥签发被拒，新密钥可执行；停用后当前密钥的 issue、revoke、correct 均被拒绝。这些反例是只读模拟，不是实发失败交易，也不证明模拟 from 地址的私钥控制权。')
p(d,'撤销前后逐字段审计确认：原版和 epoch=2 凭证记录不变，目标更正版的撤销字段按预期变化。部署证据已记录 finalized；其他业务文件保留各自查询时的最终性状态，不能把成功回执统一写成 finalized。')
h(d,'定位原始证据')
p(d,'网络 Sepolia，chainId 11155111。升级合约地址：\n0x623b2e6a55003da0aa144ef0ec53547af3f61410')
ref(d,'打开升级合约公开浏览器记录','https://sepolia.etherscan.io/address/0x623b2e6a55003da0aa144ef0ec53547af3f61410')
ref(d,'完整步骤与回执索引  deployment/upgrade-sepolia/README.md','../deployment/upgrade-sepolia/README.md')
ref(d,'单目标撤销审计  upgrade-sepolia-emergency-revoke-audit.json','../evidence/upgrade-sepolia-emergency-revoke-audit.json')

page(d,'五  独立核验与状态解释')
p(d,'2026 年 11 月 7 日，未连接钱包的 IAB 独立标签页导入三份 v3 包并导出报告。结果与固定区块重算逐字段一致。IAB 和脚本使用同一 PublicNode RPC，因此浏览器隔离不能称为独立 RPC 提供商交叉验证。')
table(d,['凭证','查询区块','完整性','技术状态'],[
('原版','12082330','匹配','已被更正版替代'),
('更正版','12082327','匹配','已紧急撤销'),
('epoch=2 新凭证','12082332','匹配','有效；技术核验通过')],[1.8,1.35,.95,3])
par=d.add_paragraph();par.alignment=WD_ALIGN_PARAGRAPH.CENTER
par.paragraph_format.line_spacing=1.0
par.paragraph_format.keep_with_next=True
pic=par.add_run().add_picture(str(ROOT/'evidence/upgrade-sepolia-independent-key2.jpg'),width=Inches(3.25))
pic._inline.docPr.set('descr','真实 IAB 核验截图，2026年11月7日，epoch=2凭证有效，机构停用，持有人未验证，学校未审批')
cap=p(d,'图 1  AI 浏览器操作归档的真实技术截图  2026 年 11 月 7 日 15:58:09 北京时间','Caption');cap.alignment=WD_ALIGN_PARAGRAPH.CENTER
p(d,'三份报告均显示 institutionEnabled=false。停用后旧记录仍可有效，是本合约的既定规则。新凭证的技术通过不表示持有人认证或学校审批已完成；报告明确保留“未验证”和“未审批”。完整原图和 JSON 可在实测证据页放大、下载。')
p(d,'图 1 用于说明技术结果。按课程独立完成要求，成员仍须亲自复查并保存含查询日期的链上取证截图，不将此图冒充团队自主现场取证。')
ref(d,'3 份截图与报告的哈希和逐字段复核索引','../evidence/upgrade-sepolia-independent-browser-acceptance.json')

page(d,'六  实验覆盖与评价口径')
p(d,'申报书规划 8 类场景、每类 2 个变体，共 16 个合成任务，并拟招募 4 至 6 名熟悉审核业务的参与者。当前附件将其整理为实验覆盖矩阵，逐项标出已有技术证据与缺口；它不是 16 次已完成的人测记录。现有单元测试、只读 RPC 检查、真实交易、模拟案例也不合并计数。')
table(d,['场景','现有证据或能力','解释与未完成项'],[
('有效凭证','真实签发及无钱包独立核验','仅技术有效，非完整业务通过'),
('字段篡改','包标题篡改与盐变更检查','需区分结构化承诺与文件哈希'),
('伪冒签发方','来源字段校验、权限约束','现实机构认证尚未完成'),
('冒用他人凭证','界面保留身份未验证','持有人挑战和防重放尚未实现'),
('撤销或过期','实链撤销；本地过期判断测试','不能将本地过期例算作真实过期实验'),
('真实但规则不符','校内规则教学提示','不等于真实学校审批'),
('重存扫描件','本地文件字节哈希比较','哈希不同应转复核，不能直接判伪'),
('状态不可得','网络异常及未知状态处理','故障场景须按附件区分已有与待测')],[1.3,2.65,3.15])
h(d,'实际评估应怎样补录')
p(d,'对每个任务保存匿名参与者编号、场景版本、流程顺序、开始结束时刻、主动操作与等待时间、补件轮数、查询次数及判定理由。处置结果分别记录正确通过、错误通过、正确拦截、错误拒绝和待复核，保留分母；不把待复核算作自动通过或错误拒绝。')
p(d,'三种流程应使用等价材料和交错顺序，并把机构初始化、纠错及维护工时计入成本。没有这些记录，就不能用模拟研究页的 48 条模型数据计算“真实效率提升”。若本轮不开展参与者实验，应保留“仅完成技术原型验证”的结论。')
h(d,'本轮结项复查')
p(d,'结项整理重新执行 offline.test.mjs 与 protocol.test.mjs，4 组检查通过，覆盖离线协议及 v2 包校验。该记录只验证指定代码路径，不替代浏览器现场操作、全部治理回归或真实用户试验。详细日志在 validation 目录，16 行覆盖矩阵另附。')

page(d,'七  课程演示与最终结论')
p(d,'展会按两分钟演示、一分钟随机问答排练：先用文件改动演示哈希差异，再展示链上状态和治理记录，解释哪些问题仍需现实审核。每位成员都应能说明关键代码、结果边界及不用区块链的替代方案。成员实际分工与 AI 使用说明另附一页。')
table(d,['时间','现场展示','需要说清的结论'],[
('0:00 至 0:15','问题与核验判断','完整性、状态、身份、学校认定各有责任'),
('0:15 至 0:50','原文件与改单标点文件比对','浏览器本地算 SHA-256，不依赖钱包'),
('0:50 至 1:25','展示替代、撤销、有效三种状态','历史报告可复核；内容匹配不保证当前有效'),
('1:25 至 2:00','解释两票、轮换及方案适用条件','不是三家独立机构，也未证明效率提升'),
('2:00 至 3:00','教师随机点人提问','每位成员能独立解释自己的工作')],[1.2,2.85,3.05])
h(d,'结论与后续选择')
p(d,'课程项目已完成从本地完整性实验到公共测试网治理验证的技术链路。它展示了状态可追溯、原子更正和指定撤销的实现方式，也暴露出“技术可验”与“业务可信”的距离。真实身份认证、学校审批和组织协作需要独立证据；中心化方案是否已足够，应由真实调查和公平比较决定。')
p(d,'课程结项优先补齐团队调查、现场自取证和成员说明。持有人挑战、真实机构接入、治理成员更替、独立节点运维及生产部署作为后续研究，不以增加功能数量替代本轮证据质量。展台演示可使用已归档报告，网络异常时明确说明是历史快照，不强行发起新交易。')
h(d,'参考资料与复现入口')
ref(d,'[1] W3C  Verifiable Credentials Data Model v2.0  2025-05-15  访问 2026-11-07','https://www.w3.org/TR/vc-data-model-2.0/')
ref(d,'[2] Ethereum  Networks  访问 2026-11-07','https://ethereum.org/developers/docs/networks/')
ref(d,'[3] 课程指导书  原件保留于项目根目录','../学期项目指导书-区块链与智慧校园.docx')
ref(d,'[4] 选题申报书  研究问题与实验计划','../选题申报书.docx')
ref(d,'[5] 基础离线原型  双击打开即可演示核心文件比对','../ProofPass_跨校证书核验实验室.html')
ref(d,'[6] 六页展台幻灯片  离线打开  左右键切换','exhibition.html')
p(d,'附件包含实验覆盖矩阵、三分钟讲稿、团队待补清单及原始证据索引。请按课程指定教材第七章第四节模板和课堂六问逐项核对后提交；本报告不代填未提供的教材问句、访谈或评价分数。')
d.save(OUT/'ProofPass_课程结项报告.docx')

a=base()
a.styles['Normal'].font.size=Pt(10.5)
a.styles['Normal'].paragraph_format.space_after=Pt(5)
a.styles['Normal'].paragraph_format.line_spacing=Pt(14.5)
p(a,'ProofPass 成员分工与人工智能使用说明','Title')
p(a,'区块链与创新思维  2026 秋  项目组填写确认后提交','Subtitle')
p(a,'项目：竞赛获奖与技能证书跨校可信核验机制研究。AI 用于技术实现、检查和材料整理；真实访谈、本校现场材料、团队链上取证及展会回答须由成员本人完成。')
table(a,['成员姓名与学院专业','本人实际工作与可核对成果'],[
('成员一：________________','实际工作：________________________________\n成果或记录位置：__________________________'),
('成员二：________________','实际工作：________________________________\n成果或记录位置：__________________________'),
('成员三：________________','实际工作：________________________________\n成果或记录位置：__________________________')],[2.25,4.85],10)
h(a,'使用工具与辅助范围')
p(a,'ChatGPT / Codex：辅助原型代码、协议与权限检查、测试脚本、证据归档、排版及材料初稿。现有 IAB 技术截图由 AI 浏览器操作归档，团队须自行复查取证。Remix、MetaMask 用于编译和钱包交互；钱包最终交易确认由用户本人操作。')
h(a,'关键提示词与生成内容')
table(a,['实际提示词摘录','对应辅助内容'],[
('按任务书修改','核验状态、包协议、教学边界及代码调整'),
('继续做独立机构权限测试','不同地址签发、撤销和记录隔离检查'),
('缺少的数据，均用模拟数据填充','明确标注的虚构访谈、案例与成本模型'),
('把这次测试的真实截图和结果放进之前的网页，替换对应的模拟内容','以真实技术截图及回执更新证据展示')],[3.55,3.55],9.5)
h(a,'成员修改与复核记录')
p(a,'本人修改的文件或文字：________________________________________________\n具体修改内容及原因：__________________________________________________\n本人复跑的操作与结果：________________________________________________')
p(a,'成员确认：不将模拟访谈、工时或模型数据作为实测结论；已阅读并能解释本人负责代码与证据。个人补充的真实材料由本人核实。')
p(a,'成员签名：________________  ________________  ________________\n确认日期：________________')
a.save(OUT/'ProofPass_成员分工与AI使用说明.docx')
print('created report and one-page statement')

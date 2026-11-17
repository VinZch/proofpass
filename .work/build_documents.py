from pathlib import Path
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path('/Users/vinch/Desktop/区块链')
BODY_FONT = 'Songti SC'
HEAD_FONT = 'Heiti SC'


def font(run, size=None, bold=None, face=None):
    run.font.name = face or BODY_FONT
    run.font.color.rgb = RGBColor(0, 0, 0)
    if size: run.font.size = Pt(size)
    if bold is not None: run.bold = bold
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts'); rpr.insert(0, rf)
    for k in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
        rf.set(qn('w:' + k), face or BODY_FONT)


def base():
    d = Document()
    s = d.sections[0]
    s.page_width, s.page_height = Cm(21), Cm(29.7)
    s.top_margin, s.bottom_margin = Cm(1.85), Cm(1.8)
    s.left_margin, s.right_margin = Cm(2.1), Cm(2.1)
    s.footer_distance = Cm(0.8)
    for name in ('Normal', 'Body Text', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'Heading 3'):
        st = d.styles[name]
        st.font.name = BODY_FONT if name in ('Normal', 'Body Text') else HEAD_FONT
        st.font.color.rgb = RGBColor(0, 0, 0)
        st.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), st.font.name)
        for el in list(st.element.xpath('./w:pPr/w:pBdr|./w:pPr/w:numPr')):
            el.getparent().remove(el)
        rf = st.element.get_or_add_rPr().get_or_add_rFonts()
        for k in list(rf.attrib):
            if 'theme' in k.lower(): del rf.attrib[k]
    d.styles['Subtitle'].font.italic = False
    n = d.styles['Normal']
    n.font.size = Pt(11)
    n.paragraph_format.line_spacing = Pt(17)
    n.paragraph_format.space_after = Pt(5)
    for nm, size in [('Title', 22), ('Heading 1', 15), ('Heading 2', 12)]:
        st = d.styles[nm]
        st.font.size = Pt(size)
        st.font.bold = True
        st.paragraph_format.space_before = Pt(10 if nm != 'Title' else 0)
        st.paragraph_format.space_after = Pt(6)
        st.paragraph_format.keep_with_next = True
        st.paragraph_format.line_spacing = Pt(20 if nm != 'Title' else 28)
    d.styles['Title'].paragraph_format.line_spacing = Pt(28)
    d.styles['Subtitle'].font.size = Pt(11)
    d.styles['Subtitle'].paragraph_format.space_after = Pt(12)
    ft = s.footer.paragraphs[0]
    ft.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = ft.add_run(); font(r, 9)
    fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'), 'PAGE'); r._r.addnext(fld)
    d.core_properties.author = ''
    d.core_properties.subject = '竞赛获奖与技能证书跨校核验'
    d.core_properties.keywords = '选题3,跨校核验,证书,访谈'
    return d


def p(d, text='', boldlead=None, small=False):
    q = d.add_paragraph()
    if boldlead and text.startswith(boldlead):
        font(q.add_run(boldlead), 10 if small else 11, True)
        font(q.add_run(text[len(boldlead):]), 10 if small else 11)
    else:
        font(q.add_run(text), 10 if small else 11)
    if small:
        q.paragraph_format.line_spacing = Pt(14.5)
        q.paragraph_format.space_after = Pt(4)
    return q


def h(d, text, level=1):
    q = d.add_paragraph(text, style=f'Heading {level}')
    for r in q.runs: font(r, 15 if level == 1 else 12, True, HEAD_FONT)
    return q


def title(d, text, subtitle):
    q = d.add_paragraph(text, style='Title')
    for r in q.runs: font(r, 22, True, HEAD_FONT)
    q = d.add_paragraph(subtitle, style='Subtitle')
    for r in q.runs: font(r, 11, False, HEAD_FONT)


def page(d, heading):
    d.add_page_break()
    h(d, heading)


def table(d, headers, rows, widths):
    t = d.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for c, w in zip(t.columns, widths): c.width = Cm(w)
    pr = t._tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement('w:' + side)
        el.set(qn('w:val'), 'single'); el.set(qn('w:sz'), '5'); el.set(qn('w:color'), 'D9D9D9')
        borders.append(el)
    pr.append(borders)
    for ri, values in enumerate([headers] + rows):
        cells = t.rows[0].cells if ri == 0 else t.add_row().cells
        trpr = t.rows[ri]._tr.get_or_add_trPr()
        cannot = OxmlElement('w:cantSplit'); trpr.append(cannot)
        if ri == 0: trpr.append(OxmlElement('w:tblHeader'))
        for ci, (cell, txt, width) in enumerate(zip(cells, values, widths)):
            cell.width = Cm(width)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tcpr = cell._tc.get_or_add_tcPr()
            margins = OxmlElement('w:tcMar')
            for side in ('top', 'left', 'bottom', 'right'):
                el = OxmlElement('w:' + side); el.set(qn('w:w'), '90' if side in ('top', 'bottom') else '110'); el.set(qn('w:type'), 'dxa'); margins.append(el)
            tcpr.append(margins)
            shade = OxmlElement('w:shd'); shade.set(qn('w:fill'), 'DCE6ED' if ri == 0 else ('F5F7F8' if ri % 2 == 0 else 'FFFFFF')); tcpr.append(shade)
            q = cell.paragraphs[0]
            q.paragraph_format.space_after = Pt(0)
            q.paragraph_format.line_spacing = Pt(14.5)
            if ci == 0 and len(txt) <= 15: q.alignment = WD_ALIGN_PARAGRAPH.CENTER
            font(q.add_run(txt), 10, ri == 0, HEAD_FONT if ri == 0 else BODY_FONT)
    d.add_paragraph().paragraph_format.space_after = Pt(0)
    return t


def question(d, code, text, probe=None):
    q = p(d, code + '  ' + text)
    q.paragraph_format.space_before = Pt(5)
    q.paragraph_format.space_after = Pt(2)
    q.paragraph_format.keep_with_next = bool(probe)
    for r in q.runs: r.bold = True
    if probe:
        q = p(d, '追问：' + probe, small=True)
        q.paragraph_format.left_indent = Cm(0.5)


def proposal():
    d = base()
    title(d, '竞赛获奖与技能证书跨校核验\n选题申报书', '选题3  证书造假风险与人工核验成本')
    p(d, '项目名称：竞赛获奖与技能证书跨校可信核验机制研究', boldlead='项目名称：')
    p(d, '申报人：________    学院与专业：________    指导教师：________', small=True)
    p(d, '项目类型：应用调研与原型验证    计划周期：启动后8周', small=True)
    h(d, '一  项目摘要')
    p(d, '本项目面向学生在跨校交流、联合培养和成果申报中使用竞赛获奖及技能证书的场景，研究如何确认签发来源、发现信息篡改、查询有效状态，并减少重复提交、跨部门询证和人工留痕。项目拟访谈持证学生、高校审核人员和签发机构，重建现行核验流程，在此基础上设计可验证凭证原型，并比较中心化登记与联盟链共同维护两种方案。研究将以处理时间、人工操作量、异常处置正确性和接入负担评价方案，形成有适用条件的结论。')
    h(d, '二  选题背景与研究价值')
    p(d, '证书核验至少涉及四个问题：文件是否被改动、是否由所称机构签发、当前是否有效、是否符合接收学校的认定规则。对真实性的检查与对竞赛层级、技能等级和成果用途的判断需要分别处理。证书真实，也可能不符合某项申报条件；查询不到记录，也不能直接判定造假。')
    p(d, '技能人才评价工作网已提供技能人员职业资格证书、职业技能等级证书等查询入口[1]。项目应先梳理现有权威渠道及其适用范围，研究跨校使用中的渠道切换、授权、结果复用和留痕需求，不将既有查询服务视为空白。竞赛获奖证书则按具体主办方及届次确认权威名录和查询方式，不能与技能证书混用一套认定依据。')
    p(d, '项目的实践价值在于识别哪些核验步骤确实占用人力，哪些风险可以由签名、状态查询和审计记录缓解，哪些仍需人工核实。现阶段将证书造假、重复核验和等待成本列为待验证问题，不预设其发生频率或改善比例。')
    h(d, '三  核心研究问题')
    p(d, '1. 现行核验中，哪些步骤产生重复操作和等待，问题在三类参与者之间如何传递？\n2. 统一凭证字段、签发方认证和状态查询能否降低操作量，同时避免错误放行？\n3. 在什么组织协作条件下，联盟链比中心化签名登记具有可说明的额外价值？')

    page(d, '四  研究内容与拟议方案')
    h(d, '1  明确凭证范围与核验规则', 2)
    p(d, '首轮选取一项能定位签发机构和获奖名单的竞赛，以及一种有明确查询渠道的技能证书，分别建立最小字段集。共同字段拟包括随机凭证编号、凭证类型、签发机构、签发时间、有效期或适用届次、持有人绑定信息和状态。竞赛另记赛道、奖项与团队成员；技能证书另记职业或工种、等级与评价机构。跨校核验先限定为A校学生向B校提交材料，由B校独立审核。')
    h(d, '2  设计签发到复核的完整流程', 2)
    p(d, '签发机构依据原始获奖或评价记录生成结构化凭证并签名；学生选择用途、接收方和授权期限后出示凭证；接收学校核对签发方身份及签发权限、签名、持有人绑定和最新状态；系统分别显示技术核验结果与校内认定结果。对字段不一致、状态无法更新或来源不明的材料转人工复核，保留原因与处理记录。更正应重新签发并关联旧版本，撤销不删除历史。')
    h(d, '3  形成能够比较的技术方案', 2)
    table(d, ['方案', '实现方式', '拟回答的问题'], [
        ['现行流程', '按已访谈学校的实际渠道查询、询证与留痕', '现有瓶颈在哪里'],
        ['中心化签名登记', '机构认证、数字签名、状态查询与访问日志', '统一数据与流程能改善多少'],
        ['联盟链共同维护', '保持同一凭证与前端流程，改由多方维护登记及状态事件', '共同治理能否带来额外收益']
    ], [3.0, 7.0, 6.8])
    p(d, '区块链的拟议作用是让多方对签发、撤销和更正事件共享可核对的记录。签发权限由成员准入及责任协议约束，不能由“记录已上链”代替。W3C可验证凭证模型区分签发者、持有者和核验者，并明确可验证性不等于内容真实[2]。本项目以该角色划分组织流程，采用哪种登记技术仍由调研和比较结果决定。')
    h(d, '4  数据与信任边界', 2)
    p(d, '原始证书和可识别身份资料原则上保存在授权的链下系统；链上候选字段仅包括不可直接识别个人的事件标识、必要承诺值和状态变更。简单散列不自动等于匿名化，应检查关联风险。原型不将完整证书、身份证号或姓名直接写入共享账本。需单独设计密钥轮换、状态更新时间提示、凭证出示防重放及接收方授权。')
    p(d, '文件哈希只能识别字节是否一致，不能判断获奖事实；扫描、重存或重新导出可能改变哈希。正式方案应核验由签发方签名的结构化字段，历史图片件进入官方查询或人工询证流程，不能仅因哈希不一致就标为假证。', boldlead='文件哈希只能识别字节是否一致，不能判断获奖事实；')

    page(d, '五  调研方法与效果评估')
    p(d, '采用半结构式访谈、脱敏流程材料分析和任务测试相结合的方法。先了解最近一次真实操作，再出示相同场景卡讨论候选方案，避免先介绍区块链诱导回答。所有人数均为招募计划，不能作为已完成样本。')
    table(d, ['访谈对象', '计划人数与覆盖', '主要证据'], [
        ['持证学生', '6至8人；覆盖两校、两类证书及顺利与补件经历', '提交步骤、重复准备、实际操作与等待'],
        ['高校审核人员', '4至6人；至少两校，覆盖直接审核与复核职责', '核验渠道、工作量、疑点处理、认定规则'],
        ['签发机构', '3至4人；竞赛与技能评价机构均有覆盖', '签发依据、纠错撤销、询证量、接入条件']
    ], [3.2, 7.3, 6.3])
    p(d, '访谈总量拟为13至18人，每次约25至30分钟。对回忆数字注明统计期和估算依据；如获准查看日志，仅提取匿名汇总。双人复核部分访谈编码，将引语、研究者解释和产品建议分栏保存。样本用于发现需求和差异，不估计全国造假率，也不以少量访谈宣称普遍规律。')
    h(d, '1  任务测试与对照安排', 2)
    p(d, '形成8类标注场景：有效凭证、字段篡改、伪冒签发方、冒用他人凭证、已撤销或过期、凭证真实但不符合认定规则、仅有重存扫描件、状态服务不可用。每类拟制作2个变体，共16个合成任务，另以误签及密钥轮换场景检查治理流程。由4至6名熟悉审核业务的参与者对比三种流程，交错安排顺序并使用等价任务减少熟悉效应。无法接入真实机构时，只报告模拟任务结果。')
    table(d, ['指标', '记录口径'], [
        ['操作与等待时间', '每件人工主动处理分钟数；另记提交至明确答复的历时，二者不混算'],
        ['重复与复核负担', '提交或补件轮数、渠道切换次数、发起询证件数及人工复核件数'],
        ['处置正确性', '分别记录正确通过、错误通过、正确拦截、错误拒绝与待复核；分母保留'],
        ['状态与接入负担', '撤销生效延迟、状态不可用次数；另记机构初始化、纠错和维护工时']
    ], [3.6, 13.2])
    h(d, '2  结论判据', 2)
    p(d, '按凭证类别和异常类型报告数量、中位操作时间与范围，不仅比较“核验速度”。只有在错误通过未增加、复核理由清晰的前提下，才能讨论效率收益。将新系统的签发、维护与对接工时计入总成本；若中心化方案已满足需求，而联盟链未改善共同治理或审计，则不支持将联盟链作为必要条件。')

    page(d, '六  实施计划与预期成果')
    table(d, ['阶段', '工作任务', '阶段产出'], [
        ['第1至2周', '确认凭证范围、招募、完成试访并修订提纲', '字段表、流程初图、修订后提纲'],
        ['第3至4周', '完成三类访谈，核对官方渠道和异常处理规则', '匿名记录、需求清单、证据与问题对应表'],
        ['第5至6周', '完善签发与状态原型，搭建两种登记方案', '可演示原型、接口说明、合成场景集'],
        ['第7至8周', '开展任务比较，分析接入成本并形成结论', '测试记录、适用边界、研究报告与展示材料']
    ], [2.6, 8.7, 5.5])
    h(d, '七  可行性与研究特色')
    p(d, '现有“校园凭证实验室”页面已包含SHA-256计算、登记摘要比对、模拟签发方认可和撤销状态展示，可用于解释核验流程。该页面未连接区块链，记录存于浏览器，签发机构身份和时间均未获可信认证。因此，它是需求讨论与交互验证的起点，后续仍需实现机构认证、数字签名、多机构共享与访问控制。')
    p(d, '本选题的特色是把“真伪核验”和“学校认定”拆成可追踪的处理环节，围绕三类参与者共同计算成本，并以中心化方案为对照检验区块链的适用条件。计划形成一套字段与状态规则、一份三类访谈提纲、一套16个合成任务的场景集、一个可演示原型和一份研究报告。成果以可复核证据和失败边界为依据。')
    h(d, '八  主要风险与应对')
    p(d, '机构招募或对接不足时，收缩到两校角色的模拟任务，并清楚说明未完成真实互联。对签发源头录入错误，保留原始责任、双人确认及更正机制；对密钥泄露，设计停用、轮换与受影响凭证复核；对学校认定差异，仅展示各自规则及人工结论，避免自动承诺互认。服务离线或状态过旧时提示待复核，不默认有效。')
    p(d, '访谈前说明研究用途与退出方式，单独征求录音同意；不索取真实证号、身份证号或未脱敏证书。录音与联系信息分开受控保存，转写核对后30日内删除录音，匿名记录在结项后6个月内删除；如学校要求另行审批，按其适用流程执行。')
    h(d, '参考依据')
    p(d, '[1] 中国就业培训技术指导中心等  技能人才评价工作网  证书查询栏目。https://osta.mohrss.gov.cn/  访问日期2026年10月21日。支持现有官方查询入口说明。', small=True)
    p(d, '[2] W3C  Verifiable Credentials Data Model v2.0  2025年5月15日推荐标准。https://www.w3.org/TR/vc-data-model-2.0/  访问日期2026年10月21日。参见角色模型、信任模型、验证与数据最小化章节。', small=True)
    path = ROOT / '选题3_跨校证书核验_选题申报书.docx'
    d.save(path)
    return path


def interviews():
    d = base()
    title(d, '竞赛获奖与技能证书跨校核验\n三类对象访谈提纲', '选题3  证书造假风险与人工核验成本')
    p(d, '访谈目的：重建真实流程，定位时间与责任成本，检验跨校核验需求及采用条件。', boldlead='访谈目的：')
    h(d, '一  执行说明')
    p(d, '采用半结构式访谈，每次约25至30分钟。先询问过去一年内最近一次实际经历；没有跨校经历的受访者可讲一般证书使用流程，但必须标记为“非跨校”，不作为跨校痛点的直接证据。受访者不清楚的问题允许跳过，不能以推测填补。')
    table(d, ['对象与编号', '建议招募', '重点'], [
        ['A类  持证学生', '6至8人；两校、两类证书，兼顾顺利办理和补件经历', '提交与授权、操作与等待、补件负担'],
        ['B类  高校审核人员', '4至6人；两校，区分直接核验和最终认定职责', '核验渠道、复核成本、校内规则'],
        ['C类  签发机构', '3至4人；分别覆盖竞赛主办方和技能评价机构', '签发依据、询证、状态维护与协作']
    ], [4.1, 7.5, 5.2])
    p(d, '时间安排：说明与同意2分钟，筛选和流程回溯8分钟，成本与异常10分钟，场景讨论5至8分钟，补充与结束2分钟。每类第1、2、4、5、6题优先；其余视经历选择，不必逐字问完。')
    h(d, '二  开场话术')
    p(d, '您好，我们正在研究竞赛获奖和技能证书在不同学校之间使用时的核验流程，想了解您实际如何操作、哪些步骤顺利、哪些步骤需要额外处理。访谈约半小时，参与完全自愿，可以跳过任何问题或随时结束，不影响任何审核或评价。我们不会要求您提供真实证书编号、身份证信息或他人资料，结果仅使用匿名表述。您是否愿意参加？是否同意录音？不同意录音时我们仅作文字记录。')
    h(d, '三  访谈与记录规则')
    p(d, '先听经历，再介绍第5页场景卡。不要以“假证很多”“上链更安全”作前提；把“查不到”“有疑点”和“已确认虚假”分开记录。每个耗时数字都追问统计期、计量单位及来源，区分手动操作时间、系统等待和跨部门等待。')
    p(d, '征求录音与匿名引用的同意并分别记录；联系信息与访谈笔记分开保存。录音在转写核对后30日内删除，匿名笔记在结项后6个月内删除。若计划对外公开引语，须依约确认使用范围。无需发送或展示未脱敏材料。')

    page(d, '四  A类持证学生访谈问题')
    p(d, '适用对象：近一年获得或使用过竞赛获奖证书、技能证书的学生。目标是了解材料如何被使用及学生承担的成本。')
    question(d, 'A1', '请选最近一次使用证书的经历：它是什么类别，用在什么事项，由哪所学校接收？', '是跨校提交还是校内使用？您是证书持有人还是团队成员？不必说具体证号。')
    question(d, 'A2', '从收到提交要求到得到答复，您依次做了哪些事？', '需要原件、扫描件、名单链接还是其他证明？通过哪些渠道提交，分别交给谁？')
    question(d, 'A3', '这份证书之前或之后还在哪些事项中用过？', '是否反复上传或重新开具证明？已有核验结果能否复用？没有重复也请说明。')
    question(d, 'A4', '这次准备和提交材料，您实际操作了多久，之后又等了多久？', '按整理材料、查询、沟通、补件分别估算；是看过记录还是凭印象回忆？')
    question(d, 'A5', '对方有没有要求补充材料或解释某处信息？如果有，最后怎样解决？', '问题来自身份、字段差异、查询不到、团队成员还是认定标准？没有异常时，哪些信息让办理顺利？')
    question(d, 'A6', '您通常如何确认自己的证书信息准确，或者找到官方查询入口？', '是否用过主办方网站、技能证书官方渠道或人工咨询？结果查不到时，您会如何处理？')
    question(d, 'A7', '是否遇过证书真实可查，但学校不按所申请等级或用途认定的情况？', '对方说明了什么规则？若信息有误需要更正，您知道找谁处理吗？没有实际经历可以回答不清楚。')
    question(d, 'A8', '一次跨校审核，您认为对方需要看到哪些信息，哪些应由您控制？', '是否接受限定接收学校、用途和期限？授权结束后应停止哪些访问？对下载保存有什么顾虑？')
    question(d, 'A9', '看完共同场景卡后，哪种流程符合您的需要，什么情况下您会继续用现有方式？', '是否愿意多做一步授权或身份确认？您最想减少哪一步？还有什么不便未被问到？')
    p(d, '记录重点：以一次具体事项为单位保存流程与时间，不把学生对制度的猜测写成学校规则。', small=True)

    page(d, '五  B类高校审核人员访谈问题')
    p(d, '适用对象：教务、学工、竞赛管理等直接核验或复核人员。分别确认其负责真实性检查、校内认定还是两者兼有。')
    question(d, 'B1', '您负责哪些材料和决定？请举最近一次接收外校学生或校外机构证书的审核事项。', '核验真伪、认定等级、计分和最终审批分别由谁负责？是否有书面规则？')
    question(d, 'B2', '这件材料从收到到结案经过哪些步骤，各步依据什么作判断？', '优先查官方系统、主办方名单、原件还是电话询证？哪些情况可以直接结束？')
    question(d, 'B3', '在最近一个审核周期，两类证书各处理多少件，涉及几个人？', '请明确周期和是否去重；区分系统统计、工作台账和个人估算。')
    question(d, 'B4', '办理一件常规材料和一件需要复核的材料，人工分别花多久？', '查询、身份匹配、联系机构、留痕各多久？等待回复另计；用范围回答也可以。')
    question(d, 'B5', '最近有没有材料无法直接核定？您凭什么将它判为待补充、拒绝或通过？', '区分来源查不到、信息不符、已撤销与真实但不符合认定规则；若确认虚假，最终依据是什么？没有则记录没有。')
    question(d, 'B6', '另一所学校已经审核过的结果，您会如何处理？', '哪些证据可以复用，哪些必须重查？结果有效期、责任承担或规则差异会如何影响决定？')
    question(d, 'B7', '官方查询和机构询证目前能解决哪些问题，还有哪些步骤需要人工衔接？', '能否保存可复查的结果及查询时间？身份与团队成员如何对应？是否存在渠道不可用或记录更新等待？')
    question(d, 'B8', '材料更正、撤销或结论被申诉后，谁负责更新、复核和通知？', '以前作出的认定如何处理？谁可看学生信息，日志保存多久，是否允许跨部门共享？')
    question(d, 'B9', '看完共同场景卡后，您会选择什么流程，采用前必须满足哪些条件？', '需要哪些来源证明、状态时效和错误处理？可接受多少额外培训或维护？谁有权决定接入，什么情况不值得更换？')
    p(d, '记录重点：分别绘制技术核验与校内认定流程；获取脱敏规则或汇总数据需另获同意。', small=True)

    page(d, '六  C类签发机构访谈问题')
    p(d, '适用对象：竞赛主办方的证书管理人员，或依法依规开展相应业务的技能评价机构工作人员。先标记机构类型，再使用对应追问。')
    question(d, 'C1', '贵机构签发哪类证书，您负责哪些环节，签发依据由谁确认？', '竞赛：主办与承办关系、届次和赛道如何确定？技能：评价机构身份、业务范围和等级依据如何核实？')
    question(d, 'C2', '请以最近一批签发为例，说明名单形成、复核、发证和发布查询记录的流程。', '竞赛：个人与团队名单如何对应？技能：证书编号、评价记录和官方数据报送如何衔接？')
    question(d, 'C3', '目前使用哪些编号、签章或查询方式识别证书，谁维护这些信息？', '可否定位到具体签发批次？官网链接失效、历史档案或签发权限变更时怎样查证？')
    question(d, 'C4', '最近一个月或最近一批业务中，收到多少学校的核验请求，通常怎样回复？', '请按统计期区分请求次数与涉及证书件数；能直接查询的与需人工处理的各有哪些？')
    question(d, 'C5', '一件普通询证和一件复杂询证，需要哪些人员投入多少操作时间？', '查档、核对、审批、回函分别多久，等待多久？是否重复回应同一证书？数据是台账还是估算？')
    question(d, 'C6', '发现证书信息错误、应撤销或有人持有存疑材料时，贵机构如何处理？', '谁能发起与批准更正？旧证如何标记，已查询学校怎样获知？未遇到过则说明现行规则。')
    question(d, 'C7', '哪些核验字段可以对学校提供，哪些必须获得持有人授权或限制访问？', '学校如何证明接收用途？批量查询与单次询证是否不同？如何避免暴露团队成员或考生信息？')
    question(d, 'C8', '如果多所学校共同使用一套核验服务，贵机构愿意承担哪些职责和成本？', '谁审核机构准入、维护公钥与状态？发生误签、密钥泄露或系统故障时谁处置？是否需要新增人员或改造现有系统？')
    question(d, 'C9', '看完共同场景卡后，哪些方式能满足要求，哪些条件下不愿接入？', '保留官方渠道还是新增接口？中心化服务与多方共同维护各有哪些实际顾虑？请说明最优先解决的一件事。')
    p(d, '记录重点：竞赛与技能机构分别汇总，不将机构自述视为已验证的资质；不索取密钥、内部考生库或真实证书清单。', small=True)

    page(d, '七  共同场景卡与访谈记录')
    h(d, '1  向三类对象出示相同场景', 2)
    p(d, '虚构学生甲在A校持有一份竞赛获奖或技能证书，拟向B校提交成果材料。B校需要判断签发来源、内容、持有人身份和当前状态，并按本校规则决定能否认定。以下三种方式均需身份匹配、异常复核和独立的认定规则；请按实际可用性评价，不预设哪种方式更快或更可信。')
    table(d, ['方式', '中性描述'], [
        ['现有渠道', '学生按要求交材料，学校使用官方查询、名单或向签发机构询证，并记录处理过程。'],
        ['统一签名服务', '签发机构提供带签名的结构化凭证，学生授权出示；学校核验签名与状态，由一个受托服务维护登记。'],
        ['多方共同维护', '保持同样的凭证、授权和核验步骤，由参与机构通过联盟链共同维护登记及状态事件，需要共同约定准入、更新和责任。']
    ], [3.4, 13.4])
    p(d, '统一追问：您还缺什么信息才能判断？哪一步最有帮助，哪一步增加负担？若查不到、状态不可用、文件被重存或证书真实但不符合B校规则，应怎样提示和处理？若现有方式已经足够，什么情况下无需新增系统？')
    h(d, '2  每次访谈记录字段', 2)
    p(d, '访谈编号：________    日期：________    时长：________\n对象类别：A / B / C    学校或机构代号：________\n凭证类型：竞赛 / 技能    经历：跨校 / 非跨校\n参与同意：是 / 否    录音同意：是 / 否    匿名引用同意：是 / 否', small=True)
    p(d, '最近一次事项及统计期：________________________________\n实际流程与责任人：____________________________________\n主动操作时间及依据：__________________________________\n等待时间及依据：______________________________________\n提交轮数与询证件数：__________________________________\n异常类型及最终依据：__________________________________\n受访者原话与定位：____________________________________\n研究者解释及待核实事项：______________________________', small=True)
    h(d, '3  整理与分析要求', 2)
    p(d, '按“提交、渠道查询、身份匹配、重复询证、状态更新、校内认定、授权、接入成本”编码。每条问题结论关联访谈编号和原话，记录相反或无痛点案例。汇总数量保留样本分母；估算工时与日志数据分开，访谈意愿不等于实际采用。需求优先级同时参考受影响范围、后果及证据强弱。', small=True)
    path = ROOT / '选题3_跨校证书核验_三类对象访谈提纲.docx'
    d.save(path)
    return path


if __name__ == '__main__':
    for f in (proposal(), interviews()):
        print(f)

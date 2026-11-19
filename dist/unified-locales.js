/* Unified report UI: English, Korean, Japanese. */
Object.assign(window.CBLocaleMessages,{
  "统一报告样例": [
    "Unified report example",
    "통합 보고서 예시",
    "統一レポート例"
  ],
  "载入统一报告样例": [
    "Load report example",
    "보고서 예시 불러오기",
    "レポート例を読み込む"
  ],
  "完整精算报告 ↗": [
    "Full actuarial report ↗",
    "전체 계리 보고서 ↗",
    "精算レポート全文 ↗"
  ],
  "报告基准": [
    "Report baseline",
    "보고서 기준",
    "レポート基準"
  ],
  "研究报价": [
    "Research quote",
    "연구 견적",
    "研究試算"
  ],
  "研究情景": [
    "Research scenario",
    "연구 시나리오",
    "研究シナリオ"
  ],
  "当前投保单试算": [
    "Current application estimate",
    "현재 청약 견적",
    "現在の申込の試算"
  ],
  "待重新测算": [
    "Recalculation required",
    "재산출 필요",
    "再計算が必要"
  ],
  "投保条件已超出本版测算范围，请重新测算后报价。": [
    "The application differs from the modeled inputs. Recalculate before quoting.",
    "청약 조건이 산출 입력값과 다릅니다. 재산출 후 견적을 발행하세요.",
    "申込条件が計算済みの前提と異なります。再計算後に見積もりを発行してください。"
  ],
  "历史保单快照": [
    "Historical policy snapshot",
    "기존 증권 스냅샷",
    "旧契約のスナップショット"
  ],
  "原币种、责任与报价保持不变。": [
    "Original currency, coverage and quote are preserved.",
    "기존 통화, 보장 및 견적을 유지합니다.",
    "元の通貨・補償・見積もりを保持します。"
  ],
  "100张差异化示例保单 · 200,000个模拟年度": [
    "100 heterogeneous example policies · 200,000 simulated years",
    "서로 다른 예시 증권 100건 · 모의 연도 200,000회",
    "条件の異なるサンプル契約100件・20万年シミュレーション"
  ],
  "参数金额、贡献毛利净损失及限额": [
    "Parameter amount, net contribution-margin loss and limits",
    "매개변수 금액, 공헌이익 순손실 및 한도",
    "パラメトリック金額・限界利益の純損失・支払限度"
  ],
  "已纳入风险模拟": [
    "Included in risk simulation",
    "위험 시뮬레이션에 반영",
    "リスクシミュレーションに反映"
  ],
  "工作日 09:00–17:00": [
    "Weekdays 09:00–17:00",
    "평일 09:00–17:00",
    "平日 09:00–17:00"
  ],
  "赔款计算与业务依赖": [
    "Claims calculation and dependencies",
    "보험금 산출 및 의존 관계",
    "保険金計算と業務依存"
  ],
  "核心业务与独立AI业务分别核定；同一业务的多项依赖不重复相加。先逐业务取参数金额与净损失的较低值，再共用事故和年度限额。": [
    "Core and independent AI businesses are assessed separately. Multiple dependencies do not duplicate a business loss. Apply each business’s net-loss cap, then shared event and annual limits.",
    "핵심 업무와 독립 AI 업무를 별도로 평가합니다. 여러 의존 서비스로 같은 손실을 중복 계산하지 않습니다. 업무별 순손실 상한 적용 후 공통 사고·연간 한도를 적용합니다.",
    "基幹業務と独立AI業務を個別に査定します。複数の依存先による同一損失は重複計上せず、業務別純損失上限の後に共通の事故・年間限度を適用します。"
  ],
  "逐事件自留额": [
    "Per-event retention",
    "사고별 보유액",
    "1事故あたりの保有額"
  ],
  "层限额 / 年度容量": [
    "Layer limit / annual capacity",
    "레이어 한도 / 연간 용량",
    "レイヤー限度額／年間引受容量"
  ],
  "同一事件的多客户赔款合并后应用超赔层；按各客户事件赔款分配回收。再保险费按预计回收份额分摊，无自动复效。": [
    "Apply the excess layer to all claims from one event. Allocate recoveries by event claims and reinsurance premium by expected recoveries. No automatic reinstatement.",
    "같은 사고의 고객 보험금을 합산해 초과손해액 재보험을 적용합니다. 사고 보험금으로 회수액을, 예상 회수 비중으로 재보험료를 배분하며 자동 복원은 없습니다.",
    "同一事故の複数契約の保険金を合算して超過損害額再保険を適用します。回収額は事故保険金、再保険料は期待回収額に応じて配賦し、自動復元はありません。"
  ],
  "再保责任范围": [
    "Reinsurance scope",
    "재보험 보장 범위",
    "再保険の補償範囲"
  ],
  "M1 + 完整M2（目标条件）": [
    "M1 + full M2 (target terms)",
    "M1 + 전체 M2 (목표 조건)",
    "M1＋M2全範囲（目標条件）"
  ],
  "仅M1；M2全部自留": [
    "M1 only; M2 fully retained",
    "M1만 보장; M2 전액 보유",
    "M1のみ・M2は全額保有"
  ],
  "再保价格为预算情景，尚未取得市场合同。": [
    "Reinsurance pricing is a budget scenario; no market contract has been secured.",
    "재보험 가격은 예산 시나리오이며 실제 계약은 확보되지 않았습니다.",
    "再保険価格は予算シナリオであり、市場での契約は未取得です。"
  ],
  "组合净TVaR 99%": [
    "Portfolio net TVaR 99%",
    "포트폴리오 순 TVaR 99%",
    "ポートフォリオ純TVaR 99%"
  ],
  "组合年均净赔款": [
    "Portfolio mean annual net claims",
    "포트폴리오 연평균 순보험금",
    "ポートフォリオの年間平均純保険金"
  ],
  "100张保单共享事件、上游与准入辖区；各客户资本贡献加总等于组合净资本。": [
    "100 policies share event, upstream and access-jurisdiction risks. Client capital allocations sum to portfolio net capital.",
    "증권 100건이 사고, 상위 서비스 및 접근 관할 위험을 공유합니다. 고객별 자본 배분 합계는 포트폴리오 순자본과 같습니다.",
    "100契約で事故・上流サービス・利用規制のリスクを共有し、各契約の資本配賦の合計がポートフォリオ純資本と一致します。"
  ],
  "固定及按案费用 F": [
    "Fixed and per-claim expenses F",
    "고정 및 건별 비용 F",
    "固定費・案件処理費 F"
  ],
  "监测、核保和按案处理逐项预算；变动费用不重复计入这些项目。": [
    "Monitoring, underwriting and claim handling are budgeted separately; variable expenses exclude these items.",
    "모니터링, 인수 심사, 보험금 처리를 개별 예산화하며 변동비에 중복 반영하지 않습니다.",
    "監視・引受審査・保険金処理を個別に予算化し、変動費に重複計上しません。"
  ],
  "承保组合": [
    "Insured portfolio",
    "인수 포트폴리오",
    "引受ポートフォリオ"
  ],
  "测算情景": [
    "Pricing scenario",
    "산출 시나리오",
    "算出シナリオ"
  ],
  "版本": [
    "Version",
    "버전",
    "バージョン"
  ],
  "情景切换读取完整组合的预计算结果；成本率调整按同一赔款分布重新分解保费。": [
    "Scenarios use precomputed portfolio results. Cost-rate changes recalculate premiums from the same claims distribution.",
    "시나리오는 사전 산출된 포트폴리오 결과를 사용합니다. 비용률 변경은 동일 보험금 분포로 보험료를 다시 산출합니다.",
    "シナリオは計算済みポートフォリオ結果を使用し、費用率変更は同一保険金分布から保険料を再計算します。"
  ],
  "危险性、暴露与恢复假设": [
    "Hazard, exposure and recovery assumptions",
    "위험, 노출 및 복구 가정",
    "ハザード・エクスポージャー・復旧の前提"
  ],
  "M1广泛 / 特定功能条件命中": [
    "M1 broad / feature-specific conditional hit",
    "M1 광범위 / 특정 기능 조건부 영향",
    "M1広範囲／特定機能の条件付き影響"
  ],
  "M2区域 / 准入辖区事件频率": [
    "M2 region / access-jurisdiction event rate",
    "M2 리전 / 접근 관할 사건 빈도",
    "M2地域／利用規制管轄の事象頻度"
  ],
  "M2条件命中（基准）": [
    "M2 conditional hit (baseline)",
    "M2 조건부 영향 (기준)",
    "M2条件付き影響（基準）"
  ],
  "物理中断时长": [
    "Physical interruption duration",
    "물리적 중단 시간",
    "物理的中断の継続時間"
  ],
  "公告准备期": [
    "Notice lead time",
    "공지 준비 기간",
    "告知からの準備期間"
  ],
  "迁移适配时长": [
    "Migration and adaptation time",
    "이전 및 적용 시간",
    "移行・適合作業時間"
  ],
  "上述概率和恢复参数为研究情景。公共事件目录提供机制和范围证据，不直接给出客户出险率。": [
    "Probabilities and recovery inputs are research scenarios. Public records support mechanisms and scope, not client claim rates.",
    "확률 및 복구 입력값은 연구 시나리오입니다. 공개 자료는 작동 원리와 범위의 근거이며 고객 사고율은 아닙니다.",
    "確率・復旧パラメーターは研究シナリオです。公開記録は仕組みと範囲の根拠であり、顧客の事故率ではありません。"
  ],
  "示例保单": [
    "Example policies",
    "예시 증권",
    "サンプル契約"
  ],
  "组合小时金额": [
    "Portfolio hourly amount",
    "포트폴리오 시간당 금액",
    "ポートフォリオ時間額"
  ],
  "最大厂商 / 地区占比": [
    "Largest provider / region share",
    "최대 공급자 / 리전 비중",
    "最大事業者／地域の割合"
  ],
  "组合平均年保费": [
    "Portfolio mean annual premium",
    "포트폴리오 평균 연보험료",
    "ポートフォリオ平均年保険料"
  ],
  "已有保单价格锁定；新增业务须重新检查组合容量，不能直接当作第101张保单沿用价格。": [
    "Existing policy prices are locked. New business requires a portfolio capacity review; the same price cannot be assumed for a 101st policy.",
    "기존 증권 가격은 고정됩니다. 신규 인수 시 포트폴리오 용량을 재검토해야 하며 101번째 증권에 같은 가격을 가정할 수 없습니다.",
    "既存契約の価格は固定します。新規引受ではポートフォリオ容量を再審査し、101件目に同じ価格をそのまま適用しません。"
  ],
  "服务商 / 区域": [
    "Provider / region",
    "공급자 / 리전",
    "サービス事業者／地域"
  ],
  "业务 / 备用": [
    "Business / backup",
    "업무 / 예비 환경",
    "業務／予備環境"
  ],
  "报告敏感性": [
    "Report sensitivities",
    "보고서 민감도",
    "レポート感応度"
  ],
  "采用报告默认成本率；情景范围不是统计置信区间。全组合备用与集中度变化包含组合影响。": [
    "Report-default cost rates. Scenario ranges are not confidence intervals. Portfolio backup and concentration scenarios include portfolio effects.",
    "보고서 기본 비용률을 적용합니다. 시나리오 범위는 신뢰구간이 아닙니다. 예비 환경 및 집중도 변화에는 포트폴리오 효과가 포함됩니다.",
    "レポート既定の費用率を適用します。シナリオ範囲は信頼区間ではなく、予備環境・集中度の変更にはポートフォリオ効果が含まれます。"
  ],
  "相对基准": [
    "Vs. baseline",
    "기준 대비",
    "基準比"
  ],
  "M2低情景": [
    "M2 low scenario",
    "M2 낮은 시나리오",
    "M2低位シナリオ"
  ],
  "M2高情景": [
    "M2 high scenario",
    "M2 높은 시나리오",
    "M2高位シナリオ"
  ],
  "M2未获再保": [
    "M2 without reinsurance",
    "M2 재보험 미확보",
    "M2再保険未取得"
  ],
  "M1频率减半": [
    "M1 frequency halved",
    "M1 빈도 절반",
    "M1頻度半減"
  ],
  "M1频率加倍": [
    "M1 frequency doubled",
    "M1 빈도 두 배",
    "M1頻度倍増"
  ],
  "组合高度集中": [
    "High portfolio concentration",
    "높은 포트폴리오 집중도",
    "高いポートフォリオ集中度"
  ],
  "全组合无备用": [
    "No portfolio backups",
    "전체 포트폴리오 예비 환경 없음",
    "全契約に予備環境なし"
  ],
  "全组合已测试备用": [
    "Tested backups across portfolio",
    "전체 포트폴리오 예비 환경 검증",
    "全契約の予備環境を検証済み"
  ],
  "首次投保年度": [
    "First insured year",
    "최초 가입 연도",
    "初回保険年度"
  ],
  "投保条件变化后原报价失效；已确认保单保留原币种、条款和报价快照。": [
    "Changed application terms invalidate unbound quotes. Bound policies retain their original currency, terms and quote snapshot.",
    "청약 조건 변경 시 미체결 견적은 무효화됩니다. 확정 증권은 기존 통화, 조건 및 견적을 유지합니다.",
    "申込条件の変更で未成立見積もりは失効し、成立済み契約は元の通貨・条件・見積もりを保持します。"
  ],
  "恢复当前生效参数": [
    "Restore active parameters",
    "현재 유효한 매개변수 복원",
    "現在の有効パラメーターを復元"
  ],
  "首次连续承保日期": [
    "First continuous inception date",
    "최초 연속 보장 시작일",
    "継続補償の初回始期日"
  ],
  "连续续保": [
    "Continuous renewal",
    "연속 갱신",
    "連続更新"
  ],
  "首次承保日期不得晚于本期起保日期": [
    "First inception cannot follow the current policy start",
    "최초 보장 시작일은 현재 보험기간 시작일보다 늦을 수 없습니다",
    "初回始期日は今期始期日以前にしてください"
  ],
  "同一事件的其他业务": [
    "Other businesses in the same event",
    "동일 사고의 다른 업무",
    "同一事故のその他の業務"
  ],
  "受影响业务": [
    "Affected business",
    "영향받은 업무",
    "影響を受けた業務"
  ],
  "业务中断": [
    "Business interruption",
    "업무 중단",
    "業務中断"
  ],
  "业务恢复": [
    "Business recovery",
    "업무 복구",
    "業務復旧"
  ],
  "不可追回贡献毛利": [
    "Irrecoverable contribution margin",
    "회복 불가능한 공헌이익",
    "回収不能な限界利益"
  ],
  "同损失补偿": [
    "Other compensation for this loss",
    "동일 손실에 대한 기타 보상",
    "同一損失への他の補償"
  ],
  "添加受影响业务": [
    "Add affected business",
    "영향받은 업무 추가",
    "影響業務を追加"
  ],
  "可赔分钟": [
    "Payable minutes",
    "지급 대상 분",
    "支払対象分数"
  ],
  "逐业务金额": [
    "Business amount",
    "업무별 금액",
    "業務別金額"
  ],
  "各独立业务分别计算后汇总": [
    "Sum of separately calculated businesses",
    "독립 업무별 산출 후 합산",
    "独立業務ごとに計算して合算"
  ],
  "逐业务贡献毛利扣除同损失补偿": [
    "Business contribution margin less other compensation",
    "업무별 공헌이익에서 기타 보상 차감",
    "業務別限界利益から同一損失の補償を控除"
  ],
  "首次实际中断须在本保单责任年度内": [
    "First actual interruption must fall within this policy year",
    "최초 실제 중단은 해당 보험연도에 발생해야 합니다",
    "最初の実際の中断は当該保険年度内である必要があります"
  ],
  "业务必须已列明且不可重复申报": [
    "Businesses must be listed and not duplicated",
    "명시된 업무만 중복 없이 신고해야 합니다",
    "列明済み業務のみ、重複なく申告してください"
  ],
  "首次承保前已知的具体停供安排或责任期间外公告不适用": [
    "Known pre-inception stoppages or out-of-period notices are excluded",
    "최초 보장 전 알려진 중단이나 보장기간 밖 공지는 제외됩니다",
    "初回始期前に既知の具体的停止や責任期間外の告知は対象外です"
  ],
  "公告须发生于首次连续承保之后": [
    "Notice must follow first continuous inception",
    "공지는 최초 연속 보장 시작 이후여야 합니다",
    "告知は継続補償の初回始期後である必要があります"
  ],
  "核心数字业务": [
    "Core digital business",
    "핵심 디지털 업무",
    "基幹デジタル業務"
  ],
  "独立AI付费业务": [
    "Independent paid AI business",
    "독립 유료 AI 업무",
    "独立した有料AI業務"
  ],
  "独立付费任务；收入与核心业务不重叠。": [
    "Independent paid tasks; no revenue overlap with core business.",
    "독립 유료 작업으로 핵심 업무 수익과 중복되지 않습니다.",
    "独立した有料タスクで、基幹業務の収益と重複しません。"
  ],
  "计算、数据库与存储共同支撑核心业务。": [
    "Compute, database and storage jointly support the core business.",
    "컴퓨팅, 데이터베이스 및 스토리지가 핵심 업무를 함께 지원합니다.",
    "コンピュート・データベース・ストレージが基幹業務を共同で支えます。"
  ],
  "法兰克福": [
    "Frankfurt",
    "프랑크푸르트",
    "フランクフルト"
  ],
  "首尔": [
    "Seoul",
    "서울",
    "ソウル"
  ],
  "香港": [
    "Hong Kong",
    "홍콩",
    "香港"
  ],
  "东京": [
    "Tokyo",
    "도쿄",
    "東京"
  ],
  "官方事件目录": [
    "Official event catalogue",
    "공식 사건 목록",
    "公式事象カタログ"
  ],
  "云区域与历史事件": [
    "Cloud regions and historical events",
    "클라우드 리전 및 과거 사건",
    "クラウド地域と過去の事象"
  ],
  "区域相关候选事件": [
    "Region-related candidate events",
    "리전 관련 후보 사건",
    "地域関連の候補事象"
  ],
  "全目录纳入 / 剔除": [
    "Catalogue included / excluded",
    "전체 목록 포함 / 제외",
    "全カタログ採用／除外"
  ],
  "Google Cloud官方事件模板；其他厂商暂用代理。事件数量不等于客户出险率，须匹配产品、区域与功能。": [
    "Official Google Cloud event templates; used as a proxy for other providers. Counts are not client claim rates: product, region and feature must match.",
    "Google Cloud 공식 사건 템플릿을 다른 공급자의 대용으로 사용합니다. 사건 수는 고객 사고율이 아니며 제품, 리전 및 기능이 일치해야 합니다.",
    "Google Cloud公式事象を他社の代理テンプレートとして使用します。件数は顧客事故率ではなく、製品・地域・機能の一致が必要です。"
  ],
  "官方事件": [
    "Official event",
    "공식 사건",
    "公式事象"
  ],
  "公开时长": [
    "Published duration",
    "공개된 지속 시간",
    "公表継続時間"
  ],
  "原文 ↗": [
    "Source ↗",
    "원문 ↗",
    "原文 ↗"
  ],
  "准备成功概率": [
    "Preparation success probability",
    "준비 성공 확률",
    "準備成功確率"
  ],
  "M1备用接管成功概率": [
    "M1 backup takeover probability",
    "M1 예비 전환 성공 확률",
    "M1予備切替成功確率"
  ],
  "M2备用接管成功概率": [
    "M2 backup takeover probability",
    "M2 예비 전환 성공 확률",
    "M2予備切替成功確率"
  ],
  "成功接管恢复时间": [
    "Recovery time after successful takeover",
    "성공적 전환 시 복구 시간",
    "切替成功時の復旧時間"
  ],
  "迁移适配": [
    "Migration and adaptation",
    "이전 및 적용",
    "移行・適合"
  ],
  "准备成功时扣减可用公告期；备用接管按概率模拟，不视为必定成功。实际理赔按恢复记录停止计时。": [
    "Successful preparation reduces the remaining migration time by the notice lead time. Backup takeover is probabilistic. Claims stop accruing at documented recovery.",
    "준비 성공 시 공지 기간만큼 남은 이전 시간을 줄입니다. 예비 전환은 확률로 모의하며 실제 보험금은 확인된 복구 시점에 누적을 멈춥니다.",
    "準備成功時は告知期間を移行残時間から控除します。予備切替は確率的に扱い、実際の保険金は確認された復旧時点で計時を止めます。"
  ]
});
// Preserve existing form translations when the currency label changes to USD.
for(const [key,values] of Object.entries(window.CBLocaleMessages)){
 if(/元|人民币|¥|CNY/.test(key)){
  const usd=key.replace(/¥\s*/g,'USD ').replace(/人民币/g,'USD').replace(/元(?=[，、）/\s]|$)/g,'USD');
  if(usd!==key&&!window.CBLocaleMessages[usd])window.CBLocaleMessages[usd]=values.map(v=>v.replace(/CNY|RMB|人民币|위안|人民元|¥/g,'USD'));
 }
}

Object.assign(window.CBLocaleMessages,{
  "营业日历": [
    "Business calendar",
    "영업 일정",
    "営業カレンダー"
  ],
  "保单": [
    "Policy",
    "증권",
    "保険契約"
  ],
  "无备用": [
    "No backup",
    "예비 환경 없음",
    "予備環境なし"
  ],
  "年保费": [
    "Annual premium",
    "연간 보험료",
    "年間保険料"
  ],
  "统一精算研究": [
    "Unified actuarial study",
    "통합 계리 연구",
    "統一精算研究"
  ],
  "统一研究组合": [
    "Unified reference portfolio",
    "통합 연구 포트폴리오",
    "統一研究ポートフォリオ"
  ],
  "载入统一研究核赔算例": [
    "Loaded unified claims example",
    "통합 보상 예시 불러옴",
    "統一査定例を読み込み"
  ],
  "是": [
    "Yes",
    "예",
    "はい"
  ],
  "否": [
    "No",
    "아니요",
    "いいえ"
  ],
  "移除": [
    "Remove",
    "삭제",
    "削除"
  ],
  "业务": [
    "Business",
    "업무",
    "業務"
  ],
  "参数金额": [
    "Parameter amount",
    "매개변수 금액",
    "パラメトリック金額"
  ],
  "净损失": [
    "Net loss",
    "순손실",
    "純損失"
  ],
  "各业务可赔分钟合计": [
    "Sum of business payable minutes",
    "업무별 지급 대상 분 합계",
    "業務別支払対象分数の合計"
  ],
  "组合容量与共同依赖已复核": [
    "Portfolio capacity and common dependencies reviewed",
    "포트폴리오 용량 및 공통 의존성 검토 완료",
    "ポートフォリオ容量・共通依存を確認済み"
  ],
  "核对引用组合版本、共享上游、准入辖区及剩余再保容量。": [
    "Check the reference portfolio version, shared upstream, access jurisdictions and remaining reinsurance capacity.",
    "참조 포트폴리오 버전, 공통 상위 서비스, 접근 관할 및 잔여 재보험 용량을 확인합니다.",
    "参照ポートフォリオの版、共通上流サービス、利用規制管轄、再保険残余容量を確認します。"
  ],
  "海桥数字科技有限公司": [
    "HarborBridge Digital Technology",
    "하버브리지 디지털 테크놀로지",
    "ハーバーブリッジ・デジタルテクノロジー"
  ],
  "海": [
    "H",
    "H",
    "H"
  ],
  "示": [
    "S",
    "S",
    "S"
  ],
  "M2外部事件中断：核验关键数字依赖、适用准入变化与实际中断。首次投保前已知的具体停供安排除外；连续续保按首次实际中断年度归属，同一事件不刷新年度限额。仅保障不可追回贡献毛利，扣除同损失补偿；不计迁移等额外费用。": [
    "M2 external event disruption: verify critical digital dependencies, applicable access changes and actual interruption. Known pre-inception stoppages are excluded. Under continuous renewal, the first actual interruption determines the policy year; one event does not refresh annual limits. Cover irrecoverable contribution margin less same-loss compensation, excluding migration and other extra expenses.",
    "M2 외부 사건 중단: 핵심 디지털 의존성, 적용되는 접근 변경 및 실제 중단을 확인합니다. 최초 가입 전 알려진 중단은 제외됩니다. 연속 갱신 시 최초 실제 중단 연도에 귀속하며 동일 사고로 연간 한도를 갱신하지 않습니다. 회복 불가능한 공헌이익에서 동일 손실 보상을 차감하고 이전 등 추가 비용은 제외합니다.",
    "M2外部事象による中断：重要なデジタル依存、適用される利用条件変更、実際の中断を確認します。初回加入前に既知の具体的停止は除外します。連続更新では最初の実際の中断が生じた保険年度に帰属し、同一事故で年間限度は更新しません。同一損失への補償を控除した回収不能な限界利益のみを補償し、移行等の追加費用は含みません。"
  ],
  "连续续保：上年度12月公告，1月10日实际中断。核心业务1.5小时恢复，独立AI业务4小时恢复。": [
    "Continuous renewal: notice in December of the prior year; interruption on January 10. Core business recovers after 1.5 hours and independent AI business after 4 hours.",
    "연속 갱신: 전년도 12월 공지 후 1월 10일 실제 중단. 핵심 업무는 1.5시간, 독립 AI 업무는 4시간 후 복구됩니다.",
    "連続更新：前年度12月に告知、1月10日に実際の中断。基幹業務は1.5時間後、独立AI業務は4時間後に復旧します。"
  ],
  "收到公告后开展迁移、适配及验证。": [
    "Migration, adaptation and validation began after notice.",
    "공지 후 이전, 적용 및 검증을 시작했습니다.",
    "告知後に移行・適合・検証を開始しました。"
  ],
  "核心业务11:30恢复，AI业务14:00恢复。": [
    "Core business recovered at 11:30; AI business at 14:00.",
    "핵심 업무 11:30, AI 업무 14:00 복구.",
    "基幹業務は11:30、AI業務は14:00に復旧。"
  ],
  "核心业务不可追回贡献毛利 USD 800；独立AI业务 USD 1,600，分别核验。": [
    "Irrecoverable contribution margin: core business USD 800; independent AI business USD 1,600, verified separately.",
    "회복 불가능한 공헌이익: 핵심 업무 USD 800, 독립 AI 업무 USD 1,600, 개별 검증.",
    "回収不能な限界利益：基幹業務USD 800、独立AI業務USD 1,600を個別に確認。"
  ],
  "核验首次投保后公告、连续续保、实际中断年度及各业务恢复；同一事件共用限额。": [
    "Verify post-inception notice, continuous renewal, interruption year and each business recovery; one shared event limit applies.",
    "최초 가입 후 공지, 연속 갱신, 실제 중단 연도 및 업무별 복구를 확인하며 동일 사고 한도를 공유합니다.",
    "初回加入後の告知、連続更新、中断年度、業務別復旧を確認し、同一事故の限度を共有します。"
  ],
  "56项无法追回的付费任务 × USD 10贡献毛利 = USD 560。": [
    "56 irrecoverable paid tasks × USD 10 contribution margin = USD 560.",
    "회복 불가능한 유료 작업 56건 × 공헌이익 USD 10 = USD 560.",
    "回収不能な有料タスク56件 × 限界利益USD 10 = USD 560。"
  ],
  "列明服务连续中断3.5小时，核对独立业务的实际影响。": [
    "The listed service was interrupted for 3.5 hours; verify the independent business impact.",
    "명시 서비스 3.5시간 중단; 독립 업무의 실제 영향을 확인합니다.",
    "列明サービスが3.5時間中断。独立業務への実際の影響を確認します。"
  ],
  "尝试重试和恢复；已核对可以补做的任务。": [
    "Retries and recovery attempted; recoverable tasks reconciled.",
    "재시도 및 복구를 시도하고 보완 가능한 작업을 확인했습니다.",
    "再試行・復旧を実施し、後日処理できるタスクを照合済み。"
  ],
  "13:30业务恢复；连续观测窗口确认。": [
    "Business recovered at 13:30, confirmed over a continuous observation window.",
    "13:30 업무 복구, 연속 관측 구간에서 확인.",
    "13:30業務復旧、連続観測窓で確認。"
  ],
  "示例调查记录：监测、业务交易和切换记录的事故时段相互吻合。待核赔人逐项复核。": [
    "Example investigation: monitoring, transactions and failover records align. Pending claims-review verification.",
    "조사 예시: 모니터링, 거래 및 전환 기록의 사고 시간이 일치합니다. 보상 심사자의 항목별 확인이 필요합니다.",
    "調査例：監視・取引・切替記録の事故時間が一致。査定担当者による項目別確認待ち。"
  ],
  "业务系统按唯一订单汇总，财务核对单笔贡献毛利；根据历史补单率估计不可挽回比例。": [
    "Aggregate unique orders, verify per-order contribution margin and estimate irrecoverability from historical recovery rates.",
    "고유 주문을 집계하고 건별 공헌이익을 확인한 후 과거 복구율로 회복 불가능 비중을 추정합니다.",
    "固有注文を集計し、注文当たり限界利益を照合し、過去の後日処理率から回収不能割合を推計します。"
  ],
  "Google Cloud · 核心业务USD 600/h，独立AI业务USD 400/h。": [
    "Google Cloud · Core USD 600/h; independent AI USD 400/h.",
    "Google Cloud · 핵심 업무 USD 600/h, 독립 AI USD 400/h.",
    "Google Cloud・基幹業務USD 600/h、独立AI業務USD 400/h。"
  ],
  "跨年公告与连续续保；两项业务合计赔款USD 2,000。": [
    "Cross-year notice with continuous renewal; total payment USD 2,000.",
    "연도 간 공지 및 연속 갱신; 두 업무 총보험금 USD 2,000.",
    "年をまたぐ告知と連続更新。2業務の保険金合計USD 2,000。"
  ],
  "3.5小时中断；参数USD 1,200，净损失封顶后USD 560。": [
    "3.5-hour interruption; USD 1,200 parameter amount, capped at USD 560 net loss.",
    "3.5시간 중단; 매개변수 금액 USD 1,200, 순손실 상한 적용 후 USD 560.",
    "3.5時間中断。パラメトリック金額USD 1,200、純損失上限適用後USD 560。"
  ],
  "模块保费按期望赔款占比分摊。": [
    "Module premiums are allocated by expected-claim shares.",
    "모듈 보험료는 기대 보험금 비중으로 배분합니다.",
    "モジュール保険料は期待保険金の割合で配賦します。"
  ],
  "该情景仅用于组合研究，不能直接出单": [
    "This scenario is for portfolio research, not direct policy issuance.",
    "이 시나리오는 포트폴리오 연구용이며 직접 증권을 발행할 수 없습니다.",
    "このシナリオはポートフォリオ研究用で、直接契約発行には使用できません。"
  ],
  "示例企业 CBU-001": [
    "Sample company CBU-001",
    "예시 기업 CBU-001",
    "サンプル企業 CBU-001"
  ],
  "示例企业 CBU-002": [
    "Sample company CBU-002",
    "예시 기업 CBU-002",
    "サンプル企業 CBU-002"
  ],
  "示例企业 CBU-003": [
    "Sample company CBU-003",
    "예시 기업 CBU-003",
    "サンプル企業 CBU-003"
  ],
  "示例企业 CBU-004": [
    "Sample company CBU-004",
    "예시 기업 CBU-004",
    "サンプル企業 CBU-004"
  ],
  "示例企业 CBU-005": [
    "Sample company CBU-005",
    "예시 기업 CBU-005",
    "サンプル企業 CBU-005"
  ],
  "示例企业 CBU-006": [
    "Sample company CBU-006",
    "예시 기업 CBU-006",
    "サンプル企業 CBU-006"
  ],
  "示例企业 CBU-007": [
    "Sample company CBU-007",
    "예시 기업 CBU-007",
    "サンプル企業 CBU-007"
  ],
  "示例企业 CBU-008": [
    "Sample company CBU-008",
    "예시 기업 CBU-008",
    "サンプル企業 CBU-008"
  ],
  "示例企业 CBU-009": [
    "Sample company CBU-009",
    "예시 기업 CBU-009",
    "サンプル企業 CBU-009"
  ],
  "示例企业 CBU-010": [
    "Sample company CBU-010",
    "예시 기업 CBU-010",
    "サンプル企業 CBU-010"
  ],
  "示例企业 CBU-011": [
    "Sample company CBU-011",
    "예시 기업 CBU-011",
    "サンプル企業 CBU-011"
  ],
  "示例企业 CBU-012": [
    "Sample company CBU-012",
    "예시 기업 CBU-012",
    "サンプル企業 CBU-012"
  ],
  "示例企业 CBU-013": [
    "Sample company CBU-013",
    "예시 기업 CBU-013",
    "サンプル企業 CBU-013"
  ],
  "示例企业 CBU-014": [
    "Sample company CBU-014",
    "예시 기업 CBU-014",
    "サンプル企業 CBU-014"
  ],
  "示例企业 CBU-015": [
    "Sample company CBU-015",
    "예시 기업 CBU-015",
    "サンプル企業 CBU-015"
  ],
  "示例企业 CBU-016": [
    "Sample company CBU-016",
    "예시 기업 CBU-016",
    "サンプル企業 CBU-016"
  ],
  "示例企业 CBU-017": [
    "Sample company CBU-017",
    "예시 기업 CBU-017",
    "サンプル企業 CBU-017"
  ],
  "示例企业 CBU-018": [
    "Sample company CBU-018",
    "예시 기업 CBU-018",
    "サンプル企業 CBU-018"
  ],
  "示例企业 CBU-019": [
    "Sample company CBU-019",
    "예시 기업 CBU-019",
    "サンプル企業 CBU-019"
  ],
  "示例企业 CBU-020": [
    "Sample company CBU-020",
    "예시 기업 CBU-020",
    "サンプル企業 CBU-020"
  ],
  "示例企业 CBU-021": [
    "Sample company CBU-021",
    "예시 기업 CBU-021",
    "サンプル企業 CBU-021"
  ],
  "示例企业 CBU-022": [
    "Sample company CBU-022",
    "예시 기업 CBU-022",
    "サンプル企業 CBU-022"
  ],
  "示例企业 CBU-023": [
    "Sample company CBU-023",
    "예시 기업 CBU-023",
    "サンプル企業 CBU-023"
  ],
  "示例企业 CBU-024": [
    "Sample company CBU-024",
    "예시 기업 CBU-024",
    "サンプル企業 CBU-024"
  ],
  "示例企业 CBU-025": [
    "Sample company CBU-025",
    "예시 기업 CBU-025",
    "サンプル企業 CBU-025"
  ],
  "示例企业 CBU-026": [
    "Sample company CBU-026",
    "예시 기업 CBU-026",
    "サンプル企業 CBU-026"
  ],
  "示例企业 CBU-027": [
    "Sample company CBU-027",
    "예시 기업 CBU-027",
    "サンプル企業 CBU-027"
  ],
  "示例企业 CBU-028": [
    "Sample company CBU-028",
    "예시 기업 CBU-028",
    "サンプル企業 CBU-028"
  ],
  "示例企业 CBU-029": [
    "Sample company CBU-029",
    "예시 기업 CBU-029",
    "サンプル企業 CBU-029"
  ],
  "示例企业 CBU-030": [
    "Sample company CBU-030",
    "예시 기업 CBU-030",
    "サンプル企業 CBU-030"
  ],
  "示例企业 CBU-031": [
    "Sample company CBU-031",
    "예시 기업 CBU-031",
    "サンプル企業 CBU-031"
  ],
  "示例企业 CBU-032": [
    "Sample company CBU-032",
    "예시 기업 CBU-032",
    "サンプル企業 CBU-032"
  ],
  "示例企业 CBU-033": [
    "Sample company CBU-033",
    "예시 기업 CBU-033",
    "サンプル企業 CBU-033"
  ],
  "示例企业 CBU-034": [
    "Sample company CBU-034",
    "예시 기업 CBU-034",
    "サンプル企業 CBU-034"
  ],
  "示例企业 CBU-035": [
    "Sample company CBU-035",
    "예시 기업 CBU-035",
    "サンプル企業 CBU-035"
  ],
  "示例企业 CBU-036": [
    "Sample company CBU-036",
    "예시 기업 CBU-036",
    "サンプル企業 CBU-036"
  ],
  "示例企业 CBU-037": [
    "Sample company CBU-037",
    "예시 기업 CBU-037",
    "サンプル企業 CBU-037"
  ],
  "示例企业 CBU-038": [
    "Sample company CBU-038",
    "예시 기업 CBU-038",
    "サンプル企業 CBU-038"
  ],
  "示例企业 CBU-039": [
    "Sample company CBU-039",
    "예시 기업 CBU-039",
    "サンプル企業 CBU-039"
  ],
  "示例企业 CBU-040": [
    "Sample company CBU-040",
    "예시 기업 CBU-040",
    "サンプル企業 CBU-040"
  ],
  "示例企业 CBU-041": [
    "Sample company CBU-041",
    "예시 기업 CBU-041",
    "サンプル企業 CBU-041"
  ],
  "示例企业 CBU-042": [
    "Sample company CBU-042",
    "예시 기업 CBU-042",
    "サンプル企業 CBU-042"
  ],
  "示例企业 CBU-043": [
    "Sample company CBU-043",
    "예시 기업 CBU-043",
    "サンプル企業 CBU-043"
  ],
  "示例企业 CBU-044": [
    "Sample company CBU-044",
    "예시 기업 CBU-044",
    "サンプル企業 CBU-044"
  ],
  "示例企业 CBU-045": [
    "Sample company CBU-045",
    "예시 기업 CBU-045",
    "サンプル企業 CBU-045"
  ],
  "示例企业 CBU-046": [
    "Sample company CBU-046",
    "예시 기업 CBU-046",
    "サンプル企業 CBU-046"
  ],
  "示例企业 CBU-047": [
    "Sample company CBU-047",
    "예시 기업 CBU-047",
    "サンプル企業 CBU-047"
  ],
  "示例企业 CBU-048": [
    "Sample company CBU-048",
    "예시 기업 CBU-048",
    "サンプル企業 CBU-048"
  ],
  "示例企业 CBU-049": [
    "Sample company CBU-049",
    "예시 기업 CBU-049",
    "サンプル企業 CBU-049"
  ],
  "示例企业 CBU-050": [
    "Sample company CBU-050",
    "예시 기업 CBU-050",
    "サンプル企業 CBU-050"
  ],
  "示例企业 CBU-051": [
    "Sample company CBU-051",
    "예시 기업 CBU-051",
    "サンプル企業 CBU-051"
  ],
  "示例企业 CBU-052": [
    "Sample company CBU-052",
    "예시 기업 CBU-052",
    "サンプル企業 CBU-052"
  ],
  "示例企业 CBU-053": [
    "Sample company CBU-053",
    "예시 기업 CBU-053",
    "サンプル企業 CBU-053"
  ],
  "示例企业 CBU-054": [
    "Sample company CBU-054",
    "예시 기업 CBU-054",
    "サンプル企業 CBU-054"
  ],
  "示例企业 CBU-055": [
    "Sample company CBU-055",
    "예시 기업 CBU-055",
    "サンプル企業 CBU-055"
  ],
  "示例企业 CBU-056": [
    "Sample company CBU-056",
    "예시 기업 CBU-056",
    "サンプル企業 CBU-056"
  ],
  "示例企业 CBU-057": [
    "Sample company CBU-057",
    "예시 기업 CBU-057",
    "サンプル企業 CBU-057"
  ],
  "示例企业 CBU-058": [
    "Sample company CBU-058",
    "예시 기업 CBU-058",
    "サンプル企業 CBU-058"
  ],
  "示例企业 CBU-059": [
    "Sample company CBU-059",
    "예시 기업 CBU-059",
    "サンプル企業 CBU-059"
  ],
  "示例企业 CBU-060": [
    "Sample company CBU-060",
    "예시 기업 CBU-060",
    "サンプル企業 CBU-060"
  ],
  "示例企业 CBU-061": [
    "Sample company CBU-061",
    "예시 기업 CBU-061",
    "サンプル企業 CBU-061"
  ],
  "示例企业 CBU-062": [
    "Sample company CBU-062",
    "예시 기업 CBU-062",
    "サンプル企業 CBU-062"
  ],
  "示例企业 CBU-063": [
    "Sample company CBU-063",
    "예시 기업 CBU-063",
    "サンプル企業 CBU-063"
  ],
  "示例企业 CBU-064": [
    "Sample company CBU-064",
    "예시 기업 CBU-064",
    "サンプル企業 CBU-064"
  ],
  "示例企业 CBU-065": [
    "Sample company CBU-065",
    "예시 기업 CBU-065",
    "サンプル企業 CBU-065"
  ],
  "示例企业 CBU-066": [
    "Sample company CBU-066",
    "예시 기업 CBU-066",
    "サンプル企業 CBU-066"
  ],
  "示例企业 CBU-067": [
    "Sample company CBU-067",
    "예시 기업 CBU-067",
    "サンプル企業 CBU-067"
  ],
  "示例企业 CBU-068": [
    "Sample company CBU-068",
    "예시 기업 CBU-068",
    "サンプル企業 CBU-068"
  ],
  "示例企业 CBU-069": [
    "Sample company CBU-069",
    "예시 기업 CBU-069",
    "サンプル企業 CBU-069"
  ],
  "示例企业 CBU-070": [
    "Sample company CBU-070",
    "예시 기업 CBU-070",
    "サンプル企業 CBU-070"
  ],
  "示例企业 CBU-071": [
    "Sample company CBU-071",
    "예시 기업 CBU-071",
    "サンプル企業 CBU-071"
  ],
  "示例企业 CBU-072": [
    "Sample company CBU-072",
    "예시 기업 CBU-072",
    "サンプル企業 CBU-072"
  ],
  "示例企业 CBU-073": [
    "Sample company CBU-073",
    "예시 기업 CBU-073",
    "サンプル企業 CBU-073"
  ],
  "示例企业 CBU-074": [
    "Sample company CBU-074",
    "예시 기업 CBU-074",
    "サンプル企業 CBU-074"
  ],
  "示例企业 CBU-075": [
    "Sample company CBU-075",
    "예시 기업 CBU-075",
    "サンプル企業 CBU-075"
  ],
  "示例企业 CBU-076": [
    "Sample company CBU-076",
    "예시 기업 CBU-076",
    "サンプル企業 CBU-076"
  ],
  "示例企业 CBU-077": [
    "Sample company CBU-077",
    "예시 기업 CBU-077",
    "サンプル企業 CBU-077"
  ],
  "示例企业 CBU-078": [
    "Sample company CBU-078",
    "예시 기업 CBU-078",
    "サンプル企業 CBU-078"
  ],
  "示例企业 CBU-079": [
    "Sample company CBU-079",
    "예시 기업 CBU-079",
    "サンプル企業 CBU-079"
  ],
  "示例企业 CBU-080": [
    "Sample company CBU-080",
    "예시 기업 CBU-080",
    "サンプル企業 CBU-080"
  ],
  "示例企业 CBU-081": [
    "Sample company CBU-081",
    "예시 기업 CBU-081",
    "サンプル企業 CBU-081"
  ],
  "示例企业 CBU-082": [
    "Sample company CBU-082",
    "예시 기업 CBU-082",
    "サンプル企業 CBU-082"
  ],
  "示例企业 CBU-083": [
    "Sample company CBU-083",
    "예시 기업 CBU-083",
    "サンプル企業 CBU-083"
  ],
  "示例企业 CBU-084": [
    "Sample company CBU-084",
    "예시 기업 CBU-084",
    "サンプル企業 CBU-084"
  ],
  "示例企业 CBU-085": [
    "Sample company CBU-085",
    "예시 기업 CBU-085",
    "サンプル企業 CBU-085"
  ],
  "示例企业 CBU-086": [
    "Sample company CBU-086",
    "예시 기업 CBU-086",
    "サンプル企業 CBU-086"
  ],
  "示例企业 CBU-087": [
    "Sample company CBU-087",
    "예시 기업 CBU-087",
    "サンプル企業 CBU-087"
  ],
  "示例企业 CBU-088": [
    "Sample company CBU-088",
    "예시 기업 CBU-088",
    "サンプル企業 CBU-088"
  ],
  "示例企业 CBU-089": [
    "Sample company CBU-089",
    "예시 기업 CBU-089",
    "サンプル企業 CBU-089"
  ],
  "示例企业 CBU-090": [
    "Sample company CBU-090",
    "예시 기업 CBU-090",
    "サンプル企業 CBU-090"
  ],
  "示例企业 CBU-091": [
    "Sample company CBU-091",
    "예시 기업 CBU-091",
    "サンプル企業 CBU-091"
  ],
  "示例企业 CBU-092": [
    "Sample company CBU-092",
    "예시 기업 CBU-092",
    "サンプル企業 CBU-092"
  ],
  "示例企业 CBU-093": [
    "Sample company CBU-093",
    "예시 기업 CBU-093",
    "サンプル企業 CBU-093"
  ],
  "示例企业 CBU-094": [
    "Sample company CBU-094",
    "예시 기업 CBU-094",
    "サンプル企業 CBU-094"
  ],
  "示例企业 CBU-095": [
    "Sample company CBU-095",
    "예시 기업 CBU-095",
    "サンプル企業 CBU-095"
  ],
  "示例企业 CBU-096": [
    "Sample company CBU-096",
    "예시 기업 CBU-096",
    "サンプル企業 CBU-096"
  ],
  "示例企业 CBU-097": [
    "Sample company CBU-097",
    "예시 기업 CBU-097",
    "サンプル企業 CBU-097"
  ],
  "示例企业 CBU-098": [
    "Sample company CBU-098",
    "예시 기업 CBU-098",
    "サンプル企業 CBU-098"
  ],
  "示例企业 CBU-099": [
    "Sample company CBU-099",
    "예시 기업 CBU-099",
    "サンプル企業 CBU-099"
  ],
  "示例企业 CBU-100": [
    "Sample company CBU-100",
    "예시 기업 CBU-100",
    "サンプル企業 CBU-100"
  ]
});

Object.assign(window.CBLocaleMessages,{"M2条件命中": ["M2 conditional hit", "M2 조건부 영향", "M2条件付き影響"], "风险资料与定价口径": ["Risk evidence and pricing basis", "위험 근거 및 요율 기준", "リスク資料と定価の基準"], "M1采用2023–2025年官方事件目录：39条候选、34条纳入、5条剔除，按产品、区域和功能映射。": ["M1 uses the 2023–2025 official catalogue: 39 candidates, 34 included and 5 excluded, mapped by product, region and feature.", "M1은 2023–2025년 공식 목록을 사용합니다. 후보 39건 중 34건 포함, 5건 제외하며 제품, 리전, 기능으로 매핑합니다.", "M1は2023～2025年の公式カタログを使用。候補39件のうち34件採用、5件除外し、製品・地域・機能で対応付けます。"], "M2公共冲突与设施目录用于证据审查；事件频率、命中及恢复仍为研究情景。地图筛选不修改报价。": ["M2 public conflict and facility records support evidence review. Event frequency, impact and recovery remain research scenarios. Map filters do not change quotes.", "M2 공개 분쟁 및 시설 자료는 근거 검토에 사용합니다. 사건 빈도, 영향 및 복구는 연구 시나리오이며 지도 필터는 견적을 변경하지 않습니다.", "M2の公開紛争・施設記録は証拠確認に使用します。事象頻度・影響・復旧は研究シナリオであり、地図の絞り込みは見積もりを変更しません。"]});

Object.assign(window.CBLocaleMessages,{"基本信息": ["Basic information", "기본 정보", "基本情報"], "企业名称 *": ["Company name *", "기업명 *", "企業名 *"], "服务商 *": ["Provider *", "공급자 *", "サービス事業者 *"], "AI API产品 *": ["AI API product *", "AI API 제품 *", "AI API製品 *"], "模型版本 / API端点 *": ["Model version / API endpoint *", "모델 버전 / API 엔드포인트 *", "モデルバージョン／APIエンドポイント *"], "生产端点 / 受保功能": ["Production endpoint / covered function", "운영 엔드포인트 / 보장 기능", "本番エンドポイント／補償対象機能"], "添加承保服务": ["Add covered service", "보장 서비스 추가", "補償サービスを追加"], "承保服务": ["Covered services", "보장 서비스", "補償サービス"], "业务运行时间": ["Business operating hours", "업무 운영 시간", "業務稼働時間"], "备用模型 / API": ["Backup model / API", "예비 모델 / API", "予備モデル／API"], "预计业务恢复时间（分钟）": ["Expected business recovery time (minutes)", "예상 업무 복구 시간(분)", "業務復旧見込時間（分）"], "更换模型 / API适配时间（小时）": ["Model / API migration time (hours)", "모델 / API 전환 소요 시간(시간)", "モデル／API移行時間（時間）"], "是否已收到停供或限制通知": ["Existing suspension or restriction notice", "서비스 중단 또는 제한 공지 수신 여부", "サービス停止・制限の告知の有無"], "备用API与切换方案": ["Backup API and switching plan", "예비 API 및 전환 계획", "予備APIと切替計画"], "备用方案与恢复说明": ["Backup and recovery plan", "예비 및 복구 계획", "予備環境と復旧計画"], "按唯一付费任务评估损失；错误、超时与实际业务不可用对应，重试和恢复后补做不重复计损。": ["Assess loss by unique paid tasks. Link errors and timeouts to actual business unavailability; do not double-count retries or recovered work.", "고유 유료 작업별로 손실을 평가합니다. 오류·시간 초과를 실제 업무 중단과 연결하고 재시도·복구 후 완료 작업을 중복 계산하지 않습니다.", "固有の有料タスク単位で損失を評価。エラー・タイムアウトを実際の業務停止と対応付け、再試行や復旧後の処理を重複計上しません。"]});

Object.assign(window.CBLocaleMessages,{
  "列明模型 / 版本 *": [
    "Model / version *",
    "명시 모델 / 버전 *",
    "対象モデル / バージョン *"
  ],
  "列明模型 / 版本": [
    "Model / version",
    "명시 모델 / 버전",
    "対象モデル / バージョン"
  ],
  "受保API接口 / 端点 *": [
    "Covered API / endpoint *",
    "보장 API / 엔드포인트 *",
    "対象 API / エンドポイント *"
  ],
  "受保API接口 / 端点": [
    "Covered API / endpoint",
    "보장 API / 엔드포인트",
    "対象 API / エンドポイント"
  ],
  "OLA · 两步约定": [
    "OLA · Two-step agreement",
    "OLA · 2단계 약정",
    "OLA · 2段階の合意"
  ],
  "OLA · 服务与测量约定": [
    "OLA · Service & measurement terms",
    "OLA · 서비스 및 측정 약정",
    "OLA · サービスと測定の約定"
  ],
  "演示约定": [
    "Sample terms",
    "예시 약정",
    "サンプル約定"
  ],
  "01 · 服务标准": [
    "01 · Service standards",
    "01 · 서비스 기준",
    "01 · サービス基準"
  ],
  "02 · 测量规则": [
    "02 · Measurement rules",
    "02 · 측정 규칙",
    "02 · 測定ルール"
  ],
  "有效调用成功率（%）": [
    "Valid-call success rate (%)",
    "유효 호출 성공률 (%)",
    "有効呼出し成功率（%）"
  ],
  "响应时间上限（秒）": [
    "Response time limit (sec)",
    "응답 시간 상한 (초)",
    "応答時間上限（秒）"
  ],
  "持续不达标判定窗口（分钟）": [
    "Breach assessment window (min)",
    "기준 미달 판정 구간 (분)",
    "基準未達の判定期間（分）"
  ],
  "连续达标恢复窗口（分钟）": [
    "Sustained recovery window (min)",
    "지속 복구 확인 구간 (분)",
    "継続復旧の確認期間（分）"
  ],
  "查看测量与恢复约定": [
    "Measurement & recovery terms",
    "측정 및 복구 약정 보기",
    "測定・復旧の約定を見る"
  ],
  "测量证据": [
    "Measurement evidence",
    "측정 증빙",
    "測定証拠"
  ],
  "有效调用": [
    "Valid calls",
    "유효 호출",
    "有効な呼出し"
  ],
  "判定与计时": [
    "Assessment & timing",
    "판정 및 시간 산정",
    "判定と時間計測"
  ],
  "恢复与停止": [
    "Recovery & cutoff",
    "복구 및 산정 종료",
    "復旧と計測終了"
  ],
  "企业调用日志＋独立测试；证据冲突或样本不足时转人工复核，不自动判定恢复。": [
    "Client call logs and independent tests. Conflicting evidence or insufficient samples require manual review; recovery is not assumed.",
    "기업 호출 로그와 독립 테스트를 사용합니다. 증빙 충돌이나 표본 부족 시 수동 검토하며 복구를 자동 인정하지 않습니다.",
    "企業の呼出しログと独立テストを使用します。証拠の不一致や標本不足は手動確認とし、復旧を自動認定しません。"
  ],
  "仅统计列明模型、接口与使用地区的有效调用；排除错误密钥、企业自身配置等约定不承保原因。": [
    "Count valid calls for the listed model, endpoint and usage region. Exclude agreed causes such as invalid keys and client configuration errors.",
    "명시된 모델, 인터페이스, 이용 지역의 유효 호출만 집계합니다. 잘못된 키와 기업 자체 설정 등 약정된 면책 원인은 제외합니다.",
    "対象モデル、インターフェース、利用地域の有効な呼出しのみ集計します。無効なキーや企業側の設定など、約定の免責原因は除外します。"
  ],
  "按约定窗口汇总，在响应时限内成功完成的有效调用占比低于标准即为不达标；确认后从该不达标窗口起点计时，另扣保单等待期。": [
    "Aggregate calls over the agreed window. A timely-success rate below the standard is a breach. Once confirmed, timing starts at that window’s beginning; the policy waiting period is deducted separately.",
    "약정 구간의 응답 제한 내 성공률이 기준보다 낮으면 미달로 판정합니다. 확인 후 해당 구간 시작부터 산정하며 증권의 대기기간은 별도로 공제합니다.",
    "約定期間内の応答期限内成功率が基準未満なら未達と判定します。確認後、その期間の開始時点から計測し、保険の待機期間は別途控除します。"
  ],
  "原服务或已接入、可接管业务的备用服务连续达标，经恢复窗口确认后，回溯至该达标窗口起点停止计时；无调用不等于已恢复。": [
    "After the original service or a connected, operational backup meets the standard throughout the recovery window, timing stops retrospectively at the start of that window. No calls does not mean recovery.",
    "원 서비스 또는 연결되어 업무를 인계할 수 있는 대체 서비스가 복구 구간 내내 기준을 충족하면 해당 구간 시작으로 소급하여 산정을 종료합니다. 호출이 없다고 복구된 것은 아닙니다.",
    "元サービスまたは接続済みで業務を引き継げる代替サービスが復旧確認期間中に基準を満たした場合、その期間の開始時点に遡って計測を終了します。呼出しがないことは復旧を意味しません。"
  ],
  "OLA按原保单约定执行。": [
    "OLA follows the original policy terms.",
    "OLA는 기존 증권 약정을 따릅니다.",
    "OLAは元の保険約定に従います。"
  ],
  "已核实OLA达标情况、除外原因及原服务或备用服务恢复时刻": [
    "OLA compliance, exclusions and original or backup service recovery times verified",
    "OLA 기준 충족, 면책 원인 및 원 서비스 또는 대체 서비스 복구 시각 확인",
    "OLA基準、免責原因、元サービスまたは代替サービスの復旧時刻を確認済み"
  ],
  "模拟曲线不替代调用日志与独立测试，须核实后认定中断和恢复。": [
    "Simulated curves do not replace logs and independent tests. Outage and recovery require verification.",
    "모의 곡선은 로그와 독립 테스트를 대체하지 않습니다. 중단과 복구는 검증 후 인정합니다.",
    "模擬曲線はログと独立テストの代わりにはなりません。中断と復旧は確認後に認定します。"
  ],
  "有效调用按时成功率模拟曲线": [
    "Simulated timely-success rate of valid calls",
    "유효 호출의 시간 내 성공률 모의 곡선",
    "有効呼出しの期限内成功率の模擬曲線"
  ],
  "OLA需列明模型、接口与使用地区": [
    "OLA requires a model, endpoint and usage region",
    "OLA에 모델, 인터페이스, 이용 지역이 필요합니다",
    "OLAにはモデル、インターフェース、利用地域が必要です"
  ],
  "请填写有效的OLA成功率、响应时间及判定窗口": [
    "Enter valid OLA success, response and window values",
    "유효한 OLA 성공률, 응답 시간 및 판정 구간을 입력하세요",
    "有効なOLA成功率、応答時間、判定期間を入力してください"
  ],
  "区域 / 业务": [
    "Region / business",
    "지역 / 업무",
    "地域 / 業務"
  ]
});

Object.assign(window.CBLocaleMessages,{
  "云服务区域": [
    "Cloud service region",
    "클라우드 서비스 지역",
    "クラウドサービス地域"
  ],
  "云区域与历史事件": [
    "Cloud regions & historical events",
    "클라우드 지역 및 과거 사건",
    "クラウド地域と過去の事象"
  ],
  "所选区域": [
    "Selected region",
    "선택한 지역",
    "選択した地域"
  ],
  "全目录纳入事件": [
    "Included catalogue events",
    "전체 목록 포함 사건",
    "全カタログの採用事象"
  ],
  "全目录剔除事件": [
    "Excluded catalogue events",
    "전체 목록 제외 사건",
    "全カタログの除外事象"
  ],
  "此区域暂无纳入事件": [
    "No included events for this region",
    "이 지역에 포함된 사건이 없습니다",
    "この地域に採用事象はありません"
  ],
  "2023–2025 · 官方事件目录": [
    "2023–2025 · Official event catalogue",
    "2023–2025 · 공식 사건 목록",
    "2023–2025 · 公式事象カタログ"
  ]
});

export type Language = 'zh' | 'en';

export const labels: Record<string, { en: string; zh: string }> = {
  // -- Sections --
  section_subscription: { en: 'Subscription Information', zh: '申购信息' },
  section_investor: { en: 'Investor Information', zh: '投资者信息' },
  section_payment: { en: 'Payment Origination', zh: '基金收款明细' },
  section_documents: { en: 'Document Upload', zh: '文件上传' },

  // -- Subscription fields --
  investorName: { en: 'Full Name of Investor', zh: '投资者全名' },
  shareClass: { en: 'Share Class', zh: '基金份额类别' },
  subscriptionDate: { en: 'Target Subscription Date', zh: '计划认购日期' },
  subscriptionAmount: { en: 'Amount of Subscription (USD)', zh: '申购金额（美元）' },
  footnote_subscription_amount: {
    en: 'Minimum USD 500,000.',
    zh: '最低申购金额为 50 万美元。',
  },
  footnote_subscription_amount_topup: {
    en: 'Minimum USD 100,000.',
    zh: '最低申购金额为 10 万美元。',
  },
  footnote_wire_fee_warning: {
    en: 'Note: If the top-up subscription amount is USD 100,000, please add sufficient funds to cover bank wire transfer fees (typically USD 10–15) to ensure the received amount reaches USD 100,000.',
    zh: '注意：如追加申购金额为 10 万美元，在转账时请增加足够覆盖银行转账费用的金额（通常为 10-15 美元），确保到账金额达到 10 万美元整。',
  },
  footnote_asset_proof_waived: {
    en: 'Subscription amount exceeds USD 1,000,000 — liquid asset proof is not required.',
    zh: '申购金额超过 100 万美元，无需提供流动资产证明。',
  },

  // -- Individual fields --
  dateOfBirth: { en: 'Date of Birth', zh: '出生日期' },
  cityCountryOfBirth: { en: 'City and Country of Birth', zh: '出生城市和国家' },
  nationality: { en: 'Nationality / Citizenship', zh: '国籍/公民身份' },
  countryOfResidence: { en: 'Country of Residence', zh: '居住国' },
  countryOfTaxResidency: { en: 'Country of Tax Residency', zh: '税务居民所在国' },
  identificationNumber: { en: 'Identification Number', zh: '身份证号码' },
  residentialAddress: { en: 'Residential Address', zh: '住宅地址' },
  phoneNumber: { en: 'Phone Number', zh: '电话号码' },
  emailAddress: { en: 'Email Address', zh: '电邮地址' },
  sourceOfWealth: { en: 'Source of Wealth', zh: '财富来源' },
  sourceOfFunds: { en: 'Source of Funds', zh: '资金来源' },
  employerName: { en: 'Name of Employer', zh: '公司名称' },
  title: { en: 'Title', zh: '职位' },
  employmentPeriod: { en: 'Employment Period', zh: '雇佣期' },
  purposeOfInvestment: { en: 'Purpose of Investment', zh: '投资目的（资本增值/资本保值）' },

  // -- Employment History --
  section_employment_history: { en: 'Employment History', zh: '受雇历史' },
  natureOfBusinessEmployer: { en: 'Nature of Business', zh: '公司业务性质' },
  employment_start: { en: 'Start (Year / Month)', zh: '起始（年/月）' },
  employment_end: { en: 'End (Year / Month)', zh: '终止（年/月）' },
  employment_present: { en: 'Present', zh: '至今' },
  employment_present_hint: { en: 'leave empty if current', zh: '当前职位请留空' },
  add_employment: { en: 'Add Employment', zh: '新增一条受雇记录' },
  remove_employment: { en: 'Remove', zh: '删除' },
  year: { en: 'Year', zh: '年' },
  month: { en: 'Month', zh: '月' },
  footnote_employment_history: {
    en: 'List each employer separately. You can add multiple entries for past and current positions.',
    zh: '请分别填写每一家雇主的信息。您可以添加多条记录，包含过去及现在的受雇经历。',
  },

  // -- Corporate fields --
  dateOfFormation: { en: 'Date of Formation/Incorporation', zh: '成立/注册日期' },
  jurisdiction: { en: 'Jurisdiction of Organization', zh: '组织管辖地' },
  taxIdNumber: { en: 'Identification Number or Tax I.D. No', zh: '识别号码或税务识别号' },
  fiscalYearEnd: { en: 'Fiscal Year-End', zh: '财政年度结束日' },
  natureOfBusiness: { en: 'Nature of Business', zh: '业务性质' },
  address: { en: 'Address', zh: '地址' },

  // -- Payment fields --
  bankName: { en: 'Bank Name', zh: '银行名称' },
  bankSwiftCode: { en: 'Bank SWIFT Code', zh: '银行SWIFT代码' },
  bankAddressCountry: { en: 'Bank Address / Country', zh: '银行地址/国家' },
  accountName: { en: 'Account Name', zh: '账户名称' },
  accountNumber: { en: 'Account No. (in USD)', zh: '美元账号' },

  // -- Document types (individual) --
  passport_front: { en: 'Passport Front Page (showing photo, name, DOB, nationality)', zh: '护照首页复印件（显示照片、姓名、出生日期和国籍）' },
  passport_signature: { en: 'Passport Signature Page', zh: '护照签字页复印件' },
  id_card: { en: 'National ID Card (HKID / NRIC / Mainland ID / etc.)', zh: '身份证复印件（香港身份证、新加坡NRIC、内地身份证等）' },
  address_proof: { en: 'Address Proof (within 3 months)', zh: '地址证明（最近三个月内）' },
  liquid_asset_proof: { en: 'Liquid Asset Proof > HKD 8M (if subscription < HKD 8M)', zh: '流动资产证明（超过800万港币，如申购金额低于800万港币）' },

  // -- Document types (corporate) --
  certificate_of_incorporation: { en: 'Certificate of Incorporation', zh: '公司注册证书' },
  memorandum_articles: { en: 'Memorandum and Articles of Association', zh: '最新版公司章程及组织大纲' },
  certificate_of_incumbency: { en: 'Certificate of Incumbency / Business Registration (within 3 months)', zh: '董事职权证明书/商业执照（不超过3个月）' },
  register_of_directors: { en: 'Register of Directors', zh: '董事登记册' },
  register_of_members: { en: 'Register of Members', zh: '股东/成员登记册' },
  board_resolution: { en: 'Board Resolution (authorizing investment)', zh: '董事会决议（授权投资及指定操作人员）' },
  authorised_signatory_list: { en: 'Authorised Signatory List', zh: '授权签字人名单' },
  investment_declaration: { en: 'Investment Declaration', zh: '投资声明（确认以公司自有账户投资且非代持，并说明资金来源）' },
  org_structure_chart: { en: 'Organisational Structure Chart', zh: '组织结构图（包含所有子公司）' },
  source_description: { en: 'Source of Funds/Wealth Description', zh: '投资资金来源及财富来源说明' },
  fatca_crs_form: { en: 'FATCA/CRS Self-Certification Form', zh: 'FATCA/CRS自我认证表格' },
  audited_financial_statements: { en: 'Latest Audited Financial Statements', zh: '公司最新经审计的财务报表' },
  personnel_passport_front: { en: 'Shareholders/Directors/Signatories - Passport Front Page', zh: '股东/董事/授权签字人护照首页' },
  personnel_passport_signature: { en: 'Shareholders/Directors/Signatories - Passport Signature Page', zh: '股东/董事/授权签字人护照签字页' },
  personnel_id_card: { en: 'Shareholders/Directors/Signatories - ID Card', zh: '股东/董事/授权签字人身份证' },
  personnel_address_proof: { en: 'Shareholders/Directors/Signatories - Address Proof (within 3 months)', zh: '股东/董事/授权签字人地址证明（最近三个月内）' },

  // -- Document types (top-up) --
  payment_proof: { en: 'Payment Proof', zh: '付款证明' },
  section_topup: { en: 'Top-up Subscription', zh: '追加投资' },
  section_topup_documents: { en: 'Payment Proof Upload', zh: '付款证明上传' },
  topup_bank_notice: {
    en: 'Please ensure the remitting bank account is the same as your initial subscription. If using a different account, please contact the fund operations team.',
    zh: '请确保汇款银行账户与首次认购时使用的账户一致。如使用不同账户，请联系基金运营部门。',
  },

  // -- UI strings --
  submit: { en: 'Submit', zh: '提交' },
  save_draft: { en: 'Saving...', zh: '保存中...' },
  saved: { en: 'Saved', zh: '已保存' },
  upload: { en: 'Upload', zh: '上传' },
  uploading: { en: 'Uploading...', zh: '上传中...' },
  uploaded: { en: 'Uploaded', zh: '已上传' },
  drag_drop: { en: 'Drag & drop file here, or click to browse', zh: '拖放文件到此处，或点击浏览' },
  required: { en: 'Required', zh: '必填' },
  optional: { en: 'Optional', zh: '选填' },
  conditional: { en: 'Conditional', zh: '视情况而定' },
  expired_title: { en: 'Link Expired', zh: '链接已过期' },
  expired_message: { en: 'This submission link has expired. Please contact Capella Capital for a new link.', zh: '此提交链接已过期。请联系奕卓資本获取新链接。' },
  login_title: { en: 'Email Verification', zh: '邮箱验证' },
  login_email_label: { en: 'Please enter your email to continue', zh: '请输入您的邮箱以继续' },
  login_code_label: { en: 'Enter the 6-digit verification code sent to your email', zh: '请输入发送到您邮箱的6位验证码' },
  send_code: { en: 'Send Code', zh: '发送验证码' },
  verify: { en: 'Verify', zh: '验证' },
  success_title: { en: 'Submission Successful', zh: '提交成功' },
  success_message: { en: 'Thank you! Your KYC materials have been submitted successfully.', zh: '感谢您！您的认证材料已成功提交。' },
  welcome_title: { en: 'Capella Alpha Fund - Investor Information Collection', zh: '奕卓資本/Capella Alpha Fund - 投资者信息收集' },
  footnote_source_of_wealth: {
    en: 'Please summarize the sources of wealth (i.e. the economic activity which generated your total net worth), for example: Employment (job title, employer name in English and Chinese, nature of business, employment period); Self-employed/Business Owner (details of the nature of the business, employer name in English and Chinese)',
    zh: '请总结财富来源（即产生你全部净资产的经济活动），例如：受雇工作（如果是这种情况，请提供详细的职位名称/职能、雇主的英文名称（如有中文名称也请提供）、业务性质、受雇时间段）；个体经营者/企业主：业务性质的详细信息、雇主的英文名称（如有中文名称也请提供）',
  },
  footnote_source_of_funds: {
    en: 'Please summarize the sources of funds used to make this investment (e.g., salary income, investment income, savings, inheritance, gift, etc.)',
    zh: '请概述用于本次投资的资金来源（例如：工资收入、投资收益、储蓄、继承、赠与等）',
  },
  footnote_source_of_funds_corporate: {
    en: 'Please summarize the sources of funds used to make this investment (e.g., business profits, investment income, savings, etc.)',
    zh: '请概述用于本次投资的资金来源（例如：认购资金来自企业利润（如属此类，请说明企业类型）、投资收益、储蓄等）',
  },
  footnote_purpose_of_investment: {
    en: 'Please describe the purpose of this investment (e.g., capital appreciation, capital preservation, portfolio diversification, retirement planning, etc.)',
    zh: '请说明本次投资的目的（例如：资本增值、资本保值、投资组合多元化、退休规划等）',
  },
  footnote_subscription_date: {
    en: 'The subscription window is at the end of each month. NAV calculation will begin on the 1st of the month following the subscription date.',
    zh: '认购窗口为每个月的月末。NAV 计算将从认购日期所在月末后的下一个月1号开始。',
  },
  footnote_asset_proof: {
    en: 'Required for SFC professional investor qualification. Proof of liquid assets (cash, stocks, bonds, etc.) exceeding HKD 8 million within the last 3 months. Not required if investing HKD 8 million or more.',
    zh: '为符合香港证监会规定的个人专业投资者的要求。需提供最近三个月以内的个人流动资产（现金、股票、债券等）超过800万港币的证明。如果投资超过800万港币则不需要。',
  },
  footnote_corporate_asset: {
    en: 'Latest Audited Financial Statements showing current assets of HKD 8 million or total assets of HKD 40 million, as required by SFC for professional investor qualification.',
    zh: '公司最新经审计的财务报表（超过800万港币的流动资产或四千万港币的总资产证明，为符合香港证监会专业投资者要求）。',
  },
};

export function t(key: string, lang: Language): string {
  const entry = labels[key];
  if (!entry) return key;
  return entry[lang] || entry.en || key;
}

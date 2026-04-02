import fs from 'fs';
import path from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import { getContractTemplateById, getFieldMappingsByTemplateId } from '@/db';

export async function generateContract(
  templateId: string,
  formData: Record<string, unknown>
): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  const template = getContractTemplateById(templateId);
  if (!template) return null;

  const mappings = getFieldMappingsByTemplateId(templateId);

  // Build replacement map: placeholder -> value from form data
  const replacements: Record<string, string> = {};
  for (const mapping of mappings) {
    const value = formData[mapping.form_field];
    replacements[mapping.placeholder] = value != null ? String(value) : '';
  }

  if (template.file_type === 'docx') {
    return generateFromDocx(template.file_path, replacements, template.original_name);
  } else if (template.file_type === 'pdf') {
    return generateFromPdf(template.file_path, replacements, template.original_name);
  }

  return null;
}

function generateFromDocx(
  templatePath: string,
  replacements: Record<string, string>,
  originalName: string
): { buffer: Buffer; fileName: string; mimeType: string } {
  const content = fs.readFileSync(path.resolve(templatePath));
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  });

  doc.render(replacements);

  const buffer = doc.getZip().generate({ type: 'nodebuffer' });
  const fileName = originalName.replace('.docx', '_filled.docx');

  return {
    buffer,
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}

async function generateFromPdf(
  templatePath: string,
  replacements: Record<string, string>,
  originalName: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const content = fs.readFileSync(path.resolve(templatePath));
  const pdfDoc = await PDFDocument.load(content);
  const form = pdfDoc.getForm();

  // Try to fill form fields matching the placeholder names
  for (const [placeholder, value] of Object.entries(replacements)) {
    try {
      const field = form.getTextField(placeholder);
      field.setText(value);
    } catch {
      // Field not found in PDF, skip
    }
  }

  const pdfBytes = await pdfDoc.save();
  const fileName = originalName.replace('.pdf', '_filled.pdf');

  return {
    buffer: Buffer.from(pdfBytes),
    fileName,
    mimeType: 'application/pdf',
  };
}

export function getAvailableFormFields(investorType: 'individual' | 'corporate'): { key: string; label: string }[] {
  if (investorType === 'individual') {
    return [
      { key: 'investorName', label: 'Full Name / 投资者全名' },
      { key: 'subscriptionDate', label: 'Date of Subscription / 申购日期' },
      { key: 'subscriptionAmount', label: 'Amount (USD) / 申购金额' },
      { key: 'dateOfBirth', label: 'Date of Birth / 出生日期' },
      { key: 'cityCountryOfBirth', label: 'City & Country of Birth / 出生城市和国家' },
      { key: 'nationality', label: 'Nationality / 国籍' },
      { key: 'countryOfResidence', label: 'Country of Residence / 居住国' },
      { key: 'countryOfTaxResidency', label: 'Tax Residency / 税务居民所在国' },
      { key: 'identificationNumber', label: 'ID Number / 身份证号码' },
      { key: 'residentialAddress', label: 'Address / 住宅地址' },
      { key: 'phoneNumber', label: 'Phone / 电话号码' },
      { key: 'emailAddress', label: 'Email / 电邮地址' },
      { key: 'sourceOfWealth', label: 'Source of Wealth / 财富来源' },
      { key: 'sourceOfFunds', label: 'Source of Funds / 资金来源' },
      { key: 'employerName', label: 'Employer / 公司名称' },
      { key: 'title', label: 'Title / 职位' },
      { key: 'employmentPeriod', label: 'Employment Period / 雇佣期' },
      { key: 'purposeOfInvestment', label: 'Purpose / 投资目的' },
      { key: 'bankName', label: 'Bank Name / 银行名称' },
      { key: 'bankSwiftCode', label: 'SWIFT Code / SWIFT代码' },
      { key: 'bankAddressCountry', label: 'Bank Address / 银行地址' },
      { key: 'accountName', label: 'Account Name / 账户名称' },
      { key: 'accountNumber', label: 'Account No. / 美元账号' },
    ];
  }

  return [
    { key: 'investorName', label: 'Company Name / 投资者全名' },
    { key: 'subscriptionDate', label: 'Date of Subscription / 申购日期' },
    { key: 'subscriptionAmount', label: 'Amount (USD) / 申购金额' },
    { key: 'dateOfFormation', label: 'Date of Formation / 成立日期' },
    { key: 'jurisdiction', label: 'Jurisdiction / 组织管辖地' },
    { key: 'taxIdNumber', label: 'Tax ID / 税务识别号' },
    { key: 'fiscalYearEnd', label: 'Fiscal Year-End / 财政年度结束日' },
    { key: 'natureOfBusiness', label: 'Nature of Business / 业务性质' },
    { key: 'address', label: 'Address / 地址' },
    { key: 'phoneNumber', label: 'Phone / 电话号码' },
    { key: 'emailAddress', label: 'Email / 电邮地址' },
    { key: 'sourceOfWealth', label: 'Source of Wealth / 财富来源' },
    { key: 'sourceOfFunds', label: 'Source of Funds / 资金来源' },
    { key: 'purposeOfInvestment', label: 'Purpose / 投资目的' },
    { key: 'bankName', label: 'Bank Name / 银行名称' },
    { key: 'bankSwiftCode', label: 'SWIFT Code / SWIFT代码' },
    { key: 'bankAddressCountry', label: 'Bank Address / 银行地址' },
    { key: 'accountName', label: 'Account Name / 账户名称' },
    { key: 'accountNumber', label: 'Account No. / 美元账号' },
  ];
}

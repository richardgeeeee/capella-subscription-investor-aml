import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface AgreementInput {
  legalFullName: string;
  idNumber: string;
  registeredAddress: string;
  agreementDateDay: string;
  agreementDateMonth: string;
  agreementDateYear: string;
  staffName: string;
  staffCeNumber: string;
  capellaSignatoryName?: string;
}

const TEMPLATE_DIR = path.join(process.cwd(), 'assets');
const TEMPLATE_FILE = 'individual_client_agreement_v3_form.pdf';

export function isAcroFormTemplateAvailable(): boolean {
  return fs.existsSync(path.join(TEMPLATE_DIR, TEMPLATE_FILE));
}

export async function fillIndividualClientAgreement(input: AgreementInput): Promise<Buffer> {
  const templatePath = path.join(TEMPLATE_DIR, TEMPLATE_FILE);
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `AcroForm template not found at ${templatePath}. ` +
      `Please create it in Adobe Acrobat (Prepare Form) and save as "${TEMPLATE_FILE}" in the assets/ directory.`
    );
  }

  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const setField = (name: string, value: string) => {
    try {
      const field = form.getTextField(name);
      field.setText(value);
    } catch {
      console.warn(`[agreement-fill] Field "${name}" not found in AcroForm — skipping`);
    }
  };

  // Date fields (appear twice: cover page + p.2)
  setField('agreement_date_day', input.agreementDateDay);
  setField('agreement_date_month', input.agreementDateMonth);
  setField('agreement_date_year', input.agreementDateYear);

  // Legal name (appears on cover, p.2, p.7, p.9 — AcroForm duplicate fields auto-fill)
  setField('legal_full_name', input.legalFullName);

  // ID number
  setField('id_number', input.idNumber);

  // Registered address
  setField('registered_address', input.registeredAddress);

  // Staff declaration (p.7, appears twice)
  setField('staff_name', input.staffName.toUpperCase());
  setField('staff_ce_number', input.staffCeNumber);

  // Capella signatory (p.9)
  if (input.capellaSignatoryName) {
    setField('capella_signatory_name', input.capellaSignatoryName);
  }

  // Flatten form fields so they appear as static text
  form.flatten();

  return Buffer.from(await pdfDoc.save());
}

export function formatAgreementFilename(
  folderName: string,
  agreementDate: Date
): string {
  const yy = String(agreementDate.getFullYear()).slice(2);
  const mm = String(agreementDate.getMonth() + 1).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mmm = months[agreementDate.getMonth()];
  const yyyy = String(agreementDate.getFullYear());
  return `${folderName} - Individual Client Agreement_${yy}${mm} ${mmm} ${yyyy}.pdf`;
}

export function parseAgreementDate(dateStr: string): { day: string; month: string; year: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return {
    day: String(d.getDate()),
    month: months[d.getMonth()],
    year: String(d.getFullYear()),
  };
}

export function defaultAgreementDate(subscriptionDate: string): string {
  const d = new Date(subscriptionDate + 'T00:00:00');
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
}

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

// EmailJS configuration
const EMAILJS_CONFIG = {
  serviceId: 'service_q3qp9rz',
  templateId: 'template_99eg2eg',
  publicKey: 'Ox1_IwykSClDMOhqz',
  privateKey: 'Dg7xyuMhc-xtKQbROJT7H'
};

export interface EmailData {
  chassisNo: string;
  sapData?: string | null;
  scheduledDealer?: string | null;
  reallocatedTo?: string | null;
  customer?: string | null;
  model?: string | null;
  statusCheck?: string | null;
  dealerCheck?: string | null;
  grDays?: number | null;
}

interface EmailTemplateParams {
  chassis_no: string;
  sap_data: string;
  scheduled_dealer: string;
  reallocated_to: string;
  customer: string;
  model: string;
  status_check: string;
  dealer_check: string;
  gr_days: number;
  report_date: string;
  issue_summary: string;
  to_name: string;
  from_name: string;
}

const safeText = (value: string | null | undefined, fallback: string) =>
  (value && String(value).trim()) || fallback;

const toSafeNumber = (value: number | string | null | undefined, fallback = 0) => {
  const num = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(num as number) ? (num as number) : fallback;
};

const buildTemplateParams = (data: EmailData): EmailTemplateParams => ({
  chassis_no: data.chassisNo,
  sap_data: safeText(data.sapData, 'N/A'),
  scheduled_dealer: safeText(data.scheduledDealer, 'N/A'),
  reallocated_to: safeText(data.reallocatedTo, 'No Reallocation'),
  customer: safeText(data.customer, 'N/A'),
  model: safeText(data.model, 'N/A'),
  status_check: safeText(data.statusCheck, 'Unknown'),
  dealer_check: safeText(data.dealerCheck, 'Unknown'),
  gr_days: toSafeNumber(data.grDays, 0),
  report_date: new Date().toLocaleString(),
  issue_summary: `Dealer Check Mismatch detected for chassis ${data.chassisNo}`,
  to_name: 'Dispatch Team',
  from_name: 'Dispatch Dashboard System'
});

const readErrorMessage = async (response: Response) => {
  const raw = await response.text();
  if (!raw) return `${response.status} ${response.statusText}`.trim();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === 'string') {
      return parsed.error;
    }
    if (typeof parsed?.message === 'string') {
      return parsed.message;
    }
  } catch {
    // ignore JSON parse errors and fall back to raw string
  }
  return raw;
};

const sendEmailRequest = async (templateParams: EmailTemplateParams): Promise<void> => {
  const response = await fetch(EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: EMAILJS_CONFIG.templateId,
      user_id: EMAILJS_CONFIG.publicKey,
      accessToken: EMAILJS_CONFIG.privateKey,
      template_params: templateParams
    })
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || 'EmailJS request failed');
  }
};

export const sendReportEmail = async (data: EmailData): Promise<void> => {
  const templateParams = buildTemplateParams(data);
  console.log('Sending email with params:', templateParams);
  await sendEmailRequest(templateParams);
};

export const testEmailConnection = async (): Promise<void> => {
  const testParams: EmailTemplateParams = {
    chassis_no: 'TEST-001',
    sap_data: 'Test SAP Data',
    scheduled_dealer: 'Test Dealer',
    reallocated_to: 'Test Reallocation',
    customer: 'Test Customer',
    model: 'Test Model',
    status_check: 'Test',
    dealer_check: 'Test',
    gr_days: 0,
    report_date: new Date().toLocaleString(),
    issue_summary: 'Email connection test',
    to_name: 'Test Recipient',
    from_name: 'Dispatch Dashboard System'
  };

  await sendEmailRequest(testParams);
};

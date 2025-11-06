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
  sapData: string;
  scheduledDealer: string;
  reallocatedTo?: string;
  customer: string;
  model: string;
  statusCheck: string;
  dealerCheck: string;
  grDays: number;
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

const buildTemplateParams = (data: EmailData): EmailTemplateParams => ({
  chassis_no: data.chassisNo,
  sap_data: data.sapData || 'N/A',
  scheduled_dealer: data.scheduledDealer || 'N/A',
  reallocated_to: data.reallocatedTo || 'No Reallocation',
  customer: data.customer || 'N/A',
  model: data.model || 'N/A',
  status_check: data.statusCheck,
  dealer_check: data.dealerCheck,
  gr_days: data.grDays,
  report_date: new Date().toLocaleString(),
  issue_summary: `Dealer Check Mismatch detected for chassis ${data.chassisNo}`,
  to_name: 'Dispatch Team',
  from_name: 'Dispatch Dashboard System'
});

const sendEmailRequest = async (templateParams: EmailTemplateParams): Promise<boolean> => {
  try {
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
      const errorText = await response.text();
      throw new Error(`EmailJS request failed: ${response.status} ${errorText}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
};

export const sendReportEmail = async (data: EmailData): Promise<boolean> => {
  const templateParams = buildTemplateParams(data);
  console.log('Sending email with params:', templateParams);
  return sendEmailRequest(templateParams);
};

export const testEmailConnection = async (): Promise<boolean> => {
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

  return sendEmailRequest(testParams);
};

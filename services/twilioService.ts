
import { TwilioConfig } from '../types';

export const makeTwilioCall = async (
  config: TwilioConfig, 
  to: string, 
  message: string,
  n8nWebhookUrl?: string
): Promise<{ success: boolean; error?: string }> => {
  if (!config.accountSid || !config.authToken || !config.fromNumber) {
    return { success: false, error: 'Missing Twilio credentials' };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`;
  const auth = btoa(`${config.accountSid}:${config.authToken}`);

  const formData = new URLSearchParams();
  formData.append('To', to);
  formData.append('From', config.fromNumber);

  // Determine URL or TwiML
  let hookUrl = config.webhookUrl;
  if (hookUrl && n8nWebhookUrl) {
     const separator = hookUrl.includes('?') ? '&' : '?';
     hookUrl = `${hookUrl}${separator}n8n_url=${encodeURIComponent(n8nWebhookUrl)}`;
  }

  if (hookUrl) {
    formData.append('Url', hookUrl);
  } else {
    const fallbackTwiml = `
      <Response>
        <Pause length="1"/>
        <Say voice="alice" language="en-US">${message}</Say>
        <Record maxLength="5" playBeep="false" trim="silence"/>
        <Pause length="1"/>
        <Say voice="alice">I heard you. However, this is a browser-only demo. To enable real-time bidirectional conversation, please configure a Webhook URL in the settings pointing to your media stream server.</Say>
        <Pause length="1"/>
      </Response>
    `;
    formData.append('Twiml', fallbackTwiml);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || response.statusText };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};



import { TwilioConfig, AssistantConfig } from '../types';

export const makeTwilioCall = async (
  config: TwilioConfig, 
  to: string, 
  assistantConfig: AssistantConfig,
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
  
  // Append configuration parameters to the Webhook URL
  if (hookUrl) {
     const separator = hookUrl.includes('?') ? '&' : '?';
     const params = new URLSearchParams();
     
     if (n8nWebhookUrl) params.append('n8n_url', n8nWebhookUrl);
     
     // Pass Voice Configuration
     if (assistantConfig.voice) params.append('voice', assistantConfig.voice);
     if (assistantConfig.voiceProvider) params.append('provider', assistantConfig.voiceProvider);
     if (assistantConfig.elevenLabsApiKey) params.append('xi_api_key', assistantConfig.elevenLabsApiKey);
     if (assistantConfig.firstMessage) params.append('first_message', assistantConfig.firstMessage);
     if (assistantConfig.systemInstruction) params.append('system_instruction', assistantConfig.systemInstruction);

     // Source of the call
     params.append('source', 'direct_call');

     hookUrl = `${hookUrl}${separator}${params.toString()}`;
     formData.append('Url', hookUrl);
  } else {
    // Fallback TwiML if no webhook is configured (Demo Mode)
    const fallbackTwiml = `
      <Response>
        <Pause length="1"/>
        <Say voice="alice" language="en-US">${assistantConfig.firstMessage || 'Hello'}</Say>
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
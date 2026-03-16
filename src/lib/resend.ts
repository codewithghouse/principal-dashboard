export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

/**
 * Sends an email using the Resend API bridge (Vercel Serverless Function).
 * This avoids CORS issues and keeps the API key secure.
 */
export const sendEmail = async (options: EmailOptions) => {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    // Check if the response is actually JSON
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to send email');
      }
      
      return data;
    } else {
      const text = await response.text();
      console.error("Non-JSON response received:", text);
      throw new Error(`Server returned an unexpected response format: ${response.status} ${response.statusText}`);
    }
  } catch (error: any) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

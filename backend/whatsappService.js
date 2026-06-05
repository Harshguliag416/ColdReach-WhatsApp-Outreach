import { readDb, writeDb, updateCampaign } from './db.js';
import qrcode from 'qrcode';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

let activeCampaignTimeout = null;
let clients = []; // SSE clients
let client = null; // WhatsApp client instance

// Connection state for WhatsApp Web
export const whatsappState = {
  status: 'disconnected', // disconnected, connecting, qr_ready, connected, error
  qrCode: null,
  mode: 'simulation', // simulation, real
  errorMsg: null
};

export function addClient(res) {
  clients.push(res);
  // Send current whatsapp status immediately on join
  res.write(`event: whatsapp_status\ndata: ${JSON.stringify(whatsappState)}\n\n`);
}

export function removeClient(res) {
  clients = clients.filter(c => c !== res);
}

export function broadcast(event, data) {
  clients.forEach(client => {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

// Set mode (real or simulation)
export function setOutreachMode(mode) {
  whatsappState.mode = mode;
  if (mode === 'real' && !client) {
    initWhatsAppClient();
  }
  broadcast('whatsapp_status', whatsappState);
}

// Initialize WhatsApp Web Client
export function initWhatsAppClient() {
  if (client) {
    try {
      console.log('📢 [ColdReach] Closing active WhatsApp session...');
      client.destroy();
    } catch (e) {}
  }

  console.log('📢 [ColdReach] Starting connection workflow...');
  whatsappState.status = 'connecting';
  whatsappState.qrCode = null;
  whatsappState.errorMsg = null;
  broadcast('whatsapp_status', whatsappState);

  try {
    console.log('📢 [ColdReach] Spawning headless Chrome browser...');
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: "coldreach-session"
      }),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
        strict: false
      },
      puppeteer: {
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    client.on('qr', async (qr) => {
      console.log('📢 [ColdReach] WhatsApp Web successfully loaded. QR Code generated!');
      whatsappState.status = 'qr_ready';
      try {
        whatsappState.qrCode = await qrcode.toDataURL(qr);
      } catch (err) {
        whatsappState.qrCode = null;
      }
      broadcast('whatsapp_status', whatsappState);
    });

    client.on('ready', () => {
      console.log('🟢 [ColdReach] WhatsApp connection ready! Device successfully linked.');
      whatsappState.status = 'connected';
      whatsappState.qrCode = null;
      whatsappState.errorMsg = null;
      broadcast('whatsapp_status', whatsappState);
    });

    client.on('disconnected', (reason) => {
      console.log('🔴 [ColdReach] Client disconnected. Reason:', reason);
      whatsappState.status = 'disconnected';
      whatsappState.qrCode = null;
      broadcast('whatsapp_status', whatsappState);
    });

    client.on('auth_failure', (msg) => {
      console.error('❌ [ColdReach] WhatsApp authentication failed:', msg);
      whatsappState.status = 'error';
      whatsappState.errorMsg = `Auth failure: ${msg}`;
      broadcast('whatsapp_status', whatsappState);
    });

    client.initialize().catch(err => {
      console.error('❌ [ColdReach] Initialize promise rejected:', err);
      whatsappState.status = 'error';
      whatsappState.errorMsg = `Initialization failed. Check console for details.`;
      broadcast('whatsapp_status', whatsappState);
    });

  } catch (error) {
    console.error('❌ [ColdReach] Failed to instantiate Client:', error);
    whatsappState.status = 'error';
    whatsappState.errorMsg = error.message;
    broadcast('whatsapp_status', whatsappState);
  }
}

// Disconnect WhatsApp session
export async function logoutWhatsApp() {
  whatsappState.status = 'disconnected';
  whatsappState.qrCode = null;
  broadcast('whatsapp_status', whatsappState);
  
  if (client) {
    try {
      await client.logout();
      await client.destroy();
      client = null;
    } catch (e) {
      client = null;
    }
  }
}

// Personalized template renderer
export function renderTemplate(template, contact) {
  let rendered = template;
  
  const normalizedContact = {};
  Object.keys(contact).forEach(key => {
    normalizedContact[key.toUpperCase()] = contact[key];
  });

  const placeholders = [
    'BUSINESS_NAME',
    'OWNER_NAME',
    'BUSINESS_TYPE',
    'CITY',
    'THEIR_WEBSITE',
    'WEBSITE',
    'PHONE'
  ];

  placeholders.forEach(ph => {
    const regex = new RegExp(`{{\\s*${ph}\\s*}}`, 'gi');
    let replacement = normalizedContact[ph] || '';
    if (ph === 'OWNER_NAME' && !replacement) {
      replacement = 'bhai';
    }
    rendered = rendered.replace(regex, replacement);
  });

  rendered = rendered.replace(/{{\s*.*?\s*}}/g, '');
  return rendered;
}

// Core sending loop
async function sendNext(index, db) {
  const campaign = db.campaign;
  const contacts = db.contacts;
  const template = db.template.text;

  if (campaign.status !== 'sending') {
    return;
  }

  if (index >= contacts.length) {
    updateCampaign(c => {
      c.status = 'completed';
      c.endTime = new Date().toISOString();
      c.logs.push({
        type: 'system',
        message: 'Campaign completed successfully!',
        timestamp: new Date().toISOString()
      });
    });
    broadcast('campaign_update', readDb().campaign);
    return;
  }

  const contact = contacts[index];
  
  // Validate Phone
  const rawPhone = String(contact.phone || contact.Phone || '').replace(/\D/g, '');
  let phone = rawPhone;
  
  // Strip leading 0 if present (common in Indian contact lists like 09876543210)
  if (phone.startsWith('0')) {
    phone = phone.substring(1);
  }

  let isInvalid = false;
  let errorMsg = '';

  if (!phone) {
    isInvalid = true;
    errorMsg = 'Missing phone number';
  } else {
    // If length is 10, format with Indian country code 91
    if (phone.length === 10) {
      phone = '91' + phone;
    } else if (phone.length < 10) {
      isInvalid = true;
      errorMsg = 'Invalid phone number (too short)';
    }
  }

  const messageText = renderTemplate(template, contact);
  const logEntry = {
    phone: phone || 'N/A',
    name: contact.owner_name || contact.Owner || 'Unknown',
    businessName: contact.business_name || contact.Business || 'Unknown',
    timestamp: new Date().toISOString(),
    message: messageText
  };

  if (isInvalid) {
    logEntry.status = 'failed';
    logEntry.error = errorMsg;
  } else {
    if (whatsappState.mode === 'real') {
      // Real WhatsApp Send - Requires client to be connected and ready
      if (!client || whatsappState.status !== 'connected') {
        logEntry.status = 'failed';
        logEntry.error = 'WhatsApp is not connected or still connecting. Please wait for the green status.';
      } else {
        try {
          // Send message
          const chatId = `${phone}@c.us`;
          console.log(`📢 [ColdReach] Sending message to ${chatId}...`);
          await client.sendMessage(chatId, messageText);
          logEntry.status = 'sent';
        } catch (err) {
          console.error(`❌ [ColdReach] Error sending message to ${phone}:`, err);
          logEntry.status = 'failed';
          
          let friendlyError = err.message || String(err);
          if (friendlyError.includes('No LID') || friendlyError.includes('LID for user')) {
            friendlyError = 'Number is not registered on WhatsApp';
          }
          
          logEntry.error = `Failed to send: ${friendlyError}`;
        }
      }
    } else {
      // Simulated Send
      const isSuccess = Math.random() > 0.08;
      if (isSuccess) {
        logEntry.status = 'sent';
      } else {
        logEntry.status = 'failed';
        logEntry.error = 'Undelivered (Target number is not on WhatsApp)';
      }
    }
  }

  // Update DB state
  const updatedDb = readDb();
  updatedDb.contacts[index].status = logEntry.status;
  if (logEntry.error) {
    updatedDb.contacts[index].error = logEntry.error;
  }
  
  updatedDb.campaign.sent = updatedDb.contacts.filter(c => c.status === 'sent').length;
  updatedDb.campaign.failed = updatedDb.contacts.filter(c => c.status === 'failed').length;
  updatedDb.campaign.pending = updatedDb.contacts.filter(c => !c.status || c.status === 'pending').length;
  updatedDb.campaign.logs.unshift(logEntry);

  writeDb(updatedDb);
  broadcast('campaign_update', updatedDb.campaign);
  broadcast('contacts_update', updatedDb.contacts);

  // Delay configuration
  const delayMs = (campaign.delaySeconds || 5) * 1000;
  activeCampaignTimeout = setTimeout(() => {
    sendNext(index + 1, readDb());
  }, delayMs);
}

export function startCampaign(delaySeconds) {
  const db = readDb();
  const startIndex = db.contacts.findIndex(c => !c.status || c.status === 'pending');
  
  if (startIndex === -1) {
    db.contacts.forEach(c => {
      delete c.status;
      delete c.error;
    });
    db.campaign.sent = 0;
    db.campaign.failed = 0;
    db.campaign.pending = db.contacts.length;
    db.campaign.logs = [{
      type: 'system',
      message: 'Resetting contacts and restarting campaign',
      timestamp: new Date().toISOString()
    }];
  }

  db.campaign.status = 'sending';
  db.campaign.delaySeconds = delaySeconds || 5;
  db.campaign.startTime = db.campaign.startTime || new Date().toISOString();
  db.campaign.endTime = null;
  writeDb(db);

  broadcast('campaign_update', db.campaign);
  
  const nextIndex = startIndex === -1 ? 0 : startIndex;
  sendNext(nextIndex, db);
}

export function pauseCampaign() {
  if (activeCampaignTimeout) {
    clearTimeout(activeCampaignTimeout);
    activeCampaignTimeout = null;
  }
  
  updateCampaign(c => {
    c.status = 'paused';
    c.logs.unshift({
      type: 'system',
      message: 'Campaign paused by user',
      timestamp: new Date().toISOString()
    });
  });
  
  broadcast('campaign_update', readDb().campaign);
}

export function stopCampaign() {
  if (activeCampaignTimeout) {
    clearTimeout(activeCampaignTimeout);
    activeCampaignTimeout = null;
  }
  
  const db = readDb();
  db.campaign.status = 'idle';
  db.campaign.startTime = null;
  db.campaign.endTime = null;
  db.campaign.sent = 0;
  db.campaign.failed = 0;
  db.campaign.pending = db.contacts.length;
  db.campaign.logs = [{
    type: 'system',
    message: 'Campaign stopped and reset',
    timestamp: new Date().toISOString()
  }];
  
  db.contacts.forEach(c => {
    delete c.status;
    delete c.error;
  });
  
  writeDb(db);
  broadcast('campaign_update', db.campaign);
  broadcast('contacts_update', db.contacts);
}

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import csvParser from 'csv-parser';
import * as xlsx from 'xlsx';
import { fileURLToPath } from 'url';

import { readDb, writeDb, updateCampaign } from './db.js';
import { 
  startCampaign, 
  pauseCampaign, 
  stopCampaign, 
  addClient, 
  removeClient,
  broadcast,
  whatsappState,
  setOutreachMode,
  initWhatsAppClient,
  logoutWhatsApp
} from './whatsappService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Setup Multer for upload
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Ensure uploads dir exists
if (!fs.existsSync(path.join(__dirname, 'uploads/'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads/'));
}

// Normalizes CSV headers to standard fields
function normalizeHeaders(row) {
  const normalized = {};
  const mappings = {
    phone: ['phone', 'phone number', 'contact', 'number', 'mobile', 'phone_number'],
    owner_name: ['owner name', 'owner_name', 'owner', 'name', 'proprietor'],
    business_name: ['business name', 'business_name', 'business', 'company', 'shop name', 'shop_name'],
    business_type: ['business type', 'business_type', 'type', 'category', 'niche'],
    city: ['city', 'location', 'town', 'address'],
    website: ['website', 'their website', 'website url', 'url', 'their_website', 'site']
  };

  Object.keys(row).forEach(key => {
    const cleanKey = key.trim().toLowerCase();
    let mapped = null;
    
    for (const [standardKey, options] of Object.entries(mappings)) {
      if (options.includes(cleanKey)) {
        mapped = standardKey;
        break;
      }
    }

    if (mapped) {
      normalized[mapped] = row[key] ? row[key].trim() : '';
    } else {
      // Keep any custom columns as is, converted to lowercase
      normalized[cleanKey.replace(/\s+/g, '_')] = row[key] ? row[key].trim() : '';
    }
  });

  return normalized;
}

// 1. GET DB State
app.get('/api/state', (req, res) => {
  res.json(readDb());
});

// 2. POST Save Template
app.post('/api/template', (req, res) => {
  const { text, examples } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Template text is required' });
  }

  const db = readDb();
  db.template = { text, examples: examples || [] };
  writeDb(db);
  
  res.json({ message: 'Template saved successfully', template: db.template });
});

// 3. POST Upload CSV/Excel
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const isExcel = originalName.endsWith('.xlsx') || originalName.endsWith('.xls');
  const contacts = [];
  const errors = [];

  try {
    if (isExcel) {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData = xlsx.utils.sheet_to_json(sheet);
      
      if (rawData.length === 0) {
        throw new Error('Excel sheet is empty');
      }

      rawData.forEach((row, idx) => {
        const normalized = normalizeHeaders(row);
        if (!normalized.phone) {
          errors.push(`Row ${idx + 2}: Missing phone number`);
        }
        contacts.push(normalized);
      });

      handleParsedContacts(contacts, errors, res, filePath);
    } else {
      // Parse CSV
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (row) => {
          const normalized = normalizeHeaders(row);
          contacts.push(normalized);
        })
        .on('end', () => {
          contacts.forEach((contact, idx) => {
            if (!contact.phone) {
              errors.push(`Row ${idx + 2}: Missing phone number`);
            }
          });
          handleParsedContacts(contacts, errors, res, filePath);
        })
        .on('error', (err) => {
          throw err;
        });
    }
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(400).json({ error: `File parsing error: ${error.message}` });
  }
});

function handleParsedContacts(contacts, errors, res, filePath) {
  // Clean up uploaded file
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  if (contacts.length === 0) {
    return res.status(400).json({ error: 'No valid contacts found in file.' });
  }

  // Update database with new contacts
  const db = readDb();
  db.contacts = contacts;
  
  // Reset Campaign Progress
  db.campaign = {
    status: 'idle',
    total: contacts.length,
    sent: 0,
    failed: 0,
    pending: contacts.length,
    startTime: null,
    endTime: null,
    delaySeconds: db.campaign.delaySeconds || 5,
    logs: [{
      type: 'system',
      message: `Uploaded ${contacts.length} contacts successfully.`,
      timestamp: new Date().toISOString()
    }]
  };

  writeDb(db);
  broadcast('campaign_update', db.campaign);
  broadcast('contacts_update', db.contacts);

  res.json({
    message: 'Contacts uploaded successfully',
    total: contacts.length,
    warnings: errors.length > 0 ? errors : null,
    contacts
  });
}

// 4. POST Start Campaign
app.post('/api/campaign/start', (req, res) => {
  const { delaySeconds } = req.body;
  const db = readDb();
  
  if (db.contacts.length === 0) {
    return res.status(400).json({ error: 'No contacts uploaded. Please upload a file first.' });
  }

  startCampaign(delaySeconds || 5);
  res.json({ message: 'Campaign started' });
});

// 5. POST Pause Campaign
app.post('/api/campaign/pause', (req, res) => {
  pauseCampaign();
  res.json({ message: 'Campaign paused' });
});

// 6. POST Stop Campaign
app.post('/api/campaign/stop', (req, res) => {
  stopCampaign();
  res.json({ message: 'Campaign stopped' });
});

// 7. GET Sample CSV
app.get('/api/sample-csv', (req, res) => {
  const sampleData = `Phone,Owner Name,Business Name,Business Type,City,Website
919999999991,Rajesh Kumar,Rajesh Sweets,Sweet Shop,Mumbai,rajeshsweets.com
919999999992,Suman Sharma,Sharma Boutique,Boutique,Delhi,sharmaboutique.in
919999999993,Vikram Singh,Singh Motors,Auto Repair,Jaipur,singhmotors.co.in
919999999994,Anjali Gupta,Gupta Diagnostics,Lab,Pune,guptadiagnostics.com
919999999995,,Cafe Delight,Cafe,Bangalore,cafedelight.com`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=sample_contacts.csv');
  res.status(200).send(sampleData);
});

// 8. Server-Sent Events Route for live streaming updates
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addClient(res);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);

  req.on('close', () => {
    removeClient(res);
  });
});

// 9. WhatsApp Web Control Endpoints
app.post('/api/whatsapp/mode', (req, res) => {
  const { mode } = req.body;
  if (mode !== 'simulation' && mode !== 'real') {
    return res.status(400).json({ error: 'Invalid mode. Use "simulation" or "real".' });
  }
  setOutreachMode(mode);
  res.json({ message: `Outreach mode updated to ${mode}`, state: whatsappState });
});

app.post('/api/whatsapp/connect', (req, res) => {
  initWhatsAppClient();
  res.json({ message: 'Initializing WhatsApp Web...', state: whatsappState });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  await logoutWhatsApp();
  res.json({ message: 'Disconnected from WhatsApp Web', state: whatsappState });
});

// 10. Serve Frontend Static Files
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

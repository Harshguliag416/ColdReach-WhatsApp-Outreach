import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, 'db.json');

const defaultData = {
  contacts: [],
  template: {
    text: "Hi {{OWNER_NAME}},\n\nI stumbled across {{BUSINESS_NAME}} today — the ratings and reviews speak for themselves, really solid work you've built.\n\nI did take a look at your website {{THEIR_WEBSITE}} though, and honestly it's not doing justice to what your business actually is. Happy to do a free review of your site and tell you exactly what's holding it back.\n\nWorth a quick chat?",
    examples: ["solelacesofficial.com", "mybusinessagency.in"]
  },
  campaign: {
    status: 'idle', // idle, sending, paused, completed
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    startTime: null,
    endTime: null,
    delaySeconds: 5,
    logs: [] // { phone, name, status, error, timestamp, message }
  }
};

// Initialize DB if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
}

export function readDb() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return defaultData;
  }
}

export function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing database:', error);
    return false;
  }
}

export function updateCampaign(updateFn) {
  const db = readDb();
  updateFn(db.campaign);
  writeDb(db);
  return db.campaign;
}

import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = window.location.origin;

function App() {
  const [contacts, setContacts] = useState([]);
  const [templateText, setTemplateText] = useState('');
  const [campaign, setCampaign] = useState({
    status: 'idle',
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    startTime: null,
    endTime: null,
    delaySeconds: 5,
    logs: []
  });

  const [selectedPreviewIdx, setSelectedPreviewIdx] = useState(0);
  const [delay, setDelay] = useState(5);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadWarnings, setUploadWarnings] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [whatsapp, setWhatsapp] = useState({
    status: 'disconnected',
    qrCode: null,
    mode: 'simulation',
    errorMsg: null
  });
  
  const fileInputRef = useRef(null);
  const logTerminalRef = useRef(null);

  // Character limit for WhatsApp messages typically doesn't exist but let's show visual feedback
  const charCount = templateText.length;

  // 1. Fetch initial state and establish SSE connection
  useEffect(() => {
    fetchInitialState();

    // Setup SSE connection
    const eventSource = new EventSource(`${API_BASE}/api/stream`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    eventSource.addEventListener('campaign_update', (e) => {
      const data = JSON.parse(e.data);
      setCampaign(data);
    });

    eventSource.addEventListener('contacts_update', (e) => {
      const data = JSON.parse(e.data);
      setContacts(data);
    });

    eventSource.addEventListener('whatsapp_status', (e) => {
      const data = JSON.parse(e.data);
      setWhatsapp(data);
    });

    return () => {
      eventSource.close();
    };
  }, []);

  // 2. Auto-scroll terminal to bottom when new logs arrive
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [campaign.logs]);

  const fetchInitialState = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/state`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setTemplateText(data.template?.text || '');
      setCampaign(data.campaign || {});
      setDelay(data.campaign?.delaySeconds || 5);
      setIsConnected(true);
    } catch (err) {
      console.error('Failed to connect to backend', err);
      setIsConnected(false);
    }
  };

  // 3. Save Template
  const handleSaveTemplate = async (newText) => {
    setTemplateText(newText);
    try {
      await fetch(`${API_BASE}/api/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText })
      });
    } catch (err) {
      console.error('Error saving template', err);
    }
  };

  // 4. File Upload Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file) => {
    setUploading(true);
    setUploadError(null);
    setUploadWarnings([]);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      
      setContacts(data.contacts);
      if (data.warnings) {
        setUploadWarnings(data.warnings);
      }
      setSelectedPreviewIdx(0);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 5. Campaign Actions
  const handleStartCampaign = async () => {
    try {
      await fetch(`${API_BASE}/api/campaign/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delaySeconds: delay })
      });
    } catch (err) {
      console.error('Error starting campaign', err);
    }
  };

  const handlePauseCampaign = async () => {
    try {
      await fetch(`${API_BASE}/api/campaign/pause`, { method: 'POST' });
    } catch (err) {
      console.error('Error pausing campaign', err);
    }
  };

  const handleStopCampaign = async () => {
    try {
      await fetch(`${API_BASE}/api/campaign/stop`, { method: 'POST' });
      setSelectedPreviewIdx(0);
    } catch (err) {
      console.error('Error stopping campaign', err);
    }
  };

  const handleModeChange = async (mode) => {
    // Update local state immediately for snappy UI response
    setWhatsapp(prev => ({ ...prev, mode }));
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (res.ok) {
        setWhatsapp(data.state);
      }
    } catch (err) {
      console.error('Error changing mode', err);
    }
  };

  const handleConnectWhatsapp = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/connect`, { method: 'POST' });
      const data = await res.json();
      setWhatsapp(data.state);
    } catch (err) {
      console.error('Error connecting WhatsApp', err);
    }
  };

  const handleDisconnectWhatsapp = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/whatsapp/disconnect`, { method: 'POST' });
      const data = await res.json();
      setWhatsapp(data.state);
    } catch (err) {
      console.error('Error disconnecting WhatsApp', err);
    }
  };

  // 6. Template Placeholder Helpers
  const insertPlaceholder = (ph) => {
    const textarea = document.getElementById('template-textarea');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    
    const newText = before + `{{${ph}}}` + after;
    handleSaveTemplate(newText);
    
    // Focus back on textarea and set cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + ph.length + 4, start + ph.length + 4);
    }, 10);
  };

  // 7. Preview Render Helper
  const getRenderedPreview = () => {
    if (contacts.length === 0) return 'No contacts uploaded yet. Upload a CSV/Excel file to preview dynamic fields.';
    const activeContact = contacts[selectedPreviewIdx] || contacts[0];
    
    let text = templateText;
    
    const replacements = {
      BUSINESS_NAME: activeContact.business_name || activeContact.business || 'Cafe Delight',
      OWNER_NAME: activeContact.owner_name || activeContact.owner || 'bhai',
      BUSINESS_TYPE: activeContact.business_type || activeContact.type || 'local business',
      CITY: activeContact.city || 'your city',
      THEIR_WEBSITE: activeContact.website || activeContact.url || 'your website',
      WEBSITE: activeContact.website || activeContact.url || 'your website',
      PHONE: activeContact.phone || '919999999999'
    };

    Object.keys(replacements).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      text = text.replace(regex, replacements[key]);
    });

    // Clean remaining variables
    text = text.replace(/{{\s*.*?\s*}}/g, '');

    return text;
  };

  // Calculations
  const totalContacts = contacts.length;
  const progressPercent = totalContacts > 0 
    ? Math.round(((campaign.sent + campaign.failed) / totalContacts) * 100) 
    : 0;

  return (
    <div className="app-container">
      {/* Top Banner connection indicator */}
      <header className="animate-fade-in">
        <div className="logo-container">
          <div className="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="22" height="22">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.855.001-2.63-1.024-5.101-2.887-6.968C16.578 1.91 14.11 8.87 11.503 1.902c-5.44 0-9.866 4.418-9.87 9.854a9.816 9.816 0 001.5 5.176l-.999 3.647 3.734-.979zm11.517-6.84c-.267-.134-1.58-.78-1.822-.867-.243-.088-.419-.133-.596.134-.176.267-.682.866-.837 1.042-.154.177-.309.199-.576.065-.267-.134-1.129-.416-2.15-1.327-.794-.708-1.33-1.582-1.486-1.849-.156-.267-.017-.411.117-.544.12-.12.267-.312.4-.468.134-.156.177-.267.267-.446.088-.178.044-.334-.022-.468-.066-.134-.596-1.432-.816-1.966-.215-.518-.452-.447-.62-.456-.16-.008-.343-.01-.527-.01-.184 0-.485.069-.738.344-.254.275-.97.949-.97 2.313 0 1.365.992 2.684 1.102 2.833.11.149 1.953 2.982 4.73 4.181.661.285 1.177.455 1.579.583.664.211 1.269.181 1.748.11.533-.08 1.58-.646 1.802-1.238.222-.593.222-1.102.155-1.21-.067-.108-.244-.176-.51-.309z"/>
            </svg>
          </div>
          <div>
            <h1 className="logo-text">ColdReach</h1>
            <div className="logo-subtitle">WhatsApp Bulk Sender</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="active-pulse" style={{ backgroundColor: isConnected ? '#25d366' : '#ef4444' }}></div>
          <span style={{ fontSize: '14px', color: isConnected ? '#10b981' : '#ef4444', fontWeight: 600 }}>
            {isConnected ? 'Server Connected' : 'Offline - Check Backend'}
          </span>
        </div>
      </header>

      {/* Main Campaign Dashboard Stats */}
      <section className="dashboard-grid animate-fade-in">
        <div className="card-glass stat-card stat-total">
          <span className="stat-label">Total Uploaded</span>
          <span className="stat-value">{totalContacts}</span>
        </div>
        <div className="card-glass stat-card stat-sent">
          <span className="stat-label">Sent Successfully</span>
          <span className="stat-value">{campaign.sent}</span>
        </div>
        <div className="card-glass stat-card stat-failed">
          <span className="stat-label">Delivery Failed</span>
          <span className="stat-value">{campaign.failed}</span>
        </div>
        <div className="card-glass stat-card stat-pending">
          <span className="stat-label">Messages Pending</span>
          <span className="stat-value">{campaign.pending}</span>
        </div>
      </section>

      {/* Dynamic Campaign Progress Bar */}
      {totalContacts > 0 && (
        <section className="card-glass progress-container animate-fade-in">
          <div className="progress-header">
            <span style={{ fontWeight: 600 }}>
              {campaign.status === 'sending' && '🚀 Campaign actively sending...'}
              {campaign.status === 'paused' && '⏸️ Campaign paused'}
              {campaign.status === 'completed' && '✅ Campaign completed'}
              {campaign.status === 'idle' && '⌛ Ready to start'}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--whatsapp-green)' }}>{progressPercent}% Complete</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </section>
      )}

      {/* Upload Warning Alerts */}
      {uploadError && (
        <div className="alert-box animate-fade-in">
          <div className="alert-icon">⚠️</div>
          <div className="alert-content">
            <div className="alert-title">Upload Error</div>
            <p>{uploadError}</p>
          </div>
        </div>
      )}

      {uploadWarnings.length > 0 && (
        <div className="alert-box animate-fade-in" style={{ background: 'rgba(245, 158, 11, 0.06)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
          <div className="alert-icon" style={{ color: 'var(--warning)' }}>⚠️</div>
          <div className="alert-content">
            <div className="alert-title" style={{ color: '#f59e0b' }}>CSV Parsing Warnings ({uploadWarnings.length})</div>
            <ul className="alert-list" style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {uploadWarnings.map((warn, i) => <li key={i}>{warn}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* WhatsApp Connection Hub */}
      <section className="card-glass conn-hub-card animate-fade-in">
        <h3 className="panel-title" style={{ borderBottom: 'none', marginBottom: '14px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          WhatsApp Link & Sending Mode
        </h3>
        
        <div className="mode-toggle-group">
          <button 
            className={`mode-toggle-btn ${whatsapp.mode === 'simulation' ? 'active' : ''}`}
            onClick={() => handleModeChange('simulation')}
          >
            🧪 Simulation Engine
          </button>
          <button 
            className={`mode-toggle-btn ${whatsapp.mode === 'real' ? 'active' : ''}`}
            onClick={() => handleModeChange('real')}
          >
            🔗 Link Real WhatsApp
          </button>
        </div>

        {whatsapp.mode === 'real' ? (
          <div className="conn-hub-content animate-fade-in">
            {whatsapp.status === 'disconnected' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Launch a headless WhatsApp Web connection to authenticate your outbound WhatsApp number.
                </p>
                <button className="btn-primary" onClick={handleConnectWhatsapp} style={{ alignSelf: 'flex-start' }}>
                  🔗 Initialize WhatsApp Session
                </button>
              </div>
            )}

            {whatsapp.status === 'connecting' && (
              <div className="spinner-container">
                <div className="spinner"></div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>Launching Chrome & Instantiating WhatsApp Session...</div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>This takes 10-15 seconds to boot connection hooks on the backend.</p>
              </div>
            )}

            {whatsapp.status === 'qr_ready' && (
              <>
                <div className="qr-code-wrapper">
                  {whatsapp.qrCode ? (
                    <img className="qr-code-img" src={whatsapp.qrCode} alt="WhatsApp Web QR Code" />
                  ) : (
                    <div className="spinner" style={{ width: '30px', height: '30px' }}></div>
                  )}
                </div>
                <div className="conn-instructions">
                  <h4 style={{ color: 'var(--whatsapp-green)', fontWeight: 600 }}>Scan QR Code with your Phone</h4>
                  <div className="instruction-step">
                    <span className="step-num">1</span>
                    <span>Open <strong>WhatsApp</strong> on the mobile device you want to send from.</span>
                  </div>
                  <div className="instruction-step">
                    <span className="step-num">2</span>
                    <span>Tap <strong>Menu</strong> (Settings) &rarr; select <strong>Linked Devices</strong>.</span>
                  </div>
                  <div className="instruction-step">
                    <span className="step-num">3</span>
                    <span>Tap <strong>Link a Device</strong> and scan the QR code shown on the left.</span>
                  </div>
                </div>
              </>
            )}

            {whatsapp.status === 'connected' && (
              <div className="connected-box animate-fade-in">
                <div className="connected-details">
                  <div className="connected-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <div>
                    <h4 style={{ color: 'var(--success)', fontWeight: 600, fontSize: '16px' }}>WhatsApp Successfully Linked!</h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      All outreach campaigns will now be sent in real-time from your linked WhatsApp account.
                    </p>
                  </div>
                </div>
                <button className="btn-danger" onClick={handleDisconnectWhatsapp} style={{ padding: '10px 16px', fontSize: '13px' }}>
                  Unlink Account
                </button>
              </div>
            )}

            {whatsapp.status === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%' }}>
                <div className="alert-box animate-fade-in" style={{ marginBottom: 0 }}>
                  <div className="alert-icon">⚠️</div>
                  <div className="alert-content">
                    <div className="alert-title">WhatsApp Initialization Failed</div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{whatsapp.errorMsg}</p>
                  </div>
                </div>
                <button className="btn-secondary" onClick={handleConnectWhatsapp} style={{ alignSelf: 'flex-start' }}>
                  🔄 Retry Initialization
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-fade-in" style={{ padding: '10px 0' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              🔬 <strong>Simulation Engine Active:</strong> Perfect for sandbox testing or dry-runs. 
              The application simulates real campaign messaging speeds, randomized anti-ban delays, and live delivery failure logs 
              without linking a real phone or consuming WhatsApp API limits.
            </p>
          </div>
        )}
      </section>

      {/* Split pane Workspace */}
      <section className="workspace-grid animate-fade-in">
        {/* Left Side: Upload Zone & Template Writer */}
        <div className="left-panel">
          <div className="card-glass" style={{ padding: '30px' }}>
            <h3 className="panel-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              1. Import Contact File
            </h3>

            <div 
              className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
            >
              <div className="upload-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <p style={{ fontWeight: 600, fontSize: '15px' }}>
                {uploading ? 'Processing File...' : 'Drag & Drop CSV / Excel or Click to Browse'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Supports standard formats containing Phone, Owner Name, Business Name
              </p>
              <span className="sample-link" onClick={(e) => {
                e.stopPropagation();
                window.open(`${API_BASE}/api/sample-csv`);
              }}>
                📥 Download Demo Excel Structure
              </span>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".csv,.xlsx,.xls" 
              onChange={handleFileChange}
            />
          </div>

          <div className="card-glass" style={{ padding: '30px' }}>
            <h3 className="panel-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
              2. Draft Personalized Template
            </h3>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Inject contact-specific parameters automatically. Click a tag to insert at cursor position:
            </p>

            <div className="variables-container">
              <span className="var-tag" onClick={() => insertPlaceholder('OWNER_NAME')}>Owner Name</span>
              <span className="var-tag" onClick={() => insertPlaceholder('BUSINESS_NAME')}>Business Name</span>
              <span className="var-tag" onClick={() => insertPlaceholder('BUSINESS_TYPE')}>Business Type</span>
              <span className="var-tag" onClick={() => insertPlaceholder('CITY')}>City</span>
              <span className="var-tag" onClick={() => insertPlaceholder('THEIR_WEBSITE')}>Website Link</span>
            </div>

            <div className="textarea-wrapper">
              <textarea 
                id="template-textarea"
                className="textarea-custom"
                style={{ height: '240px', resize: 'none', lineHeight: '1.5' }}
                value={templateText}
                onChange={(e) => handleSaveTemplate(e.target.value)}
                placeholder="Draft your outreach template here..."
              ></textarea>
              <div className="char-counter">{charCount} characters</div>
            </div>
          </div>
        </div>

        {/* Right Side: Rendered Live Preview & Delay Slider Controller */}
        <div className="right-panel">
          <div className="card-glass" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 className="panel-title" style={{ marginBottom: '10px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              3. Message Preview & Sending Config
            </h3>

            {contacts.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-5px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Previewing Contact {selectedPreviewIdx + 1} of {contacts.length}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    disabled={selectedPreviewIdx === 0}
                    onClick={() => setSelectedPreviewIdx(prev => prev - 1)}
                  >
                    ◀ Prev
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    disabled={selectedPreviewIdx >= contacts.length - 1}
                    onClick={() => setSelectedPreviewIdx(prev => prev + 1)}
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            )}

            {/* Chat Mockup Rendering */}
            <div className="chat-preview">
              <div className="chat-bubble chat-bubble-out">
                {getRenderedPreview()}
                <div className="chat-bubble-meta">
                  <span>10:42 AM</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 15" width="16" height="15"><path fill="rgba(255,255,255,0.7)" d="M15.01 3.3L8.13 10.19l-2.5-2.5-.7.7 3.2 3.2 7.58-7.58-.7-.71zm-8.9 6.29L3.71 7.2l-.7.7 3.2 3.2 2.1-2.1-.7-.7-1.9 1.9zm8.9-6.29l-.7-.71-6.19 6.19.7.7 6.19-6.18z"/></svg>
                </div>
              </div>
            </div>

            {/* Sender configurations */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="control-row">
                <div className="control-info">
                  <span className="control-label">Anti-Ban Message Delay</span>
                  <span className="control-desc">Delays message delivery to protect target accounts</span>
                </div>
                <div className="slider-container">
                  <input 
                    type="range" 
                    min="3" 
                    max="60" 
                    className="slider"
                    value={delay}
                    disabled={campaign.status === 'sending'}
                    onChange={(e) => setDelay(parseInt(e.target.value))}
                  />
                  <span className="slider-val">{delay}s</span>
                </div>
              </div>
              
              <div className="control-row">
                <div className="control-info">
                  <span className="control-label">Outreach Method</span>
                  <span className="control-desc">Outbound delivery channel</span>
                </div>
                {whatsapp.mode === 'real' ? (
                  whatsapp.status === 'connected' ? (
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--whatsapp-green)', background: 'rgba(37,211,102,0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                      🟢 Real WhatsApp Active
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--error)', background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                      🔴 WhatsApp Unlinked
                    </span>
                  )
                ) : (
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--warning)', background: 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                    🟡 Simulator Mode Active
                  </span>
                )}
              </div>
            </div>

            {/* Live Campaign Controller Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              {campaign.status !== 'sending' ? (
                <button 
                  className="btn-primary" 
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleStartCampaign}
                  disabled={contacts.length === 0 || (whatsapp.mode === 'real' && whatsapp.status !== 'connected')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  {campaign.status === 'paused' 
                    ? 'Resume Campaign' 
                    : (whatsapp.mode === 'real' && whatsapp.status !== 'connected'
                      ? '🔒 Link WhatsApp First'
                      : 'Start Outreach Campaign'
                    )
                  }
                </button>
              ) : (
                <button 
                  className="btn-secondary" 
                  style={{ flex: 1, justifyContent: 'center', borderColor: 'var(--warning)', color: 'var(--warning)', background: 'rgba(245,158,11,0.06)' }}
                  onClick={handlePauseCampaign}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  Pause Campaign
                </button>
              )}

              <button 
                className="btn-danger" 
                onClick={handleStopCampaign}
                disabled={campaign.status === 'idle' && contacts.length === 0}
                style={{ padding: '12px 20px' }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Live System Console Logs */}
      {contacts.length > 0 && (
        <section className="log-console animate-fade-in">
          <div className="card-glass" style={{ padding: '24px' }}>
            <h3 className="panel-title" style={{ borderBottom: 'none', marginBottom: '12px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: campaign.status === 'sending' ? 'var(--whatsapp-green)' : '#9ca3af', marginRight: '8px' }}></span>
              Live Outreach Console Logs
            </h3>
            
            <div className="log-terminal" ref={logTerminalRef}>
              {campaign.logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Console idle. Launch campaign to output delivery states...</div>
              ) : (
                campaign.logs.map((log, i) => {
                  if (log.type === 'system') {
                    return (
                      <div key={i} className="log-row">
                        <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className="log-status-info">[SYSTEM]</span>
                        <span className="log-msg" style={{ color: '#fff', fontWeight: 500 }}>{log.message}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="log-row">
                      <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className={log.status === 'sent' ? 'log-status-sent' : 'log-status-failed'}>
                        [{log.status.toUpperCase()}]
                      </span>
                      <span className="log-msg">
                        {log.status === 'sent' 
                          ? `Delivered to ${log.name || 'Unknown'} (${log.phone}) at ${log.businessName}. Message: "${log.message.substring(0, 75)}..."`
                          : `Failed to deliver to ${log.name || 'Unknown'} (${log.phone}). Reason: ${log.error || 'N/A'}`
                        }
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {/* Contact verification and preview grid */}
      <section className="contacts-section animate-fade-in">
        <div className="card-glass" style={{ padding: '30px' }}>
          <h3 className="panel-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Uploaded Recipient List ({contacts.length} Contacts)
          </h3>

          {contacts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📂</div>
              <h3>No recipients loaded</h3>
              <p style={{ maxWidth: '400px' }}>Upload a spreadsheet (CSV, Excel) to review leads, phone validation statuses, and start sending.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="contacts-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Phone</th>
                    <th>Owner Name</th>
                    <th>Business Name</th>
                    <th>City</th>
                    <th>Website</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact, idx) => {
                    const isInvalid = !contact.phone || String(contact.phone).replace(/\D/g, '').length < 10;
                    
                    return (
                      <tr 
                        key={idx} 
                        style={{ cursor: 'pointer', background: selectedPreviewIdx === idx ? 'rgba(37, 211, 102, 0.05)' : '' }}
                        onClick={() => setSelectedPreviewIdx(idx)}
                      >
                        <td style={{ fontWeight: 600 }}>{idx + 1}</td>
                        <td>
                          {contact.status === 'sent' && <span className="badge badge-sent">Sent</span>}
                          {contact.status === 'failed' && <span className="badge badge-failed" title={contact.error}>Failed</span>}
                          {(!contact.status || contact.status === 'pending') && (
                            isInvalid 
                              ? <span className="badge badge-failed" title="Invalid Phone details">Error</span>
                              : <span className="badge badge-pending">Pending</span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'monospace', color: isInvalid ? 'var(--error)' : 'inherit' }}>
                          {contact.phone || 'MISSING'}
                          {isInvalid && <div style={{ fontSize: '10px', color: 'var(--error)' }}>Invalid Format</div>}
                        </td>
                        <td>{contact.owner_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>bhai</span>}</td>
                        <td>{contact.business_name || 'N/A'}</td>
                        <td>{contact.city || 'N/A'}</td>
                        <td>
                          {contact.website ? (
                            <a href={`http://${contact.website}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }} onClick={(e)=>e.stopPropagation()}>
                              {contact.website}
                            </a>
                          ) : (
                            'N/A'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;

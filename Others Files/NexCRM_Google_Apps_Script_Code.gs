const EMPLOYEE_JOINING_FORM_SHEET_ID = '1zoAWOfFX6b8ewFS93V1KzuxRYyIaNj1jbtVl9PcOw7k';
const NEXCRM_DATABASE_SHEET_ID = '11W0R_jFrVt6p3WkjaBlXgNjAjjMSt2Z1zrrhT_rLu4M';
const EMPLOYEE_DOCUMENTS_FOLDER_ID = '1ZW-0X3A7NvsruMFz2zvlX4_ib1ypM2w-';
const VAULT_DATA_FOLDER_ID = '1ALyfy3batV9OJcTdYGK-ES2z_1eArNGv';

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (params.action === 'read') {
    const tab = sanitizeTabName(params.tab || params.sheet || '');
    const payload = { success: true, tab: tab, data: readSheetObjects(NEXCRM_DATABASE_SHEET_ID, tab) };
    if (params.callback) {
      return ContentService.createTextOutput(params.callback + '(' + JSON.stringify(payload) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse(payload);
  }
  if (params.action === 'readAll') {
    const payload = readAllDatabaseSheets();
    if (params.callback) {
      return ContentService.createTextOutput(params.callback + '(' + JSON.stringify(payload) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse(payload);
  }
  if (params.action === 'listDocuments') {
    const payload = { success: true, documents: readSheetObjects(NEXCRM_DATABASE_SHEET_ID, 'Documents') };
    if (params.callback) {
      return ContentService
        .createTextOutput(params.callback + '(' + JSON.stringify(payload) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse(payload);
  }
  return jsonResponse({ success: true, message: 'NexCRM API is running' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action || 'joiningSubmit';

    if (action === 'joiningSubmit') return handleJoiningSubmit(body);
    if (action === 'employeeDocuments') return handleEmployeeDocuments(body);
    if (action === 'vaultUpload') return handleVaultUpload(body);
    if (action === 'leadSubmit') return handleLeadSubmit(body);
    if (action === 'realtimeSave' || action === 'saveRecord') return handleSaveRecord(body);
    if (action === 'replaceTab') return handleReplaceTab(body);
    if (action === 'bulkSync') return handleBulkSync(body);

    return jsonResponse({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function handleJoiningSubmit(body) {
  const data = body.data || {};
  const files = body.files || [];
  const rowData = normalizeJoiningData(data);
  const employeeFolder = getEmployeeFolder(rowData);
  const uploadedDocs = uploadFilesToFolder(employeeFolder, files, rowData, 'Employee Joining Form');

  const generated = createJoiningFormFiles(employeeFolder, rowData, body.joiningHtml || '');
  const allDocs = uploadedDocs.concat(generated);

  if (allDocs.length) {
    rowData['Document Links'] = allDocs.map(f => f.url).filter(Boolean).join(', ');
    rowData['Folder Link'] = employeeFolder.getUrl();
  }

  appendToSheet(EMPLOYEE_JOINING_FORM_SHEET_ID, 'JoiningForms', rowData);
  appendToSheet(NEXCRM_DATABASE_SHEET_ID, 'JoiningForms', rowData);
  appendToSheet(NEXCRM_DATABASE_SHEET_ID, 'Employees', rowData);

  allDocs.forEach(doc => appendDocumentRecord({
    employeeId: rowData['Employee ID'],
    employeeName: rowData['Employee Name'] || rowData['Name'],
    category: 'Employee Document',
    documentType: doc.documentType || 'Employee Document',
    documentName: doc.name,
    documentLink: doc.url,
    folderName: employeeFolder.getName(),
    folderLink: employeeFolder.getUrl(),
    source: body.source || 'employee-joining-form.html',
    size: doc.size || '',
    type: doc.type || '',
    uploadedAt: new Date()
  }));

  return jsonResponse({ success: true, uploaded: allDocs.length, folderUrl: employeeFolder.getUrl() });
}

function handleEmployeeDocuments(body) {
  const employee = body.employee || {};
  const rowData = normalizeEmployeeData(employee);
  const folder = getEmployeeFolder(rowData);
  const uploadedDocs = uploadFilesToFolder(folder, body.files || [], rowData, 'Employee Document');

  uploadedDocs.forEach(doc => appendDocumentRecord({
    employeeId: rowData['Employee ID'],
    employeeName: rowData['Employee Name'] || rowData['Name'],
    category: 'Employee Document',
    documentType: doc.documentType || 'Employee Document',
    documentName: doc.name,
    documentLink: doc.url,
    folderName: folder.getName(),
    folderLink: folder.getUrl(),
    source: body.source || 'vault.html',
    size: doc.size || '',
    type: doc.type || '',
    uploadedAt: new Date()
  }));

  return jsonResponse({ success: true, uploaded: uploadedDocs.length, folderUrl: folder.getUrl() });
}

function handleVaultUpload(body) {
  const parent = DriveApp.getFolderById(VAULT_DATA_FOLDER_ID);
  const folderName = sanitizeFileName([body.folder || 'Vault Data', body.subFolder || ''].filter(Boolean).join(' - '));
  const folder = getOrCreateFolder(parent, folderName || 'Vault Data');
  const uploadedDocs = uploadFilesToFolder(folder, body.files || [], {}, 'Vault Data');

  uploadedDocs.forEach(doc => appendDocumentRecord({
    employeeId: '',
    employeeName: '',
    category: 'Vault Data',
    documentType: body.folder || 'Vault Document',
    documentName: doc.name,
    documentLink: doc.url,
    folderName: folder.getName(),
    folderLink: folder.getUrl(),
    source: body.source || 'vault.html',
    size: doc.size || '',
    type: doc.type || '',
    uploadedAt: new Date()
  }));

  return jsonResponse({ success: true, uploaded: uploadedDocs.length, folderUrl: folder.getUrl() });
}

function handleLeadSubmit(body) {
  const lead = body.lead || body.data || body;
  const rowData = normalizeLeadData(lead);
  appendToSheet(NEXCRM_DATABASE_SHEET_ID, 'Leads', rowData);
  return jsonResponse({ success: true, leadId: rowData['Lead ID'], sheet: 'Leads' });
}

function normalizeLeadData(data) {
  return {
    'Timestamp': new Date(),
    'Lead ID': data.leadId || data['Lead ID'] || '',
    'Customer Name': data.customerName || data['Customer Name'] || '',
    'Mobile': data.mobile || data['Mobile'] || '',
    'City': data.city || data['City'] || '',
    'Pincode': data.pincode || data['Pincode'] || '',
    'Customer Email': data.emailId || data.customerEmail || data['Customer Email'] || '',
    'Salary': data.salary || data['Salary'] || '',
    'Company Name': data.companyName || data['Company Name'] || '',
    'PAN No': data.panNo || data.pan || data['PAN No'] || '',
    'DOB': data.dob || data['DOB'] || '',
    'Product': data.product || data['Product'] || '',
    'Lead Source': data.source || data.leadSource || data['Lead Source'] || '',
    'Employee ID': data.employeeId || data['Employee ID'] || '',
    'Employee Name': data.employeeName || data['Employee Name'] || '',
    'Employee Email': data.email || data.employeeEmail || data['Employee Email'] || '',
    'Disposition': data.disposition || data.status || data['Disposition'] || '',
    'Status': data.status || data.disposition || data['Status'] || '',
    'Remark': data.remark || data['Remark'] || '',
    'Loan Amount': data.loanAmount || data['Loan Amount'] || '',
    'Bank': data.bank || data['Bank'] || '',
    'Remarks': data.remarks || data['Remarks'] || '',
    'Updated At': data.updatedAt || data['Updated At'] || '',
    'Source': data.sourcePage || data.page || 'leads.html'
  };
}
function handleSaveRecord(body) {
  const tab = sanitizeTabName(body.tab || body.sheet || 'Data');
  const data = body.data || body.record || body.row || {};
  appendToSheet(NEXCRM_DATABASE_SHEET_ID, tab, normalizeModuleRow(tab, data));
  return jsonResponse({ success: true, tab: tab });
}

function handleReplaceTab(body) {
  const tab = sanitizeTabName(body.tab || body.sheet || 'Data');
  const rows = Array.isArray(body.data || body.rows) ? (body.data || body.rows) : [];
  replaceSheetRows(NEXCRM_DATABASE_SHEET_ID, tab, rows.map(row => normalizeModuleRow(tab, row)));
  return jsonResponse({ success: true, tab: tab, replaced: rows.length });
}
function handleBulkSync(body) {
  const data = body.data || {};
  const result = {};
  Object.keys(data).forEach(tab => {
    const safeTab = sanitizeTabName(tab);
    const rows = Array.isArray(data[tab]) ? data[tab] : [];
    result[safeTab] = 0;
    rows.forEach(row => {
      appendToSheet(NEXCRM_DATABASE_SHEET_ID, safeTab, normalizeModuleRow(safeTab, row));
      result[safeTab]++;
    });
  });
  return jsonResponse({ success: true, synced: result });
}

function normalizeModuleRow(tab, data) {
  if (tab === 'Leads') return normalizeLeadData(data);
  if (tab === 'MIS') return normalizeMisData(data);
  if (tab === 'Attendance') return normalizeAttendanceData(data);
  if (tab === 'Employees') return normalizeEmployeeSheetData(data);
  const row = Object.assign({}, data || {});
  if (!row.Timestamp) row.Timestamp = new Date();
  return row;
}

function normalizeMisData(data) {
  return {
    'Timestamp': new Date(),
    'Login Date': data.loginDate || data['Login Date'] || '',
    'Customer ID': data.customerId || data['Customer ID'] || '',
    'NexID': data.nexId || data.NexID || data['NexID'] || '',
    'Customer Name': data.customerName || data['Customer Name'] || '',
    'Mobile': data.mobile || data.Mobile || '',
    'City': data.city || data.City || '',
    'Pincode': data.pincode || data.Pincode || '',
    'Net Salary': data.netSalary || data['Net Salary'] || '',
    'Loan Amount': data.loanAmount || data['Loan Amount'] || '',
    'PAN No': data.panNo || data['PAN No'] || '',
    'Company Name': data.companyName || data['Company Name'] || '',
    'Employee Code': data.empCode || data.employeeCode || data['Employee Code'] || '',
    'Employee Name': data.empName || data.employeeName || data['Employee Name'] || '',
    'Reporting Manager': data.reportingManager || data['Reporting Manager'] || '',
    'LAN ID / Barcode / Webtop ID': data.lanId || data['LAN ID / Barcode / Webtop ID'] || '',
    'Product': data.product || data.Product || '',
    'Login Bank': data.loginBank || data['Login Bank'] || '',
    'Status': data.status || data.Status || '',
    'Remarks': data.remarks || data.Remarks || ''
  };
}

function normalizeAttendanceData(data) {
  return {
    'Timestamp': new Date(),
    'Employee ID': data.employeeId || data['Employee ID'] || '',
    'Employee Name': data.employeeName || data['Employee Name'] || '',
    'Role': data.Role || data.role || '',
    'Manager': data.Manager || data.manager || '',
    'Salary': data.Salary || data.salary || '',
    'Month': data.Month || data.month || '',
    'Day': data.Day || data.day || '',
    'Date': data.Date || data.date || '',
    'Status': data.Status || data.status || ''
  };
}

function normalizeEmployeeSheetData(data) {
  return {
    'Timestamp': new Date(),
    'Employee ID': data['Employee ID'] || data.employeeId || data.id || '',
    'Employee Name': data['Employee Name'] || data.employeeName || data.name || '',
    'Department': data.Department || data.department || '',
    'Designation': data.Designation || data.designation || '',
    'Reporting Manager': data['Reporting Manager'] || data.reportingManager || data.manager || '',
    'Official Mail': data['Official Mail'] || data.officialMail || '',
    'Location': data.Location || data.location || '',
    'Salary': data.Salary || data.salary || '',
    'Target': data.Target || data.target || '',
    'Mobile': data.Mobile || data.mobile || '',
    'Email': data.Email || data.email || '',
    'DOB': data.DOB || data.dob || '',
    'Joining Date': data['Joining Date'] || data.joining || '',
    'Status': data.Status || data.status || 'Active'
  };
}

function readAllDatabaseSheets() {
  const ss = SpreadsheetApp.openById(NEXCRM_DATABASE_SHEET_ID);
  const out = { success: true, data: {} };
  ss.getSheets().forEach(sheet => out.data[sheet.getName()] = readSheetObjects(NEXCRM_DATABASE_SHEET_ID, sheet.getName()));
  return out;
}

function sanitizeTabName(name) {
  return String(name || 'Data').replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 90) || 'Data';
}
function normalizeJoiningData(data) {
  const employeeId = data.id || data.eCode || data['Employee ID'] || '';
  const name = data.empName || data.name || data['Employee Name'] || data['Name'] || '';

  return {
    'Timestamp': new Date(),
    'Employee ID': employeeId,
    'Employee Name': name,
    'Name': name,
    'Mobile': data.mobile || data['Mobile'] || '',
    'Email': data.email || data['Email'] || '',
    'Department': data.department || data['Department'] || '',
    'Designation': data.designation || data['Designation'] || '',
    'Reporting Manager': data.manager || data['Reporting Manager'] || '',
    'Joining Date': data.joiningDate || data.joining || data.doj || data['Joining Date'] || '',
    'Interview Date': data.interviewDate || data['Interview Date'] || '',
    'HR Name': data.hrName || data['HR Name'] || '',
    'Salary': data.salary || data['Salary'] || '',
    'CTC': data.ctc || data['CTC'] || '',
    'Location': data.location || data['Location'] || '',
    'Aadhar No': data.aadharNo || data.aadhaar || data['Aadhar No'] || '',
    'PAN No': data.panNo || data.pan || data['PAN No'] || '',
    'Education': data.education || data['Education'] || '',
    'Father Name': data.fatherName || data['Father Name'] || '',
    'Mother Name': data.motherName || data['Mother Name'] || '',
    'Father Occupation': data.fatherOccupation || data['Father Occupation'] || '',
    'Mother Occupation': data.motherOccupation || data['Mother Occupation'] || '',
    'Family Members': data.familyMembers || data['Family Members'] || '',
    'Bank Name': data.bankName || data.bank || data['Bank Name'] || '',
    'Account No': data.accountNo || data['Account No'] || '',
    'IFSC': data.ifscCode || data.ifsc || data['IFSC'] || '',
    'Branch Name': data.branchName || data['Branch Name'] || '',
    'Emergency Contact Name': data.emergencyContactName || data['Emergency Contact Name'] || '',
    'Emergency Contact No': data.emergencyContactNo || data['Emergency Contact No'] || '',
    'Emergency Relation': data.emergencyRelation || data['Emergency Relation'] || '',
    'Document Links': data.documentLinks || data.employeeDocumentsMeta || data['Document Links'] || '',
    'Documents Checklist': Array.isArray(data.documentsChecklist) ? data.documentsChecklist.join(', ') : (data.documentsChecklist || ''),
    'Status': data.status || 'Pending'
  };
}

function normalizeEmployeeData(data) {
  return normalizeJoiningData({
    id: data.id || data.eCode,
    name: data.name || data.empName,
    mobile: data.mobile,
    email: data.email,
    department: data.department,
    designation: data.designation,
    joining: data.doj,
    salary: data.salary,
    panNo: data.pan,
    aadharNo: data.aadhaar,
    bankName: data.bankName,
    accountNo: data.accountNo,
    ifsc: data.ifsc,
    fatherName: data.fatherName,
    status: data.status
  });
}

function getEmployeeFolder(rowData) {
  const parent = DriveApp.getFolderById(EMPLOYEE_DOCUMENTS_FOLDER_ID);
  const employeeId = rowData['Employee ID'] || 'NEW-EMPLOYEE';
  const employeeName = rowData['Employee Name'] || rowData['Name'] || 'Employee';
  return getOrCreateFolder(parent, sanitizeFileName(employeeId + ' - ' + employeeName));
}

function uploadFilesToFolder(folder, files, rowData, defaultType) {
  const uploaded = [];
  (files || []).forEach(file => {
    const base64 = String(file.base64 || '').split(',').pop();
    if (!base64) return;

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64),
      file.type || 'application/octet-stream',
      sanitizeFileName(file.name || 'document')
    );
    const driveFile = folder.createFile(blob);
    uploaded.push({
      name: driveFile.getName(),
      url: driveFile.getUrl(),
      size: file.size || driveFile.getSize(),
      type: file.type || '',
      documentType: defaultType,
      employeeId: rowData['Employee ID'] || '',
      employeeName: rowData['Employee Name'] || rowData['Name'] || '',
      uploadedAt: new Date()
    });
  });
  return uploaded;
}

function createJoiningFormFiles(folder, rowData, html) {
  const employeeId = rowData['Employee ID'] || 'NEW-EMPLOYEE';
  const employeeName = rowData['Employee Name'] || rowData['Name'] || 'Employee';
  const baseName = sanitizeFileName('Joining Form - ' + employeeId + ' - ' + employeeName);
  const htmlContent = html || buildFallbackJoiningHtml(rowData);
  const htmlFile = folder.createFile(Utilities.newBlob(htmlContent, 'text/html', baseName + '.html'));
  const pdfFile = folder.createFile(Utilities.newBlob(htmlContent, 'text/html', baseName + '.html').getAs('application/pdf'));
  pdfFile.setName(baseName + '.pdf');
  return [
    { name: htmlFile.getName(), url: htmlFile.getUrl(), type: 'text/html', documentType: 'Joining Form HTML' },
    { name: pdfFile.getName(), url: pdfFile.getUrl(), type: 'application/pdf', documentType: 'Joining Form PDF' }
  ];
}

function buildFallbackJoiningHtml(rowData) {
  const rows = Object.keys(rowData).map(key => '<tr><th>' + escapeHtml(key) + '</th><td>' + escapeHtml(rowData[key]) + '</td></tr>').join('');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Calibri,Arial,sans-serif;padding:28px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body><h1>Employee Joining Form</h1><table>' + rows + '</table></body></html>';
}

function appendDocumentRecord(doc) {
  appendToSheet(NEXCRM_DATABASE_SHEET_ID, 'Documents', {
    'Timestamp': doc.uploadedAt || new Date(),
    'Employee ID': doc.employeeId || '',
    'Employee Name': doc.employeeName || '',
    'Category': doc.category || '',
    'Document Type': doc.documentType || '',
    'Document Name': doc.documentName || '',
    'Document Link': doc.documentLink || '',
    'Folder Name': doc.folderName || '',
    'Folder Link': doc.folderLink || '',
    'Source': doc.source || '',
    'Size': doc.size || '',
    'MIME Type': doc.type || ''
  });
}

function appendToSheet(spreadsheetId, sheetName, rowData) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  if (sheet.getLastColumn() === 0 || sheet.getLastRow() === 0) {
    sheet.appendRow(Object.keys(rowData));
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(header => rowData[header] !== undefined ? rowData[header] : '');
  sheet.appendRow(row);
}

function readSheetObjects(spreadsheetId, sheetName) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  return values.map(row => {
    const obj = {};
    headers.forEach((header, index) => obj[toCamel(header)] = row[index]);
    obj.employeeId = obj.employeeId || obj['Employee ID'] || '';
    obj.employeeName = obj.employeeName || obj['Employee Name'] || '';
    obj.documentName = obj.documentName || obj.name || '';
    obj.documentLink = obj.documentLink || obj.url || '';
    obj.url = obj.documentLink;
    obj.name = obj.documentName;
    return obj;
  });
}

function toCamel(header) {
  return String(header || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, chr => chr.toLowerCase());
}

function getOrCreateFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

function sanitizeFileName(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|#%{}~&]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'Document';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}




function replaceSheetRows(spreadsheetId, sheetName, rows) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clearContents();
  rows = Array.isArray(rows) ? rows : [];
  const headers = [];
  rows.forEach(row => Object.keys(row || {}).forEach(key => { if (headers.indexOf(key) === -1) headers.push(key); }));
  if (!headers.length) headers.push('UpdatedAt');
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) {
    const values = rows.map(row => headers.map(header => row && row[header] !== undefined ? row[header] : ''));
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }
}

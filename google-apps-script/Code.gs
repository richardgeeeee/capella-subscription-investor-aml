/**
 * Google Apps Script - Capella Alpha Fund KYC File Relay
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Configuration (Script Properties):
 * - API_KEY: shared secret with the Next.js app
 * - AML_FOLDER_ID: ID of the "Investor AML" folder in Drive
 *
 * Expected POST body: application/json
 * {
 *   "apiKey":       string,  // must match API_KEY
 *   "folderName":   string,  // e.g. "001 ZHANG Jin"
 *   "folderId":     string,  // optional — if provided, use this folder directly
 *                            //            and rename it to folderName if needed
 *   "fileName":     string,  // e.g. "ZHANG Jin-HKID.pdf"
 *   "documentType": string,  // informational
 *   "mimeType":     string,  // e.g. "application/pdf"
 *   "fileBase64":   string   // base64-encoded file bytes
 * }
 */

/**
 * GET handler — lists all investor subfolders in the AML folder.
 *
 * Query params:
 *   ?apiKey=xxx&action=listFolders
 *
 * Returns: { success: true, folders: [{ id, name, url }] }
 */
function doGet(e) {
  try {
    var params = e.parameter || {};
    var expectedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!params.apiKey || params.apiKey !== expectedKey) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    if (params.action === 'listFolders') {
      var amlFolderId = PropertiesService.getScriptProperties().getProperty('AML_FOLDER_ID');
      var amlFolder = DriveApp.getFolderById(amlFolderId);
      var subfolders = amlFolder.getFolders();
      var list = [];
      while (subfolders.hasNext()) {
        var sub = subfolders.next();
        list.push({ id: sub.getId(), name: sub.getName(), url: sub.getUrl() });
      }
      list.sort(function(a, b) { return a.name.localeCompare(b.name); });
      return jsonResponse({ success: true, folders: list });
    }

    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var expectedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!body.apiKey || body.apiKey !== expectedKey) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    var folderName = body.folderName;
    var folderId = body.folderId;
    var fileName = body.fileName;
    var fileBase64 = body.fileBase64;
    var mimeType = body.mimeType || 'application/octet-stream';

    if (!folderName || !fileName || !fileBase64) {
      return jsonResponse({ success: false, error: 'Missing folderName, fileName, or fileBase64' });
    }

    var amlFolderId = PropertiesService.getScriptProperties().getProperty('AML_FOLDER_ID');
    var amlFolder = DriveApp.getFolderById(amlFolderId);

    // Resolve the investor-specific folder:
    // 1. If folderId is provided and valid, use it and rename if needed.
    // 2. Else fall back to name lookup, creating if missing.
    var investorFolder = null;
    if (folderId) {
      try {
        investorFolder = DriveApp.getFolderById(folderId);
        if (investorFolder.isTrashed()) {
          investorFolder = null;
        } else if (investorFolder.getName() !== folderName) {
          investorFolder.setName(folderName);
        }
      } catch (e) {
        // Folder id stale/invalid; fall through to name-based lookup.
        investorFolder = null;
      }
    }
    if (!investorFolder) {
      var folders = amlFolder.getFoldersByName(folderName);
      if (folders.hasNext()) {
        investorFolder = folders.next();
      } else {
        investorFolder = amlFolder.createFolder(folderName);
      }
    }

    // Replace existing file with the same name
    var existing = investorFolder.getFilesByName(fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    var bytes = Utilities.base64Decode(fileBase64);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = investorFolder.createFile(blob);
    file.setName(fileName);

    return jsonResponse({
      success: true,
      fileId: file.getId(),
      fileName: fileName,
      folderId: investorFolder.getId(),
      folderName: folderName,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Diagnostic - run manually to verify setup and list recent uploads.
 */
function testSetup() {
  var amlFolderId = PropertiesService.getScriptProperties().getProperty('AML_FOLDER_ID');
  var apiKey = PropertiesService.getScriptProperties().getProperty('API_KEY');

  Logger.log('AML_FOLDER_ID: ' + (amlFolderId || 'NOT SET'));
  Logger.log('API_KEY: ' + (apiKey ? '[SET, length=' + apiKey.length + ']' : 'NOT SET'));
  Logger.log('Running as: ' + Session.getActiveUser().getEmail());

  if (!amlFolderId) return;

  try {
    var folder = DriveApp.getFolderById(amlFolderId);
    Logger.log('AML Folder name: "' + folder.getName() + '"');
    Logger.log('AML Folder URL: ' + folder.getUrl());

    var subfolders = folder.getFolders();
    var list = [];
    while (subfolders.hasNext()) {
      var sub = subfolders.next();
      list.push({ name: sub.getName(), created: sub.getDateCreated(), url: sub.getUrl() });
    }
    list.sort(function (a, b) { return b.created - a.created; });
    Logger.log('--- ' + list.length + ' subfolders total; 10 most recent ---');
    for (var i = 0; i < Math.min(10, list.length); i++) {
      var f = list[i];
      Logger.log('  ' + f.created.toISOString() + ' [' + f.name + '] ' + f.url);
    }
  } catch (err) {
    Logger.log('ERROR accessing AML folder: ' + err.toString());
  }
}

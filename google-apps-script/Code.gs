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
 * POST parameters:
 * - apiKey: must match API_KEY
 * - folderName: investor folder name, e.g. "001 Jin ZHANG"
 * - fileName: file name (already formatted, e.g. "ZHANG Jin-HKID.pdf")
 * - documentType: tag/type of file (informational)
 * - file: file blob
 */

function doPost(e) {
  try {
    var apiKey = e.parameter.apiKey;
    var expectedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== expectedKey) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    var folderName = e.parameter.folderName;
    var fileName = e.parameter.fileName;
    var fileBlob = e.parameter.file;

    if (!folderName || !fileName) {
      return jsonResponse({ success: false, error: 'Missing folderName or fileName' });
    }

    var amlFolderId = PropertiesService.getScriptProperties().getProperty('AML_FOLDER_ID');
    var amlFolder = DriveApp.getFolderById(amlFolderId);

    // Find or create investor-specific folder by exact name
    var investorFolder;
    var folders = amlFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      investorFolder = folders.next();
    } else {
      investorFolder = amlFolder.createFolder(folderName);
    }

    // Save / replace file with the same name
    var existing = investorFolder.getFilesByName(fileName);
    while (existing.hasNext()) {
      // Move old version to trash so the new file takes its slot
      existing.next().setTrashed(true);
    }

    var blob;
    if (typeof fileBlob === 'string') {
      blob = Utilities.newBlob(Utilities.base64Decode(fileBlob), 'application/octet-stream', fileName);
    } else {
      blob = Utilities.newBlob(fileBlob, 'application/octet-stream', fileName);
    }

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
 * Diagnostic - run manually to verify setup and find recent uploads
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

    // List most-recently-created subfolders
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

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
 * Test function - run manually to verify setup
 */
function testSetup() {
  var amlFolderId = PropertiesService.getScriptProperties().getProperty('AML_FOLDER_ID');
  var apiKey = PropertiesService.getScriptProperties().getProperty('API_KEY');

  Logger.log('AML_FOLDER_ID: ' + (amlFolderId ? 'SET' : 'NOT SET'));
  Logger.log('API_KEY: ' + (apiKey ? 'SET' : 'NOT SET'));

  if (amlFolderId) {
    var folder = DriveApp.getFolderById(amlFolderId);
    Logger.log('AML Folder name: ' + folder.getName());
  }
}

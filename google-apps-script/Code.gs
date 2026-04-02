/**
 * Google Apps Script - Capella Alpha Fund KYC File Relay
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Configuration:
 * - Set SHARED_DRIVE_ID in Script Properties
 * - Set API_KEY in Script Properties
 * - Set AML_FOLDER_ID in Script Properties (the "Investor AML" folder ID)
 */

function doPost(e) {
  try {
    // Verify API key
    var apiKey = e.parameter.apiKey;
    var expectedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');

    if (!apiKey || apiKey !== expectedKey) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var investorName = e.parameter.investorName;
    var fileName = e.parameter.fileName;
    var documentType = e.parameter.documentType;
    var fileBlob = e.parameter.file;

    if (!investorName || !fileName) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Missing investorName or fileName'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Get or create investor folder
    var amlFolderId = PropertiesService.getScriptProperties().getProperty('AML_FOLDER_ID');
    var amlFolder = DriveApp.getFolderById(amlFolderId);

    // Find or create investor-specific folder
    var investorFolder;
    var folders = amlFolder.getFoldersByName(investorName);
    if (folders.hasNext()) {
      investorFolder = folders.next();
    } else {
      investorFolder = amlFolder.createFolder(investorName);
    }

    // Save file
    var blob;
    if (typeof fileBlob === 'string') {
      // Base64 encoded
      blob = Utilities.newBlob(Utilities.base64Decode(fileBlob), 'application/octet-stream', fileName);
    } else {
      blob = Utilities.newBlob(fileBlob, 'application/octet-stream', fileName);
    }

    var file = investorFolder.createFile(blob);
    file.setName(fileName);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: file.getId(),
      fileName: fileName,
      folderId: investorFolder.getId()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
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

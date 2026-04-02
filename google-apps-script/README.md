# Google Apps Script - Capella KYC File Relay

This Apps Script receives files from the Capella KYC web application and saves them to the Google Shared Drive.

## Setup

1. Go to [Google Apps Script](https://script.google.com) and create a new project
2. Copy the contents of `Code.gs` into the editor
3. Go to **Project Settings** > **Script Properties** and add:
   - `API_KEY`: A secret key (same as `GAS_API_KEY` in your `.env.local`)
   - `AML_FOLDER_ID`: The Google Drive folder ID of `Investor AML` folder in your Shared Drive
     - Open the folder in Google Drive, the ID is in the URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
4. Click **Deploy** > **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployed URL and set it as `GAS_WEB_APP_URL` in your `.env.local`

## How it works

When a file is received via POST:
1. Verifies the API key
2. Finds or creates a folder named after the investor under `Investor AML/`
3. Saves the file to that folder
4. Returns the Google Drive file ID

## Testing

Run the `testSetup()` function in the Apps Script editor to verify your configuration.

const path = require('path');
const fs = require('fs');

let storageProvider = (process.env.STORAGE_PROVIDER || '').trim().toLowerCase();
if (!storageProvider) storageProvider = 'mega';

// MEGA provider implementation using megajs
let megaStorage = null;
async function getMega() {
  const { Storage } = require('megajs');
  const email = (process.env.MEGA_EMAIL || '').trim();
  const password = (process.env.MEGA_PASSWORD || '').trim();
  if (!email || !password) {
    throw new Error('Mega credentials not set');
  }
  if (megaStorage) return megaStorage;
  megaStorage = await new Storage({ email, password }).ready;
  return megaStorage;
}

async function ensureMegaFolder(name) {
  const storage = await getMega();
  let folder = storage.root.children && storage.root.children.find(f => f && f.directory && f.name === name);
  if (!folder) {
    // create folder in root
    folder = await storage.mkdir({ name });
  }
  return folder;
}

async function uploadBufferToMega({ buffer, filename, category, mimeType }) {
  const storage = await getMega();
  const postsFolderName = (process.env.MEGA_POSTS_FOLDER_NAME || 'BeatbuzzPosts').trim();
  const profileFolderName = (process.env.MEGA_PROFILE_FOLDER_NAME || 'BeatbuzzProfiles').trim();
  const targetName = category === 'profiles' ? profileFolderName : postsFolderName;
  const folder = await ensureMegaFolder(targetName);

  const uploadOpts = { name: filename, target: folder };
  const file = await storage.upload(uploadOpts, buffer).complete;

  let publicUrl = null;
  try {
    if (typeof file.link === 'function') {
      publicUrl = await new Promise((resolve, reject) => {
        try {
          file.link((err, url) => (err ? reject(err) : resolve(url)));
        } catch (err) {
          reject(err);
        }
      });
    }
  } catch (e) {
    // If sharing fails, we return null and let the caller decide fallback
    publicUrl = null;
  }

  return { url: publicUrl, provider: 'mega' };
}

async function cloudHealth() {
  const provider = storageProvider;
  const health = { provider };
  if (provider === 'mega') {
    const email = (process.env.MEGA_EMAIL || '').trim();
    const password = (process.env.MEGA_PASSWORD || '').trim();
    health.emailSet = !!email;
    health.passwordSet = !!password;
    health.postsFolderName = (process.env.MEGA_POSTS_FOLDER_NAME || 'BeatbuzzPosts').trim();
    health.profileFolderName = (process.env.MEGA_PROFILE_FOLDER_NAME || 'BeatbuzzProfiles').trim();
    try {
      const storage = await getMega();
      health.loggedIn = true;
      // account info
      try {
        const info = await storage.getAccountInfo();
        health.accountInfo = info;
      } catch (e) {
        health.accountInfoError = (e && e.message) || String(e);
      }
      // ensure folders
      const postsFolder = await ensureMegaFolder(health.postsFolderName);
      const profileFolder = await ensureMegaFolder(health.profileFolderName);
      health.postsFolderExists = !!postsFolder;
      health.profileFolderExists = !!profileFolder;
      return { ok: true, ...health };
    } catch (err) {
      health.error = (err && err.message) || String(err);
      return { ok: false, ...health };
    }
  }
  // Unknown provider
  health.error = 'Unsupported storage provider';
  return { ok: false, ...health };
}

async function uploadBufferToCloud({ buffer, filename, mimeType, category }) {
  if (storageProvider === 'mega') {
    return uploadBufferToMega({ buffer, filename, mimeType, category });
  }
  throw new Error('Unsupported storage provider');
}

module.exports = {
  uploadBufferToCloud,
  cloudHealth,
  getMega
};
/**
 * Storage Service — MongoDB GridFS
 *
 * Replaces: AWS S3 / Cloudflare R2
 * Stores: avatars, documents, call recordings, transcripts
 *
 * API surface is kept compatible with the old S3 storage service
 * so callers (routes/auth.js, routes/api.js) need minimal changes.
 */

const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const { Readable } = require('stream');
const logger = require('../utils/logger');

let _bucket = null;

function getBucket() {
  if (!_bucket) {
    if (!mongoose.connection.db) {
      throw new Error('MongoDB not connected yet — GridFS unavailable');
    }
    _bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  }
  return _bucket;
}

// Reset bucket reference when Mongoose reconnects
mongoose.connection.on('connected', () => { _bucket = null; });
mongoose.connection.on('reconnected', () => { _bucket = null; });

/**
 * Upload a buffer to GridFS.
 * @param {Buffer} buffer
 * @param {string} key      Filename / logical path (e.g. "avatars/userId-ts.png")
 * @param {string} contentType
 * @returns {Promise<string>}  URL: /api/v1/files/<gridfsId>
 */
async function uploadBuffer(buffer, key, contentType = 'application/octet-stream') {
  const bucket = getBucket();

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(key, {
      contentType,
      metadata: { key, uploadedAt: new Date() }
    });

    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);

    uploadStream.on('finish', () => {
      const url = `/api/v1/files/${uploadStream.id}`;
      logger.log('GridFS upload:', key, '->', url);
      resolve(url);
    });

    uploadStream.on('error', (err) => {
      logger.error('GridFS upload error:', err.message);
      reject(err);
    });
  });
}

/**
 * Open a download stream by GridFS file ID.
 * @param {string|ObjectId} fileId
 * @returns {GridFSBucketReadStream}
 */
function getFileStream(fileId) {
  const bucket = getBucket();
  return bucket.openDownloadStream(new ObjectId(String(fileId)));
}

/**
 * Look up a file by its logical key and return a URL to serve it.
 * For GridFS, we return a relative API path instead of a signed URL.
 * @param {string} key
 * @returns {Promise<string>}
 */
async function getSignedDownloadUrl(key) {
  const bucket = getBucket();
  const files = await bucket.find({ filename: key }).limit(1).toArray();
  if (!files.length) throw new Error(`File not found: ${key}`);
  return `/api/v1/files/${files[0]._id}`;
}

/**
 * Delete a file from GridFS by ID.
 * @param {string} fileId
 */
async function deleteFile(fileId) {
  const bucket = getBucket();
  await bucket.delete(new ObjectId(String(fileId)));
  logger.log('GridFS deleted:', fileId);
}

function isConfigured() {
  return !!mongoose.connection.db;
}

module.exports = { uploadBuffer, getFileStream, getSignedDownloadUrl, deleteFile, isConfigured };

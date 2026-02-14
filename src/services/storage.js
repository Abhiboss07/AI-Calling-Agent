const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize S3Client with endpoint for Cloudflare R2 (or standard AWS)
const clientConfig = {
  region: config.s3.region || 'auto',
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey
  }
};

// If endpoint is provided (Cloudflare R2 or compatible), add it
if (config.s3.endpoint) {
  clientConfig.endpoint = config.s3.endpoint;
}

const s3 = new S3Client(clientConfig);

async function uploadBuffer(buffer, key, contentType = 'audio/mpeg') {
  if (!config.s3.bucket) throw new Error('S3 bucket not configured');

  const params = {
    Bucket: config.s3.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType
    // Note: ACL 'public-read' may not be supported by all S3-compatible services
    // Cloudflare R2 ignores ACL, but we keep it for compatibility
  };

  try {
    await s3.send(new PutObjectCommand(params));
    logger.log('Uploaded to S3/R2', key);
  } catch (err) {
    logger.error('S3 upload failed', err.message || err);
    throw err;
  }

  // Construct public URL
  // IMPORTANT: For R2, the API endpoint (e.g. https://xxx.r2.cloudflarestorage.com)
  // is NOT the public URL. Use S3_PUBLIC_URL env var for the public bucket domain.
  let url;
  const publicBase = process.env.S3_PUBLIC_URL;

  if (publicBase) {
    // Explicit public URL configured (recommended for R2/CDN)
    url = `${publicBase.replace(/\/$/, '')}/${key}`;
  } else if (config.s3.endpoint) {
    // Fallback: construct from endpoint (may not be publicly accessible)
    const baseUrl = config.s3.endpoint.replace(/\/$/, '');
    url = `${baseUrl}/${config.s3.bucket}/${key}`;
  } else {
    // Standard AWS S3 URL format
    url = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
  }

  logger.debug('S3 URL:', url);
  return url;
}


async function getSignedDownloadUrl(key, expiresIn = 3600) {
  if (!config.s3.bucket) throw new Error('S3 bucket not configured');

  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key
  });

  try {
    const url = await getSignedUrl(s3, command, { expiresIn });
    logger.log('Generated signed URL for', key);
    return url;
  } catch (err) {
    logger.error('Failed to generate signed URL', err.message || err);
    throw err;
  }
}

module.exports = { uploadBuffer, getSignedDownloadUrl };
